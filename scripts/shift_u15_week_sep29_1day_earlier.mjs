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

// Moves U15 Tue Sep 29 - Thu Oct 1 workouts one day earlier (Friday stays put)
// (Tue->Mon, Wed->Tue, Thu->Wed).
const U15_TEAM_ID = 'd9f87d34-0e07-40f6-b92d-4a1da2fef2d1';
const WEEK_START = '2026-09-28';
const WEEK_END = '2026-10-01';
const APPLY = process.argv.includes('--apply');

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const { data: memberships, error: mErr } = await supabase.from('team_memberships').select('athlete_id').eq('team_id', U15_TEAM_ID);
if (mErr) fail(mErr.message);
const athleteIds = memberships.map(m => m.athlete_id);

const { data: calendars, error: cErr } = await supabase
  .from('calendars').select('id').or(`athlete_id.in.(${athleteIds.join(',')}),team_id.eq.${U15_TEAM_ID}`);
if (cErr) fail(cErr.message);
const calIds = calendars.map(c => c.id);

let workouts = [];
for (const idChunk of chunks(calIds, 50)) {
  const { data, error } = await supabase
    .from('workouts').select('id, calendar_id, date, title, is_locked')
    .in('calendar_id', idChunk).gte('date', WEEK_START).lte('date', WEEK_END)
    .range(0, 4999);
  if (error) fail(error.message);
  workouts.push(...data);
}
console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${workouts.length} workouts in ${WEEK_START}..${WEEK_END} across ${calIds.length} U15 calendars`);

const locked = workouts.filter(w => w.is_locked);
if (locked.length) console.log(`Note: ${locked.length} workouts are locked (moving date only, content untouched)`);

let attendanceCount = 0;
for (const idChunk of chunks(workouts.map(w => w.id), 200)) {
  const { data, error } = await supabase.from('attendance').select('id').in('workout_id', idChunk);
  if (error) fail(error.message);
  attendanceCount += data.length;
}
if (attendanceCount > 0) fail(`${attendanceCount} attendance rows already logged against these workouts — aborting.`);

const summary = {};
for (const w of workouts) {
  const k = `${w.date} -> ${addDays(w.date, -1)}  ${w.title}`;
  summary[k] = (summary[k] || 0) + 1;
}
for (const [k, v] of Object.entries(summary).sort()) console.log(`  ${k} × ${v}`);

if (!APPLY) {
  console.log('\nDry run only. Re-run with --apply to commit these changes.');
  process.exit(0);
}

// Update by id (grouped by source date) so a moved row can never be picked up again.
const byDate = {};
for (const w of workouts) (byDate[w.date] ??= []).push(w.id);

let totalUpdated = 0;
for (const [oldDate, ids] of Object.entries(byDate)) {
  const newDate = addDays(oldDate, -1);
  for (const idChunk of chunks(ids, 200)) {
    const { data, error } = await supabase.from('workouts').update({ date: newDate }).in('id', idChunk).select('id');
    if (error) fail(error.message);
    totalUpdated += data.length;
  }
}

console.log(`\nDONE. Moved ${totalUpdated} workouts (expected ${workouts.length}).`);
if (totalUpdated !== workouts.length) console.error('WARNING: count mismatch, please verify.');
