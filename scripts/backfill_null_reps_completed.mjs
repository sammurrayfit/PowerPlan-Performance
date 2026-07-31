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

// Mirrors defaultReps() in workout-logger.tsx: extract the leading integer
// from a prescription string ("8" -> 8, "6 each" -> 6), null for
// non-numeric prescriptions ("AMRAP") where a default would be a guess.
function parseLeadingInt(s) {
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

const { data: nullLogs, error: lErr } = await supabase
  .from('exercise_logs')
  .select('id, workout_exercise_id, athlete_id')
  .is('reps_completed', null);
if (lErr) fail(lErr.message);
console.log('Null reps_completed rows found:', nullLogs.length);

const weIds = [...new Set(nullLogs.map(l => l.workout_exercise_id))];
const { data: workoutExercises, error: weErr } = await supabase
  .from('workout_exercises')
  .select('id, reps')
  .in('id', weIds);
if (weErr) fail(weErr.message);
const prescribedByWe = Object.fromEntries(workoutExercises.map(w => [w.id, w.reps]));

const { data: overrides, error: oErr } = await supabase
  .from('athlete_exercise_overrides')
  .select('workout_exercise_id, athlete_id, reps')
  .in('workout_exercise_id', weIds);
if (oErr) fail(oErr.message);
const overrideByKey = Object.fromEntries(
  overrides.filter(o => o.reps != null).map(o => [`${o.workout_exercise_id}|${o.athlete_id}`, o.reps])
);

const updatesByValue = new Map(); // repsValue -> [log ids]
let skippedNonNumeric = 0;
let skippedNoPrescription = 0;

for (const log of nullLogs) {
  const override = overrideByKey[`${log.workout_exercise_id}|${log.athlete_id}`];
  const prescribed = override ?? prescribedByWe[log.workout_exercise_id];
  if (!prescribed) { skippedNoPrescription++; continue; }
  const val = parseLeadingInt(prescribed);
  if (val == null) { skippedNonNumeric++; continue; }
  if (!updatesByValue.has(val)) updatesByValue.set(val, []);
  updatesByValue.get(val).push(log.id);
}

console.log('Skipped (no prescription found):', skippedNoPrescription);
console.log('Skipped (non-numeric prescription, e.g. AMRAP):', skippedNonNumeric);
console.log('Distinct reps values to backfill:', updatesByValue.size);

let totalUpdated = 0;
for (const [val, ids] of updatesByValue) {
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { error } = await supabase.from('exercise_logs').update({ reps_completed: val }).in('id', chunk);
    if (error) fail(error.message);
    totalUpdated += chunk.length;
  }
}
console.log('\nDONE. Backfilled reps_completed on', totalUpdated, 'rows.');
