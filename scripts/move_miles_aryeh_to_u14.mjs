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

const U13_TEAM_ID = 'a752669d-2ecc-44a0-b73d-739845c8f5c1';
const U14_TEAM_ID = 'b79126ca-8cab-42f6-9526-c105007eaf74';
const U13_CAL_ID = '1ed2e41e-2189-4b24-9205-f29235206ce6';
const ANDERSON_ID = 'f9a41723-24fc-48d7-bb4c-119b7a02b19b';
const PLAYERS = [
  { name: 'Miles Giuliani', id: '5744d5ec-560b-44fe-b325-610918ff0b5c' },
  { name: 'Aryeh Settles', id: 'f593d9b4-e12c-476d-af6c-f3704445b6e5' },
];

// 1. Move Miles and Aryeh from U13 to U14.
for (const p of PLAYERS) {
  const { data, error } = await supabase
    .from('team_memberships')
    .update({ team_id: U14_TEAM_ID })
    .eq('team_id', U13_TEAM_ID).eq('athlete_id', p.id)
    .select('id');
  if (error) fail(`${p.name}: ${error.message}`);
  if (data.length !== 1) fail(`${p.name}: expected 1 U13 membership, updated ${data.length}`);
  console.log(`Moved ${p.name} U13 -> U14.`);
}

for (const [label, id] of [['U13', U13_TEAM_ID], ['U14', U14_TEAM_ID]]) {
  const { count, error } = await supabase
    .from('team_memberships').select('*', { count: 'exact', head: true }).eq('team_id', id);
  if (error) fail(error.message);
  console.log(`${label} roster size: ${count}`);
}

// 2. Confirm Anderson Hamlett has workouts via the U13 team calendar.
const { data: mem, error: memErr } = await supabase
  .from('team_memberships').select('team_id').eq('athlete_id', ANDERSON_ID);
if (memErr) fail(memErr.message);
console.log('\nAnderson memberships:', mem.map(m => m.team_id));

const today = new Date().toISOString().slice(0, 10);
const { data: upcoming, error: wErr } = await supabase
  .from('workouts').select('date, title').eq('calendar_id', U13_CAL_ID).gte('date', today).order('date');
if (wErr) fail(wErr.message);
console.log(`U13 calendar upcoming workouts (>= ${today}): ${upcoming.length}`);
for (const w of upcoming.slice(0, 8)) console.log(`  ${w.date}  ${w.title}`);
if (upcoming.length) console.log(`  ... last: ${upcoming.at(-1).date}`);
