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
const CHUNK = 200;
function fail(msg) { console.error('FATAL:', msg); process.exit(1); }
function chunks(arr, size) { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; }

const preRows = JSON.parse(fs.readFileSync('scripts/_sepoct/preactivation_sep_oct.json', 'utf8'));
const mainRows = JSON.parse(fs.readFileSync('scripts/_sepoct/mainlift_sep_oct.json', 'utf8'));
console.log(`Loaded ${preRows.length} pre-activation rows, ${mainRows.length} main-lift rows`);

const athleteNames = [...new Set([...preRows.map(r => r.athlete), ...mainRows.map(r => r.athlete)])];
const { data: profiles, error: pErr } = await supabase
  .from('profiles').select('id, full_name').eq('role', 'athlete').in('full_name', athleteNames);
if (pErr) fail(pErr.message);
const athleteIdByName = {};
for (const p of profiles) athleteIdByName[p.full_name] = p.id;
for (const n of athleteNames) if (!athleteIdByName[n]) fail(`No profile found for athlete: ${n}`);
console.log('Resolved', Object.keys(athleteIdByName).length, 'athlete profiles');

// ── Exercises: resolve or create ────────────────────────────────────────────
const allExerciseNames = [...new Set([...preRows.map(r => r.exercise), ...mainRows.map(r => r.exercise)])];
const { data: existingExercises, error: eeErr } = await supabase
  .from('exercises').select('id, name').in('name', allExerciseNames);
if (eeErr) fail(eeErr.message);
const exerciseIdByName = {};
for (const e of existingExercises) exerciseIdByName[e.name] = e.id;
const missingNames = allExerciseNames.filter(n => !exerciseIdByName[n]);
if (missingNames.length > 0) {
  const toInsert = missingNames.map(name => ({ name, category_id: null, is_public: false, created_by: COACH_ID }));
  for (const chunk of chunks(toInsert, CHUNK)) {
    const { data: inserted, error: insErr } = await supabase.from('exercises').insert(chunk).select('id, name');
    if (insErr) fail(insErr.message);
    for (const e of inserted) exerciseIdByName[e.name] = e.id;
  }
  console.log('Created', missingNames.length, 'new exercises');
} else {
  console.log('All exercises already existed');
}

// ── Calendars ────────────────────────────────────────────────────────────────
// Pre-Activation: reuse each athlete's existing "Pre-Activation" calendar.
const { data: preCalendars, error: pcErr } = await supabase
  .from('calendars').select('id, athlete_id').eq('name', 'Pre-Activation').in('athlete_id', Object.values(athleteIdByName));
if (pcErr) fail(pcErr.message);
const preCalIdByAthlete = Object.fromEntries(preCalendars.map(c => [c.athlete_id, c.id]));
for (const name of athleteNames.filter(n => preRows.some(r => r.athlete === n))) {
  if (!preCalIdByAthlete[athleteIdByName[name]]) fail(`No existing Pre-Activation calendar for ${name}`);
}
console.log('Resolved', Object.keys(preCalIdByAthlete).length, 'existing Pre-Activation calendars');

// Main Lift: create (or reuse) a "U15 September–October 2026" calendar per athlete.
const mainAthleteIds = [...new Set(mainRows.map(r => athleteIdByName[r.athlete]))];
const { data: existingMainCals, error: emcErr } = await supabase
  .from('calendars').select('id, athlete_id').eq('name', 'U15 September–October 2026').in('athlete_id', mainAthleteIds);
if (emcErr) fail(emcErr.message);
const mainCalIdByAthlete = Object.fromEntries(existingMainCals.map(c => [c.athlete_id, c.id]));
const missingMainCalAthletes = mainAthleteIds.filter(id => !mainCalIdByAthlete[id]);
if (missingMainCalAthletes.length > 0) {
  const toInsert = missingMainCalAthletes.map(athlete_id => ({
    name: 'U15 September–October 2026', coach_id: COACH_ID, team_id: null, athlete_id, color: '#6366f1',
  }));
  for (const chunk of chunks(toInsert, CHUNK)) {
    const { data: inserted, error: insErr } = await supabase.from('calendars').insert(chunk).select('id, athlete_id');
    if (insErr) fail(insErr.message);
    for (const c of inserted) mainCalIdByAthlete[c.athlete_id] = c.id;
  }
  console.log('Created', missingMainCalAthletes.length, 'new Main Lift calendars');
} else {
  console.log('All Main Lift calendars already existed');
}

// ── Idempotency: remove any previously-synced workouts in the target date range ──
const preDates = [...new Set(preRows.map(r => r.date))];
const mainDates = [...new Set(mainRows.map(r => r.date))];

for (const [label, calIdMap, dates, titleFilter] of [
  ['Pre-Activation', preCalIdByAthlete, preDates, { title: 'Pre-Activation' }],
  ['Main Lift', mainCalIdByAthlete, mainDates, null],
]) {
  const calIds = Object.values(calIdMap);
  if (calIds.length === 0) continue;
  let query = supabase.from('workouts').select('id, date').in('calendar_id', calIds).in('date', dates);
  if (titleFilter) query = query.eq('title', titleFilter.title);
  const { data: existing, error: exErr } = await query;
  if (exErr) fail(exErr.message);
  if (existing && existing.length > 0) {
    const ids = existing.map(w => w.id);
    console.log(`Deleting ${ids.length} existing ${label} workouts in target range (idempotent re-run)...`);
    for (const chunk of chunks(ids, CHUNK)) {
      const { error: delErr } = await supabase.from('workouts').delete().in('id', chunk);
      if (delErr) fail(delErr.message);
    }
  }
}

// ── Insert workouts ──────────────────────────────────────────────────────────
async function insertWorkouts(rowsBySource, calIdMap, titleFn) {
  // rowsBySource: array of {athlete, date, title?}
  const uniqueDays = new Map(); // `${athlete}|${date}` -> {athlete, date, title}
  for (const r of rowsBySource) {
    const key = `${r.athlete}|${r.date}`;
    if (!uniqueDays.has(key)) uniqueDays.set(key, { athlete: r.athlete, date: r.date, title: titleFn(r) });
  }
  const toInsert = [...uniqueDays.values()].map(d => ({
    calendar_id: calIdMap[athleteIdByName[d.athlete]],
    date: d.date,
    title: d.title,
    notes: null,
    is_locked: false,
  }));
  const workoutIdByKey = {};
  for (const chunk of chunks(toInsert, CHUNK)) {
    const { error } = await supabase.from('workouts').insert(chunk);
    if (error) fail(error.message);
  }
  // Re-fetch by natural key (calendar_id, date, title) instead of trusting insert order
  const calIds = Object.values(calIdMap);
  const dates = [...new Set([...uniqueDays.values()].map(d => d.date))];
  const { data: fresh, error: freshErr } = await supabase
    .from('workouts').select('id, calendar_id, date, title').in('calendar_id', calIds).in('date', dates);
  if (freshErr) fail(freshErr.message);
  const calIdToAthleteId = Object.fromEntries(Object.entries(calIdMap).map(([aid, cid]) => [cid, aid]));
  for (const w of fresh) {
    const athleteId = calIdToAthleteId[w.calendar_id];
    const athleteName = athleteNames.find(n => athleteIdByName[n] === athleteId);
    workoutIdByKey[`${athleteName}|${w.date}|${w.title}`] = w.id;
  }
  return workoutIdByKey;
}

console.log('\nInserting Pre-Activation workouts...');
const preWorkoutIdByKey = await insertWorkouts(preRows, preCalIdByAthlete, () => 'Pre-Activation');
console.log('Inserted/resolved', Object.keys(preWorkoutIdByKey).length, 'Pre-Activation workout rows');

console.log('Inserting Main Lift workouts...');
const mainWorkoutIdByKey = await insertWorkouts(mainRows, mainCalIdByAthlete, (r) => r.title);
console.log('Inserted/resolved', Object.keys(mainWorkoutIdByKey).length, 'Main Lift workout rows');

// ── Insert workout_exercises ─────────────────────────────────────────────────
function preSortOrder(slot) {
  return { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 }[slot];
}

const preWeRows = preRows.map(r => ({
  workout_id: preWorkoutIdByKey[`${r.athlete}|${r.date}|Pre-Activation`],
  exercise_id: exerciseIdByName[r.exercise],
  sort_order: preSortOrder(r.slot),
  sets: r.sets,
  reps: String(r.reps),
  superset_group: r.slot,
  notes: r.notes,
}));
for (const row of preWeRows) if (!row.workout_id) fail('Missing workout_id mapping for a Pre-Activation row');

let preInserted = 0;
for (const chunk of chunks(preWeRows, CHUNK)) {
  const { error } = await supabase.from('workout_exercises').insert(chunk);
  if (error) fail(error.message);
  preInserted += chunk.length;
}
console.log('Inserted', preInserted, 'Pre-Activation workout_exercises rows');

const slotOrderOffset = { A: 0, B: 2, C: 4, D: 6 };
const mainWeRows = mainRows.map(r => ({
  workout_id: mainWorkoutIdByKey[`${r.athlete}|${r.date}|${r.title}`],
  exercise_id: exerciseIdByName[r.exercise],
  sort_order: slotOrderOffset[r.superset_group] + r.sub_index,
  sets: r.sets,
  reps: String(r.reps),
  load: r.load,
  load_type: r.load_type,
  superset_group: r.superset_group,
  notes: r.notes,
}));
for (const row of mainWeRows) if (!row.workout_id) fail('Missing workout_id mapping for a Main Lift row');

let mainInserted = 0;
for (const chunk of chunks(mainWeRows, CHUNK)) {
  const { error } = await supabase.from('workout_exercises').insert(chunk);
  if (error) fail(error.message);
  mainInserted += chunk.length;
}
console.log('Inserted', mainInserted, 'Main Lift workout_exercises rows');

console.log('\nDONE.');
