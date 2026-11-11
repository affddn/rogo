"""Export items, where each one comes from, every shop and every summon pool.

usage: python3 -I scripts/export_items.py <tables dir> <out dir> [Variables.cs]

<tables dir> is export_tables.py's per-table JSON (rows with real field names; repeated fields use
the lowercase C# backing name; fields at their default value are omitted). Writes items.json,
summons.json and shops.json. A few constants (idle drop timers, elite summon cost, activity
chests) live in Cross.dll's excelConfig/Variables.cs rather than a table: the 0.0.163 values are
built in below, and passing the decompiled Variables.cs re-reads them after a game update.

What each field means, and which rules come from client code, the data or inference, is
documented in ../../packages/game/src/data/items.ts.
"""
import json
import os
import re
import sys
from collections import defaultdict

T, OUT = sys.argv[1], sys.argv[2]
VARS_CS = sys.argv[3] if len(sys.argv) > 3 else None
os.makedirs(OUT, exist_ok=True)


def load(name):
    return json.load(open(os.path.join(T, name + '.json')))


# ---------------------------------------------------------------- constants (Variables.cs)
VARS = {
    'IDLE_ITEM_DROP_FREQUENCY': [900, 1800, 3600, 300, 720],
    'IDLE_CARD_DROP_FREQUENCY': [28800, 10800],
    'OFFLINE_IDLE_REWARD_TIME': 43200,
    'ELITE_SUMMON_SINGLE_COST': [18, 1],
    'ELITE_SUMMON_DROP_MULTIPLIER': [1, 2, 4],
    'TASK_DAILY_REWARD': [[20, 192001], [40, 192002], [60, 192003], [80, 192004], [100, 192005]],
    'TASK_WEEKLY_REWARD': [[20, 193001], [40, 193002], [60, 193003], [80, 193004], [100, 193005]],
    'CARNIVAL_TASK_PROGRESS_REWARD': [[100, 211001, 0], [200, 211002, 0], [400, 211003, 0], [650, 211004, 1],
                                      [850, 211005, 0], [1000, 211006, 0], [1150, 211007, 0], [1350, 211008, 1]],
    'MONTHLY_CARD_DAILY_FREE_REWARD': 201301,
    'GUILD_DONATE_REWARD': 80101,
    'GUILD_HELP_CONTRIB': 80102,
    'GUILD_BOSS_CHEST_REWARD': 80251,
    'ARENA_CHALLENGE_REWARD_WIN': 60101,
    'ARENA_CHALLENGE_REWARD_LOSE': 60102,
    'ENDLESS_TOWER_SWEEP_REWARD': 96500,
    'WELCOME_MAIL_REWARD': [[20, 2, 100], [20, 17, 30], [20, 18, 5]],
    'RATE_GUIDE_REWARD': [[20, 17, 50], [20, 2, 500]],
    'RANK_THUMB_UP_REWARD': [20, 2, 20],
    'RANK_THUMB_UP_REWARD_TIMES': 3,
    'FILM_SUMMON_PROGRESS_REWARD': [[5, 20, 16, 5], [10, 20, 16, 10], [15, 20, 16, 10], [20, 20, 16, 20], [25, 20, 16, 20]],
    'GVG_BYE_REWARD': [[20, 32, 100], [20, 38, 60], [20, 2, 30]],
    'GVG_CHALLENGE_REWARD': [[20, 32, 30], [20, 38, 20]],
    'GVG_MATCH_REWARD_WIN': [[20, 32, 100], [20, 38, 60], [20, 2, 30]],
    'GVG_MATCH_REWARD_LOSE': [[20, 32, 50], [20, 38, 30]],
    'LEGACY_SUMMON_SHOW_PRIZE': [[10000, 51101, 51302, 51501, 51601], [11000, 51102, 52201, 52301, 52502],
                                 [12000, 51502, 52202, 52505, 53003], [13000, 51301, 51303, 52303, 52608],
                                 [14000, 51702, 51703, 52601, 52602]],
    'TEAM_PVE_FREE_COUNT': 3,
    'TEAM_PVE_ASSISTANT_COUNT': 5,
    'ENDLESS_TOWER_DAILY_FREE_SWEEP_COUNT': 1,
}
if VARS_CS:
    src = open(VARS_CS).read()
    for m in re.finditer(r'public (int|List<[\w<>]+>) (\w+) \{ get; set; \} = (.*?);\n', src, re.S):
        if m.group(2) in VARS:
            body = re.sub(r'new List<[\w<>, .]*>\s*(?:\(\))?', '', m.group(3)).replace('{', '[').replace('}', ']')
            VARS[m.group(2)] = json.loads(body)

# ---------------------------------------------------------------- text
lang = {r['Id']: r.get('Text', '') for r in load('lang_en')}


def fill(text, args):
    return re.sub(r'%\{(\d+)\}', lambda m: str(args[int(m.group(1)) - 1]) if int(m.group(1)) <= len(args) else m.group(0), text)


def plain(text):
    return re.sub(r'\[/?(?:color|size|b|i|u|url)(?:=[^\]]*)?\]', '', text or '').strip()


def tr(key, *args):
    """English text for a lang key, '' when the key has no English text."""
    return plain(fill(lang[key], args)) if key and key in lang else ''


def r4(x):
    """Round a probability to 4 significant digits."""
    return float(f'{x:.4g}')


def ints(s):
    """'[1,2]' / '"[[1,2],[3,4]]"' / list -> parsed JSON list ([] for blanks and '0')."""
    if isinstance(s, list):
        return s
    if not s or s in ('0', '"0"'):
        return []
    v = json.loads(s.strip().strip('"'))
    return v if isinstance(v, list) else []


def size(path):
    return os.path.getsize(path) // 1024


def write(name, data):
    path = os.path.join(OUT, name + '.json')
    json.dump(data, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f'{name}.json {size(path)} KB')


# ---------------------------------------------------------------- tables
item_rows = {r['Entry']: r for r in load('item_info')}
card_rows = {r['Entry']: r for r in load('card_info')}
pet_rows = {r['Entry']: r for r in load('pet_info')}
legacy_rows = {r['Entry']: r for r in load('legacy_info')}
equip_q = {r['EquipQuality']: r for r in load('equip_quality')}
weapon_q = {}
for r in load('weapon_info'):
    weapon_q.setdefault(r['WeaponQuality'], (r.get('ShowQuality', 0), r.get('ShowSubQuality', '')))
funcs = {r['Entry']: tr(r.get('Name')) for r in load('function_info')}
func_rules = {r['Entry']: tr(r.get('RuleDes')) or tr(f"func_rule_{r['Entry']}") for r in load('function_info')}
QUALITY = {q: tr(f'quality_txt_{q}') for q in range(1, 11)}
CATEGORY = {c: tr(f'item_category_{c}') for c in range(1, 20) if tr(f'item_category_{c}')}
# ItemKind constants named in GameLogic (CommonUtils, IdleYieldBonusHelper, ItemSelectChestDialog, ...)
KIND = {1: 'Item', 10: 'Challenge ticket', 11: 'Avatar frame unlock', 12: 'Title unlock', 13: 'EXP boost',
        14: 'Resource boost', 30: 'Random accessory', 50: 'Card fragment', 60: 'Appearance', 70: 'Collection Gear fragment',
        101: 'Random chest', 102: 'Selectable chest', 104: 'Selectable chest (grow)'}
ACQ = {r['Entry']: tr(r.get('AcquisitionName')) for r in load('acquisition_info')}
recharge = {r['Entry']: r for r in load('recharge_info')}


def equip_q_name(q):
    return tr(equip_q[q]['FullName']) if q in equip_q else f'Quality {q}'


def weapon_q_name(q):
    show, sub = weapon_q.get(q, (0, ''))
    return f"{QUALITY.get(show, show)} {sub}".strip()


# ---------------------------------------------------------------- assets
def asset_key(kind, rid):
    """Drop/reward (ASSET_CATEGORY, id) -> (items.json key, amount multiplier) or (None, 1)."""
    if kind == 20 and rid in item_rows:
        return f'item:{rid}', 1
    if kind == 50 and rid in card_rows:
        return f'card:{rid}', 1
    if kind == 60 and rid in pet_rows:
        return f'pet:{rid}', 1
    if kind == 55 and rid in legacy_rows:  # a whole Collection Gear = DuplicateShardRatio fragments
        return f"item:{legacy_rows[rid]['Shard']}", legacy_rows[rid].get('DuplicateShardRatio', 50)
    return None, 1


def asset_name(kind, rid, arg=()):
    key, _ = asset_key(kind, rid)
    if key:
        return names[key]
    arg = list(arg or [])
    if kind == 30:
        q = arg[0] if arg and arg[0] else 0
        return f'{equip_q_name(q)} equipment' if q else f'Equipment {rid}'
    if kind == 40:
        return f'{weapon_q_name(arg[0] if arg and arg[0] else rid)} weapon'
    return f'{kind}:{rid}'


names = {}
for e, r in item_rows.items():
    names[f'item:{e}'] = tr(r.get('Name')) or r.get('Name', str(e))
for e, r in card_rows.items():
    names[f'card:{e}'] = tr(r.get('Name'))
for e, r in pet_rows.items():
    names[f'pet:{e}'] = tr(r.get('Name'))


def reward(kind, rid, amount, arg=(), p=1.0):
    key, mul = asset_key(kind, rid)
    out = {'name': asset_name(kind, rid, arg), 'amount': amount * mul if isinstance(amount, int) else amount}
    if key:
        out = {'key': key, **out}
    if p != 1:
        out['p'] = p if p == 'possible' else r4(p)
    return out


def inline(rows):
    """Inline [[kind, id, amount], ...] reward lists (bp, sign-in, event tasks) -> reward dicts."""
    return [reward(k, i, n) for k, i, n in (x[:3] for x in rows) if i]


# ---------------------------------------------------------------- drops
groups = defaultdict(dict)
for r in load('drop_group'):
    groups[r['DropId']][r.get('DropGroupId', 0)] = r
drop_rows = defaultdict(lambda: defaultdict(list))
for r in load('drop_base'):
    drop_rows[r['DropId']][r.get('DropGroupId', 0)].append(r)


def expand(drop_id):
    """Everything one roll of a drop id can give: [(kind, id, amount, arg, p, pity)].

    Each drop_group rolls on its own with Probability; a success picks one drop_base row of the
    group by Weight. Frequency (= 1/Probability) is passed through as `pity`."""
    out = []
    for gid, rows in sorted(drop_rows.get(drop_id, {}).items()):
        g = groups[drop_id].get(gid, {})
        gp = g.get('Probability', 1) if g else 1
        total = sum(r.get('Weight', 0) for r in rows)
        mult = ints(g.get('DropAmount')) if g else []
        for r in rows:
            amount = r.get('Amount', 0)
            if mult:  # count multiplier [[n, pct], ...]
                amount = [amount * min(n for n, _ in mult), amount * max(n for n, _ in mult)]
            p = gp * r.get('Weight', 0) / total if total else 'possible'
            if p == 0:  # a group switched off with Probability 0
                continue
            out.append((r['DropKind'], r.get('ItemId', 0), amount, r.get('arg', []), p, g.get('Frequency', 0) if g else 0))
    return out


def drop_rewards(drop_id):
    return [reward(k, i, n, a, p) for k, i, n, a, p, _ in expand(drop_id)]


# ---------------------------------------------------------------- source registry
raw = defaultdict(list)  # key -> source dicts; private fields start with '_'


def add(key, src):
    if key:
        raw[key].append(src)


def add_drop(drop_id, kind, lab, per=None, pos=None, seq=None, ordv=None, rpd=None, grp=None, extra=None):
    """Register every asset a drop id can give as a source of `kind`."""
    if not drop_id:
        return
    for k, rid, amount, arg, p, pity in expand(drop_id):
        key, mul = asset_key(k, rid)
        if not key:
            continue
        src = {'kind': kind, '_lab': lab, '_grp': grp or (kind, lab), 'amount': amount * mul if isinstance(amount, int) else amount,
               'p': p if p == 'possible' else r4(p)}
        if per:
            src['per'] = per
        if pity:
            src['pity'] = pity
        if pos is not None:
            src['_pos'], src['_seq'], src['_ord'] = pos, seq, ordv
        if rpd:
            src['_rpd'] = rpd
        if extra:
            src.update(extra)
        add(key, src)


def add_inline(rows, kind, lab, per=None, pos=None, seq=None, ordv=None, grp=None, extra=None):
    for k, rid, n in (x[:3] for x in rows):
        key, mul = asset_key(k, rid)
        if not key or not n:
            continue
        src = {'kind': kind, '_lab': lab, '_grp': grp or (kind, lab), 'amount': n * mul, 'p': 1}
        if per:
            src['per'] = per
        if pos is not None:
            src['_pos'], src['_seq'], src['_ord'] = pos, seq, ordv
        if extra:
            src.update(extra)
        add(key, src)


# ---- campaign stages: first clear, idle card rolls, idle item timers
stages = sorted(load('stage_info'), key=lambda r: (r['CampaignIdx'], r['StageIdx']))
stage_label = {}
for i, r in enumerate(stages):
    sid = f"{r['CampaignIdx']}-{r['StageIdx']}"
    stage_label[r['Entry']] = sid
    add_drop(r.get('FirstDownReward'), 'firstClear', 'Main stage first clear', 'first clear', sid, 'stage', i)
    for slot, drop in enumerate(r.get('idleDrop', [])):
        freq = VARS['IDLE_CARD_DROP_FREQUENCY'][slot] if slot < len(VARS['IDLE_CARD_DROP_FREQUENCY']) else 0
        if drop and freq:
            add_drop(drop, 'idle', f'Idle card roll (every {freq // 3600}h) at stage', f'idle {freq // 3600}h', sid, 'stage', i,
                     rpd=86400 / freq)
    for slot, (item, n) in enumerate(zip(r.get('idleItem', []), r.get('idleNum', []))):
        freq = VARS['IDLE_ITEM_DROP_FREQUENCY'][slot] if slot < len(VARS['IDLE_ITEM_DROP_FREQUENCY']) else 0
        if n and freq:
            add(f'item:{item}', {'kind': 'idle', '_lab': f'Idle income (every {freq // 60} min) at stage', '_grp': ('idle', item, slot),
                                 'amount': n, 'p': 1, 'per': f'idle {freq // 60} min', '_pos': sid, '_seq': 'stage', '_ord': i,
                                 '_rpd': 86400 / freq})

# ---- tasks
TASK_KIND = {1: ('quest', 'Main quest'), 2: ('daily', 'Daily task'), 4: ('achievement', 'Weapon achievement'),
             5: ('weekly', 'Weekly task'), 6: ('achievement', 'Achievement'), 7: ('limitedQuest', 'Limited quest'),
             8: ('growth', 'Growth Gift day'), 9: ('guild', 'Guild task'), 101: ('jobChange', 'Job change task')}
tasks = load('task_info')
for r in tasks:
    kind, lab = TASK_KIND.get(r['Kind'], ('quest', 'Task'))
    des = tr(r.get('Des'), *r.get('desArg', []))
    if r['Kind'] == 1:
        add_drop(r.get('Drops'), kind, lab, 'completion', f"#{r.get('TaskIdx', 0)}", 'quest', r.get('TaskIdx', 0))
    elif r['Kind'] == 8:
        add_drop(r.get('Drops'), kind, f"{lab} {r.get('Group')}: {des}", 'completion', grp=(kind, 'carnival'))
    else:
        add_drop(r.get('Drops'), kind, f'{lab}: {des}', 'completion', grp=(kind, lab))
for n, drop in VARS['TASK_DAILY_REWARD']:
    add_drop(drop, 'daily', f'Daily activity chest ({n} points)', 'day', grp=('daily', 'chest'))
for n, drop in VARS['TASK_WEEKLY_REWARD']:
    add_drop(drop, 'weekly', f'Weekly activity chest ({n} points)', 'week', grp=('weekly', 'chest'))
for n, drop, _ in VARS['CARNIVAL_TASK_PROGRESS_REWARD']:
    add_drop(drop, 'growth', f'Growth Gift progress chest ({n} points)', grp=('growth', 'chest'))
for r in load('time_limited_quest'):
    add_drop(r.get('RewardDrop'), 'limitedQuest', f"Limited quest {r['Entry']}", 'completion')

# ---- events: login reward series (event_task_*), welcome mail, rating prompt
opens = {r['Entry']: r for r in load('event_open_info')}
treasures = {r['Entry']: r for r in load('treasure_info')}
CHILD_FUNC = {1: 3001, 2: 3002, 3: 3003}


def event_name(group):
    """event_task_series / event_open_info entry -> display name of its event."""
    o = opens.get(group, {})
    for t in treasures.values():  # login series run alongside a treasure period with the same days
        to = opens.get(t['Entry'], {})
        if o and to and (to.get('OpenDay'), to.get('EndDay')) == (o.get('OpenDay'), o.get('EndDay')):
            return f"{funcs.get(CHILD_FUNC[t['EventChildType']], '')} login rewards (period {t['Entry'] % 1000})"
    return funcs.get(o.get('FunctionId'), f'Event {group}')


for r in load('event_task_info'):
    day = (r.get('desArg') or ['?'])[0]
    add_inline(ints(r.get('Awards')), 'event', event_name(r.get('Group')), 'login day', f'day {day}', f"ev{r.get('Group')}",
               int(day) if str(day).isdigit() else 0)
add_inline(VARS['WELCOME_MAIL_REWARD'], 'event', 'Welcome mail', 'once')
add_inline(VARS['RATE_GUIDE_REWARD'], 'event', 'Game rating prompt reward', 'once')
k, i, n = VARS['RANK_THUMB_UP_REWARD']
add_inline([[k, i, n]], 'event', f"Liking a ranking entry (up to {VARS['RANK_THUMB_UP_REWARD_TIMES']}/day)", 'like')

# ---- sign-in, passes, monthly cards, first top-up, trigger packs
for r in load('signin_awards_info'):
    add_inline(ints(r.get('FreeAwards')), 'signin', 'Check-in Bonus', 'day', f"day {r['Level']}", 'signin', r['Level'])
    for s in r.get('payAwards', []):
        add_inline(ints(s), 'signin', 'Check-in Bonus (premium track)', 'day', f"day {r['Level']}", 'signinP', r['Level'])
BP_STAGE = {i: tr(f'bp_stage_idx_{i}') for i in range(1, 5)}
bps = {r['Entry']: r for r in load('bp_info')}


def usd(entry):
    r = recharge.get(entry)
    return round(r['Price'], 2) if r and r.get('Price') else None


for r in load('bp_reward_info'):
    b = bps.get(r['BpEntry'], {})
    name = f"{funcs.get(b.get('CategoryFuncEntry'), '')} Pass {BP_STAGE.get(b.get('BpStageIdx'), '')}".strip()
    add_inline(ints(r.get('FreeAwards')), 'pass', f'{name} (free)', 'pass level', f"Lv {r['Level']}", f"bp{r['BpEntry']}f", r['Level'])
    price = usd((ints(b.get('RechargeId')) or [0])[0])
    for s in r.get('payAwards', []):
        add_inline(ints(s), 'pass', f'{name} (paid)', 'pass level', f"Lv {r['Level']}", f"bp{r['BpEntry']}p", r['Level'],
                   extra={'usd': price} if price else None)
for r in load('monthly_card_info'):
    name, price = tr(r.get('Name')), usd(r.get('RechargeEntry'))
    ex = {'usd': price} if price else None
    add_drop(r.get('ActiveRewardFirst'), 'monthlyCard', f'{name}: first activation', 'purchase', extra=ex)
    add_drop(r.get('ActiveReward'), 'monthlyCard', f'{name}: on activation', 'purchase', extra=ex)
    add_drop(r.get('DailyReward'), 'monthlyCard', f'{name}: daily', 'day', extra=ex)
add_drop(VARS['MONTHLY_CARD_DAILY_FREE_REWARD'], 'monthlyCard', 'Monthly card page: free daily gift', 'day')
for r in load('first_recharge_gift_info'):
    for d, drop in enumerate(r.get('reward', []), 1):
        add_drop(drop, 'firstTopUp', f'First Top Up gift, day {d}', 'once', extra={'usd': usd(r.get('RechargeEntry'))})
for r in load('trigger_gift_info'):
    price = usd((ints(r.get('CategoryArgs')) or [0])[-1])
    add_drop(r.get('RewardDrop'), 'giftPack', tr(r.get('Name')) or f"Gift pack {r['Entry']}", 'purchase',
             extra={'usd': price} if price else None)

# ---- game modes
mvp_names = {r['Entry']: (tr(r.get('MvpName')), r.get('MvpDailySweepTimes', 0)) for r in load('mvp_challenge_info')}
for r in load('mvp_stage_info'):
    name, sweeps = mvp_names.get(r['MvpEntry'], ('MVP', 0))
    lv = r.get('StageDifficultyIdx', 0)
    add_drop(r.get('FirstDownDrops'), 'mvp', f'MVP {name} first clear', 'first clear', f'Lv {lv}', f"mvp{r['MvpEntry']}f", lv)
    add_drop(r.get('SweepDrops'), 'mvp', f'MVP {name} sweep', 'sweep', f'Lv {lv}', f"mvp{r['MvpEntry']}s", lv, rpd=sweeps or None)
realm = {r['Entry']: (funcs.get(r.get('FuncEntry'), ''), r.get('ChallengeDailyRestore', 0)) for r in load('res_instance_info')}
for r in load('res_instance_stage_info'):
    name, daily = realm.get(r.get('InstanceCategory'), ('', 0))
    lv = r.get('StageIdx', 0)
    add_drop(r.get('FirstDownReward'), 'secretRealm', f'{name} Secret Realm first clear', 'first clear', f'diff {lv}',
             f"rs{r.get('InstanceCategory')}f", lv)
    add_drop(r.get('CommonReward'), 'secretRealm', f'{name} Secret Realm clear/sweep', 'clear', f'diff {lv}',
             f"rs{r.get('InstanceCategory')}c", lv, rpd=daily or None)
for r in load('endless_tower_stage_info'):
    f = r.get('StageIdx', 0)
    add_drop(r.get('Drops'), 'tower', 'Endless Tower first clear', 'first clear', f'F{f}', 'towerF', f)
    add_drop(r.get('DailySweepDrop'), 'tower', 'Endless Tower daily sweep (highest floor)', 'sweep', f'F{f}', 'towerS', f,
             rpd=VARS['ENDLESS_TOWER_DAILY_FREE_SWEEP_COUNT'])
add_drop(VARS['ENDLESS_TOWER_SWEEP_REWARD'], 'tower', 'Endless Tower sweep (base reward)', 'sweep')
for r in sorted(load('team_pve_stage_info'), key=lambda r: r.get('StageIdx', 0)):
    lv, name = r.get('StageIdx', 0), tr(r.get('Name'))
    add_drop(r.get('VisibleDrops'), 'dungeon', 'Dungeon clear', 'clear', f'{lv} {name}', 'tpve', lv, rpd=VARS['TEAM_PVE_FREE_COUNT'])
    add_drop(r.get('VisibleAssistDrops'), 'dungeon', 'Dungeon assist', 'assist', f'{lv} {name}', 'tpveA', lv,
             rpd=VARS['TEAM_PVE_ASSISTANT_COUNT'])
for r in load('team_pve_achievement'):
    add_drop(r.get('Drops'), 'dungeon', 'Dungeon achievement', 'once', f"Lv {r['Level']}", 'tpveAch', r['Level'])
for r in load('world_boss_stage_info'):
    for pct, item, n in ints(r.get('FirstReward')):
        add_inline([[20, item, n]], 'baphomet', 'Baphomet Challenge first damage milestone', 'once',
                   f"stage {r['Difficulty']} {pct}% HP", 'wb', r['Difficulty'] * 100 + (100 - pct))
for r in load('world_boss_rank_tier_reward'):
    tier = tr(r.get('TierName'))
    add_drop(r.get('DailyReward'), 'baphomet', f'Baphomet Challenge {tier} tier, daily', 'day', grp=('baphomet', 'daily'))
    add_drop(r.get('WeeklyReward'), 'baphomet', f'Baphomet Challenge {tier} tier, weekly', 'week', grp=('baphomet', 'weekly'))
for t in ('guild_boss_damage_reward', 'guild_boss_score_reward'):
    for r in load(t):
        add_drop(r.get('Reward'), 'guild', 'Guild Hunt milestone', 'once', grp=('guild', 'hunt'))
add_drop(VARS['GUILD_BOSS_CHEST_REWARD'], 'guild', 'Guild Hunt chest', 'challenge')
add_drop(VARS['GUILD_DONATE_REWARD'], 'guild', 'Guild Donation', 'donation')
add_drop(VARS['GUILD_HELP_CONTRIB'], 'guild', 'Guild Aid (helping a member)', 'help')
for r in load('guild_levelup'):
    add_drop(r.get('BargainReward'), 'guild', 'Guild Bargain item', 'purchase', grp=('guild', 'bargain'))
arena_tiers = load('arena_tier_info')
for r in load('arena_rank_reward'):
    add_drop(r.get('DailyReward'), 'arena', 'Rune Arena daily rank reward', 'day', f"rank {r['Rank']}", 'arD', r['Rank'])
    add_drop(r.get('SeasonReward'), 'arena', 'Rune Arena season rank reward', 'season', f"rank {r['Rank']}", 'arS', r['Rank'])
for i, r in enumerate(arena_tiers):
    add_drop(r.get('TierReward'), 'arena', 'Rune Arena tier reached', 'once', tr(r.get('TireName')), 'arT', i)
add_drop(VARS['ARENA_CHALLENGE_REWARD_WIN'], 'arena', 'Rune Arena win', 'challenge')
add_drop(VARS['ARENA_CHALLENGE_REWARD_LOSE'], 'arena', 'Rune Arena loss', 'challenge')
for r in load('gvg_progress_reward'):
    add_inline(ints(r.get('Reward')), 'guildWar', 'Guild War attack milestone', 'once', f"{r['TotalAttackTimes']} attacks", 'gvgP',
               r['TotalAttackTimes'])
for i, r in enumerate(load('gvg_rank_reward')):
    rank = f"rank {r['RankMin']}" + (f"-{r['RankMax']}" if r.get('RankMax', 0) != r['RankMin'] else '')
    add_inline(ints(r.get('WeekReward')), 'guildWar', 'Guild War weekly rank reward', 'week', rank, 'gvgW', i)
    add_inline(ints(r.get('SeasonReward')), 'guildWar', 'Guild War season rank reward', 'season', rank, 'gvgS', i)
for name, lab in (('GVG_MATCH_REWARD_WIN', 'Guild War match win'), ('GVG_MATCH_REWARD_LOSE', 'Guild War match loss'),
                  ('GVG_BYE_REWARD', 'Guild War bye'), ('GVG_CHALLENGE_REWARD', 'Guild War challenge')):
    add_inline(VARS[name], 'guildWar', lab, 'match')

# ---- collection milestones and gacha levels
for t, lab in (('card_collection_bonus', 'Card Album total stars'), ('legacy_collection_bonus', 'Collection Gear total stars')):
    for r in load(t):
        add_inline([ints(r.get('RewardItem'))], 'achievement', lab, 'once', str(r['ReqTotalStar']), t, r['ReqTotalStar'])
for r in load('weapon_achievement'):
    if r.get('RewardItem'):
        add_inline([ints(r['RewardItem'])], 'achievement', 'Weapon achievement', 'once', f"#{r['Entry']}", 'wach', r['Entry'])
weapon_levels = sorted(load('weapon_gacha_levelup'), key=lambda r: r['WeaponGachaLevel'])
pet_levels = sorted(load('pet_gacha_levelup'), key=lambda r: r['GachaLevel'])
for r in weapon_levels:
    if ints(r.get('LevelArchievement')):
        add_inline([ints(r['LevelArchievement'])], 'summonBonus', 'Weapon Gacha level reached', 'once', f"Lv {r['WeaponGachaLevel']}",
                   'wgl', r['WeaponGachaLevel'])
for r in pet_levels:
    if ints(r.get('LevelArchievement')):
        add_inline([ints(r['LevelArchievement'])], 'summonBonus', 'Pet Gacha level reached', 'once', f"Lv {r['GachaLevel']}",
                   'pgl', r['GachaLevel'])

# ---- conversions
for q, r in equip_q.items():
    for item, n in zip(r.get('decomposeItem', []), r.get('decomposeNum', [])):
        if item and n:
            add(f'item:{item}', {'kind': 'convert', '_lab': 'Dismantling equipment', '_grp': ('convert', 'dismantle'), 'amount': n,
                                 'p': 1, 'per': 'piece', '_pos': equip_q_name(q), '_seq': 'eq', '_ord': q})
for e, c in card_rows.items():
    if c.get('Shard') in item_rows:
        add(f"item:{c['Shard']}", {'kind': 'convert', '_lab': f"Duplicate {names[f'card:{e}']}", '_grp': ('convert', 'dup'),
                                   'amount': c.get('DuplicateShardRatio', 0), 'p': 1, 'per': 'duplicate'})
for e, l in legacy_rows.items():
    if l.get('Shard') in item_rows:
        add(f"item:{l['Shard']}", {'kind': 'convert', '_lab': f"Duplicate {tr(l.get('Name'))}", '_grp': ('convert', 'dup'),
                                   'amount': l.get('DuplicateShardRatio', 0), 'p': 1, 'per': 'duplicate'})

# ---------------------------------------------------------------- chests (item contents)
select_rows = defaultdict(list)
for r in load('drop_select'):
    select_rows[r['Refer']].append(r)
accessory = defaultdict(list)
for r in load('accessory_drop'):
    accessory[r['QualityGroup']].append(r)
contents, choose = {}, {}
for e, r in item_rows.items():
    kind, arg, name = r.get('ItemKind'), r.get('arg', []), names[f'item:{e}']
    if kind == 101 and arg:
        contents[e] = drop_rewards(arg[0])
        add_drop(arg[0], 'chest', name, 'open', extra={'ref': f'item:{e}'}, grp=('chest', e))
    elif kind == 101 and 1001 <= e <= 1007:  # "Randomly obtain a <colour> card": pool not in the client
        contents[e] = [{'name': f'Any {QUALITY.get(r["Quality"], "")} card', 'amount': 1, 'p': 'possible'}]
        for c, cr in card_rows.items():
            if cr.get('Quality') == r.get('Quality'):
                add(f'card:{c}', {'kind': 'chest', '_lab': name, '_grp': ('chest', e), 'amount': 1, 'p': 'possible', 'per': 'open',
                                  'ref': f'item:{e}'})
    elif kind in (102, 104):
        rows = select_rows.get(e, [])
        choose[e] = [reward(x['DropType'], x.get('ItemId', 0), x.get('Amount', 1), x.get('arg', [])) for x in rows]
        for x in rows:
            key, mul = asset_key(x['DropType'], x.get('ItemId', 0))
            add(key, {'kind': 'select', '_lab': name, '_grp': ('select', e), 'amount': x.get('Amount', 1) * mul, 'p': 1,
                      'per': 'open', 'ref': f'item:{e}'})
        if not rows and 1021 <= e <= 1027:
            choose[e] = [{'name': f'Any {QUALITY.get(r["Quality"], "")} card', 'amount': 1}]
            for c, cr in card_rows.items():
                if cr.get('Quality') == r.get('Quality'):
                    add(f'card:{c}', {'kind': 'select', '_lab': name, '_grp': ('select', e), 'amount': 1, 'p': 1, 'per': 'open',
                                      'ref': f'item:{e}'})
    elif kind == 30 and arg:
        rows = [x for x in accessory.get(arg[0], []) if x.get('DropWeight', 0) > 0]
        total = sum(x['DropWeight'] for x in rows)
        contents[e] = [{'name': f"{equip_q_name(x['DropQuality'])} accessory", 'amount': 1, 'p': r4(x['DropWeight'] / total)} for x in rows]

# ---------------------------------------------------------------- shops
REFRESH = {0: 'Permanent', 1: 'Daily', 2: 'Weekly', 3: 'Monthly', 4: 'Per event period'}
PAY = {0: 'free', 1: 'item', 2: 'ad', 3: 'money'}


def unlock_text(rule):
    v = ints(rule)
    if len(v) < 2 or v[1] <= 0:
        return None
    t, a = v[0], v[1]
    if t == 2:
        return tr('store_buy_rule_2', funcs.get(a, a))
    if t == 3:
        return tr('store_buy_rule_3', stage_label.get(a, a))
    return tr(f'store_buy_rule_{t}', a) or None


store_names = {}
for r in load('store_info'):
    e, cat, fid = r['Entry'], r.get('Category'), r.get('FunctionId')
    if cat == 2:
        store_names[e] = (f'{funcs.get(fid, "")} Shop',) * 2 + ('shop',)
    elif cat == 1:
        store_names[e] = (f'Mall: {funcs.get(fid, "")}',) * 2 + ('mall',)
    else:  # limited treasure events: Idx 1 = exchange vault, Idx 2 = gift pack
        part = f"{funcs.get(fid, '')} {'Exchange' if r.get('Idx') == 1 else 'Gift Pack'}"
        store_names[e] = (f'{part} (period {e % 1000})', part, 'event')
goods_by_store = defaultdict(list)
for g in load('store_goods_info'):
    goods_by_store[g['StoreEntry']].append(g)
stores_out = []
for r in load('store_info'):
    e = r['Entry']
    name, src_label, skind = store_names[e]
    goods, currencies = [], []
    for g in sorted(goods_by_store.get(e, []), key=lambda g: (g.get('Sort', 0), g['Entry'])):
        method, marg = g.get('Method', 0), g.get('methodArg', [])
        out = {'id': g['Entry'],
               'items': [reward(k, i, n) for k, i, n in zip(g.get('dropType', []), g.get('item', []), g.get('amount', [])) if i],
               'pay': PAY.get(method, str(method))}
        if method == 1 and len(marg) >= 2:
            out['cost'] = {'key': f'item:{marg[0]}', 'name': names.get(f'item:{marg[0]}', str(marg[0])), 'amount': marg[1]}
            if f'item:{marg[0]}' not in currencies:
                currencies.append(f'item:{marg[0]}')
        if method == 3 and marg:
            out['usd'] = usd(marg[0])
        if g.get('OldPrice'):
            out['was'] = g['OldPrice']
        if g.get('Sale'):
            out['sale'] = g['Sale']
        if g.get('Limit'):
            out['limit'], out['refresh'] = g['Limit'], g.get('LimitRefreshRule', 0)
        u = unlock_text(g.get('BuyRule'))
        if u:
            out['unlock'] = u
        goods.append(out)
        for it in out['items']:
            src = {'kind': 'shop', '_lab': src_label, '_grp': ('shop', src_label, it['amount'], json.dumps(out.get('cost')), out['pay']),
                   'amount': it['amount'], 'p': 1, 'per': 'purchase', 'ref': f'goods:{g["Entry"]}', 'pay': out['pay']}
            for f in ('cost', 'usd', 'limit', 'refresh'):
                if f in out:
                    src[f] = out[f]
            add(it.get('key'), src)
    o = opens.get(e) or opens.get(e - 10000 if e > 10000 else e)
    store = {'id': e, 'name': name, 'kind': skind, 'funcId': r.get('FunctionId'), 'currencies': currencies, 'goods': goods}
    if skind == 'event' and o:
        store['days'] = [o.get('OpenDay'), o.get('EndDay')]
    stores_out.append(store)
write('shops', {'refresh': {str(k): v for k, v in REFRESH.items()}, 'stores': stores_out})

# ---------------------------------------------------------------- summons
summon_info = {r['Entry']: r for r in load('summon_info')}
sdrops = defaultdict(list)
for r in load('summon_drop_info'):
    sdrops[r['SummonEntry']].append(r)
curves = defaultdict(dict)
for r in load('summon_probability_info'):
    curves[(r['SummonEntry'], r.get('BaodiEntry', 0))][r.get('SummonTimes', 0)] = r.get('Probability', 0) / 10000


def pct(s):
    try:
        return float(s.strip().rstrip('%')) / 100
    except ValueError:
        return None


def effective(curve):
    """Long-run share of pulls that pay a pity track: 1 / expected pulls between payouts."""
    n, surv, exp = max(curve), 1.0, 0.0
    for t in range(1, n + 1):
        exp += surv
        surv *= 1 - curve.get(t, 0)
    return 1 / exp


def costs(s, multi=False):
    """Cost options in the order the game spends them: draw ticket first, then currency."""
    out = []
    rep, rn = s.get('RepType', 0), s.get('MulRepNum' if multi else 'RepNum', 0)
    ct, cn = s.get('CostType', 0), s.get('MulCostNum' if multi else 'CostNum', 0)
    if rep and rn:
        out.append({'key': f'item:{rep}', 'name': names.get(f'item:{rep}', str(rep)), 'amount': rn})
    if ct and cn:
        out.append({'key': f'item:{ct}', 'name': names.get(f'item:{ct}', str(ct)), 'amount': cn})
    return out


def base_summon(e, sid, name, stype):
    s = summon_info.get(e, {})
    out = {'id': sid, 'entry': e, 'name': name, 'type': stype, 'funcId': s.get('FuncId'), 'rule': func_rules.get(s.get('FuncId'), ''),
           'cost': costs(s)}
    if s.get('MulNum'):
        out['multi'] = {'pulls': s['MulNum'], 'cost': costs(s, True)}
    for f, k in (('DayFreeTimes', 'freePerDay'), ('DayAdTimes', 'adsPerDay'), ('TotalLimit', 'totalLimit'), ('MulPerLimit', 'maxBatch')):
        if s.get(f):
            out[k] = s[f]
    o = opens.get(e)
    if o:
        out['days'] = [o.get('OpenDay'), o.get('EndDay')]
    return out


def max_quality(rows):
    q = 0
    for r in rows:
        if r['Category'] == 20 and r['ResEntry'] in item_rows:
            q = max(q, item_rows[r['ResEntry']].get('Quality', 0))
        elif r['Category'] == 50 and r['ResEntry'] in card_rows:
            q = max(q, card_rows[r['ResEntry']].get('Quality', 0))
    return q


def pool_summon(e, sid, name, stype, pity_name=None):
    out = base_summon(e, sid, name, stype)
    s = summon_info.get(e, {})
    rows = sorted(sdrops.get(e, []), key=lambda r: r.get('Idx', 0))
    shown = [x for x in ints(s.get('ShowProbability'))]
    by_group = defaultdict(list)
    for r in rows:
        by_group[r.get('ShowGroup', 1)].append(r)
    if not shown:
        shown = [[g, 0, '', ''] for g in sorted(by_group)]
    gout = []
    for g, q, lkey, ptxt in shown:
        grows = by_group.get(g, [])
        rate = pct(ptxt) if ptxt else (1.0 if len(shown) == 1 else None)
        total = sum(r.get('BaseWeight', 0) for r in grows)
        items = []
        for r in grows:
            w = r.get('BaseWeight', 0)
            it = reward(r['Category'], r['ResEntry'], r.get('Amount', 1))
            it['weight'] = w
            if rate is not None and total:
                it['p'] = r4(rate * w / total)
            if r.get('Anbaodi'):
                it['pity'] = r['Anbaodi']
            decay = ints(r.get('WeightDecayRate'))
            if r.get('WeightDecayCategory') and decay:
                it['decay'] = decay
            items.append(it)
        grp = {'id': g, 'name': tr(lkey) or ('All rewards' if len(shown) == 1 else f'Group {g}'), 'items': items}
        if q:
            grp['quality'] = q
        if ptxt:
            grp['shown'] = ptxt
        if rate is not None:
            grp['rate'] = r4(rate)
        gout.append(grp)
    out['groups'] = gout
    pity = []
    for (se, b), curve in sorted(curves.items()):
        if se != e:
            continue
        track_rows = [r for r in rows if r.get('Anbaodi') == b]
        eff = effective(curve)
        n = max(curve)
        tr_out = {'id': b, 'max': n, 'curve': [r4(curve.get(t, 0)) for t in range(1, n + 1)], 'effective': r4(eff),
                  'items': [reward(r['Category'], r['ResEntry'], r.get('Amount', 1)) for r in track_rows]}
        groups_of_track = {r.get('ShowGroup') for r in track_rows}
        if len(groups_of_track) == 1:
            g = next(x for x in gout if x['id'] in groups_of_track)
            if all(r.get('Anbaodi') == b for r in by_group.get(g['id'], [])) and 'rate' in g:
                tr_out['shownMatches'] = abs(g['rate'] - eff) < 0.0005
        mq = max_quality(track_rows)
        tr_out['name'] = pity_name or tr(f'summon_pool_quality_{mq}') or f'Track {b}'
        pity.append(tr_out)
    if pity:
        out['pity'] = pity
    return out


summons_out = []
# weapon gacha
s = base_summon(1000, 'weapon', 'Weapon Gacha', 'weapon')
levels = []
for r in weapon_levels:
    qs, ws = ints(r.get('WeaponGachaQuality')), ints(r.get('WeaponGachaWeight'))
    total = sum(ws)
    rates = [{'tier': q, 'quality': weapon_q.get(q, (0, ''))[0], 'sub': weapon_q.get(q, (0, ''))[1], 'p': r4(w / total)}
             for q, w in zip(qs, ws) if w > 0]
    lv = {'level': r['WeaponGachaLevel'], 'toNext': r.get('CostNum', 0), 'rates': rates, 'top': r.get('TopShowQuality', 0)}
    if ints(r.get('LevelArchievement')):
        lv['reward'] = [reward(*ints(r['LevelArchievement'])[:3])]
    levels.append(lv)
s['levels'] = levels
summons_out.append(s)
# pet gacha
s = base_summon(2000, 'pet', 'Pet Gacha', 'pet')
pets_by_q = defaultdict(list)
for e, r in sorted(pet_rows.items()):
    pets_by_q[r.get('PetQuality')].append(f'pet:{e}')
levels, pet_rates = [], {}
for r in pet_levels:
    qs, ws = ints(r.get('GachaQuality')), ints(r.get('GachaWeight'))
    total = sum(ws)
    rates = [{'quality': q, 'p': r4(w / total), 'pets': pets_by_q.get(q, []),
              'each': r4(w / total / len(pets_by_q[q])) if pets_by_q.get(q) else 0} for q, w in zip(qs, ws) if w > 0]
    lv = {'level': r['GachaLevel'], 'toNext': r.get('CostNum', 0), 'rates': rates, 'top': r.get('TopShowQuality', 0),
          'guardSlots': r.get('PetGuardSlot', 0), 'grade': r.get('GachaGrade', 0)}
    if ints(r.get('LevelArchievement')) and ints(r['LevelArchievement'])[2]:
        lv['reward'] = [reward(*ints(r['LevelArchievement'])[:3])]
    levels.append(lv)
    for rt in rates:
        for pk in rt['pets']:
            pet_rates.setdefault(pk, []).append((r['GachaLevel'], rt['each']))
s['levels'] = levels
summons_out.append(s)
for pk, lr in pet_rates.items():
    (lo, plo), (hi, phi) = lr[0], lr[-1]
    src = {'kind': 'summon', '_lab': f'Pet Gacha Lv {lo}–{hi}' if lo != hi else f'Pet Gacha Lv {lo}', '_grp': ('summon', 'pet'),
           'amount': 1, 'p': phi, 'per': 'pull', 'ref': 'summon:pet'}
    if plo != phi:
        src['pMin'] = plo
    add(pk, src)
# elite summon (equipment)
cost_item, cost_n = VARS['ELITE_SUMMON_SINGLE_COST']
s = {'id': 'elite', 'entry': 0, 'name': funcs.get(17, 'Elite Summon'), 'type': 'elite', 'funcId': 17, 'rule': func_rules.get(600, ''),
     'cost': [{'key': f'item:{cost_item}', 'name': names.get(f'item:{cost_item}', ''), 'amount': cost_n}],
     'multipliers': VARS['ELITE_SUMMON_DROP_MULTIPLIER']}
edrops = defaultdict(list)
for r in load('equip_summon_drop'):
    edrops[r['SummonLevel']].append(r)
levels = []
for r in sorted(load('equip_summon_info'), key=lambda r: r['SummonLevel']):
    rows = [x for x in edrops.get(r['SummonLevel'], []) if x.get('DropWeight', 0) > 0]
    total = sum(x['DropWeight'] for x in rows)
    lv = {'level': r['SummonLevel'], 'dropNum': r.get('DropNum', 0), 'color': r.get('ShowColor', 0),
          'rates': [{'tier': x['DropQuality'], 'name': equip_q_name(x['DropQuality']),
                     'quality': equip_q.get(x['DropQuality'], {}).get('ShowQuality', 0), 'p': r4(x['DropWeight'] / total)} for x in rows]}
    if r.get('UpgradeItem'):
        lv['upgrade'] = {'steps': r.get('UpgradeStage', 0), 'cost': {'key': f"item:{r['UpgradeItem']}", 'name': names.get(f"item:{r['UpgradeItem']}", ''),
                                                                      'amount': r.get('UpgradeNum', 0)}, 'seconds': r.get('UpgradeTime', 0)}
    if r.get('EfMultiEliteSummonDrop'):
        lv['multiplier'] = r['EfMultiEliteSummonDrop']
    levels.append(lv)
s['levels'] = levels
summons_out.append(s)
# Collection Gear wishes
legacy_progress = defaultdict(list)
for r in load('legacy_gacha_progress_reward'):
    legacy_progress[r['SummonShareGroup']].append(r)
show_prize = {row[0]: [f'item:{x}' for x in row[1:] if x in item_rows] for row in VARS['LEGACY_SUMMON_SHOW_PRIZE']}
for e in sorted(x for x, r in summon_info.items() if r.get('Category') == 3):
    job = tr(f'summon_name_{e}')
    sid, name = ('wish', funcs.get(41101, 'Normal Wish')) if e == 10000 else (f'wish-{e}', f"{funcs.get(41102, 'Job Wish')} ({job})")
    s = pool_summon(e, sid, name, 'wish')
    sg = summon_info[e].get('ShareGroup', 0)
    s['progress'] = [{'at': r['Progress'], 'rewards': inline([ints(r.get('Reward'))]), 'big': bool(r.get('BigPrize'))}
                     for r in sorted(legacy_progress.get(sg, []), key=lambda r: r['Progress'])]
    s['progressRepeats'] = True
    s['progressShared'] = sg
    if show_prize.get(e):
        s['featured'] = show_prize[e]
    summons_out.append(s)
# limited treasure events
PITY_NAME = {1: tr('treasure_pity_name_legacy'), 2: tr('treasure_pity_name_avatar'), 3: tr('treasure_pity_name_card')}
for e, t in sorted(treasures.items()):
    child = t.get('EventChildType')
    theme = funcs.get(CHILD_FUNC.get(child), 'Treasure')
    s = pool_summon(t.get('SummonEntry', e), f'treasure-{e}', f'{theme} (period {e % 1000})', 'treasure', PITY_NAME.get(child))
    s['theme'] = theme
    s['period'] = e % 1000
    s['exchange'] = f"item:{t.get('ExchangeItem')}"
    s['stores'] = [t.get('StoreEntry'), t.get('GiftStoreEntry')]
    s['pityCarriesOver'] = bool(ints(t.get('InheritBaodi')))
    s['progress'] = [{'at': n, 'rewards': [reward(k, i, a)]} for n, k, i, a in ints(t.get('ProgressReward'))]
    if child == 3:
        s['featured'] = [f'card:{c}' for c in ints(t.get('DisplayCore')) if c in card_rows]
    summons_out.append(s)
# Watch & Spin
s = pool_summon(16000, 'wheel', tr('summon_name_16000') or funcs.get(31, 'Watch & Spin'), 'wheel')
s['progress'] = [{'at': n, 'rewards': [reward(k, i, a)]} for n, k, i, a in VARS['FILM_SUMMON_PROGRESS_REWARD']]
summons_out.append(s)

# summon pools and milestones as item sources
for s in summons_out:
    for g in s.get('groups', []):
        for it in g['items']:
            lab = s.get('theme') or s['name']
            add(it.get('key'), {'kind': 'summon', '_lab': f"{lab}: {g['name']}", '_grp': ('summon', lab, g['name'], it['amount'], it.get('p')),
                                'amount': it['amount'], 'p': it.get('p', 'possible'), 'per': 'pull', 'ref': f"summon:{s['id']}"})
    for pr in s.get('progress', []):
        lab = s.get('theme') or s['name']
        for it in pr['rewards']:
            add(it.get('key'), {'kind': 'summonBonus', '_lab': f'{lab} draw milestone', '_grp': ('summonBonus', lab, pr['at'], it['amount']),
                                'amount': it['amount'], 'p': 1, 'per': f"{pr['at']} pulls", 'ref': f"summon:{s['id']}"})

write('summons', {'summons': summons_out})

# ---------------------------------------------------------------- merge sources per asset
KIND_ORDER = ['idle', 'firstClear', 'mvp', 'secretRealm', 'tower', 'dungeon', 'baphomet', 'guild', 'arena', 'guildWar', 'quest',
              'daily', 'weekly', 'growth', 'achievement', 'jobChange', 'limitedQuest', 'event', 'signin', 'chest', 'select',
              'convert', 'summon', 'summonBonus', 'shop', 'pass', 'monthlyCard', 'firstTopUp', 'giftPack']
MAX_LIST = 8  # ranges kept per source group before it collapses into a summary


def mid(a):
    return (a[0] + a[1]) / 2 if isinstance(a, list) else a


def finish(s):
    out = {k: v for k, v in s.items() if not k.startswith('_')}
    if '_rpd' in s and isinstance(s['p'], float | int):
        out['perDay'] = r4(mid(s['amount']) * s['p'] * s['_rpd'])
    return out


def merge(srcs):
    """Same-reward neighbours (stages, levels, floors) fold into one range; big groups become summaries."""
    by_grp = defaultdict(list)
    for s in srcs:
        by_grp[s['_grp']].append(s)
    out = []
    for grp, ss in by_grp.items():
        ranged = [s for s in ss if '_ord' in s]
        flat = [s for s in ss if '_ord' not in s]
        merged = []
        sig = lambda s: json.dumps([s['amount'], s['p'], s.get('per'), s.get('pity'), s.get('usd'), s.get('viaShard')])
        ranged.sort(key=lambda s: (sig(s), s['_seq'], s['_ord']))
        for s in ranged:
            last = merged[-1] if merged else None
            if last and sig(last) == sig(s) and last['_seq'] == s['_seq'] and s['_ord'] - last['_end'] <= 1:
                last['_end'], last['_pos2'], last['_n'] = s['_ord'], s['_pos'], last['_n'] + 1
            else:
                merged.append({**s, '_end': s['_ord'], '_pos2': s['_pos'], '_n': 1})
        for m in merged:
            if m['_pos2'] != m['_pos']:
                a, b = m['_pos'].split(' ', 1), m['_pos2'].split(' ', 1)
                span = f"{a[0]} {a[1]}–{b[1]}" if len(a) == len(b) == 2 and a[0] == b[0] else f"{m['_pos']}–{m['_pos2']}"
                m['label'] = f"{m['_lab']} {span}"
                m['count'] = m['_n']
                if m['_seq'] == 'stage':
                    m['stages'] = [m['_pos'], m['_pos2']]
            else:
                m['label'] = f"{m['_lab']} {m['_pos']}"
                if m['_seq'] == 'stage':
                    m['stages'] = [m['_pos'], m['_pos']]
        seen = {}
        for s in flat:  # identical flat sources (e.g. the same goods in 5 event periods) collapse
            k = (s['_lab'], json.dumps(s['amount']), s['p'], s.get('per'), json.dumps(s.get('cost')), s.get('viaShard'))
            if k in seen:
                seen[k]['count'] = seen[k].get('count', 1) + 1
            else:
                seen[k] = {**s, 'label': s['_lab']}
        entries = merged + list(seen.values())
        value = lambda s: (s['_rpd'] if '_rpd' in s else 1) * mid(s['amount']) * (s['p'] if s['p'] != 'possible' else 0)
        if len(entries) > MAX_LIST and grp[0] not in ('idle', 'summon', 'shop', 'chest', 'select'):
            ps = {s['p'] for s in entries}
            amounts = [x for s in entries for x in (s['amount'] if isinstance(s['amount'], list) else [s['amount']])]
            best = max(entries, key=value)
            first = min(entries, key=lambda s: s.get('_ord', 0))
            summ = {'kind': grp[0], 'label': entries[0]['_lab'], 'count': sum(s.get('count', 1) for s in entries),
                    'amount': [min(amounts), max(amounts)] if min(amounts) != max(amounts) else amounts[0],
                    'total': r4(sum(value(s) / (s['_rpd'] if '_rpd' in s else 1) * s.get('count', 1) for s in entries)),
                    'best': best['label'], 'first': first['label'], '_v': value(best)}
            if len(ps) == 1:
                summ['p'] = ps.pop()
            for f in ('per',):
                if f in entries[0]:
                    summ[f] = entries[0][f]
            out.append(summ)
        else:
            for s in entries:
                f = finish(s)
                f['_v'] = value(s)
                out.append(f)
    out.sort(key=lambda s: (KIND_ORDER.index(s['kind']) if s['kind'] in KIND_ORDER else 99, -s['_v']))
    if sum(1 for s in out if s['kind'] == 'idle') > 24:  # keep the best idle spots
        idle = [s for s in out if s['kind'] == 'idle'][:24]
        out = idle + [s for s in out if s['kind'] != 'idle']
    for s in out:
        s.pop('_v', None)
        for k in [k for k in s if k.startswith('_')]:
            s.pop(k)
    return out


def item_desc(r):
    kind, arg = r.get('ItemKind'), r.get('arg', [])
    if kind == 11 and arg:
        frame = next((f for f in load_cached('player_head_frame') if f['Entry'] == arg[0]), None)
        return tr(r.get('Description'), tr(frame.get('HeadFrameName')) if frame else '')
    if kind == 12 and arg:
        titles = load_cached('player_title_info')  # by entry, else by unlock item (TitleCfg.GetByUnlockItemEntry)
        title = next((t for t in titles if t['Entry'] == arg[0]), None) or next(
            (t for t in titles if t.get('UnlockKind') == 1 and (t.get('unlockArg') or [0])[0] == r['Entry']), None)
        return tr(r.get('Description'), tr(title.get('TitleName')) if title else '')
    if kind == 30 and len(arg) > 2:
        return tr(r.get('Description'), equip_q_name(arg[2]))
    return tr(r.get('Description'), *(r.get('desArg') or []))


_cache = {}


def load_cached(name):
    if name not in _cache:
        _cache[name] = load(name)
    return _cache[name]


spend = defaultdict(list)
for st in stores_out:
    for c in st['currencies']:
        spend[c].append(f"store:{st['id']}")
for s in summons_out:
    for c in s.get('cost', []) + (s.get('multi', {}).get('cost', []) if s.get('multi') else []):
        if f"summon:{s['id']}" not in spend[c['key']]:
            spend[c['key']].append(f"summon:{s['id']}")

out_items = []
for e, r in sorted(item_rows.items()):
    key = f'item:{e}'
    it = {'key': key, 'id': e, 'asset': 'item', 'name': names[key], 'kind': r.get('ItemKind', 0), 'category': r.get('Category', 0),
          'quality': r.get('Quality', 0), 'desc': item_desc(r)}
    if r.get('IsShow', 1) == 0:
        it['hidden'] = True
    acc = ints(r.get('Access'))
    if acc:
        it['access'] = acc
    if r.get('ItemKind') == 50 and r.get('arg'):
        it['card'] = r['arg'][0]
    if r.get('ItemKind') == 70 and r.get('arg'):
        it['legacy'] = r['arg'][0]
    if r.get('ItemKind') == 60 and r.get('arg'):
        it['avatar'] = r['arg'][0]
    if e in contents:
        it['contents'] = contents[e]
    if e in choose:
        it['choose'] = choose[e]
    if spend.get(key):
        it['spentIn'] = spend[key]
    it['sources'] = merge(raw.get(key, []))
    out_items.append(it)
for e, r in sorted(card_rows.items()):
    key = f'card:{e}'
    shard_srcs = [{**x, 'viaShard': True, '_grp': (*x['_grp'], 'shard')} for x in raw.get(f"item:{r.get('Shard')}", [])
                  if x['kind'] != 'convert']
    it = {'key': key, 'id': e, 'asset': 'card', 'name': names[key], 'kind': 0, 'category': 0, 'quality': r.get('Quality', 0),
          'desc': tr(r.get('LiteralDescription')), 'card': e, 'shard': r.get('Shard'), 'shardsPerCard': r.get('DuplicateShardRatio', 0)}
    acc = ints(r.get('Acquisition'))
    if acc:
        it['access'] = acc
    it['sources'] = merge(raw.get(key, []) + shard_srcs)
    out_items.append(it)
for e, r in sorted(pet_rows.items()):
    key = f'pet:{e}'
    it = {'key': key, 'id': e, 'asset': 'pet', 'name': names[key], 'kind': 0, 'category': 0, 'quality': r.get('PetQuality', 0), 'desc': ''}
    acc = ints(r.get('Acquisition'))
    if acc:
        it['access'] = acc
    it['sources'] = merge(raw.get(key, []))
    out_items.append(it)

write('items', {
    'version': '0.0.163',
    'qualities': {str(k): v for k, v in QUALITY.items()},
    'categories': {str(k): v for k, v in CATEGORY.items()},
    'kinds': {str(k): v for k, v in KIND.items()},
    'acquisitions': {str(k): v for k, v in sorted(ACQ.items())},
    'idle': {'cardRollSeconds': VARS['IDLE_CARD_DROP_FREQUENCY'], 'itemSeconds': VARS['IDLE_ITEM_DROP_FREQUENCY'],
             'offlineCapSeconds': VARS['OFFLINE_IDLE_REWARD_TIME']},
    'items': out_items,
})
