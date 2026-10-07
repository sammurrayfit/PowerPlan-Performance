import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Fixes exercises that slipped onto the wrong day in the U15 Oct 6 - Nov 5
// template and were imported that way (coach-confirmed): RDLs belong on Lower
// Body Posterior (Wed), and Upper Body A-group lifts on Thursday. Also adds the
// Nov 3 Front Rack Squat missing from Luca's sheet (copied from his Oct 6 row).
//
// Each move goes from the week's `from` session to the same week's `to`
// session on the athlete's personal "U15 September–October 2026" calendar.
// An exercise that already has logged sets is skipped (it was done on that day).
//
// Usage: node scripts/u15_fix_slipped_rows_oct.mjs [--apply]

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
function fail(msg) { console.error('FATAL:', msg); process.exit(1); }
const APPLY = process.argv.includes('--apply');

const CAL_NAME = 'U15 September–October 2026';
const ANT = 'Lower Body Anterior', POST = 'Lower Body Posterior', UPPER = 'Upper Body';
const WEEKS = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']; // Mondays

const FIXES = {
  'George Bugliari': [
    { exercises: ['Barbell RDL'], from: ANT, to: POST },
    { exercises: ['Barbell Bench Press', 'Band Assisted Pushups'], from: POST, to: UPPER },
  ],
  'Luca Bradley': [
    { exercises: ['DB RDL'], from: ANT, to: POST },
    { exercises: ['Barbell Bench Press', 'Band Assisted Pushups'], from: POST, to: UPPER },
  ],
  'Nikolas Kruzek': [
    { exercises: ['Barbell RDL'], from: ANT, to: POST },
    { exercises: ['Bent Over Row', 'Tricep Dips'], from: POST, to: UPPER },
  ],
  'Omari Coke': [
    { exercises: ['Barbell RDL'], from: ANT, to: POST },
  ],
};
const ADD_FROM_WEEK1 = [{ athlete: 'Luca Bradley', exercise: 'Front Rack Squat', title: ANT, week: '2026-11-02' }];

const inWeek = (date, monday) => date >= monday && date <= addDays(monday, 6);
function addDays(d, n) { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

const plannedMoves = []; // { id, athlete, date, name, fromWorkout, toWorkout }
const plannedAdds = [];
const touchedWorkouts = new Set();

for (const [athlete, fixes] of Object.entries(FIXES)) {
  const { data: prof } = await supabase.from('profiles').select('id').eq('full_name', athlete).single();
  if (!prof) fail(`No profile for ${athlete}`);
  const { data: cal } = await supabase.from('calendars').select('id').eq('athlete_id', prof.id).eq('name', CAL_NAME).single();
  if (!cal) fail(`${athlete}: no "${CAL_NAME}" calendar`);
  const { data: workouts } = await supabase.from('workouts').select('id, date, title').eq('calendar_id', cal.id).gte('date', WEEKS[0]).lte('date', addDays(WEEKS.at(-1), 6));
  const { data: rows } = await supabase.from('workout_exercises').select('id, workout_id, sort_order, superset_group, sets, reps, load, load_type, tempo, rest_seconds, notes, exercise_id, exercises(name)').in('workout_id', workouts.map(w => w.id));

  for (const monday of WEEKS) {
    const wk = workouts.filter(w => inWeek(w.date, monday));
    for (const fix of fixes) {
      const src = wk.find(w => w.title === fix.from), dst = wk.find(w => w.title === fix.to);
      for (const name of fix.exercises) {
        const hit = src && rows.find(r => r.workout_id === src.id && r.exercises?.name === name);
        if (!hit) continue; // already on the right day this week
        if (!dst) fail(`${athlete} week of ${monday}: no "${fix.to}" session to move ${name} into`);
        if (rows.some(r => r.workout_id === dst.id && r.exercises?.name === name)) fail(`${athlete} ${dst.date}: ${name} already in "${fix.to}"`);
        plannedMoves.push({ id: hit.id, athlete, name, from: `${src.date} ${fix.from}`, to: `${dst.date} ${fix.to}`, fromWorkout: src.id, toWorkout: dst.id, group: hit.superset_group });
        touchedWorkouts.add(src.id); touchedWorkouts.add(dst.id);
      }
    }
  }

  for (const add of ADD_FROM_WEEK1.filter(a => a.athlete === athlete)) {
    const week1 = workouts.find(w => w.title === add.title && inWeek(w.date, WEEKS[0]));
    const target = workouts.find(w => w.title === add.title && inWeek(w.date, add.week));
    const template = rows.find(r => r.workout_id === week1?.id && r.exercises?.name === add.exercise);
    if (!template || !target) fail(`${athlete}: can't add ${add.exercise} (template or target missing)`);
    if (rows.some(r => r.workout_id === target.id && r.exercises?.name === add.exercise)) continue;
    const { id, workout_id, sort_order, exercises, ...fields } = template;
    plannedAdds.push({ athlete, date: target.date, name: add.exercise, workoutId: target.id, fields });
    touchedWorkouts.add(target.id);
  }
}

// Logged sets live on workout_id + workout_exercise_id; moving a logged row would orphan them.
if (plannedMoves.length) {
  const { data: logs } = await supabase.from('exercise_logs').select('workout_exercise_id').in('workout_exercise_id', plannedMoves.map(m => m.id));
  // Already performed (e.g. today's session) — leave it where it was done.
  const logged = new Set(logs.map(l => l.workout_exercise_id));
  for (const m of plannedMoves.filter(m => logged.has(m.id))) console.log(`  skip  ${m.athlete}: ${m.name} ${m.from} — already logged`);
  plannedMoves.splice(0, plannedMoves.length, ...plannedMoves.filter(m => !logged.has(m.id)));
}

console.log(APPLY ? 'APPLYING' : 'DRY RUN');
for (const m of plannedMoves) console.log(`  move  ${m.athlete}: ${m.name}  ${m.from} → ${m.to}`);
for (const a of plannedAdds) console.log(`  add   ${a.athlete}: ${a.name} ${a.fields.sets}x${a.fields.reps} (${a.fields.superset_group}) on ${a.date}`);
console.log(`${plannedMoves.length} moves, ${plannedAdds.length} adds`);
if (!APPLY) { console.log('\nDry run only. Re-run with --apply.'); process.exit(0); }

for (const m of plannedMoves) {
  // -1 puts the moved exercise ahead of its group on the new day; renumbered below.
  const { error } = await supabase.from('workout_exercises').update({ workout_id: m.toWorkout, sort_order: -1 }).eq('id', m.id);
  if (error) fail(`move ${m.athlete} ${m.name}: ${error.message}`);
}
for (const a of plannedAdds) {
  const { error } = await supabase.from('workout_exercises').insert({ ...a.fields, workout_id: a.workoutId, sort_order: -1 });
  if (error) fail(`add ${a.athlete} ${a.name}: ${error.message}`);
}
// Renumber each touched workout: superset order (A, B, C...), then existing order.
for (const workoutId of touchedWorkouts) {
  const { data: list } = await supabase.from('workout_exercises').select('id, sort_order, superset_group').eq('workout_id', workoutId);
  list.sort((a, b) => (a.superset_group ?? '').localeCompare(b.superset_group ?? '') || a.sort_order - b.sort_order);
  for (const [i, r] of list.entries()) {
    if (r.sort_order === i) continue;
    const { error } = await supabase.from('workout_exercises').update({ sort_order: i }).eq('id', r.id);
    if (error) fail(`renumber ${workoutId}: ${error.message}`);
  }
}
console.log(`\nDONE. ${plannedMoves.length} moved, ${plannedAdds.length} added, ${touchedWorkouts.size} sessions renumbered.`);
