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

// Week of Sep 28: U14 Tue->Mon and Thu->Wed; U13 Thu->Wed.
const MOVES = [
  { team: 'U14', teamId: 'b79126ca-8cab-42f6-9526-c105007eaf74', from: '2026-09-29', to: '2026-09-28' },
  { team: 'U14', teamId: 'b79126ca-8cab-42f6-9526-c105007eaf74', from: '2026-10-01', to: '2026-09-30' },
  { team: 'U13', teamId: 'a752669d-2ecc-44a0-b73d-739845c8f5c1', from: '2026-10-01', to: '2026-09-30' },
];
const APPLY = process.argv.includes('--apply');

async function teamCalendarIds(teamId) {
  const { data: m, error: mErr } = await supabase.from('team_memberships').select('athlete_id').eq('team_id', teamId);
  if (mErr) fail(mErr.message);
  const { data: cals, error: cErr } = await supabase
    .from('calendars').select('id').or(`athlete_id.in.(${m.map(x => x.athlete_id).join(',')}),team_id.eq.${teamId}`);
  if (cErr) fail(cErr.message);
  return cals.map(c => c.id);
}

// Resolve every move's workout ids up front so one move can't pick up another's rows.
const plans = [];
for (const mv of MOVES) {
  const calIds = await teamCalendarIds(mv.teamId);
  const { data: workouts, error } = await supabase
    .from('workouts').select('id, title').in('calendar_id', calIds).eq('date', mv.from);
  if (error) fail(error.message);
  const { data: att, error: aErr } = await supabase.from('attendance').select('id').in('workout_id', workouts.map(w => w.id));
  if (aErr) fail(aErr.message);
  if (att.length) fail(`${mv.team} ${mv.from}: ${att.length} attendance rows logged — aborting.`);
  plans.push({ ...mv, workouts });
  console.log(`${mv.team} ${mv.from} -> ${mv.to}: ${workouts.map(w => w.title).join(', ') || '(none)'}`);
}

if (!APPLY) {
  console.log('\nDry run only. Re-run with --apply to commit these changes.');
  process.exit(0);
}

for (const p of plans) {
  if (!p.workouts.length) continue;
  const { data, error } = await supabase.from('workouts').update({ date: p.to }).in('id', p.workouts.map(w => w.id)).select('id');
  if (error) fail(error.message);
  console.log(`  ✓ ${p.team} moved ${data.length} workout(s) to ${p.to}`);
}
console.log('\nDONE.');
