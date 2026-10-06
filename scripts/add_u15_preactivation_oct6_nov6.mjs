import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Adds the Oct 6 – Nov 6 Pre-Activation block for U15 onto each athlete's
// EXISTING personal "Pre-Activation" calendar (Tue/Wed/Thu above their lift,
// plus a Friday pre-activation-only session). Unlike sync_preactivation_personal
// this never deletes calendars — the July–Oct history stays intact.
//
// Plan rows come from scripts/u15_preactivation_oct6_nov6.json (one row per
// athlete × date × slot). Refuses to run if any Pre-Activation workout already
// exists in the date range, and rolls back its own inserts on failure.

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const CATEGORY_FOR_NEW = {
  'Single Leg Balance Cone Pickup': 'Warm-Up',
  'Standing Hip CARs': 'Lower Mobility', 'Pelvic Tilt with 3s ISO': 'Lower Mobility',
  'Deep Squat to Hamstring Stretch': 'Lower Mobility', 'Pigeon Stretch with Forward Fold': 'Lower Mobility',
  'Hip Flexor to Hamstring Stretch': 'Lower Mobility',
  'Banded Knee Drives': 'Accessory', 'Mini Band Fire Hydrants (Slow)': 'Accessory',
  'Single Leg Groiners': 'Plyometrics', 'Single Leg Depth Drop': 'Plyometrics', 'Partner Banded Skaters': 'Plyometrics',
  'Single Leg Sit to Stand Jumps': 'Plyometrics', 'C Skips': 'Speed',
  'MB Rotational Throws to Wall': 'Core', 'Bear Crawl Shoulder Taps': 'Core',
  'Hanging Straight Leg Raises': 'Core', 'Straight Leg Bicycle Crunch': 'Core',
};

function fail(msg) { console.error('FATAL:', msg); process.exit(1); }

const rows = JSON.parse(fs.readFileSync('scripts/u15_preactivation_oct6_nov6.json', 'utf8'));
const athleteNames = [...new Set(rows.map(r => r.athlete))];
const dates = [...new Set(rows.map(r => r.date))].sort();
console.log(`Loaded ${rows.length} rows: ${athleteNames.length} athletes, ${dates[0]} → ${dates.at(-1)}`);

// ── Athletes + their personal Pre-Activation calendars ──────────────────────
const { data: profiles, error: pErr } = await supabase
  .from('profiles').select('id, full_name').eq('role', 'athlete').in('full_name', athleteNames);
if (pErr) fail(pErr.message);
const athleteIdByName = Object.fromEntries(profiles.map(p => [p.full_name, p.id]));
for (const n of athleteNames) if (!athleteIdByName[n]) fail(`No profile for ${n}`);

const { data: cals, error: cErr } = await supabase
  .from('calendars').select('id, athlete_id, coach_id').eq('name', 'Pre-Activation').in('athlete_id', Object.values(athleteIdByName));
if (cErr) fail(cErr.message);
const calByAthlete = {};
for (const c of cals) {
  if (calByAthlete[c.athlete_id]) fail(`Multiple Pre-Activation calendars for athlete ${c.athlete_id}`);
  calByAthlete[c.athlete_id] = c;
}
for (const n of athleteNames) if (!calByAthlete[athleteIdByName[n]]) fail(`No Pre-Activation calendar for ${n}`);
const coachId = cals[0].coach_id;

const { count: existing, error: exErr } = await supabase
  .from('workouts').select('id', { count: 'exact', head: true })
  .in('calendar_id', cals.map(c => c.id)).gte('date', dates[0]).lte('date', dates.at(-1));
if (exErr) fail(exErr.message);
if (existing > 0) fail(`${existing} Pre-Activation workouts already exist in ${dates[0]}–${dates.at(-1)}; refusing to double-insert.`);

// ── Exercise library ────────────────────────────────────────────────────────
const exerciseNames = [...new Set(rows.map(r => r.exercise))];
const { data: found, error: fErr } = await supabase.from('exercises').select('id, name').in('name', exerciseNames);
if (fErr) fail(fErr.message);
const exerciseIdByName = Object.fromEntries(found.map(e => [e.name, e.id]));
const missing = exerciseNames.filter(n => !exerciseIdByName[n]);
if (missing.length > 0) {
  const { data: categories } = await supabase.from('exercise_categories').select('id, name');
  const categoryId = Object.fromEntries(categories.map(c => [c.name, c.id]));
  const { data: inserted, error } = await supabase.from('exercises').insert(
    missing.map(name => ({ name, category_id: categoryId[CATEGORY_FOR_NEW[name] ?? 'Accessory'] ?? null, is_public: true, created_by: coachId }))
  ).select('id, name');
  if (error) fail(error.message);
  for (const e of inserted) exerciseIdByName[e.name] = e.id;
}
console.log(`Exercise library ready: ${exerciseNames.length} exercises (${missing.length} newly created)`);

// ── Workouts + exercises ────────────────────────────────────────────────────
const byAthleteDate = {};
for (const r of rows) (byAthleteDate[`${r.athlete}|${r.date}`] ??= []).push(r);

const createdWorkoutIds = [];
async function rollback(msg) {
  console.error('ERROR:', msg, `— rolling back ${createdWorkoutIds.length} workouts`);
  if (createdWorkoutIds.length) await supabase.from('workouts').delete().in('id', createdWorkoutIds);
  process.exit(1);
}

let exerciseRows = 0;
for (const name of athleteNames) {
  const calendarId = calByAthlete[athleteIdByName[name]].id;
  const athleteDates = dates.filter(d => byAthleteDate[`${name}|${d}`]);
  const { data: workouts, error: wErr } = await supabase
    .from('workouts')
    .insert(athleteDates.map(date => ({ calendar_id: calendarId, date, title: 'Pre-Activation', notes: null, is_locked: false })))
    .select('id, date');
  if (wErr) await rollback(wErr.message);
  createdWorkoutIds.push(...workouts.map(w => w.id));

  const weRows = workouts.flatMap(w =>
    byAthleteDate[`${name}|${w.date}`]
      .slice().sort((a, b) => a.slot.localeCompare(b.slot))
      .map((r, i) => ({
        workout_id: w.id,
        exercise_id: exerciseIdByName[r.exercise],
        sort_order: i,
        sets: r.sets,
        reps: String(r.reps),
        superset_group: r.slot,
        notes: r.notes ?? null,
      }))
  );
  const { error: weErr } = await supabase.from('workout_exercises').insert(weRows);
  if (weErr) await rollback(weErr.message);
  exerciseRows += weRows.length;
  console.log(`  ${name}: ${workouts.length} sessions`);
}

console.log(`\nDONE. Created ${createdWorkoutIds.length} Pre-Activation workouts (${exerciseRows} exercise rows).`);
