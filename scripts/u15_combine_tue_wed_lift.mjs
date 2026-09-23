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

// Combine U15 Tue + Wed lifts into one Wednesday session:
//   Wed A (unchanged) / B = old Tue B / C = old Wed B. Old Tue A+C and old Wed C are dropped,
//   and the Tuesday lift workout is deleted. Pre-Activation workouts are untouched.
const U15_TEAM_ID = 'd9f87d34-0e07-40f6-b92d-4a1da2fef2d1';
const TUE = '2026-09-22';
const WED = '2026-09-23';
const APPLY = process.argv.includes('--apply');

const grp = e => (e.superset_group ?? '').toUpperCase();
const bySort = (a, b) => a.sort_order - b.sort_order;

const { data: memberships, error: mErr } = await supabase.from('team_memberships').select('athlete_id').eq('team_id', U15_TEAM_ID);
if (mErr) fail(mErr.message);
const athleteIds = memberships.map(m => m.athlete_id);
const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', athleteIds);
const nameById = Object.fromEntries(profiles.map(p => [p.id, p.full_name]));

const { data: calendars, error: cErr } = await supabase.from('calendars').select('id, athlete_id').in('athlete_id', athleteIds);
if (cErr) fail(cErr.message);
const athleteByCalId = Object.fromEntries(calendars.map(c => [c.id, c.athlete_id]));

const { data: workouts, error: wErr } = await supabase
  .from('workouts')
  .select('id, calendar_id, date, title, is_locked')
  .in('calendar_id', calendars.map(c => c.id))
  .in('date', [TUE, WED])
  .neq('title', 'Pre-Activation');
if (wErr) fail(wErr.message);

const { data: allWE, error: weErr } = await supabase
  .from('workout_exercises')
  .select('*, exercises(name)')
  .in('workout_id', workouts.map(w => w.id));
if (weErr) fail(weErr.message);

const skipped = [];
const plans = [];
for (const athleteId of athleteIds) {
  const name = nameById[athleteId] ?? athleteId;
  const aw = workouts.filter(w => athleteByCalId[w.calendar_id] === athleteId);
  const tueW = aw.find(w => w.date === TUE && w.title === 'Lower Body Anterior');
  const wedW = aw.find(w => w.date === WED && w.title === 'Lower Body Posterior');
  if (!tueW || !wedW) { skipped.push(`${name}: missing Tue Lower Body Anterior or Wed Lower Body Posterior`); continue; }
  if (tueW.is_locked || wedW.is_locked) { skipped.push(`${name}: a workout is locked`); continue; }

  const tue = allWE.filter(e => e.workout_id === tueW.id).sort(bySort);
  const wed = allWE.filter(e => e.workout_id === wedW.id).sort(bySort);
  const wedA = wed.filter(e => grp(e) === 'A');
  const wedB = wed.filter(e => grp(e) === 'B');
  const wedC = wed.filter(e => grp(e) === 'C');
  const tueB = tue.filter(e => grp(e) === 'B');
  if (!wedA.length || !wedB.length || !tueB.length) { skipped.push(`${name}: missing Wed A / Wed B / Tue B rows`); continue; }

  plans.push({ name, tueW, wedW, wedA, wedB, wedC, tueB });
}

console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${plans.length} athletes ready, ${skipped.length} skipped\n`);
for (const s of skipped) console.log(`  SKIPPED ${s}`);
for (const p of plans) {
  const names = rows => rows.map(e => e.exercises.name).join(' + ');
  console.log(`${p.name}:`);
  console.log(`  A (keep):    ${names(p.wedA)}`);
  console.log(`  B (Tue B):   ${names(p.tueB)}`);
  console.log(`  C (Wed B):   ${names(p.wedB)}`);
  console.log(`  dropped Wed C: ${names(p.wedC)}; Tue workout ${p.tueW.id} deleted`);
}

if (!APPLY) { console.log('\nDry run only. Re-run with --apply to commit.'); process.exit(0); }

console.log('\nApplying...');
for (const p of plans) {
  const nA = p.wedA.length;
  const nB = p.tueB.length;

  // 1. Drop old Wed C block
  if (p.wedC.length) {
    const { error } = await supabase.from('workout_exercises').delete().in('id', p.wedC.map(e => e.id));
    if (error) fail(`${p.name}: delete Wed C failed: ${error.message}`);
  }
  // 2. Old Wed B -> C, placed after the incoming B block
  for (const [i, e] of p.wedB.entries()) {
    const { error } = await supabase.from('workout_exercises').update({ superset_group: 'C', sort_order: nA + nB + i }).eq('id', e.id);
    if (error) fail(`${p.name}: relabel Wed B->C failed: ${error.message}`);
  }
  // 3. Copy Tue B into Wed as B
  const rows = p.tueB.map((e, i) => ({
    workout_id: p.wedW.id,
    exercise_id: e.exercise_id,
    sort_order: nA + i,
    sets: e.sets,
    reps: e.reps,
    load: e.load,
    load_type: e.load_type,
    tempo: e.tempo,
    rest_seconds: e.rest_seconds,
    notes: e.notes,
    is_pr_tracking: e.is_pr_tracking,
    superset_group: 'B',
  }));
  const { error: insErr } = await supabase.from('workout_exercises').insert(rows);
  if (insErr) fail(`${p.name}: insert Tue B into Wed failed: ${insErr.message}`);
  // 4. Delete the Tuesday lift (cascades its exercises)
  const { error: delErr } = await supabase.from('workouts').delete().eq('id', p.tueW.id);
  if (delErr) fail(`${p.name}: delete Tue workout failed: ${delErr.message}`);
  console.log(`  ✓ ${p.name}`);
}
console.log('\nDONE.');
