"""Export equipment (items, enhance, refine, resonance, enchant, elite summon) as one compact JSON file.

usage (from apps/web/): python3 -I scripts/export_equipment.py <tables_dir> <out_dir>
writes <out_dir>/equipment.json. Shapes and formulas are documented in ../../packages/game/src/data/equipment.ts.

Attr keys are "<id>:<KeyEn>" like cards.json. Per-level tables that are identical for every part are stored once
(`tables`) with a part -> table index map. Item base attrs are identical for every career build, so they are keyed
by (part, quality); random attrs and refine conditions are per build.
"""
import json
import os
import re
import sys
from collections import defaultdict

T, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)


def load(n):
    return json.load(open(os.path.join(T, n + '.json')))


lang = {r['Id']: r.get('Text', '') for r in load('lang_en')}
L = lambda k, d=None: lang.get(k, d if d is not None else k) if k else ''
fa = {r['EnumValue']: r for r in load('fight_attr')}
items_info = {r['Entry']: r for r in load('item_info')}


def key(a):
    return f"{a}:{fa.get(a, {}).get('KeyEn', '?')}"


def num(v, nd=6):
    """Round floats; keep ints as ints."""
    if isinstance(v, float):
        v = round(v, nd)
        return int(v) if v == int(v) and abs(v) < 1e15 else v
    return v


def parse_list(s):
    return json.loads(s) if isinstance(s, str) and s.strip() else []


ROMAN = {'Ⅰ': 'I', 'Ⅱ': 'II', 'Ⅲ': 'III', 'Ⅳ': 'IV', 'Ⅴ': 'V', 'Ⅵ': 'VI', 'Ⅶ': 'VII', 'Ⅷ': 'VIII', 'Ⅸ': 'IX', 'Ⅹ': 'X'}
used_items = set()


def item_ref(i):
    used_items.add(i)
    return i


# ---------------------------------------------------------------- builds, parts, qualities
specs = {r['Entry']: r for r in load('career_spec')}
equip_info = load('equip_info')
BUILDS = sorted({r['CareerBuild'] for r in equip_info})
builds = [{'id': b, 'name': L(f'spec_name_{b}'), 'attrTag': specs.get(b, {}).get('AttrTag'),
           'released': b in specs} for b in BUILDS]

parts = []
for r in sorted(load('equip_part_info'), key=lambda r: r['Entry']):
    cat = r.get('Cateory', 0)
    parts.append({'id': r['Entry'], 'name': L(r['Name']), 'category': cat,
                  'categoryName': L(f'equip_part_category_{cat}', 'Armor' if cat == 1 else 'Accessory'),
                  'unlockBaseLevel': r.get('UnlockBaseLevel', 0),
                  'unlockSummonLevel': r.get('UnlockEquipSummonLevel', 0)})
PARTS = [p['id'] for p in parts]


# GameLogic UIColor.{DARK,LIGHT}_QUALITY_<ShowQuality> (code constants, not in any table); "a,b" is a gradient.
# DARK is used for text on light panels (CommonUtils.WrapEquipQualityNameWithDarkColor), LIGHT on dark panels.
UI_COLOR_DARK ={0: '#70685c', 1: '#7d8ea9', 2: '#47a286', 3: '#6888b1', 4: '#7867bf', 5: '#be6f3f', 6: '#c54848',
                 7: '#d07c19,#c49b2f', 8: '#526bd3,#6aa9d9', 9: '#8458d3,#d17fa7', 10: '#c55bd3,#46b3d6'}
UI_COLOR_LIGHT = {0: '#fafbe7', 1: '#cfdae5', 2: '#98e2cc', 3: '#95d3e7', 4: '#c7baff', 5: '#f0c798', 6: '#f99191',
                  7: '#fab06e,#ffe6a4', 8: '#85b5f0,#b6f6f4', 9: '#e094ff,#fdd1c1', 10: '#ff8bf0,#affeff'}
equip_quality = {r['EquipQuality']: r for r in load('equip_quality')}
show_ids = sorted({r['ShowQuality'] for r in equip_quality.values()})
show_qualities = [{'id': s, 'name': L(f'quality_txt_{s}'), 'dark': UI_COLOR_DARK[s].split(','),
                   'light': UI_COLOR_LIGHT[s].split(',')} for s in show_ids]
qualities = []
for q in sorted(equip_quality):
    r = equip_quality[q]
    sub = ''.join(ROMAN.get(c, c) for c in r.get('ShowSubQuality', ''))
    qualities.append({
        'id': q, 'show': r['ShowQuality'], 'sub': sub,
        'name': f"{L(f'quality_txt_{r['ShowQuality']}')} {sub}".strip(),
        'randomAttrs': r.get('RandomAttrCount', 0), 'refineAttrs': r.get('RefineAttrCount', 0),
        'dismantle': [[item_ref(i), n] for i, n in zip(r.get('decomposeItem', []), r.get('decomposeNum', [])) if i and n],
        'autoDismantleSummonLevel': r.get('AutoDecomposeSummonLevel', 0),
    })
QUALS = [q['id'] for q in qualities]

# ---------------------------------------------------------------- items
BASE_ATTRS = equip_info[0]['equipAttr']
LEVEL_NUM = equip_info[0]['levelNum'][0]
base = {p: [None] * len(QUALS) for p in PARTS}
names = {p: {} for p in PARTS}
for r in equip_info:
    assert r['equipAttr'] == BASE_ATTRS, r['Entry']
    assert all(x == LEVEL_NUM for x in r['levelNum']) and all(x == 1 for x in r['qualityNum']), r['Entry']
    ranges = [json.loads(x) for x in r['attrRangeValue']]
    assert all(lo == -hi for lo, hi in ranges), r['Entry']
    rec = [[num(x) for x in r['attrNum']], [hi for _, hi in ranges]]
    i = r['EquipQuality'] - 1
    assert base[r['EquipPart']][i] in (None, rec), ('base differs by build', r['Entry'])
    base[r['EquipPart']][i] = rec
    n = L(r['Name'])
    assert names[r['EquipPart']].get(r['ShowQuality'], n) == n
    names[r['EquipPart']][r['ShowQuality']] = n

sort_order = lambda a: fa.get(a, {}).get('SortOrder', 1 << 30)
rand_rows, ref_rows = defaultdict(list), defaultdict(list)
for r in load('equip_random_attr'):
    assert r.get('LevelNum', 1) == 1 and r.get('QualityNum', 1) == 1, r['Entry']
    rand_rows[(r['CareerBuild'], r['EquipPart'], r['EquipQuality'])].append(r)
for r in load('equip_refine_attr'):
    assert r.get('LevelNum', 1) == 1 and r.get('QualityNum', 1) == 1, r['Entry']
    ref_rows[(r['CareerBuild'], r['EquipPart'], r['EquipQuality'])].append(r)

random_attrs, refine_conds = {}, {}
for b in BUILDS:
    random_attrs[b], refine_conds[b] = {}, {}
    for p in PARTS:
        ra, rc = [], []
        for q in QUALS:
            # DropCfg.FillEquipRandomAttrs: sort by fight_attr.SortOrder then Entry, take RandomAttrCount
            rows = sorted(rand_rows[(b, p, q)], key=lambda r: (sort_order(r['EquipRandomAttr']), r['Entry']))
            rows = rows[:equip_quality[q].get('RandomAttrCount', 0)]
            ra.append({key(r['EquipRandomAttr']): num(r['RandomAttrNum']) for r in rows})
            # DropCfg.FillEquipRefineConds: sort by Entry, take RefineAttrCount; values kept where arg > 0
            rows = sorted(ref_rows[(b, p, q)], key=lambda r: r['Entry'])[:equip_quality[q].get('RefineAttrCount', 0)]
            conds = []
            for r in rows:
                args = r.get('conditionArg', [])
                vals = r.get('refineAttrNum', [])
                keep = [i for i, a in enumerate(args) if a > 0]
                c = {'attr': key(r['EquipRefineAttr']), 'at': [args[i] for i in keep],
                     'v': [num(vals[i]) if i < len(vals) else 0 for i in keep]}
                if r.get('Condition', 2) != 2:
                    c['type'] = r['Condition']
                conds.append(c)
            rc.append(conds)
        random_attrs[b][p], refine_conds[b][p] = ra, rc

level_range = []
for r in sorted(load('baseLevel_info'), key=lambda r: r['BaseLevel']):
    assert r['BaseLevel'] == len(level_range) + 1
    level_range.append(parse_list(r.get('ArmorLevelRange', '')) or [0, 0, 0])

items = {
    'attrs': [key(a) for a in BASE_ATTRS],
    'levelNum': num(LEVEL_NUM),
    'names': {p: [names[p].get(s, '') for s in show_ids] for p in PARTS},
    'base': base,
    'random': random_attrs,
    'refineConds': refine_conds,
    'levelRange': level_range,
}


# ---------------------------------------------------------------- per-part level tables (dedupe identical parts)
def dedupe(per_part):
    tables, index = [], {}
    for p in PARTS:
        t = per_part[p]
        if t not in tables:
            tables.append(t)
        index[p] = tables.index(t)
    return tables, index


enh_rows = defaultdict(dict)
for r in load('equip_enhance'):
    enh_rows[r['EnhancePart']][r['EnhanceLevel']] = r
ENH_ATTRS = enh_rows[PARTS[0]][0]['enhanceAttr']
enh_per_part = {}
for p in PARTS:
    rows = enh_rows[p]
    lvls = sorted(rows)
    assert lvls == list(range(len(lvls))), p
    for r in rows.values():
        assert r['enhanceAttr'] == ENH_ATTRS
        # blessing / selectable stones are configured off in this version
        assert not any(r.get('itemBaseRate', [])) and not any(r.get('selectCostItem', [])) and not r.get('BlessLimit')
    cost_items = {rows[l].get('CostItem') for l in lvls if rows[l].get('CostNum')}
    assert len(cost_items) == 1, cost_items
    enh_per_part[p] = {
        'values': [[num(rows[l]['attrNum'][i]) for l in lvls] for i in range(len(ENH_ATTRS))],
        'costItem': item_ref(cost_items.pop()),
        'cost': [rows[l].get('CostNum', 0) for l in lvls],
    }
enh_tables, enh_index = dedupe(enh_per_part)
enhance = {'maxLevel': len(enh_tables[0]['cost']) - 1, 'attrs': [key(a) for a in ENH_ATTRS],
           'tables': enh_tables, 'partTable': enh_index}

ref_rows_lv = defaultdict(dict)
for r in load('equip_refine'):
    ref_rows_lv[r['RefinePart']][r['RefineLevel']] = r
REF_ATTRS = ref_rows_lv[PARTS[0]][0]['refineAttr']
ref_per_part = {}
for p in PARTS:
    rows = ref_rows_lv[p]
    lvls = sorted(rows)
    assert lvls == list(range(len(lvls))), p
    levels = []
    for l in lvls:
        r = rows[l]
        assert r['refineAttr'] == REF_ATTRS and not r.get('AddRate')
        s, k, d = r.get('SuccessRate', 0), r.get('RetentionRate', 0), r.get('DemotionRate', 0)
        last = l == lvls[-1]
        assert last or s + k + d == 10000, (p, l)
        levels.append({
            'lv': l,
            'flat': [num(x) for x in r['refineNum']],
            'base': num(r.get('BaseAttr', 0)),
            'random': num(r.get('RandomAttr', 0)),
            'success': num(s / 10000), 'retain': num(k / 10000), 'demote': num(d / 10000),
            'cost': [] if last else [[item_ref(i), n] for i, n in zip(r.get('refineRes', []), r.get('resNum', [])) if i and n],
            'protect': [item_ref(r['PityItemEntry']), r.get('PityItemNum', 0)] if (d and r.get('PityItemEntry')) else None,
        })
    ref_per_part[p] = {'levels': levels}
ref_tables, ref_index = dedupe(ref_per_part)
refine = {'maxLevel': len(ref_tables[0]['levels']) - 1, 'attrs': [key(a) for a in REF_ATTRS],
          'tables': ref_tables, 'partTable': ref_index}

enhance_resonance = [{
    'level': r['AchievementLevel'], 'parts': r['PartCount'], 'enhance': r['EnhanceRequest'],
    'attrs': {key(a): num(v) for a, v in zip(r['enhanceAchievementAttr'], r['enhanceAchievementNum'])},
} for r in sorted(load('equip_enhance_achievement'), key=lambda r: r['AchievementLevel'])]
refine_resonance = [{
    'level': r['AchievementLevel'], 'parts': r['PartCount'], 'refine': r['RefineRequest'],
    'attrs': {key(a): num(v) for a, v in zip(r['refineAchievementAttr'], r['refineAchievementNum'])},
} for r in sorted(load('equip_refine_achievement'), key=lambda r: r['AchievementLevel'])]

# ---------------------------------------------------------------- enchant
ENCHANT_UNLOCK = {1: 3, 2: 12}  # Variables.ENCHANT1_UNLOCK_LEVEL / ENCHANT2_UNLOCK_LEVEL (Cross.dll defaults)
ench_levels = [{
    'category': r['EnchantCategory'], 'level': r['EnchantLevel'], 'name': L(f"quality_txt_{r['EnchantLevel']}"),
    'lines': r.get('EnchantMaxNum', 0), 'upgradeExp': r.get('UpgradeExp', 0),
    'item': item_ref(r['EnchantItem']), 'lockCost': r.get('lockCost', []),
} for r in sorted(load('enchant_level_info'), key=lambda r: (r['EnchantCategory'], r['EnchantLevel']))]
quality_odds = []
for r in sorted(load('enchant_quality_weight'), key=lambda r: r['EnchantLevel']):
    qs, ws = parse_list(r['EnchantQuality']), parse_list(r['EnchantQualityWeight'])
    tot = sum(ws)
    quality_odds.append({'level': r['EnchantLevel'], 'odds': [[q, w, num(w / tot)] for q, w in zip(qs, ws)]})

pool_rows = defaultdict(list)
for r in load('enchant_random_attr'):
    assert r.get('RandomAttrMinNum') == r.get('RandomAttrMaxNum') and not r.get('RandomAttrStep'), r['Entry']
    pool_rows[(r['EquipPart'], r['EnchantCategory'], r['EnchantQuality'])].append(r)
ALL_SPECS = sorted({s for rows in pool_rows.values() for r in rows for s in r.get('careerSpec', [])})
pools, pool_index = [], {}
for (p, c, q) in sorted(pool_rows):
    rows = sorted(pool_rows[(p, c, q)], key=lambda r: (r.get('SortOrder', 0), r['Entry']))
    totals = {s: sum(r['Weight'] for r in rows if s in r.get('careerSpec', [])) for s in ALL_SPECS}
    assert len(set(totals.values())) == 1, ('spec-dependent pool total', p, c, q, totals)
    total = totals[ALL_SPECS[0]]
    opts = []
    for r in rows:
        o = {'attr': key(r['RandomAttrClass']), 'v': num(r['RandomAttrMinNum']), 'w': r['Weight'],
             'p': num(r['Weight'] / total)}
        if sorted(r.get('careerSpec', [])) != ALL_SPECS:
            o['specs'] = r.get('careerSpec', [])
        if r.get('IsRare'):
            o['rare'] = 1
        if r.get('IsNew'):
            o['new'] = 1
        rec = parse_list(r.get('RecommendAttr'))
        if rec:
            o['rec'] = rec
        dup = parse_list(r.get('DecreaseWeight'))
        if dup:
            o['dup'] = dup
        opts.append(o)
    pool = {'total': total, 'options': opts}
    if pool not in pools:
        pools.append(pool)
    pool_index.setdefault(p, {}).setdefault(c, [None] * 6)[q - 1] = pools.index(pool)
enchant = {
    'unlockRefine': ENCHANT_UNLOCK, 'maxLocks': 2, 'presets': 3, 'specs': ALL_SPECS,
    'qualityNames': {q: L(f'quality_txt_{q}') for q in range(1, 7)},
    'levels': ench_levels, 'qualityOdds': quality_odds, 'pools': pools, 'poolIndex': pool_index,
}

# ---------------------------------------------------------------- elite summon (equipment summon) and accessory drops
drops = defaultdict(list)
for r in load('equip_summon_drop'):
    drops[r['SummonLevel']].append((r['DropQuality'], r['DropWeight']))
summon_rows = sorted(load('equip_summon_info'), key=lambda r: r['SummonLevel'])
summon_levels = []
for i, r in enumerate(summon_rows):
    d = sorted(drops[r['SummonLevel']])
    tot = sum(w for _, w in d)
    is_max = i == len(summon_rows) - 1
    summon_levels.append({
        'level': r['SummonLevel'],
        'levelUp': None if is_max else {'stages': r.get('UpgradeStage', 0), 'item': item_ref(r['UpgradeItem']),
                                        'perStage': r.get('UpgradeNum', 0), 'seconds': r.get('UpgradeTime', 0)},
        'dropNum': r.get('DropNum', 0),
        'summonItem': [item_ref(r['SummonEliteItem']), r.get('SummonEliteNum', 0)],
        'summonLimit': r.get('SummonEliteLimit', 0),
        'showColor': r.get('ShowColor', 0),
        'multiDropEf': r.get('EfMultiEliteSummonDrop', 0),
        'odds': [[q, w, num(w / tot)] for q, w in d],
    })
summon = {
    'costPerSummon': [item_ref(18), 1], 'dropMultipliers': [1, 2, 4],          # ELITE_SUMMON_SINGLE_COST / _DROP_MULTIPLIER
    'speedup': {'item': item_ref(19), 'itemSeconds': 60, 'adSeconds': 1800, 'adDaily': 3},  # ELITE_SUMMON_SPEEDUP_*
    'bagCapacity': 200,                                                          # EQUIP_BAG_CAPACITY
    'levels': summon_levels,
}

acc = defaultdict(list)
for r in load('accessory_drop'):
    acc[r['QualityGroup']].append((r['DropQuality'], r['DropWeight']))
accessory_drops = []
for r in sorted(load('team_pve_stage_info'), key=lambda r: r.get('StageIdx', r['Entry'])):
    d = sorted(acc.get(r.get('QualityGroup'), []))
    tot = sum(w for _, w in d) or 1
    accessory_drops.append({'stage': r.get('StageIdx', r['Entry']), 'name': L(r.get('Name')),
                            'unlockMainStage': r.get('UnlockMainStage', 0),
                            'odds': [[q, w, num(w / tot)] for q, w in d if w]})

# ---------------------------------------------------------------- materials referenced anywhere above
materials = {}
for i in sorted(used_items):
    r = items_info.get(i, {})
    desc = re.sub(r'\[/?(color|size)[^\]]*\]', '', L(r.get('Description'), ''))
    materials[i] = {'name': L(r.get('Name'), f'item {i}'), 'desc': desc}

out = {
    'source': 'Ragnarok: GO SEA 0.0.163 client config',
    'builds': builds, 'parts': parts, 'showQualities': show_qualities, 'qualities': qualities,
    'materials': materials, 'items': items, 'enhance': enhance, 'refine': refine,
    'enhanceResonance': enhance_resonance, 'refineResonance': refine_resonance,
    'enchant': enchant, 'summon': summon, 'accessoryDrops': accessory_drops,
}
path = os.path.join(OUT, 'equipment.json')
json.dump(out, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'equipment.json {os.path.getsize(path) // 1024} KB ({os.path.getsize(path)} bytes)')
