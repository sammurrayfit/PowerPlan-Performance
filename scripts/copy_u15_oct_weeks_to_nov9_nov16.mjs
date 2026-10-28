import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Copies whole U15 weeks (lifts + Pre-Activation, with exercise rows and
// per-athlete overrides) onto later weeks, replacing whatever is there:
//   week of Oct 12 → week of Nov 9   (LBA Tue, LBP Wed, Upper Thu, Pre-Act Tue–Fri)
//   week of Oct 5  → week of Nov 16
// Existing target-week workouts are deleted first; refuses if any of them have
// logged sets or attendance. Logged sets and attendance are not copied.
//
// Usage: node scripts/copy_u15_oct_weeks_to_nov9_nov16.mjs [--apply]

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
function fail(msg) { console.error('FATAL:', msg); process.exit(1); }
function chunks(arr, size) { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; }
function addDays(d, n) { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000); }
const APPLY = process.argv.includes('--apply');

const U15_TEAM_ID = 'd9f87d34-0e07-40f6-b92d-4a1da2fef2d1';
const COPIES = [
  { srcMonday: '2026-10-12', dstMonday: '2026-11-09' },
  { srcMonday: '2026-10-05', dstMonday: '2026-11-16' },
];

const { data: memberships, error: mErr } = await supabase.from('team_memberships').select('athlete_id').eq('team_id', U15_TEAM_ID);
if (mErr) fail(mErr.message);
const { data: calendars, error: cErr } = await supabase.from('calendars').select('id, name, athlete_id')
  .in('athlete_id', memberships.map(m => m.athlete_id));
if (cErr) fail(cErr.message);
const calById = Object.fromEntries(calendars.map(c => [c.id, c]));
const calIds = calendars.map(c => c.id);

async function workoutsInWeek(monday, cols) {
  const out = [];
  for (const idChunk of chunks(calIds, 40)) {
    const { data, error } = await supabase.from('workouts').select(cols)
      .in('calendar_id', idChunk).gte('date', monday).lte('date', addDays(monday, 6));
    if (error) fail(error.message);
    out.push(...data);
  }
  return out;
}
async function readByIds(table, col, ids, size) {
  const out = [];
  for (const idChunk of chunks(ids, size)) {
    const { data, error } = await supabase.from(table).select('*').in(col, idChunk);
    if (error) fail(`${table}: ${error.message}`);
    if (data.length >= 1000) fail(`${table} read hit the 1000-row cap`);
    out.push(...data);
  }
  return out;
}

const plans = [];
for (const { srcMonday, dstMonday } of COPIES) {
  const shift = daysBetween(srcMonday, dstMonday);
  const existing = await workoutsInWeek(dstMonday, 'id, date, title, calendar_id');
  const existingIds = existing.map(w => w.id);
  const logs = await readByIds('exercise_logs', 'workout_id', existingIds, 50);
  const attendance = await readByIds('attendance', 'workout_id', existingIds, 50);
  if (logs.length || attendance.length) fail(`week of ${dstMonday} has ${logs.length} logged sets / ${attendance.length} attendance rows — not deleting`);

  const srcWorkouts = await workoutsInWeek(srcMonday, '*');
  if (!srcWorkouts.length) fail(`No source workouts in week of ${srcMonday}`);
  const srcExercises = await readByIds('workout_exercises', 'workout_id', srcWorkouts.map(w => w.id), 20);
  const srcOverrides = await readByIds('athlete_exercise_overrides', 'workout_exercise_id', srcExercises.map(e => e.id), 100);
  plans.push({ srcMonday, dstMonday, shift, existing, srcWorkouts, srcExercises, srcOverrides });
}

console.log(APPLY ? 'APPLYING' : 'DRY RUN');
for (const p of plans) {
  console.log(`\n== Week of ${p.srcMonday} → week of ${p.dstMonday} (+${p.shift} days)`);
  const del = {};
  for (const w of p.existing) { const k = `${w.date} ${w.title}`; del[k] = (del[k] ?? 0) + 1; }
  console.log(`  Delete ${p.existing.length} existing:`);
  for (const k of Object.keys(del).sort()) console.log(`    ${String(del[k]).padStart(3)} × ${k}`);
  const add = {};
  for (const w of p.srcWorkouts) { const k = `${w.date} → ${addDays(w.date, p.shift)} ${w.title}`; add[k] = (add[k] ?? 0) + 1; }
  console.log(`  Copy ${p.srcWorkouts.length} workouts, ${p.srcExercises.length} exercise rows, ${p.srcOverrides.length} overrides, ${new Set(p.srcWorkouts.map(w => calById[w.calendar_id].athlete_id)).size} athletes:`);
  for (const k of Object.keys(add).sort()) console.log(`    ${String(add[k]).padStart(3)} × ${k}`);
}
if (!APPLY) { console.log('\nDry run only. Re-run with --apply.'); process.exit(0); }

const strip = row => { const out = { ...row }; delete out.id; delete out.created_at; return out; };

for (const p of plans) {
  for (const idChunk of chunks(p.existing.map(w => w.id), 100)) {
    const { error } = await supabase.from('workouts').delete().in('id', idChunk);
    if (error) fail(`delete: ${error.message}`);
  }

  // Insert one workout at a time so old → new ids map unambiguously.
  const newWorkoutId = {};
  for (const w of p.srcWorkouts) {
    const { data, error } = await supabase.from('workouts').insert({ ...strip(w), date: addDays(w.date, p.shift), is_locked: false }).select('id').single();
    if (error) fail(`workout ${w.id}: ${error.message}`);
    newWorkoutId[w.id] = data.id;
  }

  const newExerciseId = {};
  for (const chunk of chunks(p.srcExercises, 200)) {
    const { data, error } = await supabase.from('workout_exercises')
      .insert(chunk.map(e => ({ ...strip(e), workout_id: newWorkoutId[e.workout_id] }))).select('id');
    if (error) fail(`workout_exercises: ${error.message}`);
    // PostgREST returns bulk-inserted rows in input order.
    chunk.forEach((e, i) => { newExerciseId[e.id] = data[i].id; });
  }

  for (const chunk of chunks(p.srcOverrides, 200)) {
    const { error } = await supabase.from('athlete_exercise_overrides')
      .insert(chunk.map(o => ({ ...strip(o), workout_exercise_id: newExerciseId[o.workout_exercise_id] })));
    if (error) fail(`overrides: ${error.message}`);
  }
  console.log(`Week of ${p.dstMonday}: deleted ${p.existing.length}, copied ${p.srcWorkouts.length} workouts / ${p.srcExercises.length} exercise rows / ${p.srcOverrides.length} overrides`);
}
console.log('\nDONE.');
