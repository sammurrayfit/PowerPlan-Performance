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
function chunks(arr, size) { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; }

const U15_TEAM_ID = 'd9f87d34-0e07-40f6-b92d-4a1da2fef2d1';
const CUTOFF = '2026-08-17';

function addWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

const { data: memberships, error: mErr } = await supabase.from('team_memberships').select('athlete_id').eq('team_id', U15_TEAM_ID);
if (mErr) fail(mErr.message);
const athleteIds = memberships.map(m => m.athlete_id);

const { data: calendars, error: cErr } = await supabase
  .from('calendars').select('id, name').or(`athlete_id.in.(${athleteIds.join(',')}),team_id.eq.${U15_TEAM_ID}`);
if (cErr) fail(cErr.message);
const calIds = calendars.map(c => c.id);
console.log(`Resolved ${athleteIds.length} U15 athletes across ${calIds.length} calendars`);

// Collect all workouts in scope (paginated + chunked to stay under Supabase's row/URL limits)
let workouts = [];
for (const idChunk of chunks(calIds, 50)) {
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('workouts').select('id, calendar_id, date')
      .in('calendar_id', idChunk).gte('date', CUTOFF).order('date')
      .range(from, from + PAGE - 1);
    if (error) fail(error.message);
    workouts.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
}
console.log(`Found ${workouts.length} workouts on/after ${CUTOFF} to shift`);

// Sanity check: nothing already logged against these workouts
const woIds = workouts.map(w => w.id);
let attendanceCount = 0;
for (const idChunk of chunks(woIds, 200)) {
  const { data, error } = await supabase.from('attendance').select('id').in('workout_id', idChunk);
  if (error) fail(error.message);
  attendanceCount += data.length;
}
if (attendanceCount > 0) fail(`${attendanceCount} attendance rows already logged against in-scope workouts — aborting, review before shifting.`);

// Shift date-by-date, latest date first, so a shifted row never lands on a
// date we still need to read as "original" (would double-shift it).
const distinctDates = [...new Set(workouts.map(w => w.date))].sort().reverse();
console.log(`${distinctDates.length} distinct dates, shifting latest-first: ${distinctDates[distinctDates.length - 1]} .. ${distinctDates[0]}`);

let totalUpdated = 0;
for (const oldDate of distinctDates) {
  const newDate = addWeek(oldDate);
  for (const idChunk of chunks(calIds, 50)) {
    const { data, error } = await supabase
      .from('workouts').update({ date: newDate })
      .in('calendar_id', idChunk).eq('date', oldDate)
      .select('id');
    if (error) fail(error.message);
    totalUpdated += data.length;
  }
}

console.log(`\nDONE. Shifted ${totalUpdated} workouts (expected ${workouts.length}).`);
if (totalUpdated !== workouts.length) console.error('WARNING: count mismatch, please verify.');
