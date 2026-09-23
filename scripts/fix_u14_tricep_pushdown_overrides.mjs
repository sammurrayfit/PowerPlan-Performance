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

const U14_TEAM_ID = 'b79126ca-8cab-42f6-9526-c105007eaf74';
const NEW_WE_ID = 'ec544274-b201-49c7-87ca-da305ebf8b65'; // Keiser Tricep Pushdown row on the 9/15 U14 workout
const REFERENCE_WE_ID = '8199ffef-e125-4930-b98c-1af785e5a158'; // SA Lat Pulldown, used to find who's "active" on this workout

const { data: memberships } = await supabase.from('team_memberships').select('athlete_id').eq('team_id', U14_TEAM_ID);
const rosterIds = new Set(memberships.map(m => m.athlete_id));

// Anyone with an override anywhere on this workout is "individualized" for it —
// SA Lat Pulldown is present on every athlete's version, so it's a reliable proxy.
const { data: existingOverrides } = await supabase
  .from('athlete_exercise_overrides')
  .select('athlete_id')
  .eq('workout_exercise_id', REFERENCE_WE_ID);

const targetAthleteIds = [...new Set(existingOverrides.map(o => o.athlete_id))].filter(id => rosterIds.has(id));
console.log(`Creating "active" overrides (3x8) for ${targetAthleteIds.length} current U14 roster athletes`);

const rows = targetAthleteIds.map(athlete_id => ({
  workout_exercise_id: NEW_WE_ID,
  athlete_id,
  sets: 3,
  reps: '8',
  load_type: 'absolute',
}));

const { error } = await supabase.from('athlete_exercise_overrides').upsert(rows, { onConflict: 'workout_exercise_id,athlete_id' });
if (error) fail(error.message);

console.log('Done. Verifying...');
const { data: verify } = await supabase.from('athlete_exercise_overrides').select('athlete_id').eq('workout_exercise_id', NEW_WE_ID);
console.log(`Keiser Tricep Pushdown now has ${verify.length} active overrides.`);
