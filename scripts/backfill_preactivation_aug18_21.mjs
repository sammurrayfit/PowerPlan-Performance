// One-off backfill: 2026-08-18 through 2026-08-21 exist in the source export
// but were never synced into the DB (sync_preactivation_personal.mjs run was
// apparently interrupted mid-range). This inserts just those 4 dates into the
// athletes' EXISTING personal Pre-Activation calendars — no deletes, no
// touching any date that's already synced.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const SLOT_ORDER = ['A', 'B', 'C', 'D', 'E', 'F'];
const TARGET_DATES = ['2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21'];

function fail(msg) { console.error('FATAL:', msg); process.exit(1); }

const allRows = JSON.parse(fs.readFileSync('scripts/preactivation_export.json', 'utf8'));
const rows = allRows.filter(r => TARGET_DATES.includes(r.date));
console.log('Backfilling', rows.length, 'rows across', TARGET_DATES.length, 'dates');

const athleteNames = [...new Set(rows.map(r => r.athlete))];
const { data: profiles, error: pErr } = await supabase
  .from('profiles').select('id, full_name').eq('role', 'athlete').in('full_name', athleteNames);
if (pErr) fail(pErr.message);
const athleteIdByName = {};
for (const p of profiles) athleteIdByName[p.full_name] = p.id;
for (const n of athleteNames) if (!athleteIdByName[n]) fail(`No profile found for athlete: ${n}`);

const { data: existingCals, error: cErr } = await supabase
  .from('calendars').select('id, athlete_id').eq('name', 'Pre-Activation').in('athlete_id', Object.values(athleteIdByName));
if (cErr) fail(cErr.message);
const calendarIdByAthleteId = Object.fromEntries(existingCals.map(c => [c.athlete_id, c.id]));
for (const n of athleteNames) {
  if (!calendarIdByAthleteId[athleteIdByName[n]]) fail(`No existing personal Pre-Activation calendar for ${n}`);
}

// Guard against double-insert if this is re-run
const calendarIds = Object.values(calendarIdByAthleteId);
const { data: already, error: aErr } = await supabase
  .from('workouts').select('id, calendar_id, date').eq('title', 'Pre-Activation')
  .in('calendar_id', calendarIds).in('date', TARGET_DATES);
if (aErr) fail(aErr.message);
if (already && already.length > 0) fail(`${already.length} workouts already exist for these dates — aborting to avoid duplicates.`);

const exerciseNames = [...new Set(rows.map(r => r.exercise))];
const { data: existingExercises, error: eErr } = await supabase
  .from('exercises').select('id, name').in('name', exerciseNames);
if (eErr) fail(eErr.message);
const exerciseIdByName = Object.fromEntries(existingExercises.map(e => [e.name, e.id]));
const missing = exerciseNames.filter(n => !exerciseIdByName[n]);
if (missing.length > 0) fail(`Missing exercise(s) in library: ${missing.join(', ')}`);

const byAthleteDate = {};
for (const r of rows) {
  const key = `${r.athlete}|${r.date}`;
  (byAthleteDate[key] ??= []).push(r);
}

let workoutCount = 0;
let exerciseRowCount = 0;
for (const name of athleteNames) {
  const calendarId = calendarIdByAthleteId[athleteIdByName[name]];
  for (const date of TARGET_DATES) {
    const sessionRows = (byAthleteDate[`${name}|${date}`] ?? []).slice().sort(
      (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot)
    );
    if (sessionRows.length === 0) continue;

    const { data: workout, error: wErr } = await supabase
      .from('workouts')
      .insert({ calendar_id: calendarId, date, title: 'Pre-Activation', notes: null, is_locked: false })
      .select('id').single();
    if (wErr) fail(wErr.message);
    workoutCount++;

    const weRows = sessionRows.map((r, i) => ({
      workout_id: workout.id,
      exercise_id: exerciseIdByName[r.exercise],
      sort_order: i,
      sets: r.sets,
      reps: String(r.reps),
      superset_group: r.slot + '1',
      notes: r.notes ?? null,
    }));
    const { error: weErr } = await supabase.from('workout_exercises').insert(weRows);
    if (weErr) fail(weErr.message);
    exerciseRowCount += weRows.length;
  }
}
console.log('Created', workoutCount, 'workouts (', exerciseRowCount, 'exercise rows total)');
