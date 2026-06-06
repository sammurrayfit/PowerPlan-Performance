export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type NoRelationships = { Relationships: [] };

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: "coach" | "athlete";
          full_name: string;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          role: "coach" | "athlete";
          full_name: string;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          role?: "coach" | "athlete";
          full_name?: string;
          avatar_url?: string | null;
          created_at?: string;
        };
      } & NoRelationships;
      teams: {
        Row: {
          id: string;
          name: string;
          coach_id: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          coach_id: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          coach_id?: string;
          description?: string | null;
          created_at?: string;
        };
      } & NoRelationships;
      team_memberships: {
        Row: {
          id: string;
          team_id: string;
          athlete_id: string;
          joined_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          athlete_id: string;
          joined_at?: string;
        };
        Update: {
          id?: string;
          team_id?: string;
          athlete_id?: string;
          joined_at?: string;
        };
      } & NoRelationships;
      exercise_categories: {
        Row: { id: string; name: string };
        Insert: { id?: string; name: string };
        Update: { id?: string; name?: string };
      } & NoRelationships;
      exercises: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          instructions: string | null;
          video_url: string | null;
          image_url: string | null;
          category_id: string | null;
          muscle_groups: string[];
          created_by: string | null;
          is_public: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          instructions?: string | null;
          video_url?: string | null;
          image_url?: string | null;
          category_id?: string | null;
          muscle_groups?: string[];
          created_by?: string | null;
          is_public?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          instructions?: string | null;
          video_url?: string | null;
          image_url?: string | null;
          category_id?: string | null;
          muscle_groups?: string[];
          created_by?: string;
          is_public?: boolean;
          created_at?: string;
        };
      } & NoRelationships;
      calendars: {
        Row: {
          id: string;
          name: string;
          coach_id: string;
          team_id: string | null;
          athlete_id: string | null;
          color: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          coach_id: string;
          team_id?: string | null;
          athlete_id?: string | null;
          color?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          coach_id?: string;
          team_id?: string | null;
          athlete_id?: string | null;
          color?: string;
          created_at?: string;
        };
      } & NoRelationships;
      workouts: {
        Row: {
          id: string;
          calendar_id: string;
          date: string;
          title: string;
          notes: string | null;
          is_locked: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          calendar_id: string;
          date: string;
          title: string;
          notes?: string | null;
          is_locked?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          calendar_id?: string;
          date?: string;
          title?: string;
          notes?: string | null;
          is_locked?: boolean;
          created_at?: string;
        };
      } & NoRelationships;
      workout_exercises: {
        Row: {
          id: string;
          workout_id: string;
          exercise_id: string;
          sort_order: number;
          sets: number | null;
          reps: string | null;
          load: number | null;
          load_type: "absolute" | "percent_1rm" | "bodyweight";
          tempo: string | null;
          rest_seconds: number | null;
          notes: string | null;
          is_pr_tracking: boolean;
          superset_group: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workout_id: string;
          exercise_id: string;
          sort_order?: number;
          sets?: number | null;
          reps?: string | null;
          load?: number | null;
          load_type?: "absolute" | "percent_1rm" | "bodyweight";
          tempo?: string | null;
          rest_seconds?: number | null;
          notes?: string | null;
          is_pr_tracking?: boolean;
          superset_group?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          workout_id?: string;
          exercise_id?: string;
          sort_order?: number;
          sets?: number | null;
          reps?: string | null;
          load?: number | null;
          load_type?: "absolute" | "percent_1rm" | "bodyweight";
          tempo?: string | null;
          rest_seconds?: number | null;
          notes?: string | null;
          is_pr_tracking?: boolean;
          superset_group?: string | null;
          created_at?: string;
        };
      } & NoRelationships;
      athlete_exercise_overrides: {
        Row: {
          id: string;
          workout_exercise_id: string;
          athlete_id: string;
          sets: number | null;
          reps: string | null;
          load: number | null;
          load_type: "absolute" | "percent_1rm" | "bodyweight" | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workout_exercise_id: string;
          athlete_id: string;
          sets?: number | null;
          reps?: string | null;
          load?: number | null;
          load_type?: "absolute" | "percent_1rm" | "bodyweight" | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          workout_exercise_id?: string;
          athlete_id?: string;
          sets?: number | null;
          reps?: string | null;
          load?: number | null;
          load_type?: "absolute" | "percent_1rm" | "bodyweight" | null;
          notes?: string | null;
          created_at?: string;
        };
      } & NoRelationships;
      exercise_logs: {
        Row: {
          id: string;
          workout_exercise_id: string;
          athlete_id: string;
          workout_id: string;
          set_number: number;
          reps_completed: number | null;
          load_completed: number | null;
          rpe: number | null;
          notes: string | null;
          logged_at: string;
        };
        Insert: {
          id?: string;
          workout_exercise_id: string;
          athlete_id: string;
          workout_id: string;
          set_number: number;
          reps_completed?: number | null;
          load_completed?: number | null;
          rpe?: number | null;
          notes?: string | null;
          logged_at?: string;
        };
        Update: {
          id?: string;
          workout_exercise_id?: string;
          athlete_id?: string;
          workout_id?: string;
          set_number?: number;
          reps_completed?: number | null;
          load_completed?: number | null;
          rpe?: number | null;
          notes?: string | null;
          logged_at?: string;
        };
      } & NoRelationships;
      personal_records: {
        Row: {
          id: string;
          exercise_id: string;
          athlete_id: string;
          value: number;
          unit: string;
          date_achieved: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          exercise_id: string;
          athlete_id: string;
          value: number;
          unit?: string;
          date_achieved: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          exercise_id?: string;
          athlete_id?: string;
          value?: number;
          unit?: string;
          date_achieved?: string;
          created_at?: string;
        };
      } & NoRelationships;
      maxes: {
        Row: {
          id: string;
          exercise_id: string;
          athlete_id: string;
          value: number;
          unit: string;
          date_recorded: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          exercise_id: string;
          athlete_id: string;
          value: number;
          unit?: string;
          date_recorded: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          exercise_id?: string;
          athlete_id?: string;
          value?: number;
          unit?: string;
          date_recorded?: string;
          created_at?: string;
        };
      } & NoRelationships;
      attendance: {
        Row: {
          id: string;
          workout_id: string;
          athlete_id: string;
          status: "present" | "absent" | "late";
          rpe_pre: number | null;
          rpe_post: number | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workout_id: string;
          athlete_id: string;
          status?: "present" | "absent" | "late";
          rpe_pre?: number | null;
          rpe_post?: number | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          workout_id?: string;
          athlete_id?: string;
          status?: "present" | "absent" | "late";
          rpe_pre?: number | null;
          rpe_post?: number | null;
          notes?: string | null;
          created_at?: string;
        };
      } & NoRelationships;
      mental_checkins: {
        Row: {
          id: string;
          athlete_id: string;
          date: string;
          energy_level: number | null;
          stress_level: number | null;
          motivation: number | null;
          sleep_hours: number | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          athlete_id: string;
          date: string;
          energy_level?: number | null;
          stress_level?: number | null;
          motivation?: number | null;
          sleep_hours?: number | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          athlete_id?: string;
          date?: string;
          energy_level?: number | null;
          stress_level?: number | null;
          motivation?: number | null;
          sleep_hours?: number | null;
          notes?: string | null;
          created_at?: string;
        };
      } & NoRelationships;
      nutrition_logs: {
        Row: {
          id: string;
          athlete_id: string;
          date: string;
          calories: number | null;
          protein: number | null;
          carbs: number | null;
          fat: number | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          athlete_id: string;
          date: string;
          calories?: number | null;
          protein?: number | null;
          carbs?: number | null;
          fat?: number | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          athlete_id?: string;
          date?: string;
          calories?: number | null;
          protein?: number | null;
          carbs?: number | null;
          fat?: number | null;
          notes?: string | null;
          created_at?: string;
        };
      } & NoRelationships;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
