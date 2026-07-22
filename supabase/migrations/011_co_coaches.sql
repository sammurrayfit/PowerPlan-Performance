-- Co-coach support: a coach can add another coach who mirrors their full
-- access (same roster/teams/calendars/programs). Modeled as a single
-- primary-coach -> co-coach pointer rather than a per-team membership table,
-- so a co-coach's account always resolves to the same owner id for every
-- coach_id check.

alter table public.profiles add column primary_coach_id uuid references public.profiles(id) on delete set null;

-- Resolves a logged-in user's id to the id that actually owns their coaching
-- data: their own id if they're a primary coach (or an athlete), or their
-- primary coach's id if they're a co-coach.
create or replace function public.effective_coach_id(p_uid uuid)
returns uuid language sql stable set search_path = public as $$
  select coalesce((select primary_coach_id from public.profiles where id = p_uid), p_uid)
$$;

-- Reused by memberships_coach_all (team_memberships) — updating this alone
-- fixes that policy without touching it directly.
create or replace function public.get_my_coach_team_ids()
returns setof uuid language sql security definer stable set search_path = public as $$
  select id from public.teams where coach_id = public.effective_coach_id(auth.uid())
$$;

-- Teams
drop policy if exists "teams_coach_all" on public.teams;
create policy "teams_coach_all" on public.teams for all using (coach_id = public.effective_coach_id(auth.uid()));

-- Calendars
drop policy if exists "calendars_coach_all" on public.calendars;
create policy "calendars_coach_all" on public.calendars for all using (coach_id = public.effective_coach_id(auth.uid()));

-- Workouts
drop policy if exists "workouts_coach_all" on public.workouts;
create policy "workouts_coach_all" on public.workouts for all using (
  calendar_id in (select id from public.calendars where coach_id = public.effective_coach_id(auth.uid()))
);

-- Workout exercises
drop policy if exists "workout_exercises_coach_all" on public.workout_exercises;
create policy "workout_exercises_coach_all" on public.workout_exercises for all using (
  workout_id in (
    select w.id from public.workouts w
    join public.calendars c on c.id = w.calendar_id
    where c.coach_id = public.effective_coach_id(auth.uid())
  )
);

-- Overrides
drop policy if exists "overrides_coach_all" on public.athlete_exercise_overrides;
create policy "overrides_coach_all" on public.athlete_exercise_overrides for all using (
  workout_exercise_id in (
    select we.id from public.workout_exercises we
    join public.workouts w on w.id = we.workout_id
    join public.calendars c on c.id = w.calendar_id
    where c.coach_id = public.effective_coach_id(auth.uid())
  )
);

-- Exercise logs (coach read)
drop policy if exists "logs_coach_read" on public.exercise_logs;
create policy "logs_coach_read" on public.exercise_logs for select using (
  workout_id in (
    select w.id from public.workouts w
    join public.calendars c on c.id = w.calendar_id
    where c.coach_id = public.effective_coach_id(auth.uid())
  )
);

-- PRs (coach read)
drop policy if exists "prs_coach_read" on public.personal_records;
create policy "prs_coach_read" on public.personal_records for select using (
  athlete_id in (
    select athlete_id from public.team_memberships
    where team_id in (select id from public.teams where coach_id = public.effective_coach_id(auth.uid()))
  )
);

-- Maxes (coach all)
drop policy if exists "maxes_coach_all" on public.maxes;
create policy "maxes_coach_all" on public.maxes for all using (
  athlete_id in (
    select athlete_id from public.team_memberships
    where team_id in (select id from public.teams where coach_id = public.effective_coach_id(auth.uid()))
  )
);

-- Attendance
drop policy if exists "attendance_coach_all" on public.attendance;
create policy "attendance_coach_all" on public.attendance for all using (
  workout_id in (
    select w.id from public.workouts w
    join public.calendars c on c.id = w.calendar_id
    where c.coach_id = public.effective_coach_id(auth.uid())
  )
);

-- Exercises: share custom (non-public) exercises between a coach and their co-coaches
drop policy if exists "exercises_read_public" on public.exercises;
create policy "exercises_read_public" on public.exercises for select using (
  is_public = true or public.effective_coach_id(created_by) = public.effective_coach_id(auth.uid())
);

drop policy if exists "exercises_coach_update" on public.exercises;
create policy "exercises_coach_update" on public.exercises for update using (
  public.effective_coach_id(created_by) = public.effective_coach_id(auth.uid())
);

drop policy if exists "exercises_coach_delete" on public.exercises;
create policy "exercises_coach_delete" on public.exercises for delete using (
  public.effective_coach_id(created_by) = public.effective_coach_id(auth.uid())
);
