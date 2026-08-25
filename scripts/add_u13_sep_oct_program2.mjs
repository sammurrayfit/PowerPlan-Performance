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

const COACH_ID = '43693c20-d17e-44d5-9e67-58b49db8bd15';
const U13_TEAM_ID = 'a752669d-2ecc-44a0-b73d-739845c8f5c1';
const CAL_NAME = 'U13 September–October 2026';
const CAL_COLOR = '#f97316';

// Program 2 for U13, Sep-Oct 2026: one Total Body session/week, Thursdays.
// Reps progress: wk1 base, wk2 +2 (A2 +1), wk3 +4 (A2 +2), wk4 = wk2, wk5 = wk1. Sets constant.
const BASE = [
  { slot: 'A1', exercise: 'Countermovement Squat', sets: 3, reps: 8, suffix: '' },
  { slot: 'A2', exercise: 'Snap Downs', sets: 3, reps: 3, suffix: '', isA2: true },
  { slot: 'B1', exercise: 'Inverted Row', sets: 3, reps: 8, suffix: '' },
  { slot: 'B2', exercise: 'Banded Hip Hinges', sets: 3, reps: 8, suffix: '', isNew: true },
  { slot: 'B3', exercise: 'DB Floor Press', sets: 3, reps: 8, suffix: '', isNew: true },
  { slot: 'C1', exercise: 'Alt Supermans', sets: 3, reps: 8, suffix: ' each', isNew: true },
  { slot: 'C2', exercise: 'Birddogs', sets: 3, reps: 5, suffix: '', isNew: true },
];

const WEEK_DATES = ['2026-09-24', '2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'];
const REP_ADD = [0, 2, 4, 2, 0]; // per week, applied to everything except A2
const REP_ADD_A2 = [0, 1, 2, 1, 0]; // A2's own progression

function weekRows(weekIdx) {
  return BASE.map(r => {
    const add = r.isA2 ? REP_ADD_A2[weekIdx] : REP_ADD[weekIdx];
    return { ...r, reps: r.reps + add };
  });
}

// ── Exercises: resolve existing / create new ────────────────────────────────
const exerciseNames = [...new Set(BASE.map(r => r.exercise))];
const { data: existing, error: exErr } = await supabase.from('exercises').select('id, name').in('name', exerciseNames);
if (exErr) fail(exErr.message);
const exerciseIdByName = Object.fromEntries(existing.map(e => [e.name, e.id]));
const missing = exerciseNames.filter(n => !exerciseIdByName[n]);
if (missing.length) {
  const toInsert = missing.map(name => ({ name, category_id: null, is_public: false, created_by: COACH_ID }));
  const { data: inserted, error: insErr } = await supabase.from('exercises').insert(toInsert).select('id, name');
  if (insErr) fail(insErr.message);
  for (const e of inserted) exerciseIdByName[e.name] = e.id;
  console.log('Created new exercises:', missing.join(', '));
} else {
  console.log('All exercises already existed');
}

// ── Calendar: create (idempotent) ───────────────────────────────────────────
let { data: cal } = await supabase.from('calendars').select('id').eq('name', CAL_NAME).eq('team_id', U13_TEAM_ID).maybeSingle();
if (!cal) {
  const { data: newCal, error: calErr } = await supabase
    .from('calendars')
    .insert({ name: CAL_NAME, coach_id: COACH_ID, team_id: U13_TEAM_ID, athlete_id: null, color: CAL_COLOR })
    .select('id').single();
  if (calErr) fail(calErr.message);
  cal = newCal;
  console.log('Created calendar', CAL_NAME, cal.id);
} else {
  console.log('Reusing existing calendar', CAL_NAME, cal.id);
}

// Idempotency: remove any previously-synced workouts on these dates for this calendar.
const { data: existingWorkouts, error: ewErr } = await supabase
  .from('workouts').select('id').eq('calendar_id', cal.id).in('date', WEEK_DATES);
if (ewErr) fail(ewErr.message);
if (existingWorkouts.length) {
  console.log(`Deleting ${existingWorkouts.length} existing workouts on target dates (idempotent re-run)...`);
  const { error: delErr } = await supabase.from('workouts').delete().in('id', existingWorkouts.map(w => w.id));
  if (delErr) fail(delErr.message);
}

// ── Insert workouts + exercises ─────────────────────────────────────────────
let totalWorkouts = 0, totalExercises = 0;
for (let i = 0; i < WEEK_DATES.length; i++) {
  const date = WEEK_DATES[i];
  const { data: workout, error: wErr } = await supabase
    .from('workouts').insert({ calendar_id: cal.id, date, title: 'Total Body' }).select('id').single();
  if (wErr) fail(wErr.message);
  totalWorkouts++;

  const rows = weekRows(i).map((r, idx) => ({
    workout_id: workout.id,
    exercise_id: exerciseIdByName[r.exercise],
    sort_order: idx,
    sets: r.sets,
    reps: `${r.reps}${r.suffix}`,
    load: null,
    load_type: 'absolute',
    superset_group: r.slot,
  }));
  const { error: weErr } = await supabase.from('workout_exercises').insert(rows);
  if (weErr) fail(weErr.message);
  totalExercises += rows.length;
  console.log(`  ${date}: ${rows.length} exercises — ${rows.map(r => `${r.superset_group}:${r.reps}`).join(', ')}`);
}

console.log(`\nDONE. ${totalWorkouts} workouts, ${totalExercises} workout_exercises inserted on calendar "${CAL_NAME}" (team-wide, applies to all ${'20'} U13 roster athletes).`);
