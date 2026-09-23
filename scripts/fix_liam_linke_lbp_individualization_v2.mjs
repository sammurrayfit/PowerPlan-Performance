import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
function fail(msg) { console.error('FATAL:', msg); process.exit(1); }

// Corrects a bad update from fix_liam_linke_lbp_individualization.mjs, which
// assumed 1-indexed sort_order (A1=1..C2=6) but the recurring weekly rows
// (everything except the one-off 2026-09-03 bridge workout) actually use
// 0-indexed sort_order (A1=0..C2=5). That script's sort_order===3/4 match
// hit B2 and C1 instead of B1/B2, leaving B1 ("Copenhagen Level 2 -- Extra
// set Right") wrong and wiping out the fixed C1 exercise ("GHD or Bench
// Reverse Hyper"), replacing it with "Keiser Abduction".
//
// Restores, for every recurring Lower Body Posterior workout (date != 2026-09-03):
//   sort_order 2 (B1) -> Staggered Stance RDL, "Extra set Left (hamstring asymmetry)"
//   sort_order 3 (B2) -> Keiser Abduction, no note
//   sort_order 4 (C1) -> GHD or Bench Reverse Hyper, no note (restoring what was lost)

const { data: liam, error: pErr } = await supabase.from('profiles').select('id').eq('full_name', 'Liam Linke').single();
if (pErr || !liam) fail('Liam Linke not found');

const { data: cal, error: cErr } = await supabase
  .from('calendars').select('id').eq('athlete_id', liam.id).eq('name', 'U15 September–October 2026').single();
if (cErr || !cal) fail('Sept-Oct calendar not found');

const { data: workouts, error: wErr } = await supabase
  .from('workouts').select('id, date').eq('calendar_id', cal.id).eq('title', 'Lower Body Posterior')
  .neq('date', '2026-09-03').order('date');
if (wErr) fail(wErr.message);
console.log(`Found ${workouts.length} recurring Lower Body Posterior workout(s) to correct (excluding the 9/3 bridge workout).`);

const { data: exRows, error: exErr } = await supabase
  .from('exercises').select('id, name').in('name', ['Staggered Stance RDL', 'Keiser Abduction', 'GHD or Bench Reverse Hyper']);
if (exErr) fail(exErr.message);
const exIdByName = Object.fromEntries(exRows.map(e => [e.name, e.id]));
for (const n of ['Staggered Stance RDL', 'Keiser Abduction', 'GHD or Bench Reverse Hyper']) {
  if (!exIdByName[n]) fail(`Missing exercise lookup: ${n}`);
}

for (const w of workouts) {
  const { data: rows, error: rErr } = await supabase
    .from('workout_exercises').select('id, sort_order, exercises(name)').eq('workout_id', w.id).order('sort_order');
  if (rErr) fail(rErr.message);

  const b1 = rows.find(r => r.sort_order === 2);
  const b2 = rows.find(r => r.sort_order === 3);
  const c1 = rows.find(r => r.sort_order === 4);
  if (!b1 || !b2 || !c1) { console.log(`  ${w.date}: unexpected sort_order layout (${rows.map(r=>r.sort_order).join(',')}), skipping.`); continue; }

  const before = `B1="${b1.exercises?.name}" B2="${b2.exercises?.name}" C1="${c1.exercises?.name}"`;

  const { error: e1 } = await supabase.from('workout_exercises')
    .update({ exercise_id: exIdByName['Staggered Stance RDL'], notes: 'Extra set Left (hamstring asymmetry)' })
    .eq('id', b1.id);
  if (e1) fail(e1.message);

  const { error: e2 } = await supabase.from('workout_exercises')
    .update({ exercise_id: exIdByName['Keiser Abduction'], notes: null })
    .eq('id', b2.id);
  if (e2) fail(e2.message);

  const { error: e3 } = await supabase.from('workout_exercises')
    .update({ exercise_id: exIdByName['GHD or Bench Reverse Hyper'], notes: null })
    .eq('id', c1.id);
  if (e3) fail(e3.message);

  console.log(`  ${w.date}: ${before} -> B1="Staggered Stance RDL" B2="Keiser Abduction" C1="GHD or Bench Reverse Hyper" (restored)`);
}

console.log('\nDONE.');
