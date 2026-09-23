import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
function fail(msg) { console.error('FATAL:', msg); process.exit(1); }

const U15_TEAM_ID = 'd9f87d34-0e07-40f6-b92d-4a1da2fef2d1';

function loadTypeLabel(lt) {
  if (lt === 'percent_1rm') return 'percent_1rm';
  if (lt === 'bodyweight') return 'bodyweight';
  return 'absolute';
}

const { data: memberships, error: mErr } = await supabase
  .from('team_memberships').select('athlete_id').eq('team_id', U15_TEAM_ID);
if (mErr) fail(mErr.message);
const athleteIds = memberships.map((m) => m.athlete_id);

const { data: profiles, error: pErr } = await supabase
  .from('profiles').select('id, full_name').in('id', athleteIds).order('full_name');
if (pErr) fail(pErr.message);

// Team-wide calendar (testing days that apply to the whole roster)
const { data: teamCal, error: tcErr } = await supabase
  .from('calendars').select('id').eq('team_id', U15_TEAM_ID);
if (tcErr) fail(tcErr.message);
const teamCalIds = teamCal.map((c) => c.id);

// Each athlete's individual calendars (Pre-Activation, U15 July-Aug, U15 Sep-Oct, etc.)
const { data: indivCals, error: icErr } = await supabase
  .from('calendars').select('id, athlete_id').in('athlete_id', athleteIds);
if (icErr) fail(icErr.message);

const calIdsByAthlete = new Map(athleteIds.map((id) => [id, []]));
for (const c of indivCals) calIdsByAthlete.get(c.athlete_id).push(c.id);

const allCalIds = [...teamCalIds, ...indivCals.map((c) => c.id)];

// Fetch all workouts across every relevant calendar. Paginate with .range() since
// Supabase caps a single response at 1000 rows regardless of the .in() filter size.
const PAGE = 1000;
let allWorkouts = [];
for (let offset = 0; ; offset += PAGE) {
  const { data, error } = await supabase
    .from('workouts').select('id, calendar_id, date, title')
    .in('calendar_id', allCalIds)
    .range(offset, offset + PAGE - 1);
  if (error) fail(error.message);
  allWorkouts = allWorkouts.concat(data);
  if (data.length < PAGE) break;
}
console.log(`Fetched ${allWorkouts.length} workouts across ${allCalIds.length} calendars.`);

const workoutIds = allWorkouts.map((w) => w.id);
const CHUNK = 100;
let allExercises = [];
for (let i = 0; i < workoutIds.length; i += CHUNK) {
  const chunk = workoutIds.slice(i, i + CHUNK);
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('workout_exercises')
      .select('id, workout_id, sort_order, sets, reps, load, load_type, tempo, rest_seconds, notes, superset_group, exercises(name)')
      .in('workout_id', chunk)
      .range(offset, offset + PAGE - 1);
    if (error) fail(error.message);
    allExercises = allExercises.concat(data);
    if (data.length < PAGE) break;
  }
}
console.log(`Fetched ${allExercises.length} workout_exercises.`);

const weIds = allExercises.map((e) => e.id);
let overrides = [];
for (let i = 0; i < weIds.length; i += CHUNK) {
  const chunk = weIds.slice(i, i + CHUNK);
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('athlete_exercise_overrides')
      .select('workout_exercise_id, athlete_id, sets, reps, load, load_type, notes')
      .in('workout_exercise_id', chunk)
      .range(offset, offset + PAGE - 1);
    if (error) fail(error.message);
    overrides = overrides.concat(data);
    if (data.length < PAGE) break;
  }
}
console.log(`Fetched ${overrides.length} athlete_exercise_overrides.`);

const overrideKey = (weId, athleteId) => `${weId}::${athleteId}`;
const overrideMap = new Map(overrides.map((o) => [overrideKey(o.workout_exercise_id, o.athlete_id), o]));

const exercisesByWorkout = new Map();
for (const e of allExercises) {
  if (!exercisesByWorkout.has(e.workout_id)) exercisesByWorkout.set(e.workout_id, []);
  exercisesByWorkout.get(e.workout_id).push(e);
}
for (const list of exercisesByWorkout.values()) list.sort((a, b) => a.sort_order - b.sort_order);

const HEADERS = ["Date", "Workout", "Superset", "Exercise", "Sets", "Reps", "Load", "Type", "Tempo", "Rest", "Notes"];

function rowsForWorkout(workout, athleteId) {
  const exs = exercisesByWorkout.get(workout.id) ?? [];
  const rows = [];
  for (const e of exs) {
    const ov = overrideMap.get(overrideKey(e.id, athleteId));
    if (ov && ov.sets == null && ov.reps == null) continue; // athlete opted out of this exercise
    rows.push([
      workout.date,
      workout.title,
      e.superset_group ?? "",
      e.exercises?.name ?? "",
      ov?.sets ?? e.sets ?? "",
      ov?.reps ?? e.reps ?? "",
      ov?.load ?? e.load ?? "",
      loadTypeLabel(ov?.load_type ?? e.load_type),
      e.tempo ?? "",
      e.rest_seconds ?? "",
      ov?.notes ?? e.notes ?? "",
    ]);
  }
  return rows;
}

const wb = XLSX.utils.book_new();
const usedNames = new Set();

for (const athlete of profiles) {
  const calIds = calIdsByAthlete.get(athlete.id) ?? [];
  const workouts = allWorkouts
    .filter((w) => teamCalIds.includes(w.calendar_id) || calIds.includes(w.calendar_id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  const rows = [HEADERS];
  for (const w of workouts) rows.push(...rowsForWorkout(w, athlete.id));

  if (rows.length === 1) continue; // no posted workouts for this athlete

  let sheetName = athlete.full_name.slice(0, 31);
  let n = 2;
  while (usedNames.has(sheetName)) sheetName = `${athlete.full_name.slice(0, 28)} ${n++}`;
  usedNames.add(sheetName);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [12, 24, 10, 24, 6, 8, 8, 12, 8, 6, 24].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

const outPath = path.join(process.env.HOME, 'Downloads', 'U15-posted-workouts.xlsx');
XLSX.writeFile(wb, outPath);
console.log(`Wrote ${wb.SheetNames.length} sheets to ${outPath}`);
