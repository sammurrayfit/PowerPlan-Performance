import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import XLSX from 'xlsx';
import { MAP as EXERCISE_MAP } from './u15_exercise_mapping.mjs';

// Imports Gym Template.xlsx (Oct 6 - Nov 5 program) for the U15 team.
//
// Unlike U13/U14 (one shared team calendar + per-athlete overrides), U15's real
// workouts live on each athlete's own PERSONAL calendar ("U15 September–October
// 2026"), confirmed against the live data before writing anything. So here each
// athlete gets their own workouts + workout_exercises written directly, straight
// from their own sheet — no shared union workout, no override table.
//
// Exercise-name resolution uses the curated EXERCISE_MAP (not the app's
// exact+substring matcher, which mismatches/duplicates too often against this
// file's inconsistent spelling — verified separately).

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
function fail(msg) { console.error('FATAL:', msg); process.exit(1); }

const COACH_ID = '43693c20-d17e-44d5-9e67-58b49db8bd15'; // Sam Murray
const TARGET_CAL_NAME = 'U15 September–October 2026';
const SHEET_NAME_OVERRIDE = {
  'Matthew Gonzales ': 'Matthew Gonzalez',
  'Callum Vonwimmer': 'Callum Vonwiller',
};
// 18 athletes already imported (first pass) + Andy Tagmee (second pass, after his
// U14->U15 move). Remaining: these 6 sheets have >1 workout title on the same date
// within the athlete's own rows (e.g. both "Lower Body Anterior" and "Lower Body
// Posterior" on the same day) — a source-file error, not yet fixed in the sheet.
// Third pass targets exactly these 6, once Gym Template.xlsx is corrected.
const INCLUDE_SHEETS = new Set(['Jackson Yang', 'Saul Luna', 'Lee Hall', 'Leonardo Andrade', 'Sai Mudichintala', 'Andy Tagmee']);
const APPLY = process.argv.includes('--apply');

function parseLoadType(raw) {
  const v = raw.toLowerCase();
  if (v.includes('%') || v.includes('percent') || v.includes('1rm')) return 'percent_1rm';
  if (v.includes('bw') || v.includes('body')) return 'bodyweight';
  return 'absolute';
}
function toDateStr(raw) {
  if (!raw) return null;
  if (typeof raw === 'number') {
    const date = new Date(Math.round((raw - 25569) * 86400 * 1000));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split('/');
  if (parts.length === 3) { const [m, d, y] = parts; return `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; }
  return null;
}
function findCol(headers, ...terms) {
  const h = headers.map(s => String(s ?? '').toLowerCase().trim());
  const exact = h.findIndex(col => terms.includes(col));
  if (exact >= 0) return exact;
  return h.findIndex(col => terms.some(t => col.includes(t)));
}

const { data: m } = await supabase.from('team_memberships').select('athlete_id').eq('team_id', 'd9f87d34-0e07-40f6-b92d-4a1da2fef2d1');
const { data: athletes } = await supabase.from('profiles').select('id, full_name').in('id', m.map(x => x.athlete_id));

const wb = XLSX.readFile('/Users/sammurray/Downloads/Gym Template.xlsx', { cellDates: false });
const warnings = [];
const sheets = [];

for (const sheetName of wb.SheetNames) {
  if (!INCLUDE_SHEETS.has(sheetName)) { warnings.push(`Sheet "${sheetName}" skipped (already imported or not in this pass).`); continue; }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length < 2) continue;
  const h = rows[0];
  const col = {
    date: findCol(h, 'date'), workout: findCol(h, 'workout', 'title', 'session'),
    superset: findCol(h, 'superset', 'ss', 'group'), exercise: findCol(h, 'exercise', 'movement', 'lift', 'drill'),
    sets: findCol(h, 'sets', 'set'), reps: findCol(h, 'reps', 'rep'),
    load: findCol(h, 'load', 'weight', 'lbs', 'kg', 'intensity'), loadType: findCol(h, 'load type', 'type', 'unit'),
    tempo: findCol(h, 'tempo'), rest: findCol(h, 'rest'), notes: findCol(h, 'notes', 'note', 'cue', 'coaching'),
  };
  if (col.date < 0 || col.exercise < 0) { warnings.push(`Sheet "${sheetName}" skipped — missing Date or Exercise column.`); continue; }

  const matchName = SHEET_NAME_OVERRIDE[sheetName] ?? sheetName;
  const athlete = athletes.find(a => a.full_name.toLowerCase() === matchName.toLowerCase());
  if (!athlete) fail(`No athlete match for sheet "${sheetName}" (as "${matchName}") — aborting, this should not happen.`);

  const sheetRows = [];
  for (const row of rows.slice(1)) {
    const dateStr = toDateStr(row[col.date]);
    const exerciseNameRaw = String(row[col.exercise] ?? '').trim();
    if (!dateStr || !exerciseNameRaw) continue;
    const resolved = EXERCISE_MAP[exerciseNameRaw];
    if (!resolved) fail(`No curated mapping for exercise "${exerciseNameRaw}" (sheet "${sheetName}") — aborting.`);

    const workoutTitle = col.workout >= 0 ? String(row[col.workout] ?? '').trim() || `Workout ${dateStr}` : `Workout ${dateStr}`;
    const loadTypeRaw = col.loadType >= 0 ? String(row[col.loadType] ?? '') : '';
    const supersetRaw = col.superset >= 0 ? String(row[col.superset] ?? '').trim().toUpperCase() : '';

    sheetRows.push({
      date: dateStr, workoutTitle, supersetGroup: supersetRaw || null,
      exerciseName: resolved.name, exerciseExisting: resolved.existing,
      sets: col.sets >= 0 && row[col.sets] !== '' ? Number(row[col.sets]) || null : null,
      reps: col.reps >= 0 ? String(row[col.reps] ?? '').trim() || null : null,
      load: col.load >= 0 && row[col.load] !== '' ? Number(row[col.load]) || null : null,
      loadType: parseLoadType(loadTypeRaw),
      tempo: col.tempo >= 0 ? String(row[col.tempo] ?? '').trim() || null : null,
      restSeconds: col.rest >= 0 && row[col.rest] !== '' ? Number(row[col.rest]) || null : null,
      notes: col.notes >= 0 && supersetRaw !== 'C' ? String(row[col.notes] ?? '').trim() || null : null,
    });
  }
  if (sheetRows.length > 0) sheets.push({ sheetName, athleteId: athlete.id, athleteName: athlete.full_name, rows: sheetRows });
}
for (const w of warnings) console.log('  ', w);

// Resolve each athlete's target personal calendar up front.
for (const sheet of sheets) {
  const { data: cal, error } = await supabase.from('calendars').select('id').eq('athlete_id', sheet.athleteId).eq('name', TARGET_CAL_NAME).maybeSingle();
  if (error) fail(`lookup calendar for ${sheet.athleteName} failed: ${error.message}`);
  if (!cal) fail(`${sheet.athleteName} has no "${TARGET_CAL_NAME}" calendar — aborting.`);
  sheet.calendarId = cal.id;
}

// Group each athlete's own rows into their own workouts (by date+title) — no cross-athlete union.
for (const sheet of sheets) {
  const byKey = new Map();
  for (const row of sheet.rows) {
    const key = `${row.date}||${row.workoutTitle}`;
    if (!byKey.has(key)) byKey.set(key, []);
    const existing = byKey.get(key);
    const nameLower = row.exerciseName.toLowerCase();
    if (!existing.some(e => e.exerciseName.toLowerCase() === nameLower)) existing.push(row);
  }
  sheet.workouts = byKey;
}

const totalWorkouts = sheets.reduce((n, s) => n + s.workouts.size, 0);
const totalRows = sheets.reduce((n, s) => n + s.rows.length, 0);
const newExerciseNames = new Set(sheets.flatMap(s => s.rows.filter(r => !r.exerciseExisting).map(r => r.exerciseName)));
const allDates = [...new Set(sheets.flatMap(s => [...s.workouts.keys()].map(k => k.split('||')[0])))].sort();

console.log(`\n${APPLY ? 'APPLYING' : 'DRY RUN'}`);
console.log(`  athletes matched:      ${sheets.length}`);
console.log(`  workouts to create:    ${totalWorkouts} (own calendar per athlete)`);
console.log(`  exercise rows:         ${totalRows}`);
console.log(`  new catalog exercises: ${newExerciseNames.size}`);
console.log(`  dates covered:         ${allDates.join(', ')}`);

if (!APPLY) {
  console.log('\nPer-athlete workout counts:');
  for (const s of sheets) console.log(`   ${s.athleteName}: ${s.workouts.size} workouts, ${s.rows.length} exercise rows`);
  console.log('\nDry run only. Re-run with --apply to write to Supabase.');
  process.exit(0);
}

// Guard against clashing with anything already on these dates in each athlete's target calendar.
for (const sheet of sheets) {
  const dates = [...new Set([...sheet.workouts.keys()].map(k => k.split('||')[0]))];
  const { data: clash } = await supabase.from('workouts').select('id,date,title').eq('calendar_id', sheet.calendarId).in('date', dates);
  if (clash.length) fail(`${sheet.athleteName}'s calendar already has workouts on import dates: ${JSON.stringify(clash)}`);
}

const { data: exData } = await supabase.from('exercises').select('id, name');
const exByLower = new Map(exData.map(e => [e.name.toLowerCase(), e]));
async function resolveExercise(name, isExisting) {
  const hit = exByLower.get(name.toLowerCase());
  if (hit) return hit;
  if (isExisting) fail(`Expected "${name}" to already exist in the catalog but it doesn't.`);
  const { data: created, error } = await supabase.from('exercises')
    .insert({ name, is_public: false, created_by: COACH_ID }).select('id, name').single();
  if (error) fail(`create exercise "${name}" failed: ${error.message}`);
  exByLower.set(created.name.toLowerCase(), created);
  return created;
}

for (const sheet of sheets) {
  for (const [key, exercises] of sheet.workouts) {
    const splitAt = key.indexOf('||');
    const date = key.slice(0, splitAt), title = key.slice(splitAt + 2);
    const { data: w, error: wErr } = await supabase.from('workouts').insert({ calendar_id: sheet.calendarId, date, title }).select('id').single();
    if (wErr) fail(`create workout ${sheet.athleteName} ${key} failed: ${wErr.message}`);

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      const match = await resolveExercise(ex.exerciseName, ex.exerciseExisting);
      const { error } = await supabase.from('workout_exercises').insert({
        workout_id: w.id, exercise_id: match.id, sort_order: i, sets: ex.sets, reps: ex.reps,
        load: ex.load, load_type: ex.loadType, tempo: ex.tempo, rest_seconds: ex.restSeconds,
        notes: ex.notes, superset_group: ex.supersetGroup,
      });
      if (error) fail(`insert workout_exercise ${sheet.athleteName} ${key} / ${ex.exerciseName} failed: ${error.message}`);
    }
  }
  console.log(`  ✓ ${sheet.athleteName}: ${sheet.workouts.size} workouts`);
}

console.log('\nDONE.');
