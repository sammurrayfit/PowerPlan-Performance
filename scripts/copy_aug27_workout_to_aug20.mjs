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
function chunks(arr, size) { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; }

const U15_TEAM_ID = 'd9f87d34-0e07-40f6-b92d-4a1da2fef2d1';
const SOURCE_DATE = '2026-08-27';
const TARGET_DATE = '2026-08-20';

const { data: memberships, error: mErr } = await supabase.from('team_memberships').select('athlete_id').eq('team_id', U15_TEAM_ID);
if (mErr) fail(mErr.message);
const athleteIds = memberships.map(m => m.athlete_id);

const { data: calendars, error: cErr } = await supabase
  .from('calendars').select('id, athlete_id').in('athlete_id', athleteIds).eq('name', 'U15 July–August 2026');
if (cErr) fail(cErr.message);
const calIds = calendars.map(c => c.id);
console.log(`Resolved ${calIds.length} 'U15 July–August 2026' calendars`);

// ── Idempotency: remove any existing workouts already on the target date ──
const { data: existingTarget, error: etErr } = await supabase.from('workouts').select('id').in('calendar_id', calIds).eq('date', TARGET_DATE);
if (etErr) fail(etErr.message);
if (existingTarget.length > 0) {
  console.log(`Deleting ${existingTarget.length} existing workouts on ${TARGET_DATE} (idempotent re-run)...`);
  const { error: delErr } = await supabase.from('workouts').delete().in('id', existingTarget.map(w => w.id));
  if (delErr) fail(delErr.message);
}

// ── Source workouts ──
const { data: sourceWorkouts, error: swErr } = await supabase.from('workouts').select('*').in('calendar_id', calIds).eq('date', SOURCE_DATE);
if (swErr) fail(swErr.message);
if (sourceWorkouts.length === 0) fail(`No workouts found on ${SOURCE_DATE}`);
console.log(`Found ${sourceWorkouts.length} source workouts on ${SOURCE_DATE}`);

const sourceWoIds = sourceWorkouts.map(w => w.id);
const { data: sourceExercises, error: seErr } = await supabase.from('workout_exercises').select('*').in('workout_id', sourceWoIds);
if (seErr) fail(seErr.message);
console.log(`Found ${sourceExercises.length} source workout_exercises rows`);

const sourceOverridesByWex = {};
{
  const wexIds = sourceExercises.map(e => e.id);
  for (const idChunk of chunks(wexIds, 200)) {
    const { data, error } = await supabase.from('athlete_exercise_overrides').select('*').in('workout_exercise_id', idChunk);
    if (error) fail(error.message);
    for (const o of data) (sourceOverridesByWex[o.workout_exercise_id] ??= []).push(o);
  }
}

// ── Create new workouts on target date ──
const newWorkoutsInput = sourceWorkouts.map(w => ({
  calendar_id: w.calendar_id, date: TARGET_DATE, title: w.title, notes: w.notes, is_locked: w.is_locked,
}));
let newWorkouts = [];
for (const chunk of chunks(newWorkoutsInput, 200)) {
  const { data, error } = await supabase.from('workouts').insert(chunk).select('*');
  if (error) fail(error.message);
  newWorkouts.push(...data);
}
console.log(`Created ${newWorkouts.length} new workouts on ${TARGET_DATE}`);

// Map old workout_id -> new workout_id, matched by calendar_id (1 workout per calendar per date)
const newWoIdByCalendar = Object.fromEntries(newWorkouts.map(w => [w.calendar_id, w.id]));
const oldToNewWoId = Object.fromEntries(sourceWorkouts.map(w => [w.id, newWoIdByCalendar[w.calendar_id]]));

// ── Copy workout_exercises ──
const newExercisesInput = sourceExercises.map(e => ({
  workout_id: oldToNewWoId[e.workout_id], exercise_id: e.exercise_id, sort_order: e.sort_order,
  sets: e.sets, reps: e.reps, load: e.load, load_type: e.load_type, tempo: e.tempo,
  rest_seconds: e.rest_seconds, notes: e.notes, is_pr_tracking: e.is_pr_tracking, superset_group: e.superset_group,
}));
let newExercises = [];
for (const chunk of chunks(newExercisesInput, 200)) {
  const { data, error } = await supabase.from('workout_exercises').insert(chunk).select('id, workout_id, sort_order, superset_group');
  if (error) fail(error.message);
  newExercises.push(...data);
}
console.log(`Created ${newExercises.length} new workout_exercises rows`);

// Map old workout_exercise_id -> new id, matched by (workout_id, superset_group, sort_order)
const keyOf = (workoutId, e) => `${workoutId}|${e.superset_group}|${e.sort_order}`;
const newWexIdByKey = Object.fromEntries(newExercises.map(e => [keyOf(e.workout_id, e), e.id]));

// ── Copy any athlete_exercise_overrides ──
const newOverridesInput = [];
for (const e of sourceExercises) {
  const overrides = sourceOverridesByWex[e.id];
  if (!overrides) continue;
  const newWexId = newWexIdByKey[keyOf(oldToNewWoId[e.workout_id], e)];
  for (const o of overrides) {
    newOverridesInput.push({
      workout_exercise_id: newWexId, athlete_id: o.athlete_id, sets: o.sets, reps: o.reps,
      load: o.load, load_type: o.load_type, notes: o.notes,
    });
  }
}
if (newOverridesInput.length > 0) {
  let count = 0;
  for (const chunk of chunks(newOverridesInput, 200)) {
    const { data, error } = await supabase.from('athlete_exercise_overrides').insert(chunk).select('id');
    if (error) fail(error.message);
    count += data.length;
  }
  console.log(`Created ${count} new athlete_exercise_overrides rows`);
} else {
  console.log('No athlete_exercise_overrides to copy');
}

console.log(`\nDONE. ${TARGET_DATE} is now an exact copy of ${SOURCE_DATE} (${newWorkouts.length} workouts, ${newExercises.length} exercises).`);
