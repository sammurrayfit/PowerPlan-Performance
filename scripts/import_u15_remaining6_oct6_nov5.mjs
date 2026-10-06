import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import XLSX from 'xlsx';
import { MAP as EXERCISE_MAP } from './u15_exercise_mapping.mjs';

// Third pass of the U15 Oct 6 - Nov 5 import (see import_u15_oct6_nov5_program.mjs)
// for the 6 sheets held back because rows had slipped onto the wrong date/title
// when the template was copied (e.g. Wednesday's first exercise dated Tuesday).
//
// Week 1 (Oct 6-8) is clean on every sheet, so it's the template: each later row
// is placed on the weekday + title its exercise has in week 1, within the same
// week. Every resulting session is checked to contain exactly week 1's exercises
// for that title before anything is written.
//
// Usage: node scripts/import_u15_remaining6_oct6_nov5.mjs [--apply]

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
function fail(msg) { console.error('FATAL:', msg); process.exit(1); }

const FILE = `${process.env.HOME}/Library/Mobile Documents/com~apple~CloudDocs/NYRB/Gym Programming/u15 Gym Template october to november.xlsx`;
const COACH_ID = '43693c20-d17e-44d5-9e67-58b49db8bd15'; // Sam Murray
const TARGET_CAL_NAME = 'U15 September–October 2026';
const SHEETS = ['Jackson Yang', 'Saul Luna', 'Lee Hall', 'Leonardo Andrade', 'Sai Mudichintala', 'Andy Tagmee'];
const WEEK1_END = '2026-10-08';
const APPLY = process.argv.includes('--apply');

function toDateStr(raw) {
  if (typeof raw === 'number') return new Date(Math.round((raw - 25569) * 86400000)).toISOString().slice(0, 10);
  const s = String(raw ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function addDays(date, n) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function weekdayOffset(date) { return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7; } // Mon = 0
function parseLoadType(raw) {
  const v = raw.toLowerCase();
  if (v.includes('%') || v.includes('percent') || v.includes('1rm')) return 'percent_1rm';
  if (v.includes('bw') || v.includes('body')) return 'bodyweight';
  return 'absolute';
}
// "3-4" means up to 4 sets.
function parseSets(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const range = s.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  return range ? Number(range[2]) : Number(s) || null;
}
const num = v => (v === '' || v == null ? null : Number(v) || null);
const str = v => String(v ?? '').trim() || null;

const wb = XLSX.readFile(FILE, { cellDates: false });
const plans = [];
for (const sheetName of SHEETS) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) fail(`Sheet "${sheetName}" not found`);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const h = rows[0].map(c => String(c).toLowerCase().trim());
  const col = Object.fromEntries(['date', 'workout', 'superset', 'exercise', 'sets', 'reps', 'load', 'type', 'tempo', 'rest', 'notes'].map(k => [k, h.indexOf(k)]));
  for (const k of ['date', 'workout', 'superset', 'exercise', 'sets', 'reps']) if (col[k] < 0) fail(`${sheetName}: missing "${k}" column`);

  const parsed = rows.slice(1).map((r, i) => ({ r, rowNum: i + 2, date: toDateStr(r[col.date]), raw: String(r[col.exercise] ?? '').trim() }))
    .filter(x => x.date && x.raw);

  // Week-1 template: exercise -> { weekday offset, title }
  const template = {};
  const week1Sessions = {};
  for (const x of parsed.filter(x => x.date <= WEEK1_END)) {
    const key = x.raw.toLowerCase();
    const title = String(x.r[col.workout]).trim();
    if (template[key] && template[key].title !== title) fail(`${sheetName}: "${x.raw}" appears in two week-1 sessions`);
    template[key] = { offset: weekdayOffset(x.date), title };
    (week1Sessions[title] ??= []).push(key);
  }

  const moves = [];
  const sessions = new Map(); // `${date}||${title}` -> rows
  for (const x of parsed) {
    const t = template[x.raw.toLowerCase()];
    if (!t) fail(`${sheetName} row ${x.rowNum}: "${x.raw}" is not in week 1 — can't place it`);
    const date = addDays(x.date, t.offset - weekdayOffset(x.date));
    const origTitle = String(x.r[col.workout]).trim();
    if (date !== x.date || t.title !== origTitle) moves.push(`row ${x.rowNum} ${x.raw}: ${x.date} "${origTitle}" → ${date} "${t.title}"`);

    const resolved = EXERCISE_MAP[x.raw];
    if (!resolved) fail(`${sheetName}: no curated mapping for exercise "${x.raw}"`);
    const superset = String(x.r[col.superset] ?? '').trim().toUpperCase() || null;
    const key = `${date}||${t.title}`;
    if (!sessions.has(key)) sessions.set(key, []);
    const list = sessions.get(key);
    if (list.some(e => e.exerciseName.toLowerCase() === resolved.name.toLowerCase())) continue;
    list.push({
      rowNum: x.rowNum, sourceKey: x.raw.toLowerCase(),
      exerciseName: resolved.name, exerciseExisting: resolved.existing, supersetGroup: superset,
      sets: parseSets(x.r[col.sets]), reps: str(x.r[col.reps]),
      load: col.load >= 0 ? num(x.r[col.load]) : null,
      loadType: parseLoadType(col.type >= 0 ? String(x.r[col.type] ?? '') : ''),
      tempo: col.tempo >= 0 ? str(x.r[col.tempo]) : null,
      restSeconds: col.rest >= 0 ? num(x.r[col.rest]) : null,
      // Same rule as the earlier passes: C-group notes in this file are just "Optional".
      notes: col.notes >= 0 && superset !== 'C' ? str(x.r[col.notes]) : null,
    });
  }

  for (const [key, list] of sessions) {
    const want = week1Sessions[key.split('||')[1]];
    const got = list.map(e => e.sourceKey);
    if (got.length !== want.length || got.some(g => !want.includes(g))) fail(`${sheetName} ${key}: exercises don't match week 1 (${got.join(', ')})`);
    // Keep superset order (A before B before C), then sheet order within a group.
    list.sort((a, b) => (a.supersetGroup ?? '').localeCompare(b.supersetGroup ?? '') || a.rowNum - b.rowNum);
  }
  plans.push({ sheetName, moves, sessions });
}

// ── Resolve athletes + target calendars, guard against clashes ──────────────
const { data: profiles, error: pErr } = await supabase.from('profiles').select('id, full_name').in('full_name', SHEETS);
if (pErr) fail(pErr.message);
for (const plan of plans) {
  const athlete = profiles.find(p => p.full_name === plan.sheetName);
  if (!athlete) fail(`No profile for ${plan.sheetName}`);
  const { data: cal, error } = await supabase.from('calendars').select('id').eq('athlete_id', athlete.id).eq('name', TARGET_CAL_NAME).maybeSingle();
  if (error) fail(error.message);
  if (!cal) fail(`${plan.sheetName} has no "${TARGET_CAL_NAME}" calendar`);
  plan.calendarId = cal.id;
  const dates = [...new Set([...plan.sessions.keys()].map(k => k.split('||')[0]))];
  const { data: clash } = await supabase.from('workouts').select('id').eq('calendar_id', cal.id).in('date', dates);
  if (clash.length) fail(`${plan.sheetName}'s calendar already has ${clash.length} workouts on import dates`);
}

console.log(APPLY ? 'APPLYING' : 'DRY RUN');
for (const p of plans) {
  const exRows = [...p.sessions.values()].reduce((n, l) => n + l.length, 0);
  console.log(`  ${p.sheetName}: ${p.sessions.size} sessions, ${exRows} exercise rows, ${p.moves.length} rows re-placed`);
}
if (!APPLY) { console.log('\nDry run only. Re-run with --apply to write to Supabase.'); process.exit(0); }

// ── Write ───────────────────────────────────────────────────────────────────
const { data: exData } = await supabase.from('exercises').select('id, name');
const exByLower = new Map(exData.map(e => [e.name.toLowerCase(), e]));
const createdWorkoutIds = [];
async function rollback(msg) {
  console.error('ERROR:', msg, `— rolling back ${createdWorkoutIds.length} workouts`);
  if (createdWorkoutIds.length) await supabase.from('workouts').delete().in('id', createdWorkoutIds);
  process.exit(1);
}
async function resolveExercise(name, isExisting) {
  const hit = exByLower.get(name.toLowerCase());
  if (hit) return hit;
  if (isExisting) await rollback(`Expected "${name}" to already exist in the catalog`);
  const { data: created, error } = await supabase.from('exercises').insert({ name, is_public: false, created_by: COACH_ID }).select('id, name').single();
  if (error) await rollback(`create exercise "${name}" failed: ${error.message}`);
  exByLower.set(created.name.toLowerCase(), created);
  return created;
}

for (const plan of plans) {
  for (const [key, list] of [...plan.sessions].sort(([a], [b]) => a.localeCompare(b))) {
    const [date, title] = key.split('||');
    const { data: w, error: wErr } = await supabase.from('workouts').insert({ calendar_id: plan.calendarId, date, title }).select('id').single();
    if (wErr) await rollback(`create workout ${plan.sheetName} ${key}: ${wErr.message}`);
    createdWorkoutIds.push(w.id);
    const rows = [];
    for (const [i, ex] of list.entries()) {
      const match = await resolveExercise(ex.exerciseName, ex.exerciseExisting);
      rows.push({
        workout_id: w.id, exercise_id: match.id, sort_order: i, sets: ex.sets, reps: ex.reps,
        load: ex.load, load_type: ex.loadType, tempo: ex.tempo, rest_seconds: ex.restSeconds,
        notes: ex.notes, superset_group: ex.supersetGroup,
      });
    }
    const { error } = await supabase.from('workout_exercises').insert(rows);
    if (error) await rollback(`insert exercises ${plan.sheetName} ${key}: ${error.message}`);
  }
  console.log(`  ✓ ${plan.sheetName}: ${plan.sessions.size} workouts`);
}
console.log(`\nDONE. Created ${createdWorkoutIds.length} workouts.`);
