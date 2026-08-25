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

const KEEP_ID = '1ed2e41e-2189-4b24-9205-f29235206ce6'; // U13 August–September 2026
const MERGE_ID = 'aea2e36a-fe10-43f3-919f-5e5d68fc9507'; // U13 September–October 2026
const NEW_NAME = 'U13 August–October 2026';

// Sanity: confirm no date overlap between the two calendars before merging.
const { data: keepWorkouts, error: kErr } = await supabase.from('workouts').select('id, date').eq('calendar_id', KEEP_ID);
if (kErr) fail(kErr.message);
const { data: mergeWorkouts, error: mErr } = await supabase.from('workouts').select('id, date').eq('calendar_id', MERGE_ID);
if (mErr) fail(mErr.message);
const keepDates = new Set(keepWorkouts.map(w => w.date));
const overlap = mergeWorkouts.filter(w => keepDates.has(w.date));
if (overlap.length) fail(`Date overlap found, aborting: ${overlap.map(w => w.date).join(', ')}`);
console.log(`No overlap. Moving ${mergeWorkouts.length} workouts from merge calendar onto keep calendar.`);

const { data: moved, error: updErr } = await supabase
  .from('workouts').update({ calendar_id: KEEP_ID }).eq('calendar_id', MERGE_ID).select('id, date');
if (updErr) fail(updErr.message);
console.log(`Moved ${moved.length} workouts:`, moved.map(w => w.date).join(', '));

const { error: delErr } = await supabase.from('calendars').delete().eq('id', MERGE_ID);
if (delErr) fail(delErr.message);
console.log('Deleted now-empty calendar', MERGE_ID);

const { error: renErr } = await supabase.from('calendars').update({ name: NEW_NAME }).eq('id', KEEP_ID);
if (renErr) fail(renErr.message);
console.log(`Renamed surviving calendar to "${NEW_NAME}"`);

const { data: final, error: fErr } = await supabase.from('workouts').select('date').eq('calendar_id', KEEP_ID).order('date');
if (fErr) fail(fErr.message);
console.log(`\nDONE. Combined calendar now has ${final.length} workouts:`, final.map(w => w.date).join(', '));
