alter table public.workout_exercises add column if not exists is_pre_activation boolean not null default false;
