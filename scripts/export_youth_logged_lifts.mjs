import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

// Exports every logged set for the U15, U14 and U13 rosters to one workbook,
// one sheet per team, with the prescription (incl. athlete overrides) alongside.

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
function fail(msg) { console.error('FATAL:', msg); process.exit(1); }

const TEAMS = [
  { name: 'U15', id: 'd9f87d34-0e07-40f6-b92d-4a1da2fef2d1' },
  { name: 'U14', id: 'b79126ca-8cab-42f6-9526-c105007eaf74' },
  { name: 'U13', id: 'a752669d-2ecc-44a0-b73d-739845c8f5c1' },
];
const PAGE = 1000;
const CHUNK = 100;

// Supabase caps a response at 1000 rows, so page through every .in() chunk.
async function fetchAllIn(table, select, column, ids, order = 'id') {
  let out = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from(table).select(select).in(column, chunk)
        .order(order).range(offset, offset + PAGE - 1);
      if (error) fail(`${table}: ${error.message}`);
      out = out.concat(data);
      if (data.length < PAGE) break;
    }
  }
  return out;
}

const { data: memberships, error: mErr } = await supabase
  .from('team_memberships').select('team_id, athlete_id').in('team_id', TEAMS.map((t) => t.id));
if (mErr) fail(mErr.message);
const athleteIds = [...new Set(memberships.map((m) => m.athlete_id))];

const profiles = await fetchAllIn('profiles', 'id, full_name', 'id', athleteIds);
const nameById = new Map(profiles.map((p) => [p.id, p.full_name]));

const logs = await fetchAllIn(
  'exercise_logs',
  'id, workout_exercise_id, athlete_id, workout_id, set_number, reps_completed, load_completed, rpe, notes, logged_at',
  'athlete_id', athleteIds
);
console.log(`Fetched ${logs.length} logged sets for ${athleteIds.length} athletes.`);

const workouts = await fetchAllIn('workouts', 'id, date, title', 'id', [...new Set(logs.map((l) => l.workout_id))]);
const workoutById = new Map(workouts.map((w) => [w.id, w]));

const weIds = [...new Set(logs.map((l) => l.workout_exercise_id))];
const wes = await fetchAllIn(
  'workout_exercises',
  'id, sort_order, superset_group, sets, reps, load, load_type, exercises(name)',
  'id', weIds
);
const weById = new Map(wes.map((e) => [e.id, e]));

const overrides = await fetchAllIn(
  'athlete_exercise_overrides',
  'id, workout_exercise_id, athlete_id, sets, reps, load, load_type',
  'workout_exercise_id', weIds
);
const overrideMap = new Map(overrides.map((o) => [`${o.workout_exercise_id}::${o.athlete_id}`, o]));

const HEADERS = [
  'Date', 'Athlete', 'Workout', 'Superset', 'Exercise', 'Set',
  'Rx Sets', 'Rx Reps', 'Rx Load', 'Rx Load Type',
  'Reps Done', 'Load Done', 'RPE', 'Notes', 'Logged At',
];

function rowForLog(l) {
  const w = workoutById.get(l.workout_id);
  const e = weById.get(l.workout_exercise_id);
  const ov = overrideMap.get(`${l.workout_exercise_id}::${l.athlete_id}`);
  return {
    sortOrder: e?.sort_order ?? 0,
    cells: [
      w?.date ?? '',
      nameById.get(l.athlete_id) ?? '',
      w?.title ?? '',
      e?.superset_group ?? '',
      e?.exercises?.name ?? '',
      l.set_number,
      ov?.sets ?? e?.sets ?? '',
      ov?.reps ?? e?.reps ?? '',
      ov?.load ?? e?.load ?? '',
      ov?.load_type ?? e?.load_type ?? '',
      l.reps_completed ?? '',
      l.load_completed ?? '',
      l.rpe ?? '',
      l.notes ?? '',
      l.logged_at ? l.logged_at.slice(0, 16).replace('T', ' ') : '',
    ],
  };
}

const wb = XLSX.utils.book_new();
for (const team of TEAMS) {
  const roster = new Set(memberships.filter((m) => m.team_id === team.id).map((m) => m.athlete_id));
  const rows = logs.filter((l) => roster.has(l.athlete_id)).map(rowForLog);
  // Date → athlete → workout → exercise order → set
  rows.sort((a, b) =>
    String(a.cells[0]).localeCompare(String(b.cells[0])) ||
    a.cells[1].localeCompare(b.cells[1]) ||
    String(a.cells[2]).localeCompare(String(b.cells[2])) ||
    a.sortOrder - b.sortOrder ||
    a.cells[5] - b.cells[5]
  );
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows.map((r) => r.cells)]);
  ws['!cols'] = [11, 22, 26, 8, 28, 5, 7, 8, 8, 12, 9, 9, 5, 30, 16].map((w) => ({ wch: w }));
  ws['!autofilter'] = { ref: ws['!ref'] };
  XLSX.utils.book_append_sheet(wb, ws, team.name);
  console.log(`${team.name}: ${rows.length} sets, ${roster.size} athletes`);
}

const outPath = path.join(process.env.HOME, 'Downloads', 'U15-U14-U13-logged-lifts.xlsx');
XLSX.writeFile(wb, outPath);
console.log(`Wrote ${outPath}`);
