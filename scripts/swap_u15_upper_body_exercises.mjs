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

const U15_TEAM_ID = 'd9f87d34-0e07-40f6-b92d-4a1da2fef2d1';
const COACH_ID = '43693c20-d17e-44d5-9e67-58b49db8bd15';

const SWAPS = [
  { superset_group: 'B', sort_order: 2, fromName: '1/2 Kneeling KB Press', toName: '1/2 Kneeling Keiser Row' },
  { superset_group: 'D', sort_order: 8, fromName: 'KB Tricep Pushdown', toName: 'Keiser Tricep Pushdown' },
];

// Resolve U15 athletes -> their calendars -> Upper Body workouts
const { data: memberships, error: mErr } = await supabase.from('team_memberships').select('athlete_id').eq('team_id', U15_TEAM_ID);
if (mErr) fail(mErr.message);
const athleteIds = memberships.map(m => m.athlete_id);

const { data: calendars, error: cErr } = await supabase.from('calendars').select('id').in('athlete_id', athleteIds);
if (cErr) fail(cErr.message);
const calIds = calendars.map(c => c.id);

const { data: workouts, error: wErr } = await supabase.from('workouts').select('id, date').in('calendar_id', calIds).eq('title', 'Upper Body');
if (wErr) fail(wErr.message);
const woIds = workouts.map(w => w.id);
console.log(`Found ${woIds.length} Upper Body workouts across ${athleteIds.length} U15 athletes, dates: ${[...new Set(workouts.map(w => w.date))].sort().join(', ')}`);

// Ensure target exercises exist
const toNames = SWAPS.map(s => s.toName);
const { data: existingEx, error: eErr } = await supabase.from('exercises').select('id, name').in('name', toNames);
if (eErr) fail(eErr.message);
const exIdByName = Object.fromEntries(existingEx.map(e => [e.name, e.id]));
const missing = toNames.filter(n => !exIdByName[n]);
if (missing.length > 0) {
  const toInsert = missing.map(name => ({ name, category_id: null, is_public: false, created_by: COACH_ID }));
  const { data: inserted, error: insErr } = await supabase.from('exercises').insert(toInsert).select('id, name');
  if (insErr) fail(insErr.message);
  for (const e of inserted) exIdByName[e.name] = e.id;
  console.log('Created new exercises:', missing.join(', '));
} else {
  console.log('Target exercises already exist, reusing.');
}

let totalUpdated = 0;
for (const swap of SWAPS) {
  const targetExerciseId = exIdByName[swap.toName];
  const { data: updated, error: uErr } = await supabase
    .from('workout_exercises')
    .update({ exercise_id: targetExerciseId })
    .in('workout_id', woIds)
    .eq('superset_group', swap.superset_group)
    .eq('sort_order', swap.sort_order)
    .select('id, workout_id');
  if (uErr) fail(uErr.message);
  console.log(`Swapped "${swap.fromName}" -> "${swap.toName}" on ${updated.length} rows (expected ${woIds.length})`);
  totalUpdated += updated.length;
}

console.log('\nDONE. Total workout_exercises rows updated:', totalUpdated);
