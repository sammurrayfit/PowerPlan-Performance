import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Merges the U15 Lower Body Anterior (Tue Nov 3) and Lower Body Posterior
// (Wed Nov 4) sessions into one "Lower Body" session on Wed Nov 4
// (coach-confirmed): Posterior's A block, Anterior's B block, Posterior's C
// block. Posterior's B rows are deleted, Anterior's B rows are moved onto
// Wednesday, and the Tuesday lift session is deleted along with its remaining
// rows. Pre-Activation is untouched. Aborts if either session has logged sets.
// --week=YYYY-MM-DD (that week's Monday) runs the same merge on a later week.
//
// Usage: node scripts/u15_merge_lower_body_nov3_nov4.mjs [--week=2026-11-09] [--apply]

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
function fail(msg) { console.error('FATAL:', msg); process.exit(1); }
const APPLY = process.argv.includes('--apply');

const U15_TEAM_ID = 'd9f87d34-0e07-40f6-b92d-4a1da2fef2d1';
const CAL_NAME = 'U15 September–October 2026';
function addDays(d, n) { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
const MONDAY = process.argv.find(a => a.startsWith('--week='))?.slice('--week='.length) ?? '2026-11-02';
if (new Date(`${MONDAY}T12:00:00Z`).getUTCDay() !== 1) fail(`--week must be a Monday (got ${MONDAY})`);
const ANT = { date: addDays(MONDAY, 1), title: 'Lower Body Anterior' };
const POST = { date: addDays(MONDAY, 2), title: 'Lower Body Posterior' };
const NEW_TITLE = 'Lower Body';

const { data: memberships, error: mErr } = await supabase.from('team_memberships').select('athlete_id, profiles:athlete_id(full_name)').eq('team_id', U15_TEAM_ID);
if (mErr) fail(mErr.message);
const nameOf = Object.fromEntries(memberships.map(m => [m.athlete_id, m.profiles.full_name]));
const { data: calendars, error: cErr } = await supabase.from('calendars').select('id, athlete_id').in('athlete_id', Object.keys(nameOf)).eq('name', CAL_NAME);
if (cErr) fail(cErr.message);
const { data: workouts, error: wErr } = await supabase.from('workouts').select('id, calendar_id, date, title')
  .in('calendar_id', calendars.map(c => c.id)).in('date', [ANT.date, POST.date]);
if (wErr) fail(wErr.message);

const rows = [];
for (let i = 0; i < workouts.length; i += 20) {
  const { data, error } = await supabase.from('workout_exercises').select('id, workout_id, sort_order, superset_group, exercises(name)')
    .in('workout_id', workouts.slice(i, i + 20).map(w => w.id));
  if (error) fail(error.message);
  rows.push(...data);
}
const { data: logs, error: lErr } = await supabase.from('exercise_logs').select('workout_id').in('workout_id', workouts.map(w => w.id));
if (lErr) fail(lErr.message);
if (logs.length) fail(`${logs.length} logged sets exist on these sessions — not merging`);

const plans = [];
for (const cal of calendars) {
  const athlete = nameOf[cal.athlete_id];
  const ant = workouts.filter(w => w.calendar_id === cal.id && w.date === ANT.date && w.title === ANT.title);
  const post = workouts.filter(w => w.calendar_id === cal.id && w.date === POST.date && w.title === POST.title);
  if (!ant.length && !post.length) { console.log(`  skip  ${athlete}: no sessions that week`); continue; }
  if (ant.length !== 1 || post.length !== 1) fail(`${athlete}: expected one Anterior and one Posterior session, found ${ant.length}/${post.length}`);
  const antRows = rows.filter(r => r.workout_id === ant[0].id), postRows = rows.filter(r => r.workout_id === post[0].id);
  const antB = antRows.filter(r => r.superset_group === 'B');
  if (!antB.length) fail(`${athlete}: Anterior has no B block`);
  if ([...antRows, ...postRows].some(r => !['A', 'B', 'C'].includes(r.superset_group))) fail(`${athlete}: unexpected block outside A/B/C`);
  plans.push({
    athlete, antId: ant[0].id, postId: post[0].id,
    keepA: postRows.filter(r => r.superset_group === 'A'),
    dropB: postRows.filter(r => r.superset_group === 'B'),
    moveB: antB.sort((a, b) => a.sort_order - b.sort_order),
    keepC: postRows.filter(r => r.superset_group === 'C'),
    dropAnt: antRows.filter(r => r.superset_group !== 'B'),
  });
}

const names = list => list.map(r => r.exercises.name).join(', ') || '—';
console.log(APPLY ? 'APPLYING' : 'DRY RUN');
for (const p of plans) {
  console.log(`\n${p.athlete}`);
  console.log(`  A (posterior): ${names(p.keepA)}`);
  console.log(`  B (anterior):  ${names(p.moveB)}`);
  if (p.keepC.length) console.log(`  C (posterior): ${names(p.keepC)}`);
  console.log(`  removed: posterior B [${names(p.dropB)}]; Tue anterior [${names(p.dropAnt)}]`);
}
console.log(`\n${plans.length} athletes`);
if (!APPLY) { console.log('\nDry run only. Re-run with --apply.'); process.exit(0); }

for (const p of plans) {
  if (p.dropB.length) {
    const { error } = await supabase.from('workout_exercises').delete().in('id', p.dropB.map(r => r.id));
    if (error) fail(`${p.athlete} delete posterior B: ${error.message}`);
  }
  const ordered = [...p.keepA.sort((a, b) => a.sort_order - b.sort_order), ...p.moveB, ...p.keepC.sort((a, b) => a.sort_order - b.sort_order)];
  for (const [i, r] of ordered.entries()) {
    const { error } = await supabase.from('workout_exercises').update({ workout_id: p.postId, sort_order: i }).eq('id', r.id);
    if (error) fail(`${p.athlete} place ${r.exercises.name}: ${error.message}`);
  }
  const { error: tErr } = await supabase.from('workouts').update({ title: NEW_TITLE }).eq('id', p.postId);
  if (tErr) fail(`${p.athlete} rename: ${tErr.message}`);
  // Cascades to the Tuesday session's remaining A/C rows.
  const { error: dErr } = await supabase.from('workouts').delete().eq('id', p.antId);
  if (dErr) fail(`${p.athlete} delete Tue session: ${dErr.message}`);
}
console.log(`\nDONE. Merged ${plans.length} athletes into "${NEW_TITLE}" on ${POST.date}.`);
