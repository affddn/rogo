"""Estimate the power a stage needs, from the game's damage formula.

Per-hit damage (Cross.Fight.FightFormulaTemplate, fight_formula F1/F3/F5/F8/F10/F14):
  base  = ATK^2 / (ATK + 2*DEF) + (refineATK - refineDEF), at least 1   (no penetration)
  inner = CondDmgMod(0.2, 3.0, 0.15; our boosts vs enemy DmgReduc)
  final = CondDmgMod(0.4, 1.0, 0.15; FinalDmgIncreased vs FinalDmgReduc)
A stage's work is sum(count * HP / hit); a fight clears when work <= capacity,
the work this character gets through in 40 s (calibrated from one real fight).
Flat stats (ATK, refine ATK, HP, DEF) are scaled together; rate stats stay as now.
"""
import sys, json, math, collections, csv
sp = sys.argv[1]
def jl(p): return [json.loads(l) for l in open(p)]
sold = {r['Entry']: r for r in jl(f'{sp}/soldier.jsonl')}
lineup = collections.defaultdict(list)
for r in jl(f'{sp}/lineup.jsonl'): lineup[r['FightStageEntry']].append(r)
stages = []
for line in open(f'{sp}/stages.txt').read().split('\n')[1:]:
    if line:
        p = line.split(); stages.append((p[1], int(p[3]), int(p[5])))
BASE = {1100: 'AttrPatk', 1300: 'AttrPdef', 1500: 'AttrHp'}
def stat(l, k):
    ks, vs = l.get('AttrKey', []), l.get('AttrNum', [])
    return sold.get(l['SoldierEntry'], {}).get(BASE.get(k), 0) + (vs[ks.index(k)] if k in ks else 0)

def cond(a, b, c, inc, red):
    d, s = inc - red, inc + red
    f = d * (a + (1 - a) * math.exp(-c * max(0.0, s - b)))
    return 1 + f if d >= 0 else 1 / (1 - f)

# Simao, Archer, 10 Nov 2026 12:05 (Attribute Details), power 8,380,700
ME = dict(atk=138_700, ratk=9_587, atk_boost=0.15, skill_boost=0.0, dmg_boost=0.171,
          phys_boost=0.04, minion_up=0.03, boss_up=0.0, final_up=0.0, power=8_380_700)

def hit(me, g, e):
    atk, ratk = me['atk'] * g, me['ratk'] * g
    base = max(1.0, atk * atk / (atk + 2 * e['def']) + ratk)
    up = me['dmg_boost'] + (me['boss_up'] if e['boss'] else me['minion_up'])
    normal = cond(0.2, 3.0, 0.15, me['atk_boost'] + up + me['phys_boost'], e['red'])
    skill = cond(0.2, 3.0, 0.15, me['skill_boost'] + up + me['phys_boost'], e['red'])
    final = cond(0.4, 1.0, 0.15, me['final_up'], e['fred'])
    return base * (normal + skill) / 2 * final

def enemies(fight):
    out = []
    for l in lineup.get(fight, []):
        n = l.get('Count', 1) * l.get('Turns', 1)
        out.append(dict(n=n, hp=stat(l, 1500), def_=0, **{'def': stat(l, 1300)},
                        red=stat(l, 11800), fred=stat(l, 12000),
                        boss=not (l.get('TimeFirst', 0) == 0 and l.get('Turns', 1) > 1)))
    return out

def work(me, g, es): return sum(e['n'] * e['hp'] / hit(me, g, e) for e in es)

fights = {s: f for s, _, f in stages}
CAL_STAGE, CAL_DONE = '6-10', 0.96   # lost 6-10 with ~96% of enemy HP gone
cap = CAL_DONE * work(ME, 1.0, enemies(fights[CAL_STAGE]))

def needed_g(es):
    lo, hi = 1e-3, 1e9
    for _ in range(100):
        mid = math.sqrt(lo * hi)
        if work(ME, mid, es) > cap: lo = mid
        else: hi = mid
    return hi

# Calibration against real clears. The raw model scales today's Archer profile,
# but accounts gain rate stats as they grow, so later stages need less power
# than raw. Old account (Lord Knight), real / raw: 9-6 cleared ~88M (0.54),
# 10-1 cleared 125M (0.47), 10-9 cleared ~259M (0.58), 10-10 lost at 262M;
# 9-12 chapter boss cleared ~120M (1.07). So waves drift from 1.0 (6-10) to
# 0.53 (chapter 9 on); chapter bosses, single target, need ~2x a wave's factor.
WAVE_LATE, LO, HI, BOSS_X = 0.53, 8.6e6, 163e6, 1.07 / 0.53
def wave_factor(raw):
    if raw <= LO: return 1.0
    if raw >= HI: return WAVE_LATE
    return WAVE_LATE ** (math.log(raw / LO) / math.log(HI / LO))

def estimates():
    raw = [(s, cat, ME['power'] * needed_g(enemies(f))) for s, cat, f in stages]
    out = {}
    for i, (s, cat, r) in enumerate(raw):
        level = max(r, raw[i - 1][2]) if i else r   # a chapter boss follows its chapter's waves
        est = r * wave_factor(level) * (BOSS_X if cat == 3 else 1.0)
        ch = int(s.split('-')[0])
        basis = ('fit (Simao fight)' if ch == 6 else 'interpolated' if ch in (7, 8)
                 else 'fit (old account clears)' if ch in (9, 10) else 'extrapolated')
        out[s] = (r, est, basis)
    return out

if __name__ == '__main__':
    est = estimates()
    if len(sys.argv) > 2 and sys.argv[2].endswith('.csv'):
        rows = list(csv.DictReader(open(sys.argv[2])))
        for r in rows:
            raw, e, basis = est[r['stage']]
            r['est_power_M'] = f'{e / 1e6:.1f}'
            r['est_basis'] = basis
        fields = ['stage', 'est_power_M', 'est_basis'] + [k for k in rows[0] if k not in ('stage', 'est_power_M', 'est_basis')]
        w = csv.DictWriter(open(sys.argv[2], 'w', newline=''), fieldnames=fields); w.writeheader(); w.writerows(rows)
        print('wrote', len(rows), 'rows')
    else:
        want = set(sys.argv[2].split(',')) if len(sys.argv) > 2 else None
        for s, (raw, e, basis) in est.items():
            if want is None or s in want: print(f'{s:6} raw {raw/1e6:9.1f}M  est {e/1e6:9.1f}M  {basis}')
