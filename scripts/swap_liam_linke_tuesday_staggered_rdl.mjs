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

const LIAM_LINKE_ID = 'd9bb1ea7-8126-423a-9619-63d34d535c2c';
const TODAY = '2026-09-09';
const FROM_NAME = 'Staggered Stance RDL';
const TO_NAME = 'Weighted Reverse Nordics';

const { data: calendars, error: cErr } = await supabase
  .from('calendars')
  .select('id')
  .eq('athlete_id', LIAM_LINKE_ID);
if (cErr) fail(cErr.message);
const calIds = calendars.map(c => c.id);

const { data: workouts, error: wErr } = await supabase
  .from('workouts')
  .select('id, date')
  .in('calendar_id', calIds)
  .gte('date', TODAY);
if (wErr) fail(wErr.message);

const tuesdays = workouts.filter(w => new Date(w.date + 'T00:00:00Z').getUTCDay() === 2);
const woIds = tuesdays.map(w => w.id);
console.log(`Found ${woIds.length} future Tuesday workouts for Liam Linke: ${tuesdays.map(w => w.date).sort().join(', ')}`);

const { data: exercises, error: eErr } = await supabase
  .from('exercises')
  .select('id, name')
  .in('name', [FROM_NAME, TO_NAME]);
if (eErr) fail(eErr.message);
const fromId = exercises.find(e => e.name === FROM_NAME)?.id;
const toId = exercises.find(e => e.name === TO_NAME)?.id;
if (!fromId) fail(`Exercise "${FROM_NAME}" not found`);
if (!toId) fail(`Exercise "${TO_NAME}" not found`);

const { data: updated, error: uErr } = await supabase
  .from('workout_exercises')
  .update({ exercise_id: toId })
  .in('workout_id', woIds)
  .eq('exercise_id', fromId)
  .select('id, workout_id');
if (uErr) fail(uErr.message);

console.log(`Swapped "${FROM_NAME}" -> "${TO_NAME}" on ${updated.length} rows (expected ${woIds.length})`);
console.log('DONE.');
