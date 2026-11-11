"""Export the non-campaign game modes and the campaign stage rewards.

usage (from apps/web/): python3 -I scripts/export_content.py <tables dir> <out dir>

<tables dir> holds the exported config tables (<name>.json, a list of rows; repeated fields carry the C#
backing name). Writes modes.json and stage-rewards.json; their shapes are ../../packages/game/src/data/content.ts.
Enemies use the same rules as build_data.py so the guide's clear model runs on them unchanged.
"""
import json
import math
import os
import re
import sys

TABLES, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)


def table(name):
    return json.load(open(os.path.join(TABLES, name + '.json')))


def write(name, data):
    path = os.path.join(OUT, name + '.json')
    json.dump(data, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f'{name}.json {os.path.getsize(path) // 1024} KB')


# Compiled defaults of excelConfig.Variables / FightVariables. The client ships no table that overrides them.
IDLE_TICK = 10                                # IDLE_FREQUENCY: one idle EXP payout every 10 s
IDLE_ITEM_EVERY = [900, 1800, 3600, 300, 720]  # IDLE_ITEM_DROP_FREQUENCY, paired with stage_info.idleItem
IDLE_CARD_EVERY = [28800, 10800]              # IDLE_CARD_DROP_FREQUENCY, paired with stage_info.idleDrop
OFFLINE_CAP = 43200                           # OFFLINE_IDLE_REWARD_TIME
FAST_IDLE = {'freePerDay': 1, 'paidPerDay': 3, 'diamondCost': [100, 150, 200]}  # STAGE_FAST_IDLE_*
MONSTER_CAP = 20                              # FightVariables.STAGE_MONSTER_AMOUNT_LIMIT
BATTERY_SAVING_EVERY = 15                     # BATTERY_SAVING_KILL_MOB_INTERVAL

lang = {r['Id']: r.get('Text', '') for r in table('lang_en')}


def fill(text, args):
    return re.sub(r'%\{(\d+)\}', lambda m: str(args[int(m.group(1)) - 1]) if int(m.group(1)) <= len(args)
                  else m.group(0), text)


def T(key, *args):
    """Resolve a lang key, fill %{n} and drop the [color] markup."""
    text = lang.get(key, key) if key else ''
    return re.sub(r'\[/?color[^\]]*\]', '', fill(text, args))


def J(raw):
    """Fields stored as JSON text, e.g. "[[20,12,600]]"."""
    return json.loads(raw) if isinstance(raw, str) and raw.strip() else (raw or [])


def packed(cell):
    """A nested Int32List exported as hex-encoded packed varints: [{"_1": ["0406"]}] -> [[4, 6]]."""
    out = []
    for msg in cell or []:
        vals = []
        for chunk in msg.get('_1', []):
            if isinstance(chunk, int):
                vals.append(chunk)
                continue
            b, i = bytes.fromhex(chunk), 0
            while i < len(b):
                v = shift = 0
                while True:
                    v |= (b[i] & 0x7F) << shift
                    shift += 7
                    i += 1
                    if not b[i - 1] & 0x80:
                        break
                vals.append(v - (1 << 64) if v >= 1 << 63 else v)
        out.append(vals)
    return out


# ---------------------------------------------------------------- names for every reward kind
items = {}  # "kind:id" -> {name, quality}
item_rows = {r['Entry']: r for r in table('item_info')}
card_rows = {r['Entry']: r for r in table('card_info')}
pet_rows = {r['Entry']: r for r in table('pet_info')}
legacy_rows = {r['Entry']: r for r in table('legacy_info')}
equip_rows = {r['Entry']: r for r in table('equip_info')}
KIND = {20: 'item', 30: 'equip', 40: 'weapon', 50: 'card', 55: 'legacy', 60: 'pet'}


def ref(kind, item_id, arg=()):
    """Register a reward thing and return its key."""
    arg = [a for a in arg if a]
    key = f'{kind}:{item_id}' if item_id else f'{kind}:0:' + '-'.join(map(str, arg))
    if key in items:
        return key
    name, quality = None, 0
    if kind == 20 and item_id in item_rows:
        r = item_rows[item_id]
        name, quality = T(r['Name']), r.get('Quality', 0)
    elif kind == 50 and item_id in card_rows:
        r = card_rows[item_id]
        name, quality = T(r['Name']), r.get('Quality', 0)
    elif kind == 60 and item_id in pet_rows:
        r = pet_rows[item_id]
        name, quality = T(r['Name']), r.get('ShowQuality', 0)
    elif kind == 55 and item_id in legacy_rows:
        r = legacy_rows[item_id]
        name, quality = T(r['Name']), r.get('Quality', 0)
    elif kind == 30 and item_id in equip_rows:
        r = equip_rows[item_id]
        name, quality = T(r['Name']), r.get('ShowQuality', 0)
    elif kind == 30:  # arg mode: [quality, part, level] for the player's own build
        name, quality = f'Equipment (quality {arg[0]}, part {arg[1]}, Lv {arg[2]})' if len(arg) >= 3 else 'Equipment', \
            arg[0] if arg else 0
    elif kind == 40:  # weapon by quality, for the player's own build
        quality = arg[0] if arg else item_id
        name = f'Weapon (quality {quality})'
    items[key] = {'name': name or f'{KIND.get(kind, kind)} {item_id}', 'quality': quality}
    return key


# ---------------------------------------------------------------- drop tables
drop_base, drop_group = {}, {}
for r in table('drop_base'):
    drop_base.setdefault(r['DropId'], {}).setdefault(r['DropGroupId'], []).append(r)
for r in table('drop_group'):
    drop_group[(r['DropId'], r['DropGroupId'])] = r


def drop(drop_id):
    """A drop as rows. Each group rolls once with its Probability and picks one row by Weight.
    Guaranteed rows: [item, amount]. Random rows: [item, amount, chance, group, pity]."""
    out = []
    for gid, rows in sorted((drop_base.get(drop_id) or {}).items()):
        g = drop_group.get((drop_id, gid), {})
        p, pity = g.get('Probability', 1), g.get('Frequency', 0)
        total = sum(r.get('Weight', 0) for r in rows) or len(rows)
        for r in rows:
            k = ref(r['DropKind'], r['ItemId'], r.get('arg', []))
            chance = p * (r.get('Weight', 0) or 1) / total
            out.append([k, r['Amount']] if chance >= 1 else [k, r['Amount'], round(chance, 6), gid, pity])
    return out


def rewards(triples):
    """Inline [[kind, id, amount], ...] lists."""
    return [[ref(k, i), n] for k, i, n in triples]


# ---------------------------------------------------------------- enemies (same rules as build_data.py)
monsters = {}
for r in table('fight_soldier'):
    monsters[r['Entry']] = {'tags': r.get('tags', []),
                            'base': {'patk': r.get('AttrPatk', 0), 'matk': r.get('AttrMatk', 0),
                                     'pdef': r.get('AttrPdef', 0), 'mdef': r.get('AttrMdef', 0),
                                     'hp': r.get('AttrHp', 0)}}
soldier_name = {r['Entry']: T(r.get('SoldierName')) for r in table('fight_soldier')}
groups = {r['GroupEntry']: r.get('monsterGroup', []) for r in table('fight_monster_group')}

rounds = {}
for r in table('stage_round'):
    rounds.setdefault(r['FightStageEntry'], []).append(r)
lineup = {}
for r in table('fight_lineup'):
    lineup.setdefault(r['FightStageEntry'], []).append(r)

ATTR = {1100: 'patk', 1200: 'matk', 1300: 'pdef', 1400: 'mdef', 1500: 'hp', 19900: 'pveDmg', 11700: 'dmgUp',
        11800: 'dmgRed', 11900: 'finalUp', 12000: 'finalRed', 10700: 'hit', 10800: 'flee'}


def enemy(l):
    sid = l['SoldierEntry']
    if not sid and l.get('SoldierRandomGroup'):
        # a random pick per spawn from fight_monster_group; the members share base stats
        sid = groups[l['SoldierRandomGroup']][0]
    base = monsters.get(sid, {}).get('base', {})
    e = {'id': sid, 'count': l.get('Count', 1) * l.get('Turns', 1), 'spawnAt': l.get('TimeFirst', 0),
         'spawnOver': l.get('TimeDuration', 0), 'hpBar': l.get('HpShowAmount', 0) == 1}
    vals = dict(zip(l.get('attrKey', []), l.get('attrNum', [])))
    for k, name in ATTR.items():
        e[name] = round(base.get(name, 0) + vals.get(k, 0), 4)
    e['boss'] = not (l.get('TimeFirst', 0) == 0 and l.get('Turns', 1) > 1)
    return e


ROW = ['id', 'count', 'spawnAt', 'spawnOver', 'hpBar', 'boss', *ATTR.values()]  # content.ts ENEMY_ROW


def pack(e, round_no):
    """Enemy as a fixed-order row (booleans as 0/1) plus its round; content.ts toEnemy() expands it."""
    return [int(e[k]) if isinstance(e[k], bool) else e[k] for k in ROW] + [round_no]


def stats(r):
    """attrKey/attrNum as a row in ATTR order (patk .. flee), 0 where absent."""
    vals = dict(zip(r.get('attrKey', []), r.get('attrNum', [])))
    return [round(vals.get(k, 0), 4) for k in ATTR]


# Every mode's enemies sit on the campaign stat curve: an enemy's DEF equals some campaign stage's (to the base
# value). tier = the campaign stage whose strongest enemy DEF is nearest on a log scale.
campaign_def = sorted(
    (max((enemy(l)['pdef'] for l in lineup.get(r['FightStageEntry'], [])), default=0), f"{r['CampaignIdx']}-{r['StageIdx']}")
    for r in table('stage_info'))


def tier(rows):
    d = max((x[ROW.index('pdef')] for x in rows), default=0)
    if d <= 0:
        return None
    return min(campaign_def, key=lambda c: abs(math.log(max(c[0], 1)) - math.log(d)))[1]


fn_info = {r['FightStageType']: r for r in table('fight_function_info')}
buffs = {r['Entry']: r for r in table('res_stage_buff')}


def fight(fight_stage, stage_type, round_time=False):
    """Enemy list, timer and rounds of one fight."""
    rs = sorted(rounds.get(fight_stage, []), key=lambda x: x['StageRound'])
    fi = fn_info.get(stage_type, {})
    out = {
        # EndlessTower and campaign boss fights time the first round; the rest use fight_function_info
        'time': rs[0]['RoundTime'] if round_time and rs else fi.get('FightTime', 0),
        'maxOnField': max((x.get('MonsterLimit', 0) for x in rs), default=0),
        'enemies': [pack(enemy(l), l.get('Round', 1)) for l in lineup.get(fight_stage, []) if l.get('Active', 1)],
    }
    out['tier'] = tier(out['enemies'])
    if fi.get('ExtraFightTime'):
        out['extraTime'] = fi['ExtraFightTime']
    if len(rs) > 1 or any(x.get('StageBuff') for x in rs):
        out['rounds'] = [{'time': x['RoundTime'], 'next': x.get('RoundRule', 0), 'cut': x.get('RoundCut', 0) == 1,
                          'bossRound': x.get('BossRaid', 0) == 1, 'maxOnField': x.get('MonsterLimit', 0),
                          **({'buff': x['StageBuff']} if x.get('StageBuff') else {})} for x in rs]
    return out


# ---------------------------------------------------------------- unlocks
stage_by_entry = {r['Entry']: f"{r['CampaignIdx']}-{r['StageIdx']}" for r in table('stage_info')}
tasks = {r['Entry']: r for r in table('task_info')}
functions = {r['Entry']: r for r in table('function_info')}


def unlock(func_id):
    f = functions.get(func_id)
    if not f:
        return None
    u = {'func': func_id, 'name': T(f.get('Name'))}
    if f.get('UnlockBaselevel'):
        u['baseLevel'] = f['UnlockBaselevel']
    if f.get('UnlockJoblevel'):
        u['jobLevel'] = f['UnlockJoblevel']
    if f.get('UnlockStage'):
        u['stage'] = stage_by_entry.get(f['UnlockStage'], str(f['UnlockStage']))
    if f.get('UnlockCreateDate'):
        u['accountDay'] = f['UnlockCreateDate']
    task = tasks.get(f.get('UnlockMainTask'))
    if task:
        u['mainQuest'] = task['TaskIdx']
        if task.get('TriggerType') == 201:
            u['stage'] = stage_by_entry.get(task['arg'][0], str(task['arg'][0]))
            what = f"Clear Main Stage {u['stage']}"
        else:
            what = T(task.get('Des'), *task.get('desArg', []))
        u['text'] = T(f['UnlockDes'], task['TaskIdx'], what)
    elif f.get('UnlockBaselevel'):
        u['text'] = T(f['UnlockDes'], f['UnlockBaselevel'])
    elif f.get('UnlockStage') and f['UnlockStage'] in stage_by_entry and f.get('UnlockDes') != 'func_unlock_classicequip':
        u['text'] = T(f['UnlockDes'], stage_by_entry[f['UnlockStage']])
    else:
        u['text'] = T(f.get('UnlockDes'))
    if f.get('UnlockStage') == 99999:  # no such stage: FunctionManager.IsFunctionOpen never passes
        del u['stage']
        u['closed'] = True
    return u


def power(n):
    return {'recommendedPower': n} if n else {}


def rule_text(func_id):
    f = functions.get(func_id) or {}
    return T(f['RuleDes']) if f.get('RuleDes') else ''


modes = {}

# ---------------------------------------------------------------- MVP Challenge (FightStageType 8)
mvp_stages = {}
for r in table('mvp_stage_info'):
    mvp_stages.setdefault(r['MvpEntry'], []).append(r)
bosses = []
for c in sorted(table('mvp_challenge_info'), key=lambda r: r['Entry']):
    name = T(c['MvpName'])
    stages = []
    for r in sorted(mvp_stages.get(c['Entry'], []), key=lambda r: r['StageDifficultyIdx']):
        stages.append({
            'id': f"mvp-{r['Entry']}", 'entry': r['Entry'], 'name': f"{name} {T('res_instance_name_format', r['StageDifficultyIdx'])}",
            'difficulty': r['StageDifficultyIdx'], 'win': 'killAll', **power(r.get('RecommendBr')),
            **fight(r['FightStageEntry'], 8),
            'firstClear': drop(r['FirstDownDrops']), 'repeat': drop(r['SweepDrops']),
        })
    bosses.append({'entry': c['Entry'], 'name': name, 'monster': c['MvpMonster'], 'unlock': unlock(c['FuncEntry']),
                   'dailySweeps': c['MvpDailySweepTimes'], 'stages': stages})
modes['mvp'] = {'name': T('func_name_807'), 'unlock': unlock(807), 'rules': rule_text(807), 'bosses': bosses}

# ---------------------------------------------------------------- World Boss / Baphomet Challenge (type 7)
wb = []
for r in sorted(table('world_boss_stage_info'), key=lambda r: r['Difficulty']):
    pairs = J(r.get('FirstReward'))
    wb.append({
        'id': f"wb-{r['Entry']}", 'entry': r['Entry'], 'name': T(r['Name']), 'difficulty': r['Difficulty'],
        'unlockAfter': r.get('UnlockCondition') or None, 'final': r.get('IsFinal', 0) == 1,
        'bossHp': r.get('BossHp', 0), 'scoreRatio': r.get('HpToScoreRatio', 0), 'monster': r.get('Monster', 0),
        'win': 'damage', **fight(r['FightStageEntry'], 7),
        # [boss HP % reached, reward]; the last pair is the kill reward
        'hpRewards': [{'hpPercent': p, 'reward': [[ref(20, i), n]]} for p, i, n in pairs],
    })
tiers = []
for t in sorted(table('world_boss_rank_tier_reward'), key=lambda r: r['Entry']):
    tiers.append({'entry': t['Entry'], 'name': T(t['TierName']), 'minScore': t.get('MinScore', 0),
                  'maxRank': t.get('MaxRank', 0), 'daily': drop(t['DailyReward']), 'weekly': drop(t['WeeklyReward'])})
modes['worldBoss'] = {'name': T('func_name_806'), 'unlock': unlock(806), 'rules': rule_text(806), 'stages': wb,
                      'tiers': tiers}

# ---------------------------------------------------------------- Endless Tower (type 10)
# 1200 one-round floors: compact rows (floor = index + 1); content.ts towerFloor() turns one into a ModeStage
floors = []
for r in sorted(table('endless_tower_stage_info'), key=lambda r: r['StageIdx']):
    assert r['StageIdx'] == len(floors) + 1 and not r.get('CheckMinBr')
    fs = fight(r['FightStageEntry'], 10, round_time=True)
    boss = (rounds.get(r['FightStageEntry']) or [{}])[0].get('BossRaid', 0) == 1  # EndlessTowerStageAdapterFL.IsBossFloor
    floors.append({'time': fs['time'], 'enemies': fs['enemies'], 'firstClear': drop(r['Drops']),
                   'repeat': drop(r['DailySweepDrop']),
                   **({'kind': 'boss'} if boss else {'kind': 'special'} if r.get('Category', 0) == 1 else {})})
skill_tasks = {r['Entry']: r for r in table('fight_skill_task')}
# Each threat row's task runs once when today's cleared floors pass its StageAmount and adds its side attrs
# (FSTFightSideAttr -> AddAttr), so they stack. The five stat multipliers always move together.
STAT_MULS = (1507, 1108, 1207, 1308, 1407)  # Base{Hp,PAtk,MAtk,PDef,MDef}MulL6
threat_texts, threat, total = [], [], {}
for b in sorted(table('endless_tower_buff_info'), key=lambda r: r['StageAmount']):
    for t in (skill_tasks.get(b.get('FightSkillTask')) or {}).get('task', []):
        a = t.get('FSTFightSideAttr')
        if a and a.get('Value'):
            total[a['Attr']] = round(total.get(a['Attr'], 0) + a['Value'], 6)
    assert len({total.get(k, 0) for k in STAT_MULS}) == 1
    raw = lang.get(b['Des'], '')
    if raw not in threat_texts:
        threat_texts.append(raw)
    row = [b['StageAmount'], b.get('ThreatLevel', 0), threat_texts.index(raw), total.get(1507, 0), total.get(15300, 0)]
    if not threat or threat[-1][1:] != row[1:]:
        threat.append(row)
threat_texts = [re.sub(r'\[/?color[^\]]*\]', '', t) for t in threat_texts]  # %{1} = floors cleared today
modes['endlessTower'] = {'name': T('func_name_808'), 'unlock': unlock(808), 'rules': rule_text(808),
                         'win': 'killAll', 'maxOnField': max(x.get('MonsterLimit', 0) for e in table('endless_tower_stage_info')
                                                             for x in rounds.get(e['FightStageEntry'], [])),
                         'dailyChallenges': 5, 'dailyFreeSweeps': 1, 'floors': floors, 'threat': threat,
                         'threatTexts': threat_texts,
                         'sweepFallback': drop(96500)}

# ---------------------------------------------------------------- Resource Secret Realms (types 3, 4, 5)
res_stages = {}
for r in table('res_instance_stage_info'):
    res_stages.setdefault(r['InstanceCategory'], []).append(r)
trigger_rows = {r['Entry']: r for r in table('fight_trigger')}
cats = []
for c in sorted(table('res_instance_info'), key=lambda r: r['Entry']):
    stype = 3 + c['Entry'] - 1  # ResInstanceStageAdapterFVBase: category = StageType - 3 + 1
    win = 'killBoss' if stype == 5 else 'killAll'
    stages = []
    for r in sorted(res_stages.get(c['Entry'], []), key=lambda r: r['StageIdx']):
        stages.append({
            'id': f"res-{c['Entry']}-{r['StageIdx']}", 'entry': r['Entry'], 'name': T(r['Name'], r['StageIdx']),
            'difficulty': r['StageIdx'], 'win': win, **power(r.get('RecommendBr')),
            **fight(r['FightStageEntry'], stype),
            'firstClear': drop(r['FirstDownReward']), 'repeat': drop(r['CommonReward']),
        })
    # every stage of a category runs the same rounds: keep them once on the category
    shared = {json.dumps(st.get('rounds')) for st in stages}
    cat_rounds = stages[0].get('rounds') if len(shared) == 1 else None
    if cat_rounds:
        for st in stages:
            st.pop('rounds', None)
    cats.append({'category': c['Entry'], 'name': T('preview_name_%d' % c['FuncEntry']), 'unlock': unlock(c['FuncEntry']),
                 'rules': rule_text(c['FuncEntry']), 'stageType': stype, **({'rounds': cat_rounds} if cat_rounds else {}),
                 'ticket': {'item': ref(20, c['ChallengeItemEntry']), 'dailyRestore': c['ChallengeDailyRestore'],
                            'restoreCap': c['ChallengeRestoreCap']},
                 'stages': stages})
stage_buffs = []
for b in sorted(buffs.values(), key=lambda r: r['Entry']):
    trig = []
    for task in b.get('taskEntry', []):
        for t in (skill_tasks.get(task) or {}).get('task', []):
            tr = trigger_rows.get((t.get('FSTAddTrigger') or {}).get('TriggerEntry'))
            if tr:
                trig.append({'trigger': tr['Trigger'], 'max': tr.get('Max', 0), 'lifeTime': tr.get('LifeTime', 0)})
    stage_buffs.append({'entry': b['Entry'], 'target': ['none', 'player', 'attacker', 'defender', 'both'][b['StageBuffType']],
                        'tasks': b.get('taskEntry', []), 'triggers': trig})
modes['resInstances'] = {'name': T('func_name_801'), 'unlock': unlock(801), 'categories': cats, 'stageBuffs': stage_buffs}

# ---------------------------------------------------------------- Team PvE / Dungeon (type 6)
acc = {}
for r in table('accessory_drop'):
    acc.setdefault(r['QualityGroup'], []).append(r)
team = []
for r in sorted(table('team_pve_stage_info'), key=lambda r: r['StageIdx']):
    a = [x for x in acc.get(r['QualityGroup'], []) if x.get('DropWeight', 0) > 0]
    tw = sum(x['DropWeight'] for x in a)
    team.append({
        'id': f"team-{r['StageIdx']}", 'entry': r['Entry'], 'name': T(r['Name']), 'difficulty': r['StageIdx'],
        'unlockStage': stage_by_entry.get(r['UnlockMainStage'], str(r['UnlockMainStage'])), 'win': 'killAll',
        **power(r.get('RecommendBr')), **fight(r['FightStageEntry'], 6),
        'repeat': drop(r['VisibleDrops']), 'assist': drop(r['VisibleAssistDrops']),
        'accessoryQuality': [[x['DropQuality'], round(x['DropWeight'] / tw, 4)] for x in a],
        'monsters': [int(x) for x in str(r.get('Monster', '')).split(',') if x.strip()],
        'rawDrops': [r.get('Drops', ''), r.get('AssistDrops', '')],
    })
modes['teamPve'] = {'name': T('func_name_805'), 'unlock': unlock(805), 'rules': rule_text(805),
                    'dailyClears': 3, 'dailyAssists': 5, 'stages': team,
                    'achievements': [{'level': r['Level'], 'points': r['Exp'], 'reward': drop(r['Drops'])}
                                     for r in sorted(table('team_pve_achievement'), key=lambda r: r['Level'])]}

# ---------------------------------------------------------------- Guild Hunt / Guild Boss (type 9)
gb = table('guild_boss_stage_info')[0]
gb_fight = fight(gb['FightStageEntry'], 9)
phase_monsters, chests, challenge = J(gb['Monster']), J(gb['ChestCount']), J(gb['ChallengeReward'])
skills = {r['Entry']: r for r in table('guild_skill')}
skill_lv = {(r['SkillEntry'], r['Level']): r for r in table('guild_skill_level')}
modes['guildBoss'] = {
    'name': T('func_name_2904'), 'unlock': unlock(2904), 'rules': rule_text(2904), 'dailyChallenges': 3,
    'stage': {'id': f"guild-{gb['Entry']}", 'entry': gb['Entry'], 'name': T('func_name_2904'), 'win': 'damage', **gb_fight},
    'phases': [{'phase': i + 1, 'monster': m, 'name': soldier_name.get(m, ''), 'chests': chests[i] if i < len(chests) else 0,
                'challengeReward': drop(challenge[i]) if i < len(challenge) else []} for i, m in enumerate(phase_monsters)],
    'chest': drop(80251),
    'scoreSegments': [[r['Damage'], r['ScoreRatio']] for r in sorted(table('guild_boss_damage_score_ratio'),
                                                                       key=lambda r: (r['Damage'], r['ScoreRatio']))],
    'scoreRewards': [{'score': r['TotalScore'], 'reward': drop(r['Reward'])}
                     for r in sorted(table('guild_boss_score_reward'), key=lambda r: r['TotalScore'])],
    'damageRewards': [{'damage': r['TotalDamage'], 'reward': drop(r['Reward'])}
                      for r in sorted(table('guild_boss_damage_reward'), key=lambda r: r['TotalDamage'])],
    'tiers': [{'entry': t['Entry'], 'name': T(t['TierName']), 'maxRank': t.get('MaxRank', 0), 'minScore': t.get('MinScore', 0),
               'skills': [{'skill': s, 'name': T(skills[s]['Name']), 'level': lv,
                           'text': T(skill_lv[(s, lv)]['Des'], *skill_lv[(s, lv)].get('desArg', [])),
                           'days': skills[s].get('Duration', 0) // 86400}
                          for s, lv in J(t.get('RewardGuildSkills'))]}
              for t in sorted(table('guild_boss_rank_reward'), key=lambda r: r['Entry'])],
}

# ---------------------------------------------------------------- Rune Arena (type 11, PvP)
arena_ranks = sorted(table('arena_rank_reward'), key=lambda r: r['Rank'])
modes['arena'] = {
    'name': T('func_name_809'), 'unlock': unlock(809), 'rules': rule_text(809), 'time': fn_info[11]['FightTime'],
    'tiers': [{'entry': r['Entry'], 'name': T(r['TireName']), 'minScore': r['MinScore'], 'seasonReset': r['ScoreReset'],
               'reward': drop(r['TierReward'])} for r in sorted(table('arena_tier_info'), key=lambda r: r['Entry'])],
    'rankRewards': [{'from': r['Rank'], 'to': (arena_ranks[i + 1]['Rank'] - 1) if i + 1 < len(arena_ranks) else 0,
                     'daily': drop(r['DailyReward']) if r.get('DailyReward') else [],
                     'season': drop(r['SeasonReward']) if r.get('SeasonReward') else []}
                    for i, r in enumerate(arena_ranks) if r.get('DailyReward') or r.get('SeasonReward')],
    'scoreBrackets': [{'minScore': r['Score'], 'winMul': r['VictoryVar'], 'lossMul': r['DefeatVar']}
                      for r in sorted(table('arena_score'), key=lambda r: r['Score'])],
    'elo': {'base': 10, 'divisor': 400, 'k': 80, 'startScore': 1000},
    'tickets': {'item': ref(20, 11), 'dailyRestore': 5, 'buyPerDay': 5, 'buyCost': [10, 15, 20, 25, 30]},
    'fightReward': {'win': drop(60101), 'lose': drop(60102), 'perDay': 5},
}

# ---------------------------------------------------------------- Guild War / GvG (PvP)
modes['gvg'] = {
    'name': T('func_name_2910'), 'unlock': unlock(2910), 'rules': rule_text(2910), 'attacksPerMatch': 3,
    'tiers': [{'entry': r['Entry'], 'name': T(r['TierName']), 'minScore': r['NeedScore'], 'seasonReset': r['ScoreReset']}
              for r in sorted(table('gvg_tier'), key=lambda r: r['Entry'])],
    'rankRewards': [{'from': r['RankMin'], 'to': r['RankMax'], 'weekly': rewards(J(r['WeekReward'])),
                     'season': rewards(J(r['SeasonReward']))} for r in sorted(table('gvg_rank_reward'), key=lambda r: r['RankMin'])],
    'progressRewards': [{'attacks': r['TotalAttackTimes'], 'reward': rewards(J(r['Reward']))}
                        for r in sorted(table('gvg_progress_reward'), key=lambda r: r['TotalAttackTimes'])],
    'strongholds': [{'level': r['Level'], 'count': r['Num'], 'attackPoints': r['AttackPoint'], 'breakPoints': r['BreakPoint'],
                     'breakTimes': r['BreakTimes']} for r in sorted(table('gvg_stronghold_info'), key=lambda r: r['Level'])],
    'scoreBrackets': [{'minScore': r['ScoreMin'], 'winMul': r['VictoryVar'], 'lossMul': r['DefeatVar']}
                      for r in sorted(table('gvg_score'), key=lambda r: r['ScoreMin'])],
    'elo': {'base': 10, 'divisor': 400, 'k': 80, 'startScore': 1000},
    'matchRewards': {'attack': rewards([[20, 32, 30], [20, 38, 20]]), 'win': rewards([[20, 32, 100], [20, 38, 60], [20, 2, 30]]),
                     'lose': rewards([[20, 32, 50], [20, 38, 30]]), 'bye': rewards([[20, 32, 100], [20, 38, 60], [20, 2, 30]])},
    'schedule': [{'season': r['SeasonIdx'], 'week': r['WeekIdx'], 'match': r['SessionIdx'], 'open': r['OpenDate'],
                  'end': r['EndDate']} for r in sorted(table('gvg_open_info'), key=lambda r: r['Entry'])],
}

modes_items = dict(items)
write('modes', {'items': modes_items, 'modes': modes})

# ---------------------------------------------------------------- campaign stage rewards
items.clear()
idle_mon = {r['FightStageEntry']: r for r in table('stage_idle_monster')}
elite_mon = {r['FightStageEntry']: r for r in table('stage_elite_monster')}
arena_rng = {r['FightStageEntry']: r for r in table('stage_boss_range')}
card_pools, arenas, out = {}, [], {}
per_hour = 3600 // IDLE_TICK
for r in sorted(table('stage_info'), key=lambda r: (r['CampaignIdx'], r['StageIdx'])):
    f = r['FightStageEntry']
    idle_items = []
    for i, (item, n) in enumerate(zip(r.get('idleItem', []), r.get('idleNum', []))):
        if n and i < len(IDLE_ITEM_EVERY):
            idle_items.append([ref(20, item), round(n * 3600 / IDLE_ITEM_EVERY[i], 4)])
    cards = []
    for i, d in enumerate(r.get('idleDrop', [])):
        if d and i < len(IDLE_CARD_EVERY) and drop_base.get(d):
            rows = drop(d)
            # many stages share a card pool under different drop ids: key each pool by its first drop id
            pool = next((k for k, v in card_pools.items() if v == rows), str(d))
            card_pools.setdefault(pool, rows)
            cards.append([IDLE_CARD_EVERY[i] / 3600, pool])
    s = {
        'entry': r['Entry'],
        'firstClear': drop(r['FirstDownReward']) if r.get('FirstDownReward') else [],
        'idle': {'baseExpPerHour': r.get('IdleExpBase', 0) * per_hour, 'jobExpPerHour': r.get('IdleExpJob', 0) * per_hour,
                 'items': idle_items, 'cards': cards},
        'batterySavingKills': r.get('BatterySavingMob', 0),
    }
    im, em = idle_mon.get(f), elite_mon.get(f)
    if im or em:
        field = {}
        if im:
            mons, amount, grp = packed(im.get('monster')), packed(im.get('monsterAmount')), packed(im.get('monsterGroupAmount'))
            field['slots'] = [[ids, *((amount[i] if i < len(amount) else []) + [0, 0])[:2],
                               *((grp[i] if i < len(grp) else []) + [0, 0, 0])[:3]] for i, ids in enumerate(mons)]
            field['stats'] = stats(im)
        if em:
            field['elites'] = em.get('eliteGroup', [])
            field['eliteStats'] = stats(em)
        s['field'] = field
    ar = arena_rng.get(f)
    if ar:
        a = {'size': ar.get('lengthWidth', []), 'player': ar.get('playerPosition', []), 'boss': ar.get('bossPosition', [])}
        if a not in arenas:
            arenas.append(a)
        if a != arenas[0]:
            s['bossArena'] = a
    out[f"{r['CampaignIdx']}-{r['StageIdx']}"] = s

cards_info = {r['Entry']: r for r in table('monthly_card_info')}
write('stage-rewards', {
    'items': items,
    'idle': {
        'tickSeconds': IDLE_TICK, 'itemEverySeconds': IDLE_ITEM_EVERY, 'cardEverySeconds': IDLE_CARD_EVERY,
        'offlineCapHours': OFFLINE_CAP / 3600, 'monsterCap': MONSTER_CAP, 'batterySavingEverySeconds': BATTERY_SAVING_EVERY,
        'fastIdle': {**FAST_IDLE, 'ticketItem': ref(20, 29)},
        'cards': [{'entry': c['Entry'], 'name': T(c['Name']), 'baseExpPct': c.get('EfExtraIdleBaseexp', 0),
                   'jobExpPct': c.get('EfExtraIdleJobexp', 0), 'resourcePct': c.get('EfExtraIdleResources', 0),
                   'offlineHours': c.get('EfExtraIdleOfflineTime', 0), 'fastIdleFree': c.get('EfExtraIdleFreeTimes', 0),
                   'mvpSweeps': c.get('EfMvpSweepTimes', 0), 'resTicketsWeekly': c.get('EfResInstanceWeeklyTimes', 0)}
                  for c in sorted(cards_info.values(), key=lambda c: c['Entry'])],
    },
    'bossArena': arenas[0] if arenas else None,
    'cardPools': card_pools,
    'stages': out,
})
