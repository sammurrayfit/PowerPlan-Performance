import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
function fail(msg) { console.error('FATAL:', msg); process.exit(1); }

const U15_TEAM_ID = 'd9f87d34-0e07-40f6-b92d-4a1da2fef2d1';
const TUE = '2026-09-15';
const WED = '2026-09-16';
const THU = '2026-09-17';
const APPLY = process.argv.includes('--apply');

const { data: memberships, error: mErr } = await supabase.from('team_memberships').select('athlete_id').eq('team_id', U15_TEAM_ID);
if (mErr) fail(mErr.message);
const athleteIds = memberships.map(m => m.athlete_id);
const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', athleteIds);
const nameById = Object.fromEntries(profiles.map(p => [p.id, p.full_name]));

const { data: calendars, error: cErr } = await supabase.from('calendars').select('id, athlete_id').in('athlete_id', athleteIds);
if (cErr) fail(cErr.message);
const calIds = calendars.map(c => c.id);
const athleteByCalId = Object.fromEntries(calendars.map(c => [c.id, c.athlete_id]));

const { data: workouts, error: wErr } = await supabase
  .from('workouts')
  .select('id, calendar_id, date, title, is_locked')
  .in('calendar_id', calIds)
  .in('date', [TUE, WED, THU]);
if (wErr) fail(wErr.message);

const woIds = workouts.map(w => w.id);
// Supabase caps a single request at 1000 rows; page through explicitly so
// large team-wide fetches (168 workouts * ~6 exercises here) aren't silently truncated.
let allWE = [];
for (let offset = 0; ; offset += 1000) {
  const { data: page, error: weErr } = await supabase
    .from('workout_exercises')
    .select('*')
    .in('workout_id', woIds)
    .range(offset, offset + 999);
  if (weErr) fail(weErr.message);
  allWE = allWE.concat(page ?? []);
  if (!page || page.length < 1000) break;
}

let skipped = [];
let plans = [];

for (const athleteId of athleteIds) {
  const athleteName = nameById[athleteId] ?? athleteId;
  const athleteWorkouts = workouts.filter(w => athleteByCalId[w.calendar_id] === athleteId);

  const tueW = athleteWorkouts.find(w => w.date === TUE && w.title === 'Lower Body Anterior');
  const wedW = athleteWorkouts.find(w => w.date === WED && w.title === 'Lower Body Posterior');
  const thuW = athleteWorkouts.find(w => w.date === THU && w.title === 'Upper Body');

  if (!tueW || !wedW || !thuW) {
    skipped.push(`${athleteName}: missing one of Tue Lower Body Anterior / Wed Lower Body Posterior / Thu Upper Body`);
    continue;
  }
  if (tueW.is_locked || wedW.is_locked || thuW.is_locked) {
    skipped.push(`${athleteName}: a workout is locked (Tue=${tueW.is_locked} Wed=${wedW.is_locked} Thu=${thuW.is_locked})`);
    continue;
  }

  const tueA = allWE.filter(e => e.workout_id === tueW.id && (e.superset_group ?? '').toUpperCase() === 'A');
  const wedA = allWE.filter(e => e.workout_id === wedW.id && (e.superset_group ?? '').toUpperCase() === 'A');

  if (tueA.length === 0) { skipped.push(`${athleteName}: Tuesday has no A-block exercises`); continue; }
  if (wedA.length === 0) { skipped.push(`${athleteName}: Wednesday has no A-block exercises to replace`); continue; }

  plans.push({ athleteId, athleteName, tueW, wedW, thuW, tueA, wedA });
}

console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${plans.length} athletes ready, ${skipped.length} skipped\n`);
if (skipped.length) {
  console.log('Skipped:');
  for (const s of skipped) console.log(`  - ${s}`);
  console.log();
}

for (const p of plans) {
  console.log(`${p.athleteName}:`);
  console.log(`  Wed A-block: [${p.wedA.map(e => e.exercise_id).join(', ')}] -> replaced by Tue A-block [${p.tueA.map(e => e.exercise_id).join(', ')}]`);
  console.log(`  Tue workout (old Lower Body Anterior, id=${p.tueW.id}) deleted entirely`);
  console.log(`  Thu Upper Body (id=${p.thuW.id}) moved to date ${TUE}`);
}

if (!APPLY) {
  console.log('\nDry run only. Re-run with --apply to commit these changes.');
  process.exit(0);
}

console.log('\nApplying...');
for (const p of plans) {
  // 1. Delete Wednesday's existing A-block rows
  const { error: delWedAErr } = await supabase.from('workout_exercises').delete().in('id', p.wedA.map(e => e.id));
  if (delWedAErr) fail(`${p.athleteName}: delete Wed A-block failed: ${delWedAErr.message}`);

  // 2. Insert Tuesday's A-block exercises into Wednesday's workout
  const newWedRows = p.tueA.map(e => ({
    workout_id: p.wedW.id,
    exercise_id: e.exercise_id,
    sort_order: e.sort_order,
    sets: e.sets,
    reps: e.reps,
    load: e.load,
    load_type: e.load_type,
    tempo: e.tempo,
    rest_seconds: e.rest_seconds,
    notes: e.notes,
    is_pr_tracking: e.is_pr_tracking,
    superset_group: e.superset_group,
  }));
  const { error: insWedErr } = await supabase.from('workout_exercises').insert(newWedRows);
  if (insWedErr) fail(`${p.athleteName}: insert into Wed failed: ${insWedErr.message}`);

  // 3. Delete the old Tuesday "Lower Body Anterior" workout entirely (cascades its exercises)
  const { error: delTueErr } = await supabase.from('workouts').delete().eq('id', p.tueW.id);
  if (delTueErr) fail(`${p.athleteName}: delete old Tue workout failed: ${delTueErr.message}`);

  // 4. Move Thursday's "Upper Body" workout to Tuesday's date
  const { error: moveThuErr } = await supabase.from('workouts').update({ date: TUE }).eq('id', p.thuW.id);
  if (moveThuErr) fail(`${p.athleteName}: move Thu->Tue failed: ${moveThuErr.message}`);

  console.log(`  ✓ ${p.athleteName}`);
}

console.log('\nDONE.');
