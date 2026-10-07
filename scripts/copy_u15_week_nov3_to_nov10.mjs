import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Copies every U15 workout from the week of Nov 3 (Mon Nov 2 - Sun Nov 8) to the
// same weekday of the following week (Nov 9 - 15): lift sessions and
// Pre-Activation, with all exercise rows and per-athlete overrides. Logged sets
// and attendance are not copied. Refuses to run if the target week already has
// workouts on any of those calendars.
//
// Usage: node scripts/copy_u15_week_nov3_to_nov10.mjs [--apply]

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
function fail(msg) { console.error('FATAL:', msg); process.exit(1); }
function chunks(arr, size) { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; }
function addDays(d, n) { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
const APPLY = process.argv.includes('--apply');

const U15_TEAM_ID = 'd9f87d34-0e07-40f6-b92d-4a1da2fef2d1';
const SRC_MONDAY = '2026-11-02';
const SHIFT = 7;

const { data: memberships, error: mErr } = await supabase.from('team_memberships').select('athlete_id').eq('team_id', U15_TEAM_ID);
if (mErr) fail(mErr.message);
const { data: calendars, error: cErr } = await supabase.from('calendars').select('id, name, athlete_id, profiles:athlete_id(full_name)')
  .in('athlete_id', memberships.map(m => m.athlete_id));
if (cErr) fail(cErr.message);
const calById = Object.fromEntries(calendars.map(c => [c.id, c]));
const calIds = calendars.map(c => c.id);

const { data: existing, error: eErr } = await supabase.from('workouts').select('id, date, calendar_id')
  .in('calendar_id', calIds).gte('date', addDays(SRC_MONDAY, SHIFT)).lte('date', addDays(SRC_MONDAY, SHIFT + 6));
if (eErr) fail(eErr.message);
if (existing.length) fail(`${existing.length} workouts already exist in the target week — not copying over them`);

const { data: srcWorkouts, error: swErr } = await supabase.from('workouts').select('*')
  .in('calendar_id', calIds).gte('date', SRC_MONDAY).lte('date', addDays(SRC_MONDAY, 6));
if (swErr) fail(swErr.message);
if (!srcWorkouts.length) fail('No source workouts found');

const srcExercises = [];
// Small chunks keep each read under PostgREST's 1000-row response cap.
for (const idChunk of chunks(srcWorkouts.map(w => w.id), 20)) {
  const { data, error } = await supabase.from('workout_exercises').select('*').in('workout_id', idChunk);
  if (error) fail(error.message);
  if (data.length >= 1000) fail('workout_exercises read hit the 1000-row cap');
  srcExercises.push(...data);
}
const srcOverrides = [];
for (const idChunk of chunks(srcExercises.map(e => e.id), 200)) {
  const { data, error } = await supabase.from('athlete_exercise_overrides').select('*').in('workout_exercise_id', idChunk);
  if (error) fail(error.message);
  if (data.length >= 1000) fail('athlete_exercise_overrides read hit the 1000-row cap');
  srcOverrides.push(...data);
}

const summary = {};
for (const w of srcWorkouts) {
  const k = `${w.date} → ${addDays(w.date, SHIFT)}  ${calById[w.calendar_id].name} / ${w.title}`;
  summary[k] = (summary[k] ?? 0) + 1;
}
console.log(APPLY ? 'APPLYING' : 'DRY RUN');
for (const k of Object.keys(summary).sort()) console.log(`  ${String(summary[k]).padStart(3)} × ${k}`);
console.log(`${srcWorkouts.length} workouts, ${srcExercises.length} exercise rows, ${srcOverrides.length} overrides, ${new Set(srcWorkouts.map(w => calById[w.calendar_id].athlete_id)).size} athletes`);
if (!APPLY) { console.log('\nDry run only. Re-run with --apply.'); process.exit(0); }

const strip = (row, ...keys) => { const out = { ...row }; for (const k of ['id', 'created_at', ...keys]) delete out[k]; return out; };

// Insert one workout at a time so old → new ids map unambiguously.
const newWorkoutId = {};
for (const w of srcWorkouts) {
  const { data, error } = await supabase.from('workouts').insert({ ...strip(w), date: addDays(w.date, SHIFT) }).select('id').single();
  if (error) fail(`workout ${w.id}: ${error.message}`);
  newWorkoutId[w.id] = data.id;
}

const newExerciseId = {};
for (const chunk of chunks(srcExercises, 200)) {
  const { data, error } = await supabase.from('workout_exercises')
    .insert(chunk.map(e => ({ ...strip(e), workout_id: newWorkoutId[e.workout_id] }))).select('id');
  if (error) fail(`workout_exercises: ${error.message}`);
  // PostgREST returns bulk-inserted rows in input order.
  chunk.forEach((e, i) => { newExerciseId[e.id] = data[i].id; });
}

for (const chunk of chunks(srcOverrides, 200)) {
  const { error } = await supabase.from('athlete_exercise_overrides')
    .insert(chunk.map(o => ({ ...strip(o), workout_exercise_id: newExerciseId[o.workout_exercise_id] })));
  if (error) fail(`overrides: ${error.message}`);
}

console.log(`\nDONE. Copied ${srcWorkouts.length} workouts, ${srcExercises.length} exercise rows, ${srcOverrides.length} overrides.`);
