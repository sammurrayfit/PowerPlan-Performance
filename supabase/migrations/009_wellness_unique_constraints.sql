-- Unique constraints so upsert (athlete_id, date) works correctly
alter table public.mental_checkins
  add constraint mental_checkins_athlete_date_unique unique (athlete_id, date);

alter table public.nutrition_logs
  add constraint nutrition_logs_athlete_date_unique unique (athlete_id, date);
