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

// Week of Sep 28: U13 Wed -> Tue (session was already moved Thu -> Wed by shift_u13_u14_week_sep28.mjs).
const TEAM_ID = 'a752669d-2ecc-44a0-b73d-739845c8f5c1';
const FROM = '2026-09-30';
const TO = '2026-09-29';
const APPLY = process.argv.includes('--apply');

const { data: m, error: mErr } = await supabase.from('team_memberships').select('athlete_id').eq('team_id', TEAM_ID);
if (mErr) fail(mErr.message);
const { data: cals, error: cErr } = await supabase
  .from('calendars').select('id').or(`athlete_id.in.(${m.map(x => x.athlete_id).join(',')}),team_id.eq.${TEAM_ID}`);
if (cErr) fail(cErr.message);

const { data: workouts, error } = await supabase
  .from('workouts').select('id, title').in('calendar_id', cals.map(c => c.id)).eq('date', FROM);
if (error) fail(error.message);
const { data: att, error: aErr } = await supabase.from('attendance').select('id').in('workout_id', workouts.map(w => w.id));
if (aErr) fail(aErr.message);
if (att.length) fail(`${att.length} attendance rows logged on ${FROM} — aborting.`);
console.log(`U13 ${FROM} -> ${TO}: ${workouts.map(w => w.title).join(', ') || '(none)'}`);

if (!APPLY) {
  console.log('\nDry run only. Re-run with --apply to commit these changes.');
  process.exit(0);
}
if (!workouts.length) fail('Nothing to move.');

const { data, error: uErr } = await supabase.from('workouts').update({ date: TO }).in('id', workouts.map(w => w.id)).select('id');
if (uErr) fail(uErr.message);
console.log(`  ✓ U13 moved ${data.length} workout(s) to ${TO}`);
console.log('\nDONE.');
