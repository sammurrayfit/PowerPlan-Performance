import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
function fail(msg) { console.error('FATAL:', msg); process.exit(1); }

// Epley estimated 1RM -- matches src/lib/pr.ts's epley1RM exactly.
function epley1RM(weight, reps) {
  if (reps <= 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

const BENCH_EXERCISE_ID = 'd96047d3-bda1-4df7-825a-b8ca55a78a3f'; // Barbell Bench Press

const { data: testWorkout, error: wErr } = await supabase
  .from('workouts').select('id, date').eq('title', '3RM Barbell Bench').single();
if (wErr || !testWorkout) fail(`"3RM Barbell Bench" test workout not found: ${wErr?.message}`);

const { data: logs, error: lErr } = await supabase
  .from('exercise_logs').select('athlete_id, reps_completed, load_completed')
  .eq('workout_id', testWorkout.id);
if (lErr) fail(lErr.message);
console.log(`Found ${logs.length} logged sets from ${testWorkout.date}.`);

// Best (max) Epley estimate per athlete across all their logged sets that day.
const bestByAthlete = {};
for (const l of logs) {
  if (l.reps_completed == null || l.load_completed == null) continue;
  const est = epley1RM(l.load_completed, l.reps_completed);
  if (!bestByAthlete[l.athlete_id] || est > bestByAthlete[l.athlete_id]) {
    bestByAthlete[l.athlete_id] = est;
  }
}

// Skip anyone who already has a Barbell Bench Press max on file (avoid duplicates on re-run).
const { data: existingMaxes, error: emErr } = await supabase
  .from('maxes').select('athlete_id').eq('exercise_id', BENCH_EXERCISE_ID);
if (emErr) fail(emErr.message);
const alreadyHasMax = new Set((existingMaxes ?? []).map(m => m.athlete_id));

const { data: profiles } = await supabase.from('profiles').select('id, full_name');
const nameById = Object.fromEntries((profiles ?? []).map(p => [p.id, p.full_name]));

const toInsert = Object.entries(bestByAthlete)
  .filter(([athleteId]) => !alreadyHasMax.has(athleteId))
  .map(([athleteId, value]) => ({
    exercise_id: BENCH_EXERCISE_ID,
    athlete_id: athleteId,
    value,
    unit: 'lbs',
    date_recorded: testWorkout.date,
  }));

if (toInsert.length === 0) { console.log('Nothing to insert.'); process.exit(0); }

const { error: insErr } = await supabase.from('maxes').insert(toInsert);
if (insErr) fail(insErr.message);

console.log(`\nInserted ${toInsert.length} Barbell Bench Press maxes:`);
for (const row of toInsert) console.log(`  ${nameById[row.athlete_id] ?? row.athlete_id}: ${row.value} lbs`);

const skipped = Object.keys(bestByAthlete).filter(id => alreadyHasMax.has(id));
if (skipped.length) console.log(`\nSkipped (already had a max on file): ${skipped.map(id => nameById[id]).join(', ')}`);
