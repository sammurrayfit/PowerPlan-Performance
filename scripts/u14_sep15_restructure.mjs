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

const WORKOUT_ID = 'f34bd6aa-794e-4c86-8f52-eb9c0a0a4565'; // U14 Total Body, 2026-09-15

// Rows to remove entirely
const REMOVE_IDS = [
  '480cf1d2-079b-4746-925f-eeafe2076885', // Countermovement Squat
  'e8485aea-606a-4a8d-86c4-f416f066f866', // Broad Jump
  '6d87d790-488a-43d9-a079-30bd2a5a2a86', // RDLs
];

// Existing rows to reposition (id -> new superset_group/sort_order)
const REPOSITION = [
  { id: '8199ffef-e125-4930-b98c-1af785e5a158', group: 'A', order: 0 }, // SA Lat Pulldown
  { id: '0a0d8c64-cfc1-4178-91da-078feb82d1c5', group: 'A', order: 1 }, // SA DB Bench Press
  { id: '88d1a0e4-bf4c-4be0-a9f1-6e556a194346', group: 'B', order: 3 }, // Seated DB Shoulder Press Bilateral
  { id: 'bbf1d098-e0ae-429b-8e69-13c071bf131a', group: 'C', order: 4 }, // Supermans
  { id: '3c4c5547-900a-4718-939a-57c33e7f7c36', group: 'C', order: 5 }, // Side Plank with Rotation
];

// 1. Delete unwanted exercises
const { error: delErr } = await supabase.from('workout_exercises').delete().in('id', REMOVE_IDS);
if (delErr) fail(delErr.message);
console.log(`Deleted ${REMOVE_IDS.length} exercises (Countermovement Squat, Broad Jump, RDLs)`);

// 2. Reposition existing exercises
for (const r of REPOSITION) {
  const { error } = await supabase.from('workout_exercises').update({ superset_group: r.group, sort_order: r.order }).eq('id', r.id);
  if (error) fail(error.message);
}
console.log(`Repositioned ${REPOSITION.length} existing exercises`);

// 3. Insert new Keiser Tricep Pushdown row at B2
const { data: exercise, error: exErr } = await supabase.from('exercises').select('id').eq('name', 'Keiser Tricep Pushdown').single();
if (exErr || !exercise) fail(exErr?.message ?? 'Keiser Tricep Pushdown not found');

const { error: insErr } = await supabase.from('workout_exercises').insert({
  workout_id: WORKOUT_ID,
  exercise_id: exercise.id,
  superset_group: 'B',
  sort_order: 2,
  sets: 3,
  reps: '8',
  load_type: 'absolute',
});
if (insErr) fail(insErr.message);
console.log('Inserted Keiser Tricep Pushdown at B2 (3x8)');

// Verify final state
const { data: final } = await supabase
  .from('workout_exercises')
  .select('superset_group, sort_order, sets, reps, exercises(name)')
  .eq('workout_id', WORKOUT_ID)
  .order('sort_order');
console.log('\nFinal workout structure:');
for (const e of final) console.log(`  [${e.superset_group}${e.sort_order}] ${e.exercises.name} | ${e.sets}x${e.reps}`);
