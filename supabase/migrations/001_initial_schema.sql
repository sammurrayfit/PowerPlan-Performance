-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('coach', 'athlete')),
  full_name text not null,
  avatar_url text,
  created_at timestamptz default now() not null
);

-- Auto-create profile on user signup using metadata
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'athlete'),
    coalesce(new.raw_user_meta_data->>'full_name', 'Unknown')
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        role = excluded.role;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- TEAMS
-- ============================================================
create table public.teams (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  description text,
  created_at timestamptz default now() not null
);

create table public.team_memberships (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid not null references public.teams(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz default now() not null,
  unique(team_id, athlete_id)
);

-- ============================================================
-- EXERCISE LIBRARY
-- ============================================================
create table public.exercise_categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique
);

insert into public.exercise_categories (name) values
  ('Strength'), ('Power'), ('Conditioning'), ('Mobility'), ('Speed'), ('Plyometrics'), ('Accessory');

create table public.exercises (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  instructions text,
  video_url text,
  image_url text,
  category_id uuid references public.exercise_categories(id),
  muscle_groups text[] default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  is_public boolean default true not null,
  created_at timestamptz default now() not null
);

-- ============================================================
-- CALENDARS
-- ============================================================
create table public.calendars (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  athlete_id uuid references public.profiles(id) on delete set null,
  color text default '#6366f1' not null,
  created_at timestamptz default now() not null
);

-- ============================================================
-- WORKOUTS
-- ============================================================
create table public.workouts (
  id uuid primary key default uuid_generate_v4(),
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  date date not null,
  title text not null,
  notes text,
  is_locked boolean default false not null,
  created_at timestamptz default now() not null
);

create index on public.workouts (calendar_id, date);

create table public.workout_exercises (
  id uuid primary key default uuid_generate_v4(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  sort_order int default 0 not null,
  sets int,
  reps text,
  load numeric,
  load_type text default 'absolute' check (load_type in ('absolute', 'percent_1rm', 'bodyweight')),
  tempo text,
  rest_seconds int,
  notes text,
  is_pr_tracking boolean default false not null,
  created_at timestamptz default now() not null
);

-- ============================================================
-- INDIVIDUALIZATION
-- ============================================================
create table public.athlete_exercise_overrides (
  id uuid primary key default uuid_generate_v4(),
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  sets int,
  reps text,
  load numeric,
  load_type text check (load_type in ('absolute', 'percent_1rm', 'bodyweight')),
  notes text,
  created_at timestamptz default now() not null,
  unique(workout_exercise_id, athlete_id)
);

-- ============================================================
-- LOGGING
-- ============================================================
create table public.exercise_logs (
  id uuid primary key default uuid_generate_v4(),
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  set_number int not null,
  reps_completed int,
  load_completed numeric,
  rpe int check (rpe between 1 and 10),
  notes text,
  logged_at timestamptz default now() not null
);

-- ============================================================
-- PRs & MAXES
-- ============================================================
create table public.personal_records (
  id uuid primary key default uuid_generate_v4(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  value numeric not null,
  unit text default 'lbs' not null,
  date_achieved date not null,
  created_at timestamptz default now() not null
);

create table public.maxes (
  id uuid primary key default uuid_generate_v4(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  value numeric not null,
  unit text default 'lbs' not null,
  date_recorded date not null,
  created_at timestamptz default now() not null
);

-- Latest max per athlete per exercise (used for % calculations)
create unique index maxes_latest_idx on public.maxes (exercise_id, athlete_id, date_recorded desc);

-- ============================================================
-- ATTENDANCE
-- ============================================================
create table public.attendance (
  id uuid primary key default uuid_generate_v4(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  status text default 'present' check (status in ('present', 'absent', 'late')),
  rpe_pre int check (rpe_pre between 1 and 10),
  notes text,
  created_at timestamptz default now() not null,
  unique(workout_id, athlete_id)
);

-- ============================================================
-- FUTURE: MENTAL & NUTRITION (schema only, no UI yet)
-- ============================================================
create table public.mental_checkins (
  id uuid primary key default uuid_generate_v4(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  energy_level int check (energy_level between 1 and 10),
  stress_level int check (stress_level between 1 and 10),
  motivation int check (motivation between 1 and 10),
  sleep_hours numeric,
  notes text,
  created_at timestamptz default now() not null
);

create table public.nutrition_logs (
  id uuid primary key default uuid_generate_v4(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  calories int,
  protein int,
  carbs int,
  fat int,
  notes text,
  created_at timestamptz default now() not null
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;
alter table public.exercise_categories enable row level security;
alter table public.exercises enable row level security;
alter table public.calendars enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.athlete_exercise_overrides enable row level security;
alter table public.exercise_logs enable row level security;
alter table public.personal_records enable row level security;
alter table public.maxes enable row level security;
alter table public.attendance enable row level security;
alter table public.mental_checkins enable row level security;
alter table public.nutrition_logs enable row level security;

-- Profiles: users can read any profile, update only their own
create policy "profiles_read" on public.profiles for select using (true);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Teams: coaches own their teams
create policy "teams_coach_all" on public.teams for all using (coach_id = auth.uid());
create policy "teams_athlete_read" on public.teams for select using (
  id in (select team_id from public.team_memberships where athlete_id = auth.uid())
);

-- Team memberships
create policy "memberships_coach_all" on public.team_memberships for all using (
  team_id in (select id from public.teams where coach_id = auth.uid())
);
create policy "memberships_athlete_read_own" on public.team_memberships for select using (athlete_id = auth.uid());

-- Exercise categories: readable by all authenticated
create policy "categories_read" on public.exercise_categories for select using (auth.role() = 'authenticated');

-- Exercises: public ones readable by all; coaches manage their own
create policy "exercises_read_public" on public.exercises for select using (is_public = true or created_by = auth.uid());
create policy "exercises_coach_insert" on public.exercises for insert with check (created_by = auth.uid());
create policy "exercises_coach_update" on public.exercises for update using (created_by = auth.uid());
create policy "exercises_coach_delete" on public.exercises for delete using (created_by = auth.uid());

-- Calendars: coaches own; athletes can read calendars for their teams
create policy "calendars_coach_all" on public.calendars for all using (coach_id = auth.uid());
create policy "calendars_athlete_read" on public.calendars for select using (
  team_id in (select team_id from public.team_memberships where athlete_id = auth.uid())
  or athlete_id = auth.uid()
);

-- Workouts: coaches own via calendar; athletes read via team
create policy "workouts_coach_all" on public.workouts for all using (
  calendar_id in (select id from public.calendars where coach_id = auth.uid())
);
create policy "workouts_athlete_read" on public.workouts for select using (
  calendar_id in (
    select id from public.calendars where
      team_id in (select team_id from public.team_memberships where athlete_id = auth.uid())
      or athlete_id = auth.uid()
  )
);

-- Workout exercises
create policy "workout_exercises_coach_all" on public.workout_exercises for all using (
  workout_id in (
    select w.id from public.workouts w
    join public.calendars c on c.id = w.calendar_id
    where c.coach_id = auth.uid()
  )
);
create policy "workout_exercises_athlete_read" on public.workout_exercises for select using (
  workout_id in (
    select w.id from public.workouts w
    join public.calendars c on c.id = w.calendar_id
    where c.team_id in (select team_id from public.team_memberships where athlete_id = auth.uid())
       or c.athlete_id = auth.uid()
  )
);

-- Overrides: coaches write; athletes read their own
create policy "overrides_coach_all" on public.athlete_exercise_overrides for all using (
  workout_exercise_id in (
    select we.id from public.workout_exercises we
    join public.workouts w on w.id = we.workout_id
    join public.calendars c on c.id = w.calendar_id
    where c.coach_id = auth.uid()
  )
);
create policy "overrides_athlete_read_own" on public.athlete_exercise_overrides for select using (athlete_id = auth.uid());

-- Exercise logs: athletes write/read their own; coaches read all on their workouts
create policy "logs_athlete_own" on public.exercise_logs for all using (athlete_id = auth.uid());
create policy "logs_coach_read" on public.exercise_logs for select using (
  workout_id in (
    select w.id from public.workouts w
    join public.calendars c on c.id = w.calendar_id
    where c.coach_id = auth.uid()
  )
);

-- PRs & maxes: athletes manage their own; coaches read
create policy "prs_athlete_own" on public.personal_records for all using (athlete_id = auth.uid());
create policy "prs_coach_read" on public.personal_records for select using (
  athlete_id in (
    select athlete_id from public.team_memberships
    where team_id in (select id from public.teams where coach_id = auth.uid())
  )
);

create policy "maxes_athlete_own" on public.maxes for all using (athlete_id = auth.uid());
create policy "maxes_coach_all" on public.maxes for all using (
  athlete_id in (
    select athlete_id from public.team_memberships
    where team_id in (select id from public.teams where coach_id = auth.uid())
  )
);

-- Attendance
create policy "attendance_athlete_own" on public.attendance for all using (athlete_id = auth.uid());
create policy "attendance_coach_all" on public.attendance for all using (
  workout_id in (
    select w.id from public.workouts w
    join public.calendars c on c.id = w.calendar_id
    where c.coach_id = auth.uid()
  )
);

-- Mental & nutrition: athletes own
create policy "mental_athlete_own" on public.mental_checkins for all using (athlete_id = auth.uid());
create policy "nutrition_athlete_own" on public.nutrition_logs for all using (athlete_id = auth.uid());
