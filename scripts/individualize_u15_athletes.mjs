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
const U15_TEAM_ID = 'd9f87d34-0e07-40f6-b92d-4a1da2fef2d1';
const U14_TEAM_ID = 'b79126ca-8cab-42f6-9526-c105007eaf74';
const TEMPLATE_NAME = 'Omari Coke';

// Athletes to bring onto the individualized U15 program.
// moveFromU14: true means they currently belong to U14 and should be moved (not added) to U15.
const TARGETS = [
  { name: 'Thiago Romany', moveFromU14: false },
  { name: 'Keziah Mbaye', moveFromU14: true },
  { name: 'Matthew Gonzalez', moveFromU14: true },
];

const { data: template, error: tErr } = await supabase
  .from('profiles').select('id').eq('full_name', TEMPLATE_NAME).single();
if (tErr || !template) fail(`Template athlete "${TEMPLATE_NAME}" not found`);

const { data: templateCals, error: tcErr } = await supabase
  .from('calendars').select('id, name, color').eq('athlete_id', template.id);
if (tcErr) fail(tcErr.message);
console.log(`Template "${TEMPLATE_NAME}" has ${templateCals.length} calendars: ${templateCals.map(c => c.name).join(', ')}`);

const { data: targetProfiles, error: pErr } = await supabase
  .from('profiles').select('id, full_name').in('full_name', TARGETS.map(t => t.name));
if (pErr) fail(pErr.message);
const profileByName = Object.fromEntries(targetProfiles.map(p => [p.full_name, p]));
for (const t of TARGETS) if (!profileByName[t.name]) fail(`Athlete "${t.name}" not found`);

for (const target of TARGETS) {
  const athlete = profileByName[target.name];
  console.log(`\n=== ${target.name} (${athlete.id}) ===`);

  // Team membership: move to U15
  if (target.moveFromU14) {
    const { error: delErr } = await supabase
      .from('team_memberships').delete().eq('team_id', U14_TEAM_ID).eq('athlete_id', athlete.id);
    if (delErr) fail(delErr.message);
    console.log('Removed from U14.');
  }
  const { error: memErr } = await supabase.from('team_memberships').upsert(
    { team_id: U15_TEAM_ID, athlete_id: athlete.id },
    { onConflict: 'team_id,athlete_id', ignoreDuplicates: true }
  );
  if (memErr) fail(memErr.message);
  console.log('On U15 roster.');

  // Remove any pre-existing individual calendars for this athlete with the same names
  // (so re-running this script is safe / idempotent).
  const { data: existing, error: exErr } = await supabase
    .from('calendars').select('id, name').eq('athlete_id', athlete.id).in('name', templateCals.map(c => c.name));
  if (exErr) fail(exErr.message);
  if (existing.length) {
    console.log(`Replacing ${existing.length} existing calendar(s): ${existing.map(c => c.name).join(', ')}`);
    const { error } = await supabase.from('calendars').delete().in('id', existing.map(c => c.id));
    if (error) fail(error.message);
  }

  // Clone each template calendar: new calendar row, then copy workouts + workout_exercises
  for (const tc of templateCals) {
    const { data: newCal, error: calErr } = await supabase
      .from('calendars')
      .insert({ name: tc.name, coach_id: COACH_ID, athlete_id: athlete.id, team_id: null, color: tc.color })
      .select('id').single();
    if (calErr || !newCal) fail(calErr?.message ?? 'Failed to create calendar');

    const { data: workouts, error: wErr } = await supabase
      .from('workouts').select('id, date, title, notes').eq('calendar_id', tc.id).order('date');
    if (wErr) fail(wErr.message);

    let workoutCount = 0;
    let exerciseCount = 0;
    for (const w of workouts) {
      const { data: newWorkout, error: nwErr } = await supabase
        .from('workouts')
        .insert({ calendar_id: newCal.id, date: w.date, title: w.title, notes: w.notes })
        .select('id')
        .single();
      if (nwErr || !newWorkout) fail(nwErr?.message ?? 'Failed to create workout');
      workoutCount++;

      const { data: workoutExercises, error: weErr } = await supabase
        .from('workout_exercises').select('*').eq('workout_id', w.id).order('sort_order');
      if (weErr) fail(weErr.message);

      if (workoutExercises.length) {
        const { error: insErr } = await supabase.from('workout_exercises').insert(
          workoutExercises.map((we) => ({
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
    console.log(`  ${tc.name}: ${workoutCount} workouts, ${exerciseCount} exercises`);
  }
}

console.log('\nDONE.');
