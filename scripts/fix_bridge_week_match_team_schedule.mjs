import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
function fail(msg) { console.error('FATAL:', msg); process.exit(1); }

// Corrects backfill_bridge_week_lower_body_posterior.mjs: that script used the
// NEW Sept-Oct program's day mapping (Wed=Lower Body Posterior, Thu=Upper
// Body), but the other 26 U15 athletes' leftover "U15 July–August 2026"
// calendar only has ONE more session -- "Upper Body" on 2026-09-03 -- and
// nothing 9/4-9/7 (their program simply ends there too). So the correct
// bridge-week fix is: give Saul/Callum/Liam "Upper Body" on 9/3 (matching
// the team) and remove the standalone 9/4 session, since nobody else has
// anything that day either.
const WRONG_LBP_DATE = '2026-09-03';
const EXTRA_UPPER_DATE = '2026-09-04';
const CORRECT_DATE = '2026-09-03';
const TARGET_NAMES = ['Saul Luna', 'Callum Vonwimmer', 'Liam Linke'];
const CAL_NAME = 'U15 September–October 2026';

const { data: targetProfiles, error: pErr } = await supabase
  .from('profiles').select('id, full_name').in('full_name', TARGET_NAMES);
if (pErr) fail(pErr.message);
const profileByName = Object.fromEntries(targetProfiles.map(p => [p.full_name, p]));
for (const n of TARGET_NAMES) if (!profileByName[n]) fail(`Athlete "${n}" not found`);

for (const name of TARGET_NAMES) {
  const athlete = profileByName[name];
  console.log(`\n=== ${name} ===`);

  const { data: cal, error: cErr } = await supabase
    .from('calendars').select('id').eq('athlete_id', athlete.id).eq('name', CAL_NAME).single();
  if (cErr || !cal) fail(`No "${CAL_NAME}" calendar for ${name}`);

  // Grab the 9/4 "Upper Body" exercises (already correctly cloned from the
  // athlete's own program) before deleting that workout row.
  const { data: extraUpperWorkout, error: euErr } = await supabase
    .from('workouts').select('id').eq('calendar_id', cal.id).eq('date', EXTRA_UPPER_DATE).eq('title', 'Upper Body').maybeSingle();
  if (euErr) fail(euErr.message);
  if (!extraUpperWorkout) { console.log(`  No ${EXTRA_UPPER_DATE} Upper Body workout found, skipping.`); continue; }

  const { data: upperEx, error: upperExErr } = await supabase
    .from('workout_exercises').select('*').eq('workout_id', extraUpperWorkout.id).order('sort_order');
  if (upperExErr) fail(upperExErr.message);

  // Remove the wrong 9/3 Lower Body Posterior workout.
  const { data: wrongLBP, error: wlErr } = await supabase
    .from('workouts').select('id').eq('calendar_id', cal.id).eq('date', WRONG_LBP_DATE).eq('title', 'Lower Body Posterior').maybeSingle();
  if (wlErr) fail(wlErr.message);
  if (wrongLBP) {
    await supabase.from('workouts').delete().eq('id', wrongLBP.id);
    console.log(`  Removed ${WRONG_LBP_DATE} "Lower Body Posterior".`);
  }

  // Remove the (now redundant) 9/4 Upper Body workout.
  await supabase.from('workouts').delete().eq('id', extraUpperWorkout.id);
  console.log(`  Removed ${EXTRA_UPPER_DATE} "Upper Body" (moving it to ${CORRECT_DATE}).`);

  // Recreate Upper Body on 9/3 to match the rest of the team.
  const { data: newWorkout, error: nwErr } = await supabase
    .from('workouts').insert({ calendar_id: cal.id, date: CORRECT_DATE, title: 'Upper Body', notes: null })
    .select('id').single();
  if (nwErr || !newWorkout) fail(nwErr?.message ?? 'Failed to create workout');

  const { error: insErr } = await supabase.from('workout_exercises').insert(
    upperEx.map((we) => ({
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
  console.log(`  Created ${CORRECT_DATE} "Upper Body" (${upperEx.length} exercises) -- now matches the rest of the team.`);
}

console.log('\nDONE.');
