import sys, json, csv, collections
sp, out_path = sys.argv[1], sys.argv[2]  # sp: dir with stages.txt, *.jsonl and tables/
sys.path.insert(0, f'{sp}/scripts')
from pb import msg
def jl(p): return [json.loads(l) for l in open(p)]
lang = {}
for r in msg(open(f'{sp}/tables/game/lang_en.bytes', 'rb').read())[1]:
    m = msg(r); lang[m[1][0].decode()] = m.get(2, [b''])[0].decode('utf-8', 'replace')
lineup = collections.defaultdict(list)
for r in jl(f'{sp}/lineup.jsonl'): lineup[r['FightStageEntry']].append(r)
rounds = collections.defaultdict(list)
for r in jl(f'{sp}/round.jsonl'): rounds[r['FightStageEntry']].append(r)
sold = {r['Entry']: r for r in jl(f'{sp}/soldier.jsonl')}

BASE = {1100: 'AttrPatk', 1200: 'AttrMatk', 1300: 'AttrPdef', 1400: 'AttrMdef', 1500: 'AttrHp'}
def a(l, k):
    # lineup values are added to the monster's own base stats (fight_soldier)
    ks = l.get('AttrKey', []); vs = l.get('AttrNum', [])
    base = sold.get(l['SoldierEntry'], {}).get(BASE[k], 0) if k in BASE else 0
    return base + (vs[ks.index(k)] if k in ks else 0)
rows = []
for line in open(f'{sp}/stages.txt').read().split('\n')[1:]:
    if not line: continue
    p = line.split()
    entry, cs, cat, fight = int(p[0]), p[1], int(p[3]), int(p[5])
    ls = lineup.get(fight, [])
    n = lambda l: l.get('Count', 1) * l.get('Turns', 1)
    wave = [l for l in ls if l.get('TimeFirst', 0) == 0 and l.get('Turns', 1) > 1]
    big = [l for l in ls if l not in wave]
    head = next((l for l in big if l.get('HpShowAmount') == 1), big[0] if big else None)
    name = lang.get(sold.get(head['SoldierEntry'], {}).get('SoldierName', ''), '') if head else ''
    rs = rounds.get(fight, [])
    rows.append({
        'stage': cs, 'chapter_boss': 'yes' if cat == 3 else '', 'time_limit_s': sum(r.get('RoundTime', 0) for r in rs),
        'boss': name, 'boss_count': sum(n(l) for l in big), 'boss_spawns_at_s': head.get('TimeFirst', 0) if head else '',
        'boss_hp': int(a(head, 1500)) if head else 0, 'boss_hp_total': int(sum(n(l) * a(l, 1500) for l in big)),
        'boss_atk': int(max(a(head, 1100), a(head, 1200))) if head else 0,
        'boss_def': int(a(head, 1300)) if head else 0,
        'dmg_reduction': round(a(head, 11800), 3) if head else '',
        'boss_dmg_mod': round(a(head, 19900), 3) if head else '',
        'boss_flee': round(a(head, 10800), 1) if head else '',
        'mobs': sum(n(l) for l in wave), 'mob_hp': int(a(wave[0], 1500)) if wave else 0,
        'mob_atk': int(max(a(wave[0], 1100), a(wave[0], 1200))) if wave else 0,
        'enemy_hp_total': int(sum(n(l) * a(l, 1500) for l in ls)),
        'min_power_field': int(p[11]),
    })
w = csv.DictWriter(open(out_path, 'w', newline=''), fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
print(len(rows), 'stages ->', out_path)
