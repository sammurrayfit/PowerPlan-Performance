import csv, json
from datetime import datetime

ROSTER = ["Aaron Judka","Ben Mccaughrain","Callum Vonwimmer","Carlos Palma","Chase Epperly",
"Cyro Barrios","George Bugliari","Hudson Griffith","Jacob Valeriano","Jordi Lacher",
"Lee Hall","Leonardo Andrade","Luca Bradley","Matthew Rodi","Nikolas Kruzek","Omari Coke",
"Sai Mudichintala","Saul Luna","Seif Aly","Tyler Edwards"]

ALIAS = {
    "Ben McCaughrain": "Ben Mccaughrain",
    "Callum Vonwiller": "Callum Vonwimmer",
    "Leo Andrade": "Leonardo Andrade",
    "Nikolas Kruczek": "Nikolas Kruzek",
}

def parse_date(s):
    s = s.strip()
    for fmt in ("%m/%d/%y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None

def load(fname):
    rows = []
    with open(fname, newline='', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            name = (row.get('Name') or '').strip()
            name = ALIAS.get(name, name)
            if name not in ROSTER:
                continue
            row['Name'] = name
            rows.append(row)
    return rows

nb_rows = load('/Users/sammurray/Downloads/Red Bull NY Academy Data - VALD_NordBord.csv')
hf_rows = load('/Users/sammurray/Downloads/Red Bull NY Academy Data - VALD_HipForce.csv')

print(f"NordBord matched rows: {len(nb_rows)}")
print(f"HipForce matched rows: {len(hf_rows)}")

latest_nb, latest_sq, latest_pl = {}, {}, {}
for r in nb_rows:
    dt = parse_date(r.get('Date UTC', ''))
    if not dt: continue
    name = r['Name']
    if name not in latest_nb or dt > latest_nb[name][0]:
        latest_nb[name] = (dt, r)

for r in hf_rows:
    dt = parse_date(r.get('Date UTC', ''))
    if not dt: continue
    name = r['Name']
    direction = (r.get('Direction') or '').strip()
    target = latest_sq if direction == 'Squeeze' else (latest_pl if direction == 'Pull' else None)
    if target is None: continue
    if name not in target or dt > target[name][0]:
        target[name] = (dt, r)

print("\n=== Coverage for all 20 roster athletes ===")
for name in ROSTER:
    nb = latest_nb.get(name)
    sq = latest_sq.get(name)
    pl = latest_pl.get(name)
    print(f"{name:20s} NB={'Y '+nb[0].strftime('%m/%d/%y') if nb else 'MISSING':12s} SQ={'Y '+sq[0].strftime('%m/%d/%y') if sq else 'MISSING':12s} PULL={'Y '+pl[0].strftime('%m/%d/%y') if pl else 'MISSING'}")

out = {
    'nordbord': {k: v[1] for k, v in latest_nb.items()},
    'squeeze': {k: v[1] for k, v in latest_sq.items()},
    'pull': {k: v[1] for k, v in latest_pl.items()},
}
json.dump(out, open('scripts/_sepoct/latest_tests_full.json', 'w'), indent=1)
