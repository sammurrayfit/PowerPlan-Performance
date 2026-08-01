import json

data = json.load(open('scripts/_sepoct/latest_tests_full.json'))

REF_HAM_L, REF_HAM_R = 281.8, 292.2
REF_ABD_L, REF_ABD_R = 136.7, 134.3   # Pull = abduction
REF_ADD_L, REF_ADD_R = 155.0, 161.8   # Squeeze = adduction

def f(row, key):
    v = row.get(key, '')
    try:
        return float(v)
    except (ValueError, TypeError):
        return None

roster = list(data['nordbord'].keys())

results = {}
for name in sorted(roster):
    nb = data['nordbord'].get(name, {})
    sq = data['squeeze'].get(name, {})
    pl = data['pull'].get(name, {})

    ham_l, ham_r = f(nb, 'L Max Force (N)'), f(nb, 'R Max Force (N)')
    ham_imb = f(nb, 'Max Imbalance (%)')

    add_l, add_r = f(sq, 'L Max Force (N)'), f(sq, 'R Max Force (N)')
    add_imb = f(sq, 'Max Imbalance')

    abd_l, abd_r = f(pl, 'L Max Force (N)'), f(pl, 'R Max Force (N)')
    abd_imb = f(pl, 'Max Imbalance')

    def pct_below_avg(l, r, ref_l, ref_r):
        if l is None or r is None: return None
        avg = (l + r) / 2
        ref_avg = (ref_l + ref_r) / 2
        return round((avg - ref_avg) / ref_avg * 100, 1)

    results[name] = {
        'hamstring': {'L': ham_l, 'R': ham_r, 'imbalance_pct': round(ham_imb,1) if ham_imb is not None else None,
                       'weaker_side': 'L' if (ham_l is not None and ham_r is not None and ham_l < ham_r) else ('R' if ham_r is not None else None),
                       'pct_vs_avg': pct_below_avg(ham_l, ham_r, REF_HAM_L, REF_HAM_R)},
        'adductor_squeeze': {'L': add_l, 'R': add_r, 'imbalance_pct': round(add_imb,1) if add_imb is not None else None,
                       'weaker_side': 'L' if (add_l is not None and add_r is not None and add_l < add_r) else ('R' if add_r is not None else None),
                       'pct_vs_avg': pct_below_avg(add_l, add_r, REF_ADD_L, REF_ADD_R)},
        'abductor_pull': {'L': abd_l, 'R': abd_r, 'imbalance_pct': round(abd_imb,1) if abd_imb is not None else None,
                       'weaker_side': 'L' if (abd_l is not None and abd_r is not None and abd_l < abd_r) else ('R' if abd_r is not None else None),
                       'pct_vs_avg': pct_below_avg(abd_l, abd_r, REF_ABD_L, REF_ABD_R)},
    }

print(f"{'Name':18s} {'Ham L/R':14s} {'Ham%Imb':8s} {'Add L/R':14s} {'Add%Imb':8s} {'AddVsAvg':9s} {'Abd L/R':14s} {'Abd%Imb':8s} {'AbdVsAvg':9s}")
for name, r in results.items():
    h, a, b = r['hamstring'], r['adductor_squeeze'], r['abductor_pull']
    print(f"{name:18s} {str(h['L'])+'/'+str(h['R']):14s} {str(h['imbalance_pct']):8s} {str(a['L'])+'/'+str(a['R']):14s} {str(a['imbalance_pct']):8s} {str(a['pct_vs_avg'])+'%':9s} {str(b['L'])+'/'+str(b['R']):14s} {str(b['imbalance_pct']):8s} {str(b['pct_vs_avg'])+'%':9s}")

json.dump(results, open('scripts/_sepoct/athlete_metrics.json', 'w'), indent=1)
