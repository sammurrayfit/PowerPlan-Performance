-- Fix: athletes could not see any of their coach's private exercises
-- (is_public = false), which is the default for most coach-created
-- exercises. exercises_read_public (migration 011) only matched
-- coach/co-coach visibility via effective_coach_id — an athlete's
-- effective_coach_id is their own id (profiles.primary_coach_id is a
-- co-coach concept, never set for athletes), so it never matched their
-- coach's id. Every private exercise on an athlete's workout rendered
-- as "Unknown" in the app.
--
-- Security-definer functions (same pattern as migration 005) resolve
-- the athlete's coach without going through teams/calendars RLS directly,
-- avoiding recursion.

create or replace function public.get_my_team_coach_ids()
returns setof uuid language sql security definer stable set search_path = public as $$
  select t.coach_id from public.teams t
  join public.team_memberships tm on tm.team_id = t.id
  where tm.athlete_id = auth.uid()
$$;

create or replace function public.get_my_calendar_coach_ids()
returns setof uuid language sql security definer stable set search_path = public as $$
  select coach_id from public.calendars where athlete_id = auth.uid()
$$;

drop policy if exists "exercises_read_public" on public.exercises;
create policy "exercises_read_public" on public.exercises for select using (
  is_public = true
  or public.effective_coach_id(created_by) = public.effective_coach_id(auth.uid())
  or public.effective_coach_id(created_by) in (select public.get_my_team_coach_ids())
  or public.effective_coach_id(created_by) in (select public.get_my_calendar_coach_ids())
);
