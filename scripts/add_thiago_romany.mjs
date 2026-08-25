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
const FULL_NAME = 'Thiago Romany';
const EMAIL = 'thiago.romany@placeholder.powerplan.local';
const PASSWORD = 'U15-Romany-8420';

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
  { team_id: U15_TEAM_ID, athlete_id: created.user.id },
  { onConflict: 'team_id,athlete_id', ignoreDuplicates: true }
);
if (memErr) fail(memErr.message);
console.log('Added to U15 team.');

console.log(`\nDONE.\n  Name: ${FULL_NAME}\n  Email: ${EMAIL}\n  Temp password: ${PASSWORD}\n  Team: U15 (${U15_TEAM_ID})`);
