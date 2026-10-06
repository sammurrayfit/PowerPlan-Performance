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
const FULL_NAME = 'Anderson Hamlett';
const EMAIL = 'anderson.hamlett@placeholder.powerplan.local';
const PASSWORD = `U13-Hamlett-${Math.floor(1000 + Math.random() * 9000)}`;

const { data: team, error: teamErr } = await supabase
  .from('teams').select('id, name').eq('id', U13_TEAM_ID).single();
if (teamErr || !team) fail(`U13 team lookup: ${teamErr?.message ?? 'not found'}`);

// guard against a duplicate account for the same player
const { data: existing, error: exErr } = await supabase
  .from('profiles').select('id, full_name').ilike('full_name', '%hamlett%');
if (exErr) fail(exErr.message);
if (existing.length) fail(`Profile already exists: ${JSON.stringify(existing)}`);

const { data: created, error: createErr } = await supabase.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  user_metadata: { role: 'athlete', full_name: FULL_NAME },
  email_confirm: true,
});
if (createErr || !created.user) fail(createErr?.message ?? 'Failed to create account');
console.log(`Created auth user ${created.user.id} (${EMAIL})`);

const { error: profileErr } = await supabase.from('profiles').upsert(
  { id: created.user.id, full_name: FULL_NAME, role: 'athlete' },
  { onConflict: 'id' }
);
if (profileErr) fail(profileErr.message);
console.log('Profile created.');

const { error: memErr } = await supabase.from('team_memberships').upsert(
  { team_id: U13_TEAM_ID, athlete_id: created.user.id },
  { onConflict: 'team_id,athlete_id', ignoreDuplicates: true }
);
if (memErr) fail(memErr.message);
console.log(`Added to ${team.name} team.`);

const { count, error: countErr } = await supabase
  .from('team_memberships').select('*', { count: 'exact', head: true }).eq('team_id', U13_TEAM_ID);
if (countErr) fail(countErr.message);

console.log(`\nDONE.\n  Name: ${FULL_NAME}\n  Email: ${EMAIL}\n  Temp password: ${PASSWORD}\n  Team: ${team.name} (${U13_TEAM_ID})\n  Roster size now: ${count}`);
