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
const U13_CAL_ID = '1ed2e41e-2189-4b24-9205-f29235206ce6';
const U14_CAL_ID = '06d4aeab-2fbc-4f56-af9f-dbcf5ebff51e';
const KEANU_ID = 'c84d5fb8-224f-4897-a57f-3e86a0178a6f';

function randDigits() { return Math.floor(1000 + Math.random() * 9000); }
function shiftToThursday(dateStr) {
  // U14 workouts fall on Tuesdays; Keanu needs his lift on Thursdays -> +2 days.
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 2);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------
// 1. Add 3 new players to U13 roster.
// U13 already has one shared team calendar, so team_membership alone
// gives them the U13 workouts (app unions calendars by team_id).
// ---------------------------------------------------------------
const NEW_PLAYERS = [
  { name: 'Noah Franco', email: 'noah.franco@placeholder.powerplan.local' },
  { name: 'Luke Thurlow', email: 'luke.thurlow@placeholder.powerplan.local' },
  { name: 'Kristijan Barisic', email: 'kristijan.barisic@placeholder.powerplan.local' },
];

for (const p of NEW_PLAYERS) {
  const lastName = p.name.split(' ').at(-1);
  const password = `U13-${lastName}-${randDigits()}`;

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: p.email,
    password,
    user_metadata: { role: 'athlete', full_name: p.name },
    email_confirm: true,
  });
  if (createErr || !created.user) fail(`${p.name}: ${createErr?.message ?? 'failed to create account'}`);

  const { error: profileErr } = await supabase.from('profiles').upsert(
    { id: created.user.id, full_name: p.name, role: 'athlete' },
    { onConflict: 'id' }
  );
  if (profileErr) fail(`${p.name} profile: ${profileErr.message}`);

  const { error: memErr } = await supabase.from('team_memberships').upsert(
    { team_id: U13_TEAM_ID, athlete_id: created.user.id },
    { onConflict: 'team_id,athlete_id', ignoreDuplicates: true }
  );
  if (memErr) fail(`${p.name} membership: ${memErr.message}`);

  console.log(`Added ${p.name} to U13.  email=${p.email}  temp_password=${password}`);
}

// ---------------------------------------------------------------
// 2. Keanu: stays on U13 roster, gets an individual calendar cloned
// from U14's program, rescheduled Tue -> Thu so his lift lands on
// Thursday. Any date that collides with an existing U13 Thursday
// workout is skipped (U13's shared Thursday session already covers
// that date for him; no duplicate entry is created).
// ---------------------------------------------------------------
const CAL_NAME = 'Keanu — U14 Program';

const { data: u13Workouts, error: u13Err } = await supabase
  .from('workouts').select('date').eq('calendar_id', U13_CAL_ID);
if (u13Err) fail(u13Err.message);
const u13Dates = new Set(u13Workouts.map(w => w.date));

const { data: u14Cal, error: u14CalErr } = await supabase
  .from('calendars').select('color').eq('id', U14_CAL_ID).single();
if (u14CalErr) fail(u14CalErr.message);

// idempotency: remove any prior run's calendar of the same name
const { data: existingCal, error: exErr } = await supabase
  .from('calendars').select('id').eq('athlete_id', KEANU_ID).eq('name', CAL_NAME);
if (exErr) fail(exErr.message);
if (existingCal.length) {
  const { error } = await supabase.from('calendars').delete().in('id', existingCal.map(c => c.id));
  if (error) fail(error.message);
  console.log(`Removed ${existingCal.length} pre-existing "${CAL_NAME}" calendar(s).`);
}

const { data: newCal, error: calErr } = await supabase
  .from('calendars')
  .insert({ name: CAL_NAME, coach_id: COACH_ID, athlete_id: KEANU_ID, team_id: null, color: u14Cal.color })
  .select('id').single();
if (calErr || !newCal) fail(calErr?.message ?? 'failed to create calendar');

const { data: u14Workouts, error: u14wErr } = await supabase
  .from('workouts').select('id, date, title, notes').eq('calendar_id', U14_CAL_ID).order('date');
if (u14wErr) fail(u14wErr.message);

let created = 0, skipped = 0, exerciseCount = 0;
for (const w of u14Workouts) {
  const newDate = shiftToThursday(w.date);
  if (u13Dates.has(newDate)) { skipped++; continue; }

  const { data: newWorkout, error: nwErr } = await supabase
    .from('workouts')
    .insert({ calendar_id: newCal.id, date: newDate, title: w.title, notes: w.notes })
    .select('id').single();
  if (nwErr || !newWorkout) fail(nwErr?.message ?? 'failed to create workout');
  created++;

  const { data: workoutExercises, error: weErr } = await supabase
    .from('workout_exercises').select('*').eq('workout_id', w.id).order('sort_order');
  if (weErr) fail(weErr.message);

  if (workoutExercises.length) {
    const { error: insErr } = await supabase.from('workout_exercises').insert(
      workoutExercises.map(we => ({
        workout_id: newWorkout.id,
        exercise_id: we.exercise_id,
        sort_order: we.sort_order,
        sets: we.sets,
        reps: we.reps,
        load: we.load,
        load_type: we.load_type,
        tempo: we.tempo,
        rest_seconds: we.rest_seconds,
        notes: we.notes,
        is_pr_tracking: we.is_pr_tracking,
        superset_group: we.superset_group,
      }))
    );
    if (insErr) fail(insErr.message);
    exerciseCount += workoutExercises.length;
  }
}

console.log(`\nKeanu: created ${created} Thursday workout(s) (${exerciseCount} exercises) on individual U14-cloned calendar.`);
console.log(`Skipped ${skipped} date(s) that collide with existing U13 Thursday workouts (he already sees those via the U13 team calendar).`);
console.log('\nDONE.');
