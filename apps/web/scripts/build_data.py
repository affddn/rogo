"""Build the app's data files from the exported game tables.

usage: python3 -I scripts/build_data.py <export dir> <out dir>

<export dir> is export_tables.py's output (tables/*.json, enums.json). Repeated fields carry
the C# backing-field name (lowercase first letter, e.g. specEntry). Writes compact
JSON files the app fetches at runtime: stages, monsters, attrs, battle-rate weights,
damage formulas and chapter list.
"""
import json
import os
import sys

EXPORT, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)


def table(name):
    return json.load(open(os.path.join(EXPORT, 'tables', name + '.json')))


def write(name, data):
    path = os.path.join(OUT, name + '.json')
    json.dump(data, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f'{name}.json {os.path.getsize(path) // 1024} KB')


lang = {r['Id']: r.get('Text', '') for r in table('lang_en')}
T = lambda key: lang.get(key, key) if key else ''

# attributes: id -> key, display name, description
attrs = {}
for r in table('fight_attr'):
    attrs[r['EnumValue']] = {
        'key': r.get('KeyEn', ''),
        'name': T(r.get('Name')) if r.get('Name') else r.get('KeyEn', ''),
        'desc': (lambda d: '' if d == r.get('Description') else d)(T(r.get('Description', ''))),
        'template': r.get('FormulaTemplateType', 0),
        'params': r.get('formulaParams', []),
        # 0 whole number, 1 percent, 4 two decimals (GL/AttrUtils.cs, NumberDisplayTransform.cs)
        'show': r.get('ShowStyle', 0),
        'min': r.get('MinValue') if r.get('EnableMin') else None,
        'max': r.get('MaxValue') if r.get('EnableMax') else None,
    }
write('attrs', attrs)

# monster skills: name, text and cooldown (seconds), for the boss panel
fight_skills = {r['Entry']: r for r in table('fight_skill')}
TAGS = {r['EnumValue']: r['KeyEn'] for r in table('soldier_tag')}


def skill_info(sid):
    r = fight_skills.get(sid)
    if not r:
        return None
    name = T(r.get('ShowName'))
    return {'id': sid, 'name': '' if name == r.get('ShowName') else name,
            'desc': (lambda d: '' if d == r.get('Description') else d)(T(r.get('Description', ''))),
            'cd': round(r.get('BaseCooldown', 0) / 1000, 2) if r.get('BaseCooldown', 0) > 100 else r.get('BaseCooldown', 0),
            'active': bool(r.get('IsActive'))}


# monsters: base stats and names
monsters = {}
for r in table('fight_soldier'):
    monsters[r['Entry']] = {
        'name': T(r.get('SoldierName')),
        'tags': r.get('tags', []),
        'head': r.get('HeadIcon', 0),
        'element': r.get('ElementType', 0),
        'damageType': r.get('DamageType', 0),
        'base': {'patk': r.get('AttrPatk', 0), 'matk': r.get('AttrMatk', 0), 'pdef': r.get('AttrPdef', 0),
                 'mdef': r.get('AttrMdef', 0), 'hp': r.get('AttrHp', 0)},
        'skills': r.get('skills', []),
        'skillInfo': [i for i in (skill_info(x) for x in r.get('skills', [])) if i],
        'tagNames': [TAGS.get(t, str(t)) for t in r.get('tags', [])],
    }
write('monsters', monsters)

chapters = {r['CampaignIdx']: T(r.get('Name')) for r in table('campaign_info')}
write('chapters', chapters)

rounds = {}
for r in table('stage_round'):
    rounds.setdefault(r['FightStageEntry'], []).append(r)
lineup = {}
for r in table('fight_lineup'):
    lineup.setdefault(r['FightStageEntry'], []).append(r)

ATTR = {1100: 'patk', 1200: 'matk', 1300: 'pdef', 1400: 'mdef', 1500: 'hp', 19900: 'pveDmg', 11700: 'dmgUp',
        11800: 'dmgRed', 11900: 'finalUp', 12000: 'finalRed', 10700: 'hit', 10800: 'flee'}


def enemy(l):
    base = monsters.get(l['SoldierEntry'], {}).get('base', {})
    e = {'id': l['SoldierEntry'], 'count': l.get('Count', 1) * l.get('Turns', 1), 'spawnAt': l.get('TimeFirst', 0),
         'spawnOver': l.get('TimeDuration', 0), 'hpBar': l.get('HpShowAmount', 0) == 1}
    vals = dict(zip(l.get('attrKey', []), l.get('attrNum', [])))
    for k, name in ATTR.items():
        e[name] = round(base.get(name, 0) + vals.get(k, 0), 4)
    # a wave is the trash spawned from the start; everything else is the boss group
    e['boss'] = not (l.get('TimeFirst', 0) == 0 and l.get('Turns', 1) > 1)
    return e


stages = []
for r in table('stage_info'):
    f = r['FightStageEntry']
    rs = rounds.get(f, [])
    stages.append({
        'id': f"{r['CampaignIdx']}-{r['StageIdx']}",
        'entry': r['Entry'],
        'chapter': r['CampaignIdx'],
        'index': r['StageIdx'],
        'chapterBoss': r.get('Category') == 3,
        'time': sum(x.get('RoundTime', 0) for x in rs),
        'maxOnField': max((x.get('MonsterLimit', 0) for x in rs), default=0),
        'idleExp': [r.get('IdleExpBase', 0), r.get('IdleExpJob', 0)],
        'minPower': r.get('CheckMinBr', 0),
        'enemies': [enemy(l) for l in lineup.get(f, [])],
    })
write('stages', stages)

# power weights per spec entry
battle_rate = [{'attr': r['EnumValue'], 'layer': r.get('BrMul', 0), 'base': r.get('BaseValue', 0),
                'weights': dict(zip(map(str, r.get('specEntry', [])), r.get('specBrRatio', [])))}
               for r in table('fight_battle_rate')]
write('battle-rate', battle_rate)

formulas = [{'id': r['EnumValue'], 'key': r.get('KeyEn', ''), 'cn': r.get('KeyCn', ''), 'template': r.get('Template', 0),
             'params': r.get('param', [])} for r in table('fight_formula')]
templates = {r['EnumValue']: {'key': r.get('KeyEn', ''), 'desc': r.get('Desc', '')} for r in table('fight_formula_template')}
write('formulas', {'formulas': formulas, 'templates': templates})

enums = json.load(open(os.path.join(EXPORT, 'enums.json')))
write('enums', {k: enums[k] for k in ('FightActorType', 'FightStageType', 'FormulaTemplateType', 'CareerType')
                if k in enums})

# primary stat -> derived attrs. fight_attr_transfer stores the total for each stat value 1..400;
# every pair is linear except AGI -> Aspd (10103), which is a curve shared by all specs.
STAT_KEYS = {1010: 'str', 1020: 'agi', 1030: 'vit', 1040: 'int', 1050: 'dex', 1060: 'luk'}
totals = {}
for r in table('fight_attr_transfer'):
    for a, v in zip(r.get('transAttr', []), r.get('attrNum', [])):
        totals.setdefault((r['CareerSpec'], r['AttrKey'], a), {})[r['AttrTotal']] = v
rates, aspd = {}, None
for (spec, stat, attr), by in totals.items():
    if attr == 10103:
        aspd = [round(by.get(i, 0), 4) for i in range(0, 401)]
        continue
    rate = by.get(100, 0) / 100
    assert all(abs(by.get(i, 0) - rate * i) < 1e-3 for i in range(1, 401)), (spec, stat, attr)
    if rate:
        rates.setdefault(str(spec), {}).setdefault(STAT_KEYS[stat], {})[str(attr)] = round(rate, 6)
levels = table('baseLevel_info')
cum, points = 0, {}
for r in sorted(levels, key=lambda r: r['BaseLevel']):
    cum += r.get('BasePoint', 0)
    points[r['BaseLevel']] = cum
write('attr-transfer', {'rates': rates, 'aspdCurve': aspd, 'pointsByLevel': points})
