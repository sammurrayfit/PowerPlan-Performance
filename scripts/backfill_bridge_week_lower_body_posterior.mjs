import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
function fail(msg) { console.error('FATAL:', msg); process.exit(1); }

// Bridges the gap between today and the Sept-Oct program's 9/8 start for the
// three athletes who never got a "U15 July–August 2026" individual calendar
// (Saul Luna, Callum Vonwimmer, Liam Linke), using the same Program 2 doc
// template and VALD NordBord/HipForce individualization rules the rest of
// the roster's Sept-Oct program was built from.
const LBP_DATE = '2026-09-03';
const UPPER_DATE = '2026-09-04';
const CAL_NAME = 'U15 September–October 2026';

const FIXED_LBP = [
  { name: 'Barbell Hip Thrust', sets: 4, reps: '6,5,5,4', notes: 'As reps decrease, weight increases' },
  { name: 'Hamstring Bridge Catch', sets: 3, reps: '2', notes: null },
  // B1/B2 filled per-athlete below
  { name: 'GHD or Bench Reverse Hyper', sets: 2, reps: '6', notes: null },
  { name: 'Reverse Plank Knees To Chest', sets: 2, reps: '6', notes: null },
];

// Derived from VALD_NordBord (hamstring, "Nordic" test) and VALD_HipForce
// ("Pull" = abduction) latest tests as of 2026-07-20/28, >10% asymmetry rule.
const INDIVIDUAL_B = {
  'Saul Luna': [
    { name: 'Staggered Stance RDL', sets: 3, reps: '6', notes: 'Extra set Right (hamstring asymmetry)' },
    { name: 'Keiser Abduction', sets: 3, reps: '6', notes: null },
  ],
  'Callum Vonwimmer': [
    { name: 'Staggered Stance RDL', sets: 3, reps: '6', notes: null },
    { name: 'Crossover Step Up', sets: 3, reps: '6', notes: null },
  ],
  'Liam Linke': [
    { name: 'Staggered Stance RDL', sets: 3, reps: '6', notes: 'Extra set Left (hamstring asymmetry)' },
    { name: 'Keiser Abduction', sets: 3, reps: '6', notes: null },
  ],
};

const TARGET_NAMES = Object.keys(INDIVIDUAL_B);

const { data: targetProfiles, error: pErr } = await supabase
  .from('profiles').select('id, full_name').in('full_name', TARGET_NAMES);
if (pErr) fail(pErr.message);
const profileByName = Object.fromEntries(targetProfiles.map(p => [p.full_name, p]));
for (const n of TARGET_NAMES) if (!profileByName[n]) fail(`Athlete "${n}" not found`);

// Resolve all needed exercise ids by name once.
const allExNames = [...new Set([
  ...FIXED_LBP.map(e => e.name),
  ...Object.values(INDIVIDUAL_B).flat().map(e => e.name),
])];
const { data: exRows, error: exErr } = await supabase.from('exercises').select('id, name').in('name', allExNames);
if (exErr) fail(exErr.message);
const exIdByName = Object.fromEntries(exRows.map(e => [e.name, e.id]));
for (const n of allExNames) if (!exIdByName[n]) fail(`Exercise "${n}" not found in exercises table`);

for (const name of TARGET_NAMES) {
  const athlete = profileByName[name];
  console.log(`\n=== ${name} (${athlete.id}) ===`);

  const { data: cal, error: calErr } = await supabase
    .from('calendars').select('id').eq('athlete_id', athlete.id).eq('name', CAL_NAME).single();
  if (calErr || !cal) fail(`No "${CAL_NAME}" calendar for ${name}`);

  // --- Lower Body Posterior (idempotent: replace if a row already exists) ---
  const { data: existingLBP } = await supabase.from('workouts').select('id').eq('calendar_id', cal.id).eq('date', LBP_DATE);
  if (existingLBP?.length) {
    await supabase.from('workouts').delete().in('id', existingLBP.map(w => w.id));
    console.log(`  Removed ${existingLBP.length} existing workout(s) on ${LBP_DATE}.`);
  }

  const b = INDIVIDUAL_B[name];
  const lbpExercises = [FIXED_LBP[0], FIXED_LBP[1], b[0], b[1], FIXED_LBP[2], FIXED_LBP[3]];

  const { data: lbpWorkout, error: lbpErr } = await supabase
    .from('workouts').insert({ calendar_id: cal.id, date: LBP_DATE, title: 'Lower Body Posterior', notes: null })
    .select('id').single();
  if (lbpErr || !lbpWorkout) fail(lbpErr?.message ?? 'Failed to create LBP workout');

  const { error: lbpExErr } = await supabase.from('workout_exercises').insert(
    lbpExercises.map((e, i) => ({
      workout_id: lbpWorkout.id,
      exercise_id: exIdByName[e.name],
      sort_order: i + 1,
      sets: e.sets,
      reps: e.reps,
      notes: e.notes,
    }))
  );
  if (lbpExErr) fail(lbpExErr.message);
  console.log(`  Created ${LBP_DATE} Lower Body Posterior (${lbpExercises.length} exercises).`);

  // --- Upper Body: not individualized per the program doc, so clone the
  // athlete's OWN existing Sept-Oct "Upper Body" session verbatim. ---
  const { data: existingUpper } = await supabase.from('workouts').select('id').eq('calendar_id', cal.id).eq('date', UPPER_DATE);
  if (existingUpper?.length) {
    await supabase.from('workouts').delete().in('id', existingUpper.map(w => w.id));
    console.log(`  Removed existing workout(s) on ${UPPER_DATE}.`);
  }

  const { data: srcWorkout, error: srcErr } = await supabase
    .from('workouts').select('id').eq('calendar_id', cal.id).eq('title', 'Upper Body').order('date').limit(1).single();
  if (srcErr || !srcWorkout) fail(`No existing "Upper Body" workout found to clone for ${name}`);
  const { data: srcEx, error: srcExErr } = await supabase
    .from('workout_exercises').select('*').eq('workout_id', srcWorkout.id).order('sort_order');
  if (srcExErr) fail(srcExErr.message);

  const { data: upperWorkout, error: upperErr } = await supabase
    .from('workouts').insert({ calendar_id: cal.id, date: UPPER_DATE, title: 'Upper Body', notes: null })
    .select('id').single();
  if (upperErr || !upperWorkout) fail(upperErr?.message ?? 'Failed to create Upper Body workout');

  const { error: upperExErr } = await supabase.from('workout_exercises').insert(
    srcEx.map((we) => ({
      workout_id: upperWorkout.id,
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
  if (upperExErr) fail(upperExErr.message);
  console.log(`  Created ${UPPER_DATE} Upper Body (${srcEx.length} exercises, cloned from own program).`);
}

console.log('\nDONE.');
