"""Export the non-gear power systems as one compact JSON file.

usage: python3 -I scripts/export_systems.py <tables dir> <out dir>

<tables dir> holds the exported config tables (<name>.json, a list of rows with real field
names; repeated fields use the lowercase C# backing name). Writes <out dir>/systems.json with
one section per system: weapons, legacy (Collection Gear), pets, awakening, guild, treasure,
cards (slots + collection bonus), avatars (costumes) and titles. Shapes and the rules the UI
must apply are documented in ../../packages/game/src/data/systems.ts.

Attr maps are keyed "<attr id>:<KeyEn>" like cards.json. Values are the table numbers
(0.05 = 5% for percent attrs). Formula-driven tables are exported as base values plus
per-level arrays instead of exploded rows.
"""
import json
import os
import re
import sys

T, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)


def load(name):
    return json.load(open(os.path.join(T, name + '.json')))


lang = {r['Id']: r.get('Text', '') for r in load('lang_en_server')}
lang.update({r['Id']: r.get('Text', '') for r in load('lang_en')})
TAG = re.compile(r'\[/?(?:color|size)[^\]]*\]')


def L(key, fallback=None):
    if not key:
        return fallback or ''
    return lang.get(key, key if fallback is None else fallback)


def fill(text, args):
    return re.sub(r'%\{(\d+)\}', lambda m: str(args[int(m.group(1)) - 1])
                  if int(m.group(1)) <= len(args) else m.group(0), text)


def text(key, args=()):
    return TAG.sub('', fill(L(key, ''), list(args))).strip()


def num(v):
    if isinstance(v, float):
        v = round(v, 6)
        return int(v) if v.is_integer() else v
    return v


def ints(raw):
    """Table cells like "[1,2]", "0" or "" -> list of numbers."""
    if raw in (None, '', '0', 0):
        return []
    if isinstance(raw, list):
        return raw
    v = json.loads(raw)
    return v if isinstance(v, list) else [v]


fight_attr = {r['EnumValue']: r for r in load('fight_attr')}


def key(a):
    return f"{a}:{fight_attr.get(a, {}).get('KeyEn', '?')}"


def pairs(ps):
    """[(attr id, value)] -> {"<id>:<KeyEn>": value}; id 0 marks an unused column."""
    return {key(a): num(v) for a, v in ps if a}


def amap(ids, vals):
    """Parallel attr/value columns (the client zips them to the shorter length)."""
    return pairs(zip(ids or [], vals or []))


items = {r['Entry']: r for r in load('item_info')}
cards = {r['Entry']: r for r in load('card_info')}
legacy_info = {r['Entry']: r for r in load('legacy_info')}
pet_info = {r['Entry']: r for r in load('pet_info')}


def item_name(i):
    r = items.get(i)
    return L(r['Name'], '') if r else ''


ASSET = {20: 'item', 30: 'equip', 40: 'weapon', 50: 'card', 55: 'legacy', 60: 'pet'}  # enums ASSET_CATEGORY


def asset_name(cat, i):
    src = {20: (items, 'Name'), 50: (cards, 'Name'), 55: (legacy_info, 'Name'), 60: (pet_info, 'Name')}.get(cat)
    if src and i in src[0]:
        return L(src[0][i][src[1]], '')
    return ''


def rewards(raw):
    """"[cat,id,num]" or "[[cat,id,num],...]" -> [{type,id,num,name}] (RewardUtils.ParseRewardItemToAssetData)."""
    v = ints(raw)
    if not v:
        return []
    rows = v if isinstance(v[0], list) else [v]
    return [{'type': ASSET.get(c, str(c)), 'id': i, 'num': n, 'name': asset_name(c, i)} for c, i, n in rows]


def cost(item, n):
    return {'item': item, 'name': item_name(item), 'num': n} if item and n else None


fight_brand = {r['Entry']: r for r in load('fight_brand')}
brands_by_skill = {}
for r in fight_brand.values():
    if r.get('SkillEntry'):
        brands_by_skill.setdefault((r['SkillEntry'], r.get('SkillLevel', 0)), []).append(r)


def brand(i):
    b = fight_brand.get(i)
    return {'id': i, 'text': text(b['Description'], b.get('desArg', []))} if b else None


def skill_brand(skill, spec=None):
    """Level-1 brand of a skill (AwakenCfg.GetFightBrandDesc, PetInfoSkillCell). A few awakening skills
    are shared by spec 41 and 42 and carry one brand per spec: brand Entry digit 3 = spec digit 2."""
    bs = brands_by_skill.get((skill, 1), [])
    if spec and len(bs) > 1:
        bs = [b for b in bs if str(b['Entry'])[2:3] == str(spec)[1:2]] or bs
    return brand(bs[0]['Entry']) if bs else None


fight_skill = {r['Entry']: r for r in load('fight_skill')}
quality_names = {q: L(f'quality_txt_{q}', '') for q in range(1, 11)}
acq = {r['Entry']: L(r['AcquisitionName']) for r in load('acquisition_info')}

# ---------------------------------------------------------------- specs and careers
br_rows = {r['EnumValue']: r for r in load('fight_battle_rate')}


def spec_ratio(attr, spec):
    r = br_rows[attr]
    s = r.get('specEntry', [])
    return r['specBrRatio'][s.index(spec)] if spec in s and s.index(spec) < len(r['specBrRatio']) else None


career_spec = {r['Entry']: r for r in load('career_spec')}
weapon_info = load('weapon_info')
SPEC_IDS = sorted(set(career_spec) | {r['CareerBuild'] for r in weapon_info})
specs = {}
for s in SPEC_IDS:
    p = spec_ratio(1100, s)
    specs[s] = {'name': L(f'spec_name_{s}'), 'careerKind': s // 10 * 100,
                'damage': 'magic' if p == 0 else 'physical', 'released': s in career_spec}
careers = {}
for r in load('career_info'):
    careers[r['Entry']] = {'name': L(r['CareerName']), 'kind': r['CareerKind'], 'tierStage': r['TierStage'],
                           'specs': [s for s in SPEC_IDS if specs[s]['careerKind'] == r['CareerKind']]}

# ---------------------------------------------------------------- weapons
up_rows = load('weapon_upgrade')
by_show = {}
for r in up_rows:
    by_show.setdefault(r['WeaponShowQuality'], {})[r['WeaponStar']] = r
max_star = max(r['WeaponStar'] for r in up_rows)
first = by_show[min(by_show)]
for rows in by_show.values():
    assert sorted(rows) == list(range(1, max_star + 1))
    assert all((rows[s]['EquipedAttrFactor'], rows[s]['InventoryAttrFactor']) ==
               (first[s]['EquipedAttrFactor'], first[s]['InventoryAttrFactor']) for s in rows), 'factors differ by quality'
levelups = load('weapon_levelup')
assert len(levelups) == 1 and levelups[0]['EquipedAttrFactor'] == 1, 'weapon level now matters; export it'

builds = []
for spec in SPEC_IDS:
    rows = sorted((r for r in weapon_info if r['CareerBuild'] == spec), key=lambda r: r['WeaponQuality'])
    if not rows:
        continue
    ws = []
    for r in rows:
        eq = list(zip(r['equipedAttr'], r['equipedAttrNum']))
        inv = list(zip(r['inventoryAttr'], r['inventoryAttrNum']))
        ws.append({'q': r['WeaponQuality'], 'name': L(r['Name']), 'sub': r['ShowSubQuality'], 'show': r['ShowQuality'],
                   'equip': pairs(eq[:1]), 'equipFlat': pairs(eq[1:]), 'inv': pairs(inv[:1]), 'invFlat': pairs(inv[1:]),
                   'desc': L(r['LiteralDescription'], '')})
    builds.append({'spec': spec, 'specName': specs[spec]['name'], 'released': specs[spec]['released'],
                   'category': rows[0]['Category'], 'categoryName': L(f"weapon_category_{rows[0]['Category']}"),
                   'weapons': ws})

tasks = {r['Entry']: r for r in load('task_info')}
achievements = []
for r in sorted(load('weapon_achievement'), key=lambda r: r['Entry']):
    t = tasks.get(r['TaskEntry'], {})
    show = (t.get('arg') or [0])[0]
    achievements.append({'id': r['Entry'], 'task': r['TaskEntry'], 'show': show, 'stars': t.get('Progress', 0),
                         'text': f"{quality_names.get(show, show)} weapons: {t.get('Progress', 0)} total stars",
                         'attrs': amap(r.get('rewardAttr'), r.get('rewardAttrNum')),
                         'reward': rewards(r.get('RewardItem'))})

summon_info = {r['Entry']: r for r in load('summon_info')}
SUMMON_NAME = {1000: acq.get(26, ''), 2000: acq.get(27, ''), 10000: acq.get(17, '')}  # pools without a Name key


def summon(entry):
    s = summon_info.get(entry)
    if not s:
        return None
    out = {'id': entry, 'name': L(s.get('Name'), '') or SUMMON_NAME.get(entry, ''), 'cost': cost(s['CostType'], s['CostNum']),
           'multi': {'draws': s['MulNum'], 'cost': cost(s['CostType'], s['MulCostNum'])} if s['MulNum'] else None,
           'ticket': cost(s['RepType'], s['RepNum']), 'freePerDay': s['DayFreeTimes'], 'adPerDay': s['DayAdTimes']}
    if s.get('ShowProbability'):
        out['shownOdds'] = [{'group': L(g[2]), 'rate': g[3]} for g in json.loads(s['ShowProbability'])]
    return out


def odds(qs, ws):
    tot = sum(ws)
    return {str(q): num(w / tot) for q, w in zip(qs, ws) if w}


weapon_gacha = [{'level': r['WeaponGachaLevel'], 'drawsToNext': r['CostNum'],
                 'odds': odds(ints(r['WeaponGachaQuality']), ints(r['WeaponGachaWeight'])),
                 'topShow': r['TopShowQuality'], 'reward': rewards(r['LevelArchievement'])}
                for r in sorted(load('weapon_gacha_levelup'), key=lambda r: r['WeaponGachaLevel'])]

weapons = {
    'maxStar': max_star,
    'starFactor': {'equip': [num(first[s]['EquipedAttrFactor']) for s in range(1, max_star + 1)],
                   'inv': [num(first[s]['InventoryAttrFactor']) for s in range(1, max_star + 1)]},
    'starCost': {str(q): [by_show[q][s]['CostNum'] for s in range(1, max_star + 1)] for q in sorted(by_show)},
    'builds': builds,
    'achievements': achievements,
    'summonLevels': weapon_gacha,
    'summon': summon(1000),
}

# ---------------------------------------------------------------- Collection Gear (legacy_*)
cat_rows = {r['Entry']: r for r in load('legacy_category_info')}
legacy_up = {}
for r in load('legacy_upgrade'):
    legacy_up.setdefault(r['LegacyEntry'], []).append(r)


def specs_of(career_raw):
    out = []
    for c in ints(career_raw):
        out += [s for s in careers.get(c, {}).get('specs', []) if s not in out]
    return sorted(out)


legacy_items = []
for e, r in sorted(legacy_info.items(), key=lambda kv: (kv[1]['Category'], kv[1]['Quality'], kv[0])):
    tr = ints(r.get('ShardItemTransfer'))
    stars = [{'star': u['Star'], 'shards': u['ShardCostNum'], 'equip': amap(u['equipedAttr'], u['equipedAttrNum']),
              'brand': brand(u['EquipedBrand']), 'inv': amap(u['inventoryAttr'], u['inventoryAttrNum'])}
             for u in sorted(legacy_up.get(e, []), key=lambda u: u['Star'])]
    legacy_items.append({
        'id': e, 'name': L(r['Name']), 'quality': r['Quality'], 'category': r['Category'], 'baseLevel': r['BaseLevel'],
        'careers': ints(r['Career']), 'specs': specs_of(r['Career']),
        'shard': {'item': r['Shard'], 'name': item_name(r['Shard'])}, 'dupShards': r['DuplicateShardRatio'],
        'shardTransfer': {'shards': tr[0], 'item': tr[1], 'name': item_name(tr[1]), 'num': tr[2]} if len(tr) == 3 else None,
        'acquisition': [acq.get(a, str(a)) for a in ints(r.get('Acquisition'))],
        'desc': L(r.get('LiteralDescription'), ''), 'stars': stars})

enh = {}
for r in load('legacy_enhance'):
    enh.setdefault(r['EnhancePart'], {})[r['EnhanceLevel']] = r
parts = sorted(enh)
p0 = enh[parts[0]]
lv = sorted(p0)
assert lv == list(range(0, len(lv)))
for p in parts:
    assert all((enh[p][l]['enhanceAttr'], enh[p][l]['enhanceAttrNum'], enh[p][l]['CostItem'], enh[p][l]['CostNum']) ==
               (p0[l]['enhanceAttr'], p0[l]['enhanceAttrNum'], p0[l]['CostItem'], p0[l]['CostNum']) for l in lv), p
assert all(len(set(p0[l]['enhanceAttrNum'])) == 1 for l in lv), 'enhance attrs no longer share one value'
enhance_items = sorted({p0[l]['CostItem'] for l in lv if p0[l]['CostNum']})
assert len(enhance_items) == 1

suit_fx = {}
for r in load('legacy_suit_effect'):
    suit_fx.setdefault(r['SuitEntry'], []).append(r)
suits = []
for r in sorted(load('legacy_suit'), key=lambda r: r['SuitOrder']):
    suits.append({'id': r['Entry'], 'name': L(r['SuitName']), 'parts': ints(r['SuitPart']), 'careers': ints(r['Career']),
                  'specs': specs_of(r['Career']),
                  'tiers': [{'star': f['Star'], 'equip': amap(f['equipedAttr'], f['equipedAttrNum']),
                             'brand': brand(f['SuitBrand']), 'inv': amap(f['inventoryAttr'], f['inventoryAttrNum'])}
                            for f in sorted(suit_fx.get(r['Entry'], []), key=lambda f: f['Star'])]})

legacy = {
    'slots': {str(s): L(f'legacy_slot_name_{s}') for s in range(1, 9)},
    'categories': [{'id': c, 'name': L(r['Name']), 'slots': ints(r['AllowSlot']), 'twoHanded': r['TotalSlot'] == 1}
                   for c, r in sorted(cat_rows.items())],
    'items': legacy_items,
    'enhance': {'parts': parts, 'maxLevel': lv[-1], 'attrs': [key(a) for a in p0[0]['enhanceAttr']],
                'costItem': {'item': enhance_items[0], 'name': item_name(enhance_items[0])},
                'value': [num(p0[l]['enhanceAttrNum'][0]) for l in lv],
                'cost': [p0[l]['CostNum'] for l in lv]},
    'suits': suits,
    'collectionBonus': [{'totalStar': r['ReqTotalStar'], 'reward': rewards(r['RewardItem'])}
                        for r in sorted(load('legacy_collection_bonus'), key=lambda r: r['ReqTotalStar'])],
    'summonProgress': [{'group': r['SummonShareGroup'], 'round': r['Round'], 'draws': r['Progress'],
                        'reward': rewards(r['Reward']), 'bigPrize': bool(r['BigPrize'])}
                       for r in sorted(load('legacy_gacha_progress_reward'), key=lambda r: r['Entry'])],
    'summon': [summon(e) for e in (10000, 11000, 12000, 13000, 14000) if e in summon_info],
}

# ---------------------------------------------------------------- pets
pet_lv = {}
for r in load('pet_levelup'):
    pet_lv.setdefault(r['PetEntry'], {})[r['Level']] = r


def curve_sig(rows):
    return json.dumps([[rows[l][k] for k in ('CostNum', 'guardAttr', 'guardAttrNum', 'inventoryAttr', 'inventoryAttrNum',
                                             'InheritMasterAtkRatio', 'FightBattleRate')] for l in sorted(rows)])


curves, pet_curve = {}, {}
for e, p in sorted(pet_info.items()):
    rows = pet_lv[e]
    sig = curve_sig(rows)
    cid = str(p['PetQuality'])
    if cid in curves:
        assert curves[cid][0] == sig, f'pet {e} level table differs from its quality'
    else:
        lvls = sorted(rows)
        assert lvls == list(range(1, len(lvls) + 1))

        def cols(ids_k, vals_k):
            out = {}
            for i, a in enumerate(rows[1][ids_k]):
                col = [num(rows[l][vals_k][i]) for l in lvls]
                if any(col):
                    out[key(a)] = col
            return out

        curves[cid] = (sig, {'maxLevel': lvls[-1], 'cost': [rows[l]['CostNum'] for l in lvls],
                             'inherit': [num(rows[l]['InheritMasterAtkRatio']) for l in lvls],
                             'battleRate': [num(rows[l]['FightBattleRate']) for l in lvls],
                             'guard': cols('guardAttr', 'guardAttrNum'), 'inv': cols('inventoryAttr', 'inventoryAttrNum')})
    pet_curve[e] = cid

pet_skills = {}
for r in load('pet_skill'):
    pet_skills.setdefault(r['PetEntry'], []).append(r)
KIND = {0: L('client_10078'), 1: L('client_10079'), 2: L('client_10080')}


def pet_skill(r):
    s = fight_skill.get(r['SkillEntry'], {})
    b = skill_brand(r['SkillEntry'])
    return {'idx': r['Idx'], 'kind': r['SkillKind'], 'kindName': KIND.get(r['SkillKind'], ''), 'unlockLevel': r['UnlockPetLevel'],
            'skill': r['SkillEntry'], 'name': L(s.get('ShowName'), ''), 'text': b['text'] if b else '',
            'cd': num(s.get('BaseCooldown', 0) + s.get('VariableCooldown', 0)), 'cast': num(s.get('BaseSingTime', 0))}


pets = {
    'pets': [{'id': e, 'name': L(p['Name']), 'quality': p['PetQuality'], 'show': p['ShowQuality'], 'curve': pet_curve[e],
              'own': amap(p['attr'], p['attrNum']), 'acquisition': [acq.get(a, str(a)) for a in ints(p.get('Acquisition'))],
              'skills': [pet_skill(r) for r in sorted(pet_skills.get(e, []), key=lambda r: r['Idx'])]}
             for e, p in sorted(pet_info.items())],
    'levels': {cid: v[1] for cid, v in sorted(curves.items())},
    'summonLevels': [{'level': r['GachaLevel'], 'drawsToNext': r['CostNum'],
                      'odds': odds(ints(r['GachaQuality']), ints(r['GachaWeight'])), 'guardSlots': r['PetGuardSlot'],
                      'topShow': r['TopShowQuality'], 'grade': r['GachaGrade'], 'reward': rewards(r['LevelArchievement'])}
                     for r in sorted(load('pet_gacha_levelup'), key=lambda r: r['GachaLevel'])],
    'summon': summon(2000),
    'slotNames': {'fight': L('scheme_pet_fight'), 'guard': L('scheme_pet_guard')},
}

# ---------------------------------------------------------------- awakening
tiers = {}
for r in load('awaken_tier'):
    tiers.setdefault(r['AwakenEntry'], []).append(r)
awakening = []
for r in sorted(load('awaken_info'), key=lambda r: (r['CareerSpec'], r['AwakenCategory'])):
    spec, gate = r['CareerSpec'], r['AwankenRequestAttr']
    ts = []
    for t in sorted(tiers.get(r['Entry'], []), key=lambda t: t['AwakenTierIndex']):
        sk = t['SkillEntry']
        b = skill_brand(sk, spec) if sk else None
        ts.append({'tier': t['AwakenTierIndex'], 'req': num(t['AwakenTierRequestNum']),
                   'kind': 'skill' if t['AwakenShowCategory'] == 0 else 'stat',
                   'attrs': amap(t['awakenTierAttr'], t['awakenTierNum']),
                   'skill': {'id': sk, 'name': L(fight_skill.get(sk, {}).get('ShowName'), ''),
                             'text': b['text'] if b else ''} if sk else None})
    awakening.append({'id': r['Entry'], 'spec': spec, 'specName': specs.get(spec, {}).get('name', ''),
                      'released': specs.get(spec, {}).get('released', False), 'line': r['AwakenCategory'],
                      'name': L(r['AwakenSkillName']), 'desc': text(r['AwakenSkillDes']),
                      'gate': key(gate), 'gateName': L(fight_attr.get(gate, {}).get('Name'), ''),
                      'acquisition': [acq.get(a, str(a)) for a in ints(r.get('AwakenAcquisition'))], 'tiers': ts})

# ---------------------------------------------------------------- guild skills
g_levels = {}
for r in load('guild_skill_level'):
    g_levels.setdefault(r['SkillEntry'], []).append(r)
GKIND = {1: L('guild_tech_tab_member'), 2: L('guild_tech_tab_mastery'), 3: 'Guild Hunt privilege'}
EFKIND = {1: 'idle resources', 2: 'idle base & job EXP', 3: 'summon level & guild tech upgrade time', 4: 'guild coins',
          5: 'guild tech cores', 6: 'max-quality equipment drop rate'}  # from each level's Des text
guild = {
    'skills': [{'id': e, 'name': L(g['Name']), 'kind': g['GuildSkillKind'], 'kindName': GKIND.get(g['GuildSkillKind'], ''),
                'stats': g['EfPipe'] == 1, 'category': g['Category'], 'unlockGuildLevel': g['UnlockGuildLevel'],
                'maxLevel': g['MaxLevel'], 'durationSec': g['Duration'],
                'levels': [{'level': r['Level'], 'researchSec': r['ResearchTime'], 'cost': cost(r['CostItem'], r['CostNum']),
                            'attrs': amap(r.get('attr'), r.get('attrNum')), 'brand': brand(r['Brand']),
                            'effect': {'kind': r['EfKind'], 'name': EFKIND.get(r['EfKind'], ''), 'value': num(r['EfNum'])}
                            if r['EfKind'] else None,
                            'text': text(r['Des'], r.get('desArg', []))}
                           for r in sorted(g_levels.get(e, []), key=lambda r: r['Level'])]}
               for e, g in sorted({r['Entry']: r for r in load('guild_skill')}.items())],
    'huntRankRewards': [{'tier': r['Entry'], 'name': L(r['TierName']), 'maxRank': r['MaxRank'], 'minScore': r['MinScore'],
                         'skills': [{'id': s, 'level': lv} for s, lv in ints(r['RewardGuildSkills'])]}
                        for r in sorted(load('guild_boss_rank_reward'), key=lambda r: r['Entry'])],
}

# ---------------------------------------------------------------- treasure (event pools)
TREASURE = {1: ('legacy', 15001, 'treasure_pity_name_legacy'), 2: ('avatar', 15002, 'treasure_pity_name_avatar'),
            3: ('card', 15003, 'treasure_pity_name_card')}
avatar_new = {r['AvatarEntry']: r for r in load('avatar_new_info')}
avatar_res = {}
for r in load('avatar_res_info'):
    avatar_res.setdefault(r['AvatarEntry'], {})[r['CareerSpec']] = r


def avatar_names(e):
    """Name per spec (index 0 of avatarName = male). Weapon looks are named per build."""
    out = {}
    for s, r in sorted(avatar_res.get(e, {}).items()):
        n = L((r.get('avatarName') or [''])[0], '')
        if n:
            out[str(s)] = n
    return out


def avatar_name(e):
    """{name} when every spec shares one name, else {name: first, names: per spec}."""
    ns = avatar_names(e)
    vals = list(ns.values())
    return {'name': vals[0] if vals else ''} if len(set(vals)) <= 1 else {'name': vals[0], 'names': ns}


def display_core(kind, raw):
    out = []
    for g in ints(raw):
        for i in (g if isinstance(g, list) else [g]):
            if kind == 'card':
                out.append({'type': 'card', 'id': i, 'name': asset_name(50, i)})
            elif kind == 'avatar':
                out.append({'type': 'avatar', 'id': i, 'name': avatar_name(i)['name']})
            else:
                out.append({'type': kind, 'id': i, 'name': asset_name(55, i)})
    return out


treasure = []
for r in sorted(load('treasure_info'), key=lambda r: r['Entry']):
    kind, name_e, pity = TREASURE.get(r['EventChildType'], ('?', 0, ''))
    treasure.append({'id': r['Entry'], 'type': r['EventChildType'], 'feeds': kind, 'name': L(f'summon_name_{name_e}', ''),
                     'pityName': L(pity, ''), 'maxLuck': r['MaxLuck'], 'summon': summon(r['SummonEntry']),
                     'exchangeItem': {'item': r['ExchangeItem'], 'name': item_name(r['ExchangeItem'])},
                     'featured': display_core(kind, r.get('DisplayCore')),
                     'progressRewards': [{'draws': p[0], 'reward': rewards(json.dumps(p[1:]))} for p in ints(r['ProgressReward'])]})

# ---------------------------------------------------------------- cards: slots and collection bonus
cards_sys = {
    'slotCategories': {str(c): L(f'card_slot_category_{c}') for c in range(1, 7)},
    'slots': [{'entry': r['Entry'], 'category': r['CardSlotCateory'], 'idx': r['Idx'], 'unlockLevel': r['UnlockBaseLevel']}
              for r in sorted(load('card_slot_info'), key=lambda r: (r['CardSlotCateory'], r['Idx']))],
    'collectionBonus': [{'totalStar': r['ReqTotalStar'], 'reward': rewards(r['RewardItem'])}
                        for r in sorted(load('card_collection_bonus'), key=lambda r: r['ReqTotalStar'])],
}

# ---------------------------------------------------------------- avatars (costumes) and titles
stage_info = {r['Entry']: r for r in load('stage_info')}


def avatar_unlock(r):
    k, args = r['UnlockKind'], r.get('unlockArg') or []
    if k == 1:
        return {'kind': 1, 'text': text(r['UnlockDes'], [L(f'career_tier_stage_{args[0]}')]), 'jobStage': args[0]}
    if k == 2:
        return {'kind': 2, 'text': text(r['UnlockDes']), 'cost': cost(args[0], args[1] if len(args) > 1 else 1)}
    if k == 3:
        return {'kind': 3, 'text': text(r['UnlockDes'], [quality_names.get(args[0], args[0])]), 'weaponShow': args[0]}
    return {'kind': k, 'text': text(r['UnlockDes'])}


avatars = {
    'categories': {str(c): text(f'avatar_tip_category_{c}').replace('Appearance - ', '') for c in range(1, 7)},
    'items': [{'id': e, 'category': r['Category'], 'quality': r['Quality'], 'progress': r['Progress'],
               **avatar_name(e), 'unlock': avatar_unlock(r), 'attrs': amap(r.get('unlockAttr'), r.get('unlockAttrNum'))}
              for e, r in sorted(avatar_new.items(), key=lambda kv: (kv[1]['Category'], kv[1]['Quality'], kv[0]))],
    'progressRewards': [{'progress': r['ReqProgress'], 'attrs': amap(r['rewardAttr'], r['rewardAttrNum'])}
                        for r in sorted(load('avatar_progress_reward'), key=lambda r: r['ReqProgress'])],
}


def title_text(r):
    """TitleCfg.GetTitleDescription."""
    k, a = r['UnlockKind'], (r.get('unlockArg') or []) + [0, 0]
    if k == 1:
        return text(r['TitleDes'], [item_name(a[0])])
    if k == 2:
        return text(r['TitleDes'], [L(f'career_tier_stage_{a[0]}')])
    if k == 3:
        return text(r['TitleDes'], [stage_info.get(a[0], {}).get('CampaignIdx', 0)])
    if k in (4, 5, 6, 7):
        return text(r['TitleDes'], [a[0]])
    if k == 8:
        return text(r['TitleDes'], [quality_names.get(a[0], a[0])])
    if k in (9, 10):
        return text(r['TitleDes'], [a[0], a[1]] if a[0] > 0 and a[1] > 0 and a[0] != a[1] else [a[0]])
    return text(r['TitleDes'])


title_fields = {k for r in load('player_title_info') for k in r}
assert not any('attr' in k.lower() for k in title_fields), 'titles now carry attrs; export them'
titles = [{'id': r['Entry'], 'name': L(r['TitleName']), 'grade': r['Grade'], 'unlockKind': r['UnlockKind'],
           'text': title_text(r), 'timedSec': r['DurationSec'] if r['IsTimed'] else 0, 'hiddenUntilUnlocked': bool(r['HideCondition'])}
          for r in sorted(load('player_title_info'), key=lambda r: (r['Sort'], r['Entry']))]

# ---------------------------------------------------------------- write
systems = {
    'meta': {'client': 'SEA 0.0.163', 'qualityNames': {str(k): v for k, v in quality_names.items()},
             'specs': {str(k): v for k, v in specs.items()},
             'careers': {str(k): v for k, v in careers.items()}},
    'weapons': weapons,
    'legacy': legacy,
    'pets': pets,
    'awakening': awakening,
    'guild': guild,
    'treasure': treasure,
    'cards': cards_sys,
    'avatars': avatars,
    'titles': {'hasStats': False, 'titles': titles},
}
path = os.path.join(OUT, 'systems.json')
json.dump(systems, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'systems.json {os.path.getsize(path) // 1024} KB')
for k, v in systems.items():
    print(f'  {k}: {len(json.dumps(v, ensure_ascii=False, separators=(",", ":"))) // 1024} KB')
