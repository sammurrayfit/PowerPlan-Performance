"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { GripVertical, Plus, Trash2, Lock, Unlock, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateWorkout, deleteWorkout } from "@/app/(coach)/coach/calendar/actions";
import { ExercisePicker } from "./exercise-picker";
import { ExcelImport, type ParsedExerciseRow } from "./excel-import";
import { CopyWorkoutModal } from "./copy-workout-modal";
import { Individualization } from "./individualization";
import type { Database } from "@/lib/supabase/types";

type Workout = Database["public"]["Tables"]["workouts"]["Row"];

interface WorkoutExerciseRow {
  id: string;
  exercise_id: string;
  exercise_name: string;
  sort_order: number;
  sets: number | null;
  reps: string | null;
  load: number | null;
  load_type: "absolute" | "percent_1rm" | "bodyweight";
  tempo: string | null;
  rest_seconds: number | null;
  notes: string | null;
  is_pr_tracking: boolean;
}

interface AllExercise {
  id: string;
  name: string;
  muscle_groups: string[];
}

interface Athlete {
  id: string;
  full_name: string;
}

interface Override {
  id: string;
  workout_exercise_id: string;
  athlete_id: string;
  sets: number | null;
  reps: string | null;
  load: number | null;
  load_type: "absolute" | "percent_1rm" | "bodyweight" | null;
  notes: string | null;
}

interface WorkoutBuilderProps {
  workout: Workout;
  initialExercises: WorkoutExerciseRow[];
  allExercises: AllExercise[];
  calendarId: string;
  athletes?: Athlete[];
  initialOverrides?: Override[];
  maxesMap?: Record<string, Record<string, number>>;
}

const LOAD_TYPE_LABELS = { absolute: "lbs", percent_1rm: "%", bodyweight: "BW" };

function ExerciseRow({
  row,
  onUpdate,
  onDelete,
}: {
  row: WorkoutExerciseRow;
  onUpdate: (id: string, field: string, value: unknown) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function field(name: string, value: unknown) {
    return (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
      const v = e.target.value;
      const parsed = name === "sets" || name === "load" || name === "rest_seconds"
        ? v === "" ? null : Number(v)
        : v === "" ? null : v;
      if (parsed !== value) onUpdate(row.id, name, parsed);
    };
  }

  return (
    <tr ref={setNodeRef} style={style} className="border-b group">
      <td className="w-8 px-2 py-1">
        <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground">
          <GripVertical className="h-4 w-4" />
        </button>
      </td>
      <td className="px-2 py-1 font-medium text-sm min-w-[160px]">{row.exercise_name}</td>
      <td className="px-1 py-1 w-16">
        <Input
          type="number"
          defaultValue={row.sets ?? ""}
          onBlur={field("sets", row.sets)}
          className="h-7 text-sm px-1.5"
          placeholder="—"
        />
      </td>
      <td className="px-1 py-1 w-20">
        <Input
          defaultValue={row.reps ?? ""}
          onBlur={field("reps", row.reps)}
          className="h-7 text-sm px-1.5"
          placeholder="—"
        />
      </td>
      <td className="px-1 py-1 w-20">
        <Input
          type="number"
          defaultValue={row.load ?? ""}
          onBlur={field("load", row.load)}
          className="h-7 text-sm px-1.5"
          placeholder="—"
        />
      </td>
      <td className="px-1 py-1 w-20">
        <select
          defaultValue={row.load_type}
          onBlur={field("load_type", row.load_type)}
          className="h-7 w-full rounded border border-input bg-background px-1 text-sm"
        >
          <option value="absolute">lbs</option>
          <option value="percent_1rm">%</option>
          <option value="bodyweight">BW</option>
        </select>
      </td>
      <td className="px-1 py-1 w-20">
        <Input
          defaultValue={row.tempo ?? ""}
          onBlur={field("tempo", row.tempo)}
          className="h-7 text-sm px-1.5"
          placeholder="—"
        />
      </td>
      <td className="px-1 py-1 w-16">
        <Input
          type="number"
          defaultValue={row.rest_seconds ?? ""}
          onBlur={field("rest_seconds", row.rest_seconds)}
          className="h-7 text-sm px-1.5"
          placeholder="—"
        />
      </td>
      <td className="px-1 py-1 min-w-[120px]">
        <Input
          defaultValue={row.notes ?? ""}
          onBlur={field("notes", row.notes)}
          className="h-7 text-sm px-1.5"
          placeholder="—"
        />
      </td>
      <td className="px-2 py-1 w-10 text-center">
        <button
          onClick={() => onUpdate(row.id, "is_pr_tracking", !row.is_pr_tracking)}
          title="Track PR"
          className={row.is_pr_tracking ? "text-yellow-500" : "text-muted-foreground hover:text-yellow-500"}
        >
          <Star className="h-4 w-4" fill={row.is_pr_tracking ? "currentColor" : "none"} />
        </button>
      </td>
      <td className="px-2 py-1 w-10">
        <button
          onClick={() => onDelete(row.id)}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}

type Tab = "prescription" | "individualize";

export function WorkoutBuilder({ workout, initialExercises, allExercises, calendarId, athletes = [], initialOverrides = [], maxesMap = {} }: WorkoutBuilderProps) {
  const supabase = createClient();
  const [exercises, setExercises] = useState<WorkoutExerciseRow[]>(initialExercises);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(workout.is_locked);
  const [title, setTitle] = useState(workout.title);
  const [notes, setNotes] = useState(workout.notes ?? "");
  const [activeTab, setActiveTab] = useState<Tab>("prescription");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleUpdate = useCallback(async (id: string, field: string, value: unknown) => {
    setExercises((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase.from("workout_exercises").update({ [field]: value } as any).eq("id", id);
  }, [supabase]);

  const handleDelete = useCallback(async (id: string) => {
    setExercises((prev) => prev.filter((r) => r.id !== id));
    await supabase.from("workout_exercises").delete().eq("id", id);
  }, [supabase]);

  async function handleAddExercise(ex: AllExercise) {
    const nextOrder = exercises.length > 0 ? Math.max(...exercises.map((e) => e.sort_order)) + 1 : 0;
    const { data } = await supabase
      .from("workout_exercises")
      .insert({
        workout_id: workout.id,
        exercise_id: ex.id,
        sort_order: nextOrder,
        load_type: "absolute",
      })
      .select("id")
      .single();

    if (data) {
      setExercises((prev) => [
        ...prev,
        {
          id: data.id,
          exercise_id: ex.id,
          exercise_name: ex.name,
          sort_order: nextOrder,
          sets: null,
          reps: null,
          load: null,
          load_type: "absolute",
          tempo: null,
          rest_seconds: null,
          notes: null,
          is_pr_tracking: false,
        },
      ]);
    }
    setPickerOpen(false);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = exercises.findIndex((e) => e.id === active.id);
    const newIndex = exercises.findIndex((e) => e.id === over.id);
    const reordered = arrayMove(exercises, oldIndex, newIndex).map((e, i) => ({ ...e, sort_order: i }));
    setExercises(reordered);

    await Promise.all(
      reordered.map((e) => supabase.from("workout_exercises").update({ sort_order: e.sort_order }).eq("id", e.id))
    );
  }

  async function handleImportExcel(rows: ParsedExerciseRow[]) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let nextOrder = exercises.length > 0 ? Math.max(...exercises.map((e) => e.sort_order)) + 1 : 0;
    const newRows: WorkoutExerciseRow[] = [];

    for (const row of rows) {
      let match = allExercises.find(
        (e) => e.name.toLowerCase() === row.exerciseName.toLowerCase()
      );

      if (!match) {
        match = allExercises.find(
          (e) =>
            e.name.toLowerCase().includes(row.exerciseName.toLowerCase()) ||
            row.exerciseName.toLowerCase().includes(e.name.toLowerCase())
        );
      }

      if (!match) {
        const { data: created } = await supabase
          .from("exercises")
          .insert({ name: row.exerciseName, is_public: false, created_by: user.id })
          .select("id, name, muscle_groups")
          .single();
        if (created) {
          match = created;
          allExercises.push(created);
        }
      }

      if (!match) continue;

      const { data: we } = await supabase
        .from("workout_exercises")
        .insert({
          workout_id: workout.id,
          exercise_id: match.id,
          sort_order: nextOrder,
          sets: row.sets,
          reps: row.reps,
          load: row.load,
          load_type: row.loadType,
          tempo: row.tempo,
          rest_seconds: row.restSeconds,
          notes: row.notes,
        })
        .select("id")
        .single();

      if (we) {
        newRows.push({
          id: we.id,
          exercise_id: match.id,
          exercise_name: match.name,
          sort_order: nextOrder,
          sets: row.sets,
          reps: row.reps,
          load: row.load,
          load_type: row.loadType,
          tempo: row.tempo,
          rest_seconds: row.restSeconds,
          notes: row.notes,
          is_pr_tracking: false,
        });
        nextOrder++;
      }
    }

    setExercises((prev) => [...prev, ...newRows]);
  }

  async function toggleLock() {
    const next = !isLocked;
    setIsLocked(next);
    await updateWorkout(workout.id, { is_locked: next });
  }

  async function handleTitleBlur() {
    if (title !== workout.title) await updateWorkout(workout.id, { title });
  }

  async function handleNotesBlur() {
    const val = notes || null;
    if (val !== workout.notes) await updateWorkout(workout.id, { notes: val });
  }

  async function handleDeleteWorkout() {
    if (!confirm("Delete this workout and all its exercises?")) return;
    await deleteWorkout(workout.id, calendarId);
  }

  // Exercises shaped for the Individualization component
  const individualizationExercises = exercises.map((e) => ({
    id: e.id,
    exercise_id: e.exercise_id,
    exercise_name: e.exercise_name,
    sets: e.sets,
    reps: e.reps,
    load: e.load,
    load_type: e.load_type,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex-1 space-y-2">
          <Link href={`/coach/calendar/${calendarId}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← Calendar
          </Link>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            className="text-2xl font-bold border-0 border-b rounded-none px-0 h-auto text-foreground focus-visible:ring-0"
          />
          <p className="text-sm text-muted-foreground">{workout.date}</p>
        </div>
        <div className="flex items-center gap-2 pt-6">
          <CopyWorkoutModal workoutId={workout.id} workoutTitle={title} />
          <Button variant="outline" size="sm" onClick={toggleLock}>
            {isLocked ? <><Unlock className="h-4 w-4 mr-1.5" /> Unlock</> : <><Lock className="h-4 w-4 mr-1.5" /> Lock</>}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDeleteWorkout} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Notes */}
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={handleNotesBlur}
        placeholder="Workout notes…"
        rows={2}
        className="resize-none"
      />

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab("prescription")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "prescription"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Prescription
        </button>
        <button
          onClick={() => setActiveTab("individualize")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "individualize"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Individualize
          {athletes.length > 0 && (
            <span className="ml-1.5 text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
              {athletes.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === "prescription" && (
        <>
          {/* Exercise table */}
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
                <tr>
                  <th className="w-8" />
                  <th className="px-2 py-2 text-left">Exercise</th>
                  <th className="px-2 py-2 text-left w-16">Sets</th>
                  <th className="px-2 py-2 text-left w-20">Reps</th>
                  <th className="px-2 py-2 text-left w-20">Load</th>
                  <th className="px-2 py-2 text-left w-20">Type</th>
                  <th className="px-2 py-2 text-left w-20">Tempo</th>
                  <th className="px-2 py-2 text-left w-16">Rest</th>
                  <th className="px-2 py-2 text-left">Notes</th>
                  <th className="px-2 py-2 w-10" title="PR Tracking">PR</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={exercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                  <tbody>
                    {exercises.map((row) => (
                      <ExerciseRow
                        key={row.id}
                        row={row}
                        onUpdate={handleUpdate}
                        onDelete={handleDelete}
                      />
                    ))}
                  </tbody>
                </SortableContext>
              </DndContext>
            </table>

            {exercises.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No exercises yet — add one below.
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={() => setPickerOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add exercise
            </Button>
          </div>

          <ExcelImport onImport={handleImportExcel} />
        </>
      )}

      {activeTab === "individualize" && (
        <Individualization
          exercises={individualizationExercises}
          athletes={athletes}
          initialOverrides={initialOverrides}
          maxesMap={maxesMap}
        />
      )}

      {/* Exercise picker sheet */}
      <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
        <SheetContent className="flex flex-col">
          <SheetHeader>
            <SheetTitle>Add exercise</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-hidden mt-4">
            <ExercisePicker exercises={allExercises} onSelect={handleAddExercise} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
