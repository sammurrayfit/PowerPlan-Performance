import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const COACH_ID = '43693c20-d17e-44d5-9e67-58b49db8bd15';
const SLOT_ORDER = ['A', 'B', 'C', 'D', 'E', 'F'];

const CATEGORY_FOR_EXERCISE = {
  'Single Leg Eyes Closed': 'Mobility', 'Tandem Eyes Closed': 'Mobility', 'Single Leg ABCs': 'Mobility',
  '90/90 with Internal Leg Lift': 'Mobility', 'Quadruped Hip Circles': 'Mobility', 'Deep Squat with Rotation': 'Mobility',
  'Pigeon Stretch with Rotation': 'Mobility', 'Kneeling Sitbacks': 'Mobility',
  'Seated Hip Flexor Leg Lifts': 'Accessory', 'Prone Hurdlers': 'Accessory', 'Mini Band Knee Drive': 'Accessory',
  'Cossack Squat': 'Accessory', 'Frog Stretch with Leg Lift': 'Accessory', 'Med Ball Squeeze': 'Accessory',
  'Split Squat with Foam Roll Adduction': 'Accessory', 'Banded Adduction (3-Way)': 'Accessory',
  'Clam Shells': 'Accessory', 'Reverse Clam Shells': 'Accessory', 'Monster Walks': 'Accessory', 'Lateral Walks': 'Accessory',
  'Hamstring Rocks': 'Accessory', 'Banded SL RDL': 'Accessory', 'Hamstring Walkouts': 'Accessory', 'Glider Hamstring Curl': 'Accessory',
  'Gate Swings': 'Plyometrics', 'Depth Drop': 'Plyometrics', 'Sled March': 'Speed', 'Lateral Lunge Pushoffs': 'Plyometrics',
  'A Skips': 'Speed', 'Non-CMJ': 'Plyometrics', 'Pogos for Speed': 'Plyometrics', 'Skaters': 'Plyometrics',
};

function fail(msg) { console.error('FATAL:', msg); process.exit(1); }

const rows = JSON.parse(fs.readFileSync('scripts/preactivation_export.json', 'utf8'));
console.log('Loaded', rows.length, 'pre-activation rows from export');

const dates = [...new Set(rows.map(r => r.date))].sort();
const athleteNames = [...new Set(rows.map(r => r.athlete))];

const { data: profiles, error: pErr } = await supabase
  .from('profiles').select('id, full_name').eq('role', 'athlete').in('full_name', athleteNames);
if (pErr) fail(pErr.message);
const athleteIdByName = {};
for (const p of profiles) athleteIdByName[p.full_name] = p.id;
for (const n of athleteNames) if (!athleteIdByName[n]) fail(`No profile found for athlete: ${n}`);
console.log('Resolved', Object.keys(athleteIdByName).length, 'athlete profiles');

const exerciseNames = [...new Set(rows.map(r => r.exercise))];
const { data: existingExercises, error: eeErr } = await supabase
  .from('exercises').select('id, name').in('name', exerciseNames);
if (eeErr) fail(eeErr.message);
const exerciseIdByName = {};
for (const e of existingExercises) exerciseIdByName[e.name] = e.id;
const missingNames = exerciseNames.filter(n => !exerciseIdByName[n]);
if (missingNames.length > 0) {
  const { data: categories } = await supabase.from('exercise_categories').select('id, name');
  const categoryIdByName = Object.fromEntries(categories.map(c => [c.name, c.id]));
  const toInsert = missingNames.map(name => ({
    name, category_id: categoryIdByName[CATEGORY_FOR_EXERCISE[name] ?? 'Accessory'] ?? null,
    is_public: true, created_by: COACH_ID,
  }));
  const { data: inserted, error: insErr } = await supabase.from('exercises').insert(toInsert).select('id, name');
  if (insErr) fail(insErr.message);
  for (const e of inserted) exerciseIdByName[e.name] = e.id;
}
console.log('Exercise library ready:', exerciseNames.length, 'exercises (', missingNames.length, 'newly created)');

const { data: existingPersonalCals, error: pcErr } = await supabase
  .from('calendars').select('id, athlete_id').eq('coach_id', COACH_ID).eq('name', 'Pre-Activation').in('athlete_id', Object.values(athleteIdByName));
if (pcErr) fail(pcErr.message);
if (existingPersonalCals && existingPersonalCals.length > 0) {
  console.log('Removing', existingPersonalCals.length, 'pre-existing personal Pre-Activation calendars (and cascaded workouts)...');
  const { error } = await supabase.from('calendars').delete().in('id', existingPersonalCals.map(c => c.id));
  if (error) fail(error.message);
}

const calendarIdByAthlete = {};
for (const name of athleteNames) {
  const { data, error } = await supabase
    .from('calendars')
    .insert({ name: 'Pre-Activation', coach_id: COACH_ID, athlete_id: athleteIdByName[name], team_id: null, color: '#7c3aed' })
    .select('id').single();
  if (error) fail(error.message);
  calendarIdByAthlete[name] = data.id;
}
console.log('Created', Object.keys(calendarIdByAthlete).length, 'personal calendars');

const byAthleteDate = {};
for (const r of rows) {
  const key = `${r.athlete}|${r.date}`;
  (byAthleteDate[key] ??= []).push(r);
}

let workoutCount = 0;
let exerciseRowCount = 0;
for (const name of athleteNames) {
  const calendarId = calendarIdByAthlete[name];
  for (const date of dates) {
    const sessionRows = (byAthleteDate[`${name}|${date}`] ?? []).slice().sort(
      (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot)
    );
    if (sessionRows.length === 0) continue;

    const { data: workout, error: wErr } = await supabase
      .from('workouts')
      .insert({ calendar_id: calendarId, date, title: 'Pre-Activation', notes: null, is_locked: false })
      .select('id').single();
    if (wErr) fail(wErr.message);
    workoutCount++;

    const weRows = sessionRows.map((r, i) => ({
      workout_id: workout.id,
      exercise_id: exerciseIdByName[r.exercise],
      sort_order: i,
      sets: r.sets,
      reps: String(r.reps),
      superset_group: r.slot + '1',
      notes: r.notes ?? null,
    }));
    const { error: weErr } = await supabase.from('workout_exercises').insert(weRows);
    if (weErr) fail(weErr.message);
    exerciseRowCount += weRows.length;
  }
}
console.log('Created', workoutCount, 'personal workouts (', exerciseRowCount, 'exercise rows total )');
console.log('\nDONE.');
