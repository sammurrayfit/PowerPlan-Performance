-- Fix infinite recursion in RLS policies between teams and team_memberships.
-- The circular reference: teams_athlete_read queries team_memberships, and
-- memberships_coach_all queries teams — they trigger each other infinitely.
-- Security definer functions bypass RLS when they run, breaking the loop.

CREATE OR REPLACE FUNCTION public.get_my_athlete_team_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT team_id FROM public.team_memberships WHERE athlete_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.get_my_coach_team_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT id FROM public.teams WHERE coach_id = auth.uid()
$$;

DROP POLICY IF EXISTS "teams_athlete_read" ON public.teams;
CREATE POLICY "teams_athlete_read" ON public.teams FOR SELECT USING (
  id IN (SELECT get_my_athlete_team_ids())
);

DROP POLICY IF EXISTS "memberships_coach_all" ON public.team_memberships;
CREATE POLICY "memberships_coach_all" ON public.team_memberships FOR ALL USING (
  team_id IN (SELECT get_my_coach_team_ids())
);
