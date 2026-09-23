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

const U13_CAL_ID = '1ed2e41e-2189-4b24-9205-f29235206ce6';
const COACH_ID = '43693c20-d17e-44d5-9e67-58b49db8bd15';
const APPLY = process.argv.includes('--apply');

const DATES = ['2026-10-29', '2026-11-05', '2026-11-12', '2026-11-19', '2026-12-03']; // Thu, skip Thanksgiving week (11/26)

// Base (week 1) prescription: [exercise name, superset_group, sets, baseReps,
// each (display suffix only), isA2 (the one exercise that gets +1/week instead of +2/week)]
const BASE = [
  { name: 'Landmine Squat',    group: 'A', sets: 3, reps: 8, each: false, isA2: false },
  { name: 'Depth Drop',        group: 'A', sets: 3, reps: 3, each: true,  isA2: true  },
  { name: 'Banded Chin Ups',   group: 'B', sets: 3, reps: 8, each: false, isA2: false },
  { name: 'Medicine Ball Slams', group: 'B', sets: 3, reps: 4, each: true, isA2: false },
  { name: 'Banded Hip Hinges', group: 'C', sets: 3, reps: 8, each: false, isA2: false },
  { name: 'DB Bench Press',    group: 'C', sets: 3, reps: 8, each: false, isA2: false },
  { name: 'Prone X',           group: 'D', sets: 2, reps: 8, each: false, isA2: false },
  { name: 'Birddogs',          group: 'D', sets: 2, reps: 5, each: false, isA2: false },
];
const NEW_EXERCISES = ['Banded Chin Ups', 'DB Bench Press'];

// Verify all target dates are Thursdays
for (const d of DATES) {
  const day = new Date(d + 'T00:00:00Z').getUTCDay();
  if (day !== 4) fail(`${d} is not a Thursday (day=${day})`);
}

// Week-over-week reps: week1 = base; week2 = +1 to A2 (Depth Drop), +2 to everyone else;
// week3 = same rule applied again on top of week2; week4 = same as week2; week5 = same as week3.
function repsForWeek(base, isA2, weekIndex) {
  // weekIndex: 0..4 corresponding to DATES
  const bumps = [0, 1, 2, 1, 2]; // cumulative applications of the week-2 rule
  const n = bumps[weekIndex];
  const inc = isA2 ? 1 : 2;
  return base + n * inc;
}

console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — building Program 3 (Total Body) for U13, 5 weeks\n`);

// Preview the full progression
for (let w = 0; w < DATES.length; w++) {
  console.log(`Week ${w + 1} (${DATES[w]}):`);
  for (const ex of BASE) {
    const r = repsForWeek(ex.reps, ex.isA2, w);
    console.log(`  [${ex.group}] ${ex.name}: ${ex.sets}x${r}${ex.each ? ' each' : ''}`);
  }
}

if (!APPLY) {
  console.log('\nDry run only. Re-run with --apply to commit.');
  process.exit(0);
}

console.log('\nApplying...');

// 1. Ensure new exercises exist
const { data: existingEx, error: exErr } = await supabase.from('exercises').select('id, name').in('name', BASE.map(e => e.name));
if (exErr) fail(exErr.message);
const exIdByName = Object.fromEntries(existingEx.map(e => [e.name, e.id]));
const missing = NEW_EXERCISES.filter(n => !exIdByName[n]);
if (missing.length > 0) {
  const { data: inserted, error: insErr } = await supabase
    .from('exercises')
    .insert(missing.map(name => ({ name, category_id: null, is_public: false, created_by: COACH_ID })))
    .select('id, name');
  if (insErr) fail(insErr.message);
  for (const e of inserted) exIdByName[e.name] = e.id;
  console.log('Created new exercises:', missing.join(', '));
}
for (const ex of BASE) {
  if (!exIdByName[ex.name]) fail(`Exercise "${ex.name}" could not be resolved`);
}

// 2. Create the 5 workouts + their exercises
for (let w = 0; w < DATES.length; w++) {
  const { data: workout, error: woErr } = await supabase
    .from('workouts')
    .insert({ calendar_id: U13_CAL_ID, date: DATES[w], title: 'Total Body' })
    .select('id')
    .single();
  if (woErr) fail(`${DATES[w]}: ${woErr.message}`);

  const rows = BASE.map((ex, i) => ({
    workout_id: workout.id,
    exercise_id: exIdByName[ex.name],
    sort_order: i,
    superset_group: ex.group,
    sets: ex.sets,
    reps: `${repsForWeek(ex.reps, ex.isA2, w)}${ex.each ? ' each' : ''}`,
    load_type: 'absolute',
  }));
  const { error: weErr } = await supabase.from('workout_exercises').insert(rows);
  if (weErr) fail(`${DATES[w]}: ${weErr.message}`);

  console.log(`  ✓ ${DATES[w]} (workout ${workout.id})`);
}

console.log('\nDONE.');
