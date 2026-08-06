-- exercise_logs.rpe was left on the old 1-10 scale when attendance moved to
-- 0-10 in 008_rpe_scale_0_10.sql. RPE 0 ("no exertion") is a valid set entry
-- and was being silently rejected, so the set never saved.
alter table public.exercise_logs
  drop constraint if exists exercise_logs_rpe_check,
  add constraint exercise_logs_rpe_check check (rpe >= 0 and rpe <= 10);
