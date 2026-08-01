import json
import datetime

ROSTER = ["Aaron Judka","Ben Mccaughrain","Callum Vonwimmer","Carlos Palma","Chase Epperly",
"Cyro Barrios","George Bugliari","Hudson Griffith","Jacob Valeriano","Jordi Lacher",
"Lee Hall","Leonardo Andrade","Luca Bradley","Matthew Rodi","Nikolas Kruzek","Omari Coke",
"Sai Mudichintala","Saul Luna","Seif Aly","Tyler Edwards"]

GOALKEEPERS = {"Callum Vonwimmer", "Aaron Judka"}

metrics = json.load(open('/Users/sammurray/Downloads/powerplan-performance/scripts/_sepoct/athlete_metrics.json'))

BALANCE = ["Single Leg Eyes Closed", "Tandem Eyes Closed", "Single Leg ABCs"]
HIP_MOBILITY = ["Kneeling Hip CARs", "Quadruped Hip Circles", "Deep Squat with Rotation", "Pigeon Stretch with Rotation", "Kneeling Sitbacks"]
QUAD = ["Reverse Nordics", "Forward Lunge", "Standing Box 90 Hip Flexor Lifts"]
ADDUCTOR = ["Banded Hip Adduction", "Medball Squeeze with Straight Legs", "Side Lying Adduction"]
ABDUCTOR = ["Side Lying Mini Band Abduction", "Single Leg Exercise Ball Hip Abduction with Hip Flexion", "Mini Band Fire Hydrant Hold"]
HAMSTRING = ["Banded Knee Extensions", "Banded SL RDL", "Hamstring Bridge Iso", "Single Leg Exercise Ball Hamstring Curl"]
GK_ADDUCTION = "3 Way Banded Adduction"

# (exercise, sets, reps) - fixed sets/reps per exercise, from the doc
EXPLOSIVE_TUE_THU = [
    ("Partner Shoulder Bumps", 1, "6"),
    ("Depth Drop to Vertical", 1, "4"),
    ("Banded A Skips", 2, "10 yards"),
    ("Skaters", 1, "4"),
]
EXPLOSIVE_WED_FRI = [
    ("CMJ", 1, "3"),
    ("Wideouts", 1, "10 sec"),
    ("Sit to Stand Jumps", 1, "4"),
]

VERY_BELOW_AVG_THRESHOLD = -20.0  # % vs team average
ASYMMETRY_THRESHOLD = 10.0        # % L/R imbalance

def weaker_side_label(m):
    return "Left" if m["weaker_side"] == "L" else "Right"

def pick(pool, athlete_idx, offset=0):
    return pool[(athlete_idx + offset) % len(pool)]

def build_cd(athlete, athlete_idx, day_group):
    """day_group: 'tue_thu' (quad+adductor) or 'wed_fri' (hamstring+abductor)."""
    m = metrics[athlete]
    rows = []  # list of (slot, exercise, sets, reps, notes)

    if day_group == "tue_thu":
        add_m = m["adductor_squeeze"]
        very_low_add = add_m["pct_vs_avg"] is not None and add_m["pct_vs_avg"] <= VERY_BELOW_AVG_THRESHOLD
        add_note = None
        if add_m["imbalance_pct"] is not None and abs(add_m["imbalance_pct"]) > ASYMMETRY_THRESHOLD:
            add_note = f"Extra set {weaker_side_label(add_m)} (adductor asymmetry)"

        if very_low_add:
            # both slots become adductor-focused
            e1 = pick(ADDUCTOR, athlete_idx, 0)
            e2 = pick(ADDUCTOR, athlete_idx, 1)
            rows.append(("C", e1, 1, "10", add_note))
            rows.append(("D", e2, 1, "10", add_note))
        else:
            quad_ex = pick(QUAD, athlete_idx, 0)
            add_ex = pick(ADDUCTOR, athlete_idx, 0)
            rows.append(("C", quad_ex, 1, "10", None))
            rows.append(("D", add_ex, 1, "10", add_note))
    else:
        ham_m = m["hamstring"]
        abd_m = m["abductor_pull"]
        ham_valid = ham_m["L"] not in (None, 0.0) and ham_m["R"] not in (None, 0.0)
        very_low_abd = abd_m["pct_vs_avg"] is not None and abd_m["pct_vs_avg"] <= VERY_BELOW_AVG_THRESHOLD
        very_low_ham = ham_valid and ham_m["pct_vs_avg"] is not None and ham_m["pct_vs_avg"] <= VERY_BELOW_AVG_THRESHOLD

        ham_note = None
        if ham_valid and ham_m["imbalance_pct"] is not None and abs(ham_m["imbalance_pct"]) > ASYMMETRY_THRESHOLD:
            ham_note = f"Extra set {weaker_side_label(ham_m)} (hamstring asymmetry)"
        abd_note = None
        if abd_m["imbalance_pct"] is not None and abs(abd_m["imbalance_pct"]) > ASYMMETRY_THRESHOLD:
            abd_note = f"Extra set {weaker_side_label(abd_m)} (abductor asymmetry)"

        if very_low_abd or very_low_ham:
            # both slots shift toward whichever category is flagged; if both flagged, split 1 of each (doc's "1 of each" option)
            if very_low_abd and very_low_ham:
                e1 = pick(HAMSTRING, athlete_idx, 0)
                e2 = pick(ABDUCTOR, athlete_idx, 0)
                rows.append(("C", e1, 1, "10", ham_note))
                rows.append(("D", e2, 1, "10", abd_note))
            elif very_low_abd:
                e1 = pick(ABDUCTOR, athlete_idx, 0)
                e2 = pick(ABDUCTOR, athlete_idx, 1)
                rows.append(("C", e1, 1, "10", abd_note))
                rows.append(("D", e2, 1, "10", abd_note))
            else:
                e1 = pick(HAMSTRING, athlete_idx, 0)
                e2 = pick(HAMSTRING, athlete_idx, 1)
                rows.append(("C", e1, 1, "10", ham_note))
                rows.append(("D", e2, 1, "10", ham_note))
        else:
            ham_ex = pick(HAMSTRING, athlete_idx, 0)
            abd_ex = pick(ABDUCTOR, athlete_idx, 0)
            rows.append(("C", ham_ex, 1, "10", ham_note))
            rows.append(("D", abd_ex, 1, "10", abd_note))

    if athlete in GOALKEEPERS:
        # D slot always becomes 3-way banded adduction for GKs, on every day, note preserved if any
        d_note = rows[1][4]
        rows[1] = ("D", GK_ADDUCTION, 1, "10", d_note)

    return rows

def build_day(athlete, athlete_idx, weekday):
    """weekday: 0=Tue,1=Wed,2=Thu,3=Fri (offset within the Tue-Fri block)."""
    day_group = "tue_thu" if weekday in (0, 2) else "wed_fri"
    # Tue/Thu share one exercise set; Wed/Fri share another (matches July-Aug precedent)
    ab_offset = 0 if weekday in (0, 2) else 1

    rows = []
    rows.append(("A", pick(BALANCE, athlete_idx, ab_offset), 2, "20 sec", None))
    rows.append(("B", pick(HIP_MOBILITY, athlete_idx, ab_offset), 1, "8", None))
    rows.extend(build_cd(athlete, athlete_idx, day_group))

    explosive_pool = EXPLOSIVE_TUE_THU if weekday in (0, 2) else EXPLOSIVE_WED_FRI
    e_ex = pick(explosive_pool, athlete_idx, 0)
    f_ex = pick(explosive_pool, athlete_idx, 1)
    rows.append(("E", e_ex[0], e_ex[1], e_ex[2], None))
    rows.append(("F", f_ex[0], f_ex[1], f_ex[2], None))
    return rows

def all_dates():
    d = datetime.date(2026, 9, 1)
    dates = []
    for week in range(9):
        for offset in range(4):  # Tue, Wed, Thu, Fri
            dates.append((d + datetime.timedelta(days=7*week + offset), offset))
    return dates

out = []
for idx, athlete in enumerate(ROSTER):
    for date, weekday in all_dates():
        rows = build_day(athlete, idx, weekday)
        for slot, ex, sets, reps, notes in rows:
            out.append({
                "athlete": athlete,
                "date": date.isoformat(),
                "slot": slot,
                "exercise": ex,
                "sets": sets,
                "reps": reps,
                "notes": notes,
            })

json.dump(out, open('/Users/sammurray/Downloads/powerplan-performance/scripts/_sepoct/preactivation_sep_oct.json', 'w'), indent=1)
print(f"Generated {len(out)} rows for {len(ROSTER)} athletes x {len(all_dates())} days")
