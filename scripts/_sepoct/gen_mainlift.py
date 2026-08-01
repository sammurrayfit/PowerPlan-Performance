import json
import datetime

ROSTER = ["Aaron Judka","Ben Mccaughrain","Callum Vonwimmer","Carlos Palma","Chase Epperly",
"Cyro Barrios","George Bugliari","Hudson Griffith","Jacob Valeriano","Jordi Lacher",
"Lee Hall","Leonardo Andrade","Luca Bradley","Matthew Rodi","Nikolas Kruzek","Omari Coke",
"Sai Mudichintala","Saul Luna","Seif Aly","Tyler Edwards"]

metrics = json.load(open('/Users/sammurray/Downloads/powerplan-performance/scripts/_sepoct/athlete_metrics.json'))

ASYMMETRY_THRESHOLD = 10.0
VERY_BELOW_AVG_THRESHOLD = -20.0

TUE_ADDUCTOR = ["Curtsy Lunge", "Copenhagen Level 2", "Lateral Lunge"]
TUE_QUAD = ["Weighted Reverse Nordics"]

WED_HAMSTRING = ["Staggered Stance RBL"]
WED_GLUTE = ["Crossover Step Up", "Keiser Abduction"]

def pick(pool, athlete_idx, offset=0):
    return pool[(athlete_idx + offset) % len(pool)]

def weaker_side_label(m):
    return "Left" if m["weaker_side"] == "L" else "Right"

# week_progression index: 0=week1 baseline, 1=week2, 2=week3 (week4=week2, week5=week1, repeats for weeks 6-9)
def week_stage(week_num_1_indexed):
    """Map week 1-9 to stage 0/1/2/1/0 repeating (weeks 6-9 = weeks 1-4)."""
    cycle_pos = (week_num_1_indexed - 1) % 5  # 0,1,2,3,4 within a 5-week block; week9 -> pos (9-1)%5=3 -> stage for week4(=week2)
    stage_by_pos = {0: 0, 1: 1, 2: 2, 3: 1, 4: 0}
    return stage_by_pos[cycle_pos]

def tue_a2_reps(stage):
    return [2, 3, 4][stage]

def tue_cd_reps(stage):
    return [6, 8, 10][stage]

def thu_bench(stage):
    return [(4, "4", 85), (4, "5", 83), (4, "6", 80)][stage]

def thu_a2_reps(stage):
    return [2, 3, 4][stage]

def thu_c2_reps(stage):
    return [6, 8, 10][stage]

def build_tuesday(athlete, athlete_idx, stage):
    m = metrics[athlete]
    rows = []
    rows.append(("A", 0, "Back Squat to Box", 4, "6,5,5,4", None, "As reps decrease, weight increases"))
    rows.append(("A", 1, "SL Vert Jump to Bilateral Landing", 3, "2", None, None))

    add_m = m["adductor_squeeze"]
    very_low_add = add_m["pct_vs_avg"] is not None and add_m["pct_vs_avg"] <= VERY_BELOW_AVG_THRESHOLD
    add_note = None
    if add_m["imbalance_pct"] is not None and abs(add_m["imbalance_pct"]) > ASYMMETRY_THRESHOLD:
        add_note = f"Extra set {weaker_side_label(add_m)} (adductor asymmetry)"

    if very_low_add:
        b1 = pick(TUE_ADDUCTOR, athlete_idx, 0)
        b2 = pick(TUE_ADDUCTOR, athlete_idx, 1)
        rows.append(("B", 0, b1, 3, "6", add_note, None))
        rows.append(("B", 1, b2, 3, "6", add_note, None))
    else:
        quad_ex = pick(TUE_QUAD, athlete_idx, 0)
        add_ex = pick(TUE_ADDUCTOR, athlete_idx, 0)
        rows.append(("B", 0, quad_ex, 3, "6", None, None))
        rows.append(("B", 1, add_ex, 3, "6", add_note, None))

    cd_reps = tue_cd_reps(stage)
    rows.append(("C", 0, "Reverse Crunch to Leg Lower", 2, str(cd_reps), None, None))
    rows.append(("C", 1, "Russian Twist", 2, str(cd_reps), None, None))
    a2_reps = tue_a2_reps(stage)
    rows[1] = ("A", 1, "SL Vert Jump to Bilateral Landing", 3, str(a2_reps), None, None)
    return rows

def build_wednesday(athlete, athlete_idx, stage):
    m = metrics[athlete]
    rows = []
    rows.append(("A", 0, "Barbell Hip Thrust", 4, "6,5,5,4", None, "As reps decrease, weight increases"))
    a2_reps = tue_a2_reps(stage)  # same 2/3/4 progression rule as Tuesday's A2
    rows.append(("A", 1, "Hamstring Bridge Catch", 3, str(a2_reps), None, None))

    ham_m = m["hamstring"]
    abd_m = m["abductor_pull"]
    ham_valid = ham_m["L"] not in (None, 0.0) and ham_m["R"] not in (None, 0.0)
    very_low_glute = abd_m["pct_vs_avg"] is not None and abd_m["pct_vs_avg"] <= VERY_BELOW_AVG_THRESHOLD
    very_low_ham = ham_valid and ham_m["pct_vs_avg"] is not None and ham_m["pct_vs_avg"] <= VERY_BELOW_AVG_THRESHOLD

    ham_note = None
    if ham_valid and ham_m["imbalance_pct"] is not None and abs(ham_m["imbalance_pct"]) > ASYMMETRY_THRESHOLD:
        ham_note = f"Extra set {weaker_side_label(ham_m)} (hamstring asymmetry)"
    glute_note = None
    if abd_m["imbalance_pct"] is not None and abs(abd_m["imbalance_pct"]) > ASYMMETRY_THRESHOLD:
        glute_note = f"Extra set {weaker_side_label(abd_m)} (hip/glute asymmetry)"

    if very_low_glute and very_low_ham:
        b1 = pick(WED_HAMSTRING, athlete_idx, 0)
        b2 = pick(WED_GLUTE, athlete_idx, 0)
        rows.append(("B", 0, b1, 3, "6", ham_note, None))
        rows.append(("B", 1, b2, 3, "6", glute_note, None))
    elif very_low_glute:
        b1 = pick(WED_GLUTE, athlete_idx, 0)
        b2 = pick(WED_GLUTE, athlete_idx, 1)
        rows.append(("B", 0, b1, 3, "6", glute_note, None))
        rows.append(("B", 1, b2, 3, "6", glute_note, None))
    elif very_low_ham:
        rows.append(("B", 0, "Staggered Stance RBL", 3, "6", ham_note, None))
        rows.append(("B", 1, "Staggered Stance RBL", 3, "6", ham_note, None))
    else:
        ham_ex = pick(WED_HAMSTRING, athlete_idx, 0)
        glute_ex = pick(WED_GLUTE, athlete_idx, 0)
        rows.append(("B", 0, ham_ex, 3, "6", ham_note, None))
        rows.append(("B", 1, glute_ex, 3, "6", glute_note, None))

    cd_reps = tue_cd_reps(stage)
    rows.append(("C", 0, "GHD or Bench Reverse Hyper", 2, str(cd_reps), None, None))
    rows.append(("C", 1, "Reverse Plank Knees To Chest", 2, str(cd_reps), None, None))
    return rows

def build_thursday(athlete, athlete_idx, stage):
    rows = []
    sets, reps, pct = thu_bench(stage)
    rows.append(("A", 0, "Barbell Bench Press", sets, reps, None, None, pct))
    a2_reps = thu_a2_reps(stage)
    rows.append(("A", 1, "Plyo Pushup", 2, str(a2_reps), None, None, None))
    rows.append(("B", 0, "2pt Dumbbell Row", 3, "8", None, None, None))
    rows.append(("B", 1, "Seated DB Arnold Press", 3, "8", None, None, None))
    rows.append(("C", 0, "Suitcase Carry", 2, "down track and back", None, None, None))
    c2_reps = thu_c2_reps(stage)
    rows.append(("C", 1, "Keiser Chops", 2, f"{c2_reps} each", None, None, None))
    rows.append(("D", 0, "21s", 2, "7", "Optional", None, None))
    rows.append(("D", 1, "Lateral Raises", 2, "8", "Optional", None, None))
    rows.append(("D", 2, "Anterior Raises", 2, "8", "Optional", None, None))
    return rows

def week_tuesdays():
    d = datetime.date(2026, 9, 1)
    return [d + datetime.timedelta(days=7*w) for w in range(9)]

out = []
for idx, athlete in enumerate(ROSTER):
    for week_idx, tue in enumerate(week_tuesdays()):
        week_num = week_idx + 1
        stage = week_stage(week_num)
        wed = tue + datetime.timedelta(days=1)
        thu = tue + datetime.timedelta(days=2)

        for date, builder, title, has_pct in [
            (tue, build_tuesday, "Lower Body Posterior", False),
            (wed, build_wednesday, "Lower Body Anterior", False),
            (thu, build_thursday, "Upper Body", True),
        ]:
            rows = builder(athlete, idx, stage)
            for sort_idx, row in enumerate(rows):
                if has_pct:
                    slot, sub, ex, sets, reps, notes, extra_note, pct = row
                else:
                    slot, sub, ex, sets, reps, notes, extra_note = row
                    pct = None
                combined_notes = notes
                if extra_note:
                    combined_notes = f"{notes}; {extra_note}" if notes else extra_note
                out.append({
                    "athlete": athlete,
                    "date": date.isoformat(),
                    "title": title,
                    "week": week_num,
                    "superset_group": slot,
                    "sub_index": sub,
                    "exercise": ex,
                    "sets": sets,
                    "reps": reps,
                    "load": pct,
                    "load_type": "percent_1rm" if pct is not None else "absolute",
                    "notes": combined_notes,
                })

json.dump(out, open('/Users/sammurray/Downloads/powerplan-performance/scripts/_sepoct/mainlift_sep_oct.json', 'w'), indent=1)
print(f"Generated {len(out)} rows for {len(ROSTER)} athletes x 9 weeks x 3 days")
