import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const CALENDAR_ID = '9eb466b7-993e-43c8-a360-52afb1cad1c3'; // U15 July-August 2026 (the existing shared lift calendar)
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

// idempotency: remove any existing Pre-Activation workouts for these dates on this calendar
const { data: existing, error: exErr } = await supabase
  .from('workouts').select('id, date').eq('calendar_id', CALENDAR_ID).eq('title', 'Pre-Activation').in('date', dates);
if (exErr) fail(exErr.message);
if (existing && existing.length > 0) {
  const ids = existing.map(w => w.id);
  console.log('Deleting', ids.length, 'existing Pre-Activation workouts (and their cascaded exercises/overrides)...');
  const { error: delErr } = await supabase.from('workouts').delete().in('id', ids);
  if (delErr) fail(delErr.message);
}

const workoutIdByDate = {};
for (const date of dates) {
  const { data, error } = await supabase
    .from('workouts')
    .insert({ calendar_id: CALENDAR_ID, date, title: 'Pre-Activation', notes: null, is_locked: false })
    .select('id, date').single();
  if (error) fail(error.message);
  workoutIdByDate[date] = data.id;
}
console.log('Inserted', Object.keys(workoutIdByDate).length, 'new Pre-Activation workouts');

const { data: categories, error: catErr } = await supabase.from('exercise_categories').select('id, name');
if (catErr) fail(catErr.message);
const categoryIdByName = {};
for (const c of categories) categoryIdByName[c.name] = c.id;

const exerciseNames = [...new Set(rows.map(r => r.exercise))];
const { data: existingExercises, error: eeErr } = await supabase
  .from('exercises').select('id, name').in('name', exerciseNames);
if (eeErr) fail(eeErr.message);
const exerciseIdByName = {};
for (const e of existingExercises) exerciseIdByName[e.name] = e.id;

const missingNames = exerciseNames.filter(n => !exerciseIdByName[n]);
if (missingNames.length > 0) {
  const toInsert = missingNames.map(name => ({
    name,
    category_id: categoryIdByName[CATEGORY_FOR_EXERCISE[name] ?? 'Accessory'] ?? null,
    is_public: true,
    created_by: COACH_ID,
  }));
  const { data: inserted, error: insErr } = await supabase.from('exercises').insert(toInsert).select('id, name');
  if (insErr) fail(insErr.message);
  for (const e of inserted) exerciseIdByName[e.name] = e.id;
}
console.log('Exercise library: ', exerciseNames.length, 'unique exercises (', missingNames.length, 'newly created)');

const weByKey = {};
const weRowsToInsert = [];
const weKeyMeta = [];
for (const date of dates) {
  for (let i = 0; i < SLOT_ORDER.length; i++) {
    const slot = SLOT_ORDER[i];
    const slotRows = rows.filter(r => r.date === date && r.slot === slot);
    const distinctExercises = [...new Set(slotRows.map(r => r.exercise))];
    for (const exName of distinctExercises) {
      const sample = slotRows.find(r => r.exercise === exName);
      weRowsToInsert.push({
        workout_id: workoutIdByDate[date],
        exercise_id: exerciseIdByName[exName],
        sort_order: i,
        sets: sample.sets,
        reps: String(sample.reps),
        superset_group: slot + '1',
      });
      weKeyMeta.push(`${date}|${slot}|${exName}`);
    }
  }
}
const CHUNK = 200;
let insertedCount = 0;
for (let i = 0; i < weRowsToInsert.length; i += CHUNK) {
  const chunk = weRowsToInsert.slice(i, i + CHUNK);
  const { error } = await supabase.from('workout_exercises').insert(chunk);
  if (error) fail(error.message);
  insertedCount += chunk.length;
}

// Re-fetch by natural key (workout_id, exercise_id, superset_group) instead of trusting
// insert-response ordering, which is not guaranteed to match input order.
const exerciseNameById = Object.fromEntries(Object.entries(exerciseIdByName).map(([n, id]) => [id, n]));
const dateByWorkoutId = Object.fromEntries(Object.entries(workoutIdByDate).map(([d, id]) => [id, d]));
const { data: freshWes, error: freshErr } = await supabase
  .from('workout_exercises')
  .select('id, workout_id, exercise_id, superset_group')
  .in('workout_id', Object.values(workoutIdByDate));
if (freshErr) fail(freshErr.message);
for (const we of freshWes) {
  const date = dateByWorkoutId[we.workout_id];
  const slot = we.superset_group[0];
  const exName = exerciseNameById[we.exercise_id];
  weByKey[`${date}|${slot}|${exName}`] = we.id;
}
console.log('Inserted', insertedCount, 'workout_exercises rows (', freshWes.length, 'confirmed on re-fetch)');

// sets/reps must be non-null: the coach's per-athlete filtered view treats an override
// as an "active assignment" only when sets or reps is set.
const overrideRows = rows.map(r => ({
  workout_exercise_id: weByKey[`${r.date}|${r.slot}|${r.exercise}`],
  athlete_id: athleteIdByName[r.athlete],
  sets: r.sets,
  reps: String(r.reps),
  load: null,
  load_type: null,
  notes: r.notes ?? null,
}));
for (const o of overrideRows) if (!o.workout_exercise_id) fail('Missing workout_exercise_id mapping for an override row');

let overrideCount = 0;
for (let i = 0; i < overrideRows.length; i += CHUNK) {
  const chunk = overrideRows.slice(i, i + CHUNK);
  const { error } = await supabase.from('athlete_exercise_overrides').insert(chunk);
  if (error) fail(error.message);
  overrideCount += chunk.length;
}
console.log('Inserted', overrideCount, 'athlete_exercise_overrides rows');

console.log('\nDONE.');
