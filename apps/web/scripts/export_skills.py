"""Export jobs, levels and skills for the guide.

usage (from apps/web/): python3 -I scripts/export_skills.py <tables dir> <out dir>

<tables dir> holds the exported config tables (<name>.json, rows with real field names).
Writes <out dir>/jobs.json and <out dir>/skills.json. Shapes are documented in
../../packages/game/src/data/skills.ts. Attr maps are keyed "<id>:<KeyEn>" like cards.json.

How a skill's numbers are derived (see skills.ts for the [code]/[data]/[inferred] tags):
  skill -> fight_skill_cast (per cast state) -> SPEBulletCast / SPETask -> fight_bullet_cast
  -> fight_bullet (+ FSTCastBullet chains in the bullet's tasks). A skill at level L runs every
  fight_brand row with SkillLevel <= L; their tasks add to per-bullet / per-cast / per-skill
  attribute matrices ("mods"). The per-level summary is computed with the skill's own mods only;
  skills.ts has the helper that recombines mods across every learned skill of a build.
"""
import json
import math
import os
import re
import sys

T, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)


def load(name):
    return json.load(open(os.path.join(T, name + '.json')))


def write(name, data):
    path = os.path.join(OUT, name + '.json')
    json.dump(data, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f'{name}.json {os.path.getsize(path) // 1024} KB')


lang = {r['Id']: r.get('Text', '') for r in load('lang_en')}
COLOR = re.compile(r'\[/?color[^\]]*\]')


def L(key, *args):
    text = lang.get(key, key) if key else ''
    return COLOR.sub('', fill(text, args)) if args else COLOR.sub('', text)


def fill(text, args):
    return re.sub(r'%\{(\d+)\}', lambda m: str(args[int(m.group(1)) - 1]) if int(m.group(1)) <= len(args) else m.group(0), text)


fa = {r['EnumValue']: r['KeyEn'] for r in load('fight_attr')}


def key(a):
    return f"{a}:{fa.get(a, '?')}"


def num(v, nd=6):
    """Round floats (fixes 0.30000000000000004) and keep ints as ints."""
    if isinstance(v, float):
        v = round(v, nd)
        if v == int(v):
            return int(v)
    return v


def attrmap(ids, vals):
    out = {}
    for a, v in zip(ids or [], vals or []):
        out[key(a)] = num(v)
    return out


STAT_ORDER = ['str', 'agi', 'vit', 'int', 'dex', 'luk']

# ---------------------------------------------------------------------------------------------
# Shared lookups
# ---------------------------------------------------------------------------------------------
career = {r['Entry']: r for r in load('career_info')}
specs_cfg = {r['Entry']: r for r in load('career_spec')}
job_levels = sorted(load('jobLevel_info'), key=lambda r: r['UnlockJoblevel'])
job_by_entry = {r['Entry']: r for r in job_levels}
job_by_idx = {r['UnlockJoblevel']: r for r in job_levels}
career_skill = load('career_skill')
stage_info = {r['Entry']: r for r in load('stage_info')}
item_info = {r['Entry']: r for r in load('item_info')}
soldiers = load('fight_soldier')
TIER_NAME = {t: L(f'career_tier_stage_{t}') for t in range(0, 6)}


def stage_name(entry):
    s = stage_info.get(entry)
    return f"{s['CampaignIdx']}-{s['StageIdx']}" if s else str(entry)


def job_ref(idx):
    """Global job-level index (jobLevel_info.UnlockJoblevel) -> (tier, job level)."""
    r = job_by_idx.get(idx)
    return [r['TierStage'], r['JobLevel']] if r else None


# Spec ids: career_spec rows, plus builds that only exist in career_skill (42 Shoot Hunter).
spec_ids = sorted(set(specs_cfg) | {r['Build'] for r in career_skill})
spec_line = {s: specs_cfg[s]['CareerKind'] if s in specs_cfg else
             next(r['CareerKind'] for r in career_skill if r['Build'] == s) for s in spec_ids}


def normal_attack(spec):
    kind = spec_line[spec]
    for r in soldiers:  # IdleStageAdapterFV.NewNormalSkillData: first soldier with (Career, Spec), skills[0]
        if r.get('Career') == kind and r.get('Spec') == spec and r.get('skills'):
            return r['skills'][0]
    return None


# ---------------------------------------------------------------------------------------------
# jobs.json
# ---------------------------------------------------------------------------------------------
def task_text(t):
    """TaskUtils.GetTaskDescription for the trigger types job-change tasks use."""
    des, args, arg = t.get('Des', ''), t.get('desArg', []), t.get('arg', [])
    tt = t.get('TriggerType')
    if tt == 102 and arg and arg[0] in job_by_entry:
        j = job_by_entry[arg[0]]
        return L(des, TIER_NAME[j['TierStage']], j['JobLevel'])
    if tt == 201 and arg:
        s = stage_info.get(arg[0])   # MainStageNameDisplay.FormatShort
        name = L(s.get('Name'), s['CampaignIdx'], L(load_campaign().get(s['CampaignIdx'], '')), s['StageIdx']) if s else str(arg[0])
        return L(des, name, *args[1:2])
    if tt == 511 and len(args) > 1 and int(args[1]) in item_info:
        return L(des, args[0], L(item_info[int(args[1])].get('Name')))
    return L(des, *args)


_campaign = None


def load_campaign():
    global _campaign
    if _campaign is None:
        _campaign = {r['CampaignIdx']: r.get('Name', '') for r in load('campaign_info')}
    return _campaign


tasks_by_group = {}
for t in load('task_info'):
    tasks_by_group.setdefault(t.get('Group'), []).append(t)

groups = sorted(load('job_transfer_task_group'), key=lambda r: (r['TierStage'], r['TaskGroupIndex']))
job_change = []
for tier in sorted({g['TierStage'] for g in groups}):
    gs = []
    need_base, need_job, need_stage = 0, None, None
    for g in [g for g in groups if g['TierStage'] == tier]:
        tasks = []
        for t in sorted(tasks_by_group.get(g['Entry'], []), key=lambda t: t.get('Sort', 0)):
            tasks.append({'id': t['Entry'], 'type': t.get('TriggerType'), 'need': t.get('Progress'), 'text': task_text(t)})
            if t.get('TriggerType') == 101:
                need_base = max(need_base, t.get('Progress', 0))
            if t.get('TriggerType') == 102 and t['arg'][0] in job_by_entry:
                j = job_by_entry[t['arg'][0]]
                need_job = [j['TierStage'], j['JobLevel']]
            if t.get('TriggerType') == 201:
                need_stage = stage_name(t['arg'][0])
        need_base = max(need_base, g.get('UnlockBaseLevel', 0))
        gs.append({
            'id': g['Entry'], 'index': g['TaskGroupIndex'], 'name': L(g['Name'], g['TaskGroupIndex']),
            'unlockBaseLevel': g.get('UnlockBaseLevel', 0),
            'unlockStage': stage_name(g['UnlockStageEntry']) if g.get('UnlockStageEntry') else None,
            'unlockText': L(g.get('UnlockDes')),
            'bonus': attrmap(g.get('bonusAttr'), g.get('bonusAttrNum')),
            'tasks': tasks,
        })
    job_change.append({'fromTier': tier, 'toTier': tier + 1, 'baseLevel': need_base, 'jobLevel': need_job,
                       'stage': need_stage, 'groups': gs})


def ratio(r):
    return dict(zip(STAT_ORDER, (num(v) for v in r)))


lines = []
for kind in sorted({c['CareerKind'] for c in career.values()}):
    jobs = []
    for c in sorted([c for c in career.values() if c['CareerKind'] == kind], key=lambda c: c['TierStage']):
        try:
            stage_skills = json.loads(c.get('CareerStageSkill') or '[]')
        except ValueError:
            stage_skills = []
        jobs.append({
            'career': c['Entry'], 'tier': c['TierStage'], 'tierName': TIER_NAME[c['TierStage']],
            'name': L(c['CareerName']), 'front': c.get('FrontCareer') or None, 'next': c.get('TierCareer') or None,
            'defaultSpec': c.get('SwitchDefaultSpec'), 'stageSkills': stage_skills,
            'base': attrmap(c.get('attr'), c.get('numAttr')),
        })
    first = jobs[0]['career'] if kind == 100 else next(j['career'] for j in jobs if j['tier'] == 1)
    lines.append({'kind': kind, 'name': lang.get(f'career_{kind}') or L(career[first]['CareerName']),
                  'jobs': jobs, 'specs': [s for s in spec_ids if spec_line[s] == kind]})

specs_out = {}
for s in spec_ids:
    c = specs_cfg.get(s)
    unlock = None
    if c and c.get('UnlockJoblevelEntry'):
        j = job_by_entry[c['UnlockJoblevelEntry']]
        unlock = [j['TierStage'], j['JobLevel']]
    try:
        core = json.loads(c['CoreSkills']) if c else []
    except ValueError:
        core = []
    specs_out[str(s)] = {
        'name': L(f'spec_name_{s}'), 'desc': L(f'spec_des_{s}'), 'line': spec_line[s],
        'attrTag': c.get('AttrTag') if c else None, 'icon': c.get('Icon') if c else s,
        'unlock': unlock, 'ratio': ratio(c['recommendRefRatio']) if c else None,
        'coreSkills': core, 'normalAttack': normal_attack(s),
        'unreleased': c is None,
    }

# Base levels: EXP to next, points, unlocks
card_slots = load('card_slot_info')
equip_parts = load('equip_part_info')
functions = load('function_info')
unlocks = {}
for r in card_slots:
    unlocks.setdefault(r['UnlockBaseLevel'], []).append(
        {'type': 'cardSlot', 'id': r['Entry'], 'name': L('card_slot_category_%d' % r['CardSlotCateory']) + f" card slot {r['Idx']}"})
for r in equip_parts:
    unlocks.setdefault(r['UnlockBaseLevel'], []).append(
        {'type': 'equipPart', 'id': r['Entry'], 'name': L(r['Name']),
         **({'summonLevel': r['UnlockEquipSummonLevel']} if r.get('UnlockEquipSummonLevel', 0) > 1 else {})})
for r in functions:
    if r.get('UnlockBaselevel', 0) > 0:
        unlocks.setdefault(r['UnlockBaselevel'], []).append({'type': 'function', 'id': r['Entry'], 'name': L(r['Name'])})
for g in groups:
    if g.get('UnlockBaseLevel', 0) > 1:
        unlocks.setdefault(g['UnlockBaseLevel'], []).append(
            {'type': 'jobQuest', 'id': g['Entry'], 'name': f"{TIER_NAME[g['TierStage'] + 1]} quest {L(g['Name'], g['TaskGroupIndex'])}",
             **({'stage': stage_name(g['UnlockStageEntry'])} if g.get('UnlockStageEntry') else {})})

base_levels, cum = [], 0
for r in sorted(load('baseLevel_info'), key=lambda r: r['BaseLevel']):
    cum += r.get('BasePoint', 0)
    try:
        gear = json.loads(r.get('ArmorLevelRange') or '[]')
    except ValueError:
        gear = []
    row = {'lv': r['BaseLevel'], 'exp': r.get('CostExp', 0), 'points': r.get('BasePoint', 0), 'cumPoints': cum, 'gear': gear}
    if r.get('levelAttr'):
        row['attrs'] = attrmap(r['levelAttr'], r.get('attrNum'))
    if r['BaseLevel'] in unlocks:
        row['unlocks'] = unlocks[r['BaseLevel']]
    base_levels.append(row)

# Job levels: EXP, skill points, skills unlocked (per spec) at that global index
unlock_by_idx = {}
for r in career_skill:
    if r.get('UnlockJoblevel'):
        unlock_by_idx.setdefault(r['UnlockJoblevel'], {}).setdefault(str(r['Build']), []).append(r['SkillEntry'])
job_out, cum = [], 0
for r in job_levels:
    cum += r.get('SkillPoint', 0)
    row = {'tier': r['TierStage'], 'lv': r['JobLevel'], 'idx': r['UnlockJoblevel'], 'exp': r.get('CostExp', 0),
           'sp': r.get('SkillPoint', 0), 'cumSp': cum}
    if any(r.get('numAttr') or []) and r.get('upgradeAttr'):
        row['attrs'] = dict(zip(r['upgradeAttr'], r['numAttr']))
    if r['UnlockJoblevel'] in unlock_by_idx:
        row['skills'] = unlock_by_idx[r['UnlockJoblevel']]
    job_out.append(row)

gated_functions = []
for r in functions:
    gate = {k: r[k] for k in ('UnlockBaselevel', 'UnlockJoblevel', 'UnlockStage', 'UnlockCreateDate', 'UnlockMainTask') if r.get(k)}
    if not gate or lang.get(r['Name']) is None:
        continue
    g = {}
    if gate.get('UnlockBaselevel'):
        g['baseLevel'] = gate['UnlockBaselevel']
    if gate.get('UnlockStage'):
        g['stage'] = stage_name(gate['UnlockStage']) if gate['UnlockStage'] != 99999 else None
    if gate.get('UnlockMainTask'):
        g['mainQuest'] = gate['UnlockMainTask']
    if gate.get('UnlockCreateDate'):
        g['accountDay'] = gate['UnlockCreateDate']
    if gate.get('UnlockJoblevel'):
        g['jobLevel'] = gate['UnlockJoblevel']
    if gate.get('UnlockStage') == 99999:
        g['closed'] = True
    gated_functions.append({'id': r['Entry'], 'name': L(r['Name']), **g})

write('jobs', {
    'tiers': {str(k): v for k, v in TIER_NAME.items()},
    'lines': lines,
    'specs': specs_out,
    'jobChange': job_change,
    'baseLevels': base_levels,
    'jobLevels': job_out,
    'functions': gated_functions,
    'pointRules': {'costPerPoint': 'floor(allocated/5)+1', 'perSpentPoint': {
        key(1101): 2, key(1201): 2, key(1301): 1, key(1401): 1, key(1501): 20, key(1601): 2}},
})

# ---------------------------------------------------------------------------------------------
# skills.json
# ---------------------------------------------------------------------------------------------
fs = {r['Entry']: r for r in load('fight_skill')}
skill_casts = {}
for r in load('fight_skill_cast'):
    skill_casts.setdefault(r['Entry'], {})[r['State']] = r
bc_cfg = {r['Entry']: r for r in load('fight_bullet_cast')}
bl_cfg = {r['Entry']: r for r in load('fight_bullet')}
tasks = {r['Entry']: r for r in load('fight_skill_task')}
changes = {r['Entry']: r for r in load('fight_skill_task_change')}
brands = {}
for r in load('fight_brand'):
    brands.setdefault(r['SkillEntry'], []).append(r)
trig_cfg = {r['Entry']: r for r in load('fight_trigger')}
cond_cfg = {r['Entry']: r for r in load('fight_condition')}
formula_cfg = {r['EnumValue']: r for r in load('fight_formula')}
buff_cfg = {r['Entry']: r for r in load('fight_buff')}
csa = {}
for r in load('career_skill_attr'):
    csa[(r['SkillEntry'], r['SkillLevel'])] = r
awaken_info = load('awaken_info')
awaken_tier = load('awaken_tier')

AREA_SCRIPTS = {1, 2, 6, 9, 11, 12}   # Bullet_*_Area: damage through a HitArea node
PICK_TARGETS = {100, 101, 102, 103, 150, 151, 152, 153, 154, 200, 250, 251}


def task_items(entry):
    t = tasks.get(entry)
    return [(k, v) for x in (t or {}).get('task', []) for k, v in x.items()]


def task_params(entry):
    return {p['Name']: p.get('Value', 0) for p in (tasks.get(entry) or {}).get('param', [])}


# Which bullets / triggers / buffs own each task entry (for STCAdd / STCValueParam targets)
owner_bullet, owner_trig, owner_buff = {}, {}, {}
for b in bl_cfg.values():
    for e in (b.get('taskEntry') or []) + (b.get('attackerTask') or []):
        owner_bullet.setdefault(e, []).append(b['Entry'])
for t in trig_cfg.values():
    for e in t.get('tasks') or []:
        owner_trig.setdefault(e, []).append(t['Entry'])
for b in buff_cfg.values():
    for x in b.get('tasks') or []:
        owner_buff.setdefault(x.get('Task'), []).append(b['Entry'])

out_casts, out_bullets, out_trigs, out_buffs = {}, {}, {}, {}
warnings = []


def chance_of(cond_id):
    """fight_condition FPCRandom -> {p} (constant), {cast, stat?, per?, k?} (BulletCastProbability
    formula: chance = cast attr 101500 [+ stat/per*k]), else {cond} (not a random roll)."""
    c = cond_cfg.get(cond_id)
    if not c:
        return {'cond': cond_id}
    for p in c.get('param', []):
        if 'FPCBuffNum' in p:
            return {'cond': cond_id, 'buff': p['FPCBuffNum'].get('BuffEntry')}
        if 'FPCSkillUnifiedCritCache' in p:
            return {'cond': cond_id, 'crit': 1}
        r = p.get('FPCRandom')
        if not r:
            continue
        if 'ValueFormula' not in r:
            return {'p': num(r.get('Value', 0))}
        f = formula_cfg.get(r.get('ValueFormula'))
        if not f:
            break
        ps = f.get('param', [])
        if f.get('Template') == 1 and ps and 'FPValue' in ps[0]:
            return {'p': num(ps[0]['FPValue'].get('Value', 0))}
        src = ps[0].get('FPBulletCastAttr') if ps else None
        if src and src.get('Attr') == 101500:
            out = {'cast': src['BulletCastEntry']}
            if f.get('Template') == 103 and len(ps) >= 4:   # P0 + P1/P2*P3  (FightFormulaTemplate.BulletCastProbability)
                out.update({'stat': ps[1].get('FPActorAttr', {}).get('Attr'), 'per': ps[2].get('FPValue', {}).get('Value'),
                            'k': ps[3].get('FPValue', {}).get('Value')})
            visit_cast(src['BulletCastEntry'])
            return out
    return {'cond': cond_id}


def links(entries):
    """Task entries -> (cast links [castId or [castId, chance]], buff ids, formula id, other task kinds)."""
    cast_ids, buff_ids, formula, other = [], [], 0, []
    for e in entries or []:
        entry_cond = (tasks.get(e) or {}).get('Condition')
        for k, v in task_items(e):
            if k == 'FSTHurt' and not formula:
                formula = v.get('ValueFormula', 0)
            elif k == 'FSTCastBullet':
                cid = v.get('BulletCastEntry')
                visit_cast(cid)
                cond = v.get('Condition') or entry_cond
                if cond:
                    cast_ids.append([cid, chance_of(cond)])
                else:
                    cast_ids.append(cid)
            elif k == 'FSTAddBuff':
                visit_buff(v.get('BuffEntry'))
                buff_ids.append(v.get('BuffEntry'))
            elif k not in ('FSTCameraShake', 'FSTEmitStrCommon'):
                other.append(k[3:])
    return cast_ids, buff_ids, formula, other


def visit_cast(cid):
    if cid in out_casts or cid not in bc_cfg:
        return
    c = bc_cfg[cid]
    rec = {'b': c['Bullet'], 'scr': (c.get('BulletScript') or {}).get('Key', 0)}
    for f, k in (('CopierNum', 'n'), ('CopierWave', 'w'), ('CopierWaveInterval', 'wi'), ('ChainCount', 'ch'),
                 ('BulletTarget', 'tgt'), ('Range', 'range')):
        if c.get(f):
            rec[k] = num(c[f])
    if c.get('TargetNoRepeat'):
        rec['noRep'] = 1
    out_casts[cid] = rec
    visit_bullet(c['Bullet'])


def visit_bullet(bid):
    if bid in out_bullets or bid not in bl_cfg:
        return
    b = bl_cfg[bid]
    rec = {}
    out_bullets[bid] = rec
    hit, hbuffs, formula, other = links(b.get('taskEntry'))
    fire, fbuffs, _, _ = links(b.get('attackerTask'))
    rec['mul'] = num(b.get('AttrAttackMul', 0))
    if formula:
        rec['f'] = formula
    if b.get('DamageType'):
        rec['dt'] = b['DamageType']
    for f, k in (('CollideRadii', 'r'), ('CollideLength', 'len'), ('CollideAngle', 'ang'), ('CollideRoundLimit', 'rounds'),
                 ('CollideInterval', 'int'), ('CollideDuration', 'dur'), ('CollideLimit', 'lim'), ('RoleHitedMax', 'hmax'),
                 ('RoleHitedInterval', 'hint'), ('CollideStart', 'start')):
        if b.get(f):
            rec[k] = num(b[f])
    if b.get('rectAxis'):
        rec['rect'] = [num(x) for x in b['rectAxis']]
    if b.get('tags'):
        rec['tags'] = b['tags']
    if b.get('IgnoreEvasion'):
        rec['sure'] = 1
    if hit:
        rec['hit'] = hit
    if fire:
        rec['fire'] = fire
    if hbuffs or fbuffs:
        rec['buffs'] = hbuffs + fbuffs
    if other:
        rec['fx'] = sorted(set(other))


TRIGGER_FILTERS = {'bulletEntrys': 'bullets', 'skillEntrys': 'skills', 'spellKinds': 'spellKinds',
                   'damageSources': 'damageSources', 'CheckCrit': 'crit', 'UseCurrentBullet': 'ownBullet'}


def visit_trigger(tid):
    if tid in out_trigs or tid not in trig_cfg:
        return
    t = trig_cfg[tid]
    (kind, params), = t['Trigger'].items()
    rec = {'on': kind[3:] if kind.startswith('FTR') else kind}
    out_trigs[tid] = rec
    filt = {TRIGGER_FILTERS.get(k, k): v for k, v in (params or {}).items() if v not in (None, [], False)}
    if filt:
        rec['filter'] = filt
    for f, k in (('Step', 'every'), ('Cd', 'cd'), ('Max', 'max'), ('LifeTime', 'life')):
        if t.get(f) and not (f == 'Step' and t[f] == 1):
            rec[k] = num(t[f])
    if t.get('Condition'):
        rec['chance'] = chance_of(t['Condition'])
    casts_, buffs_, formula, other = links(t.get('tasks'))
    if casts_:
        rec['casts'] = casts_
    if buffs_:
        rec['buffs'] = buffs_
    if other:
        rec['fx'] = sorted(set(other))
    params_ = {}
    for e in t.get('tasks') or []:
        params_.update(task_params(e))
    if params_:
        rec['params'] = {k: num(v) for k, v in params_.items()}


def visit_buff(bid):
    if bid in out_buffs or bid not in buff_cfg:
        return
    b = buff_cfg[bid]
    rec = {'dur': num(b.get('Duration', 0))}
    out_buffs[bid] = rec
    if b.get('BuffKind'):
        rec['kind'] = b['BuffKind']
    if b.get('CoverLayer', 1) > 1:
        rec['stack'] = b['CoverLayer']
    attrs, params, on, casts_, other, bmods = {}, {}, None, [], [], []
    for x in b.get('tasks') or []:
        e = x.get('Task')
        tp = task_params(e)
        if tasks.get(e):
            on = on or tasks[e].get('Actor')
        for k, v in task_items(e):
            if k == 'FSTActorAttr':
                if 'ValueParam' in v:
                    params[v['ValueParam']] = key(v['Attr'])
                    attrs[key(v['Attr'])] = num(tp.get(v['ValueParam'], 0))
                else:
                    attrs[key(v['Attr'])] = num(attrs.get(key(v['Attr']), 0) + v.get('Value', 0))
            elif k == 'FSTCastBullet':
                visit_cast(v.get('BulletCastEntry'))
                casts_.append(v.get('BulletCastEntry'))
            elif k in ('FSTBulletAttr', 'FSTBulletCastAttr', 'FSTSkillAttr', 'FSTSkillStateIdx'):
                val = tp.get(v['ValueParam'], 0) if 'ValueParam' in v else v.get('Value', 0)
                if k == 'FSTBulletAttr':
                    for bb in ([v['BulletEntry']] if v.get('BulletEntry') else []) + (v.get('BulletEntrys') or []):
                        bmods.append(['b', bb, v['Attr'], num(val)])
                elif k == 'FSTBulletCastAttr':
                    bmods.append(['c', v['BulletCastEntry'], v['Attr'], num(val)])
                elif k == 'FSTSkillAttr':
                    for ss in v.get('skillEntrys') or []:
                        bmods.append(['s', ss, v['Attr'], num(val)])
                else:
                    bmods.append(['st', v['SkillEntry'], v.get('stateIdx') or []])
            elif k not in ('FSTEmitStrCommon',):
                other.append(k[3:])
    # who holds the buff: its task Actor (2 initiator = self, 4 target); a task-less debuff (kind 2) sits on the enemy
    rec['on'] = 'target' if on == 4 or (on is None and b.get('BuffKind') == 2) else 'self'
    if bmods:
        rec['mods'] = bmods
    if attrs:
        rec['attrs'] = attrs
    if params:
        rec['params'] = params
    if casts_:
        rec['casts'] = casts_
    for t in b.get('triggers') or []:
        visit_trigger(t)
    if b.get('triggers'):
        rec['triggers'] = b['triggers']
    if other:
        rec['fx'] = sorted(set(other))


bullets_by_tag = {}
for b in bl_cfg.values():
    for t in b.get('tags') or []:
        bullets_by_tag.setdefault(t, []).append(b['Entry'])


def task_bullets(v):
    """FSTBulletAttr targets: BulletEntry, BulletEntrys, and every bullet carrying one of `tags`
    (FightSkillTaskLogic.BulletAttr scans the whole fight_bullet table)."""
    out = ([v['BulletEntry']] if v.get('BulletEntry') else []) + (v.get('BulletEntrys') or [])
    for t in v.get('tags') or []:
        out += bullets_by_tag.get(t, [])
    for b in out:
        visit_bullet(b)
    return list(dict.fromkeys(out))


def buff_task_mods(buff, te):
    """FSTBuffTask: task entry `te` runs while `buff` is on -> ['bmod', buff, mod(, paramTask, paramName)]."""
    out, params = [], task_params(te)
    for k, v in task_items(te):
        if k == 'FSTSkillStateIdx':
            out.append(['bmod', buff, ['st', v['SkillEntry'], v.get('stateIdx') or []]])
        elif k == 'FSTBulletAttr':
            for bid in task_bullets(v):
                if 'ValueParam' in v:
                    out.append(['bmod', buff, ['b', bid, v['Attr'], params.get(v['ValueParam'], 0)], te, v['ValueParam']])
                else:
                    out.append(['bmod', buff, ['b', bid, v['Attr'], v.get('Value', 0)]])
        elif k == 'FSTBulletCastAttr':
            out.append(['bmod', buff, ['c', v['BulletCastEntry'], v['Attr'], v.get('Value', 0)]])
        elif k == 'FSTSkillAttr':
            for sk in v.get('skillEntrys') or []:
                out.append(['bmod', buff, ['s', sk, v['Attr'], v.get('Value', 0)]])
        elif k == 'FSTActorAttr' and 'Value' in v:
            out.append(['bp+', buff, key(v['Attr']), v['Value']])
    return out


def brand_mods(br):
    """One fight_brand row -> list of mods (see skills.ts SkillMod)."""
    mods = []
    for e in br.get('taskEntry') or []:
        for k, v in task_items(e):
            if k == 'FSTBulletAttr':
                for bid in task_bullets(v):
                    mods.append(['b', bid, v['Attr'], v.get('Value', 0)])
            elif k == 'FSTBulletCastAttr':
                mods.append(['c', v['BulletCastEntry'], v['Attr'], v.get('Value', 0)])
            elif k == 'FSTSkillAttr':
                for s in v.get('skillEntrys') or []:
                    mods.append(['s', s, v['Attr'], v.get('Value', 0)])
            elif k == 'FSTActorAttr':
                if 'Value' in v:
                    mods.append(['a', 0, v['Attr'], v['Value']])
            elif k == 'FSTBuffAttr':
                visit_buff(v.get('BuffEntry'))
                mods.append(['bf', v['BuffEntry'], v['Attr'], v.get('Value', 0)])
            elif k == 'FSTTriggerAttr':
                mods.append(['ta', v['TriggerEntry'], v['Attr'], v.get('Value', 0)])
            elif k == 'FSTSkillStateIdx':
                mods.append(['st', v['SkillEntry'], v.get('stateIdx') or []])
            elif k == 'FSTAddTrigger':
                visit_trigger(v['TriggerEntry'])
                mods.append(['tr', v['TriggerEntry']])
            elif k == 'FSTBuffTrigger':
                visit_trigger(v['TriggerEntry'])
                visit_buff(v.get('BuffEntry'))
                mods.append(['tr', v['TriggerEntry'], 'buff', v.get('BuffEntry')])
            elif k == 'FSTPrepBulletTrigger':
                visit_trigger(v['TriggerEntry'])
                mods.append(['tr', v['TriggerEntry'], 'bullet', v.get('BulletEntry')])
            elif k == 'FSTAddBuff':
                visit_buff(v.get('BuffEntry'))
                mods.append(['buff', v['BuffEntry']])
            elif k == 'FSTBuffTask':
                visit_buff(v.get('BuffEntry'))
                mods += buff_task_mods(v.get('BuffEntry'), v.get('TaskEntry'))
            elif k == 'FSTDoHitAreaOneTargetHurtPP':
                mods.append(['fx', 'OneTargetHurt', v.get('HurtFormula')])
    for ce in br.get('changeEntry') or []:
        c = changes.get(ce)
        if not c:
            continue
        for x in c.get('change', []):
            for k, v in x.items():
                te = v.get('TaskEntry')
                if k == 'STCValueParam':
                    val = v.get('Value', 0) if v.get('AddType', 1) == 1 else None
                    if val is None:
                        warnings.append(f'multiplicative STCValueParam {ce}')
                        continue
                    for b in owner_buff.get(te, []):
                        visit_buff(b)
                        mods.append(['bp', b, v['ParamName'], val])
                    for t in owner_trig.get(te, []):
                        mods.append(['tp', t, v['ParamName'], val])
                    if not owner_buff.get(te) and not owner_trig.get(te):
                        mods.append(['p', te, v['ParamName'], val])
                elif k == 'STCAdd':
                    for kk, vv in [(kk, vv) for y in c.get('task', []) for kk, vv in y.items()]:
                        if kk == 'FSTCastBullet':
                            visit_cast(vv['BulletCastEntry'])
                            for b in owner_bullet.get(te, []):
                                mods.append(['hit', b, vv['BulletCastEntry']])
                            for t in owner_trig.get(te, []):
                                visit_trigger(t)
                                mods.append(['tcast', t, vv['BulletCastEntry']])
                        elif kk == 'FSTAddBuff':
                            visit_buff(vv['BuffEntry'])
                            for b in owner_bullet.get(te, []):
                                mods.append(['hbuff', b, vv['BuffEntry']])
                            for t in owner_trig.get(te, []):
                                mods.append(['tbuff', t, vv['BuffEntry']])
                        elif kk == 'FSTSkillStateIdx' and owner_buff.get(te):
                            for b in owner_buff[te]:   # replaces the buff's own state switch (same SubKey) while it is up
                                mods.append(['bst', b, vv['SkillEntry'], vv.get('stateIdx') or []])
                        elif kk == 'FSTSkillStateIdx':
                            mods.append(['st', vv['SkillEntry'], vv.get('stateIdx') or []])
                        elif kk == 'FSTActorAttr' and 'Value' in vv:
                            for b in owner_buff.get(te, []):
                                mods.append(['bp+', b, key(vv['Attr']), vv['Value']])
                        else:
                            mods.append(['fx', kk[3:], te])
    return mods


def combine(mod_lists):
    """Sum numeric mods by (kind, target, attr); keep structural mods once, in order."""
    sums, order, seen = {}, [], set()
    for m in (x for ml in mod_lists for x in ml):
        if m[0] in ('b', 'c', 's', 'a', 'bf', 'ta', 'bp', 'tp', 'p', 'bp+'):
            k = (m[0], m[1], m[2])
            if k not in sums:
                order.append(k)
                sums[k] = 0
            sums[k] += m[3]
        else:
            k = json.dumps(m)
            if k not in seen:
                seen.add(k)
                order.append(k)
    out = []
    for k in order:
        if isinstance(k, tuple):
            out.append([k[0], k[1], k[2], num(sums[k])])
            continue
        m = json.loads(k)
        if m[0] == 'bmod' and len(m) == 5:   # value comes from a task param, raised by STCValueParam ('p') mods
            inner = list(m[2])
            inner[3] = num(inner[3] + sums.get(('p', m[3], m[4]), 0))
            m = ['bmod', m[1], inner]
        out.append(m)
    return out


# ---- evaluation (mirrors skills.ts evalSkill) ----
class Mods:
    def __init__(self, mods):
        self.v, self.states, self.hit, self.tcast, self.trigs = {}, {}, {}, {}, []
        for m in mods:
            if m[0] in ('b', 'c', 's', 'a', 'bf', 'ta', 'bp', 'tp', 'p', 'bp+'):
                k = (m[0], m[1], m[2])
                self.v[k] = self.v.get(k, 0) + m[3]
            elif m[0] == 'st':
                self.states[m[1]] = m[2]
            elif m[0] == 'hit':
                self.hit.setdefault(m[1], []).append(m[2])
            elif m[0] == 'tcast':
                self.tcast.setdefault(m[1], []).append(m[2])
            elif m[0] == 'tr' and m[1] not in self.trigs:
                self.trigs.append(m[1])

    def g(self, kind, target, attr):
        return self.v.get((kind, target, attr), 0)


INF = 10 ** 9


def area_hits(b, M, bid):
    rounds = b.get('rounds', 0) + M.g('b', bid, 100900)
    dur = b.get('dur', 0) + M.g('b', bid, 100800)
    itv = b.get('int', 0) + M.g('b', bid, 100700)
    w = rounds if rounds > 0 else INF
    if dur > 0 and itv > 0:
        w = min(w, math.floor(dur / itv + 1e-6) + 1)
    if b.get('hmax'):
        w = min(w, b['hmax'])
    if b.get('hint') and dur > 0:
        w = min(w, math.floor(dur / b['hint'] + 1e-6) + 1)
    if b.get('lim'):
        w = min(w, b['lim'])
    return w if w < INF else None


def bullet_mul(bid, M):
    b = out_bullets[bid]
    return (b['mul'] + M.g('b', bid, 100002)) * (1 + M.g('b', bid, 100003))


def eval_cast(cid, M, mult, parts, flags, depth=0, chance=1.0, cond=None):
    """Walk one bullet cast against a lone target. Appends damage parts; hits = damage instances
    on that target (expected value when a random condition gates a child cast). Parts behind a
    non-random condition (e.g. "while buff X is on") carry `cond` and stay out of the totals."""
    c = out_casts.get(cid)
    if not c or depth > 6:
        return 0
    bid = c['b']
    b = out_bullets.get(bid, {})
    n = c.get('n', 0)
    if n > 0:   # copier: n bullets per wave, w waves; a no-repeat pool runs dry after one pick on a lone target
        n = max(0, round(n + M.g('c', cid, 101200)))
        w = max(1, round(c.get('w', 0) + M.g('c', cid, 101300)))
        total = n * w
        lone = min(1, total) if c.get('noRep') else total
    else:
        total = lone = 1
    chain = c.get('ch', 0) + M.g('c', cid, 101900)
    area = c['scr'] in AREA_SCRIPTS
    per = area_hits(b, M, bid) if area else 1
    if per is None:
        flags.add('unboundedArea')
        per = 1
    hits = mult * lone * per
    if area:
        tg = b.get('lim') or 0
    else:
        tg = total if c.get('tgt') in PICK_TARGETS else 1
        tg += int(chain)
    if b.get('f'):
        r = b.get('r', 0) + M.g('b', bid, 100600) if area else 0
        shape = 'rect' if b.get('len') else 'sector' if b.get('ang') else 'circle'
        part = {'b': bid, 'mul': bullet_mul(bid, M), 'hits': hits * chance, 'f': b['f'], 'r': r, 'tg': tg,
                'shape': shape if area else None}
        if cond:
            part['cond'] = cond
        parts.append(part)
    for links_, m in (((b.get('hit') or []) + M.hit.get(bid, []), hits), (b.get('fire') or [], mult * lone)):
        for link in links_:
            cc, ch, cd = link, 1.0, cond
            if isinstance(link, list):
                cc, ch = link[0], cond_chance(link[1], M)
                if ch is None:
                    flags.add('conditional')
                    ch, cd = 1.0, cond or link[1]
            eval_cast(cc, M, m, parts, flags, depth + 1, chance * ch, cd)
    return tg


def cond_chance(ch, M):
    if 'p' in ch:
        return ch['p']
    if 'cast' in ch:
        return min(1.0, M.g('c', ch['cast'], 101500))
    return None


state_links = {}   # (skill, state) -> cast links, exported in skills[].emits


def skill_casts_of(sid, M):
    """Bullet casts each cast state emits: SPEBulletCast and casts inside SPETask entries. A link is
    a cast id, or [castId, chance] when gated by a phase-effect Condition or by a Skill_MultiAction
    follow-up action (phase 30/31 runs only if actionData[1|2].Condition holds)."""
    s = fs.get(sid) or {}
    states = M.states.get(sid) or s.get('stateIdx') or []
    out = []
    for st in states:
        cast = skill_casts.get(sid, {}).get(st)
        if not cast:
            continue
        if (sid, st) not in state_links:
            act = cast.get('actionData') or []
            ids = []
            for pe in cast.get('phaseEffect', []):
                for k, v in pe.items():
                    if k not in ('SPEBulletCast', 'SPETask'):
                        continue
                    cond = v.get('Condition')
                    for ph, ai in ((30, 1), (31, 2)):
                        if ph in (v.get('phase') or []) and len(act) > ai and act[ai].get('Condition'):
                            cond = cond or act[ai]['Condition']
                    if k == 'SPEBulletCast':
                        visit_cast(v['Entry'])
                        found = [v['Entry']]
                    else:
                        found = links([v['Entry']])[0]
                    for x in found:
                        if cond and not isinstance(x, list):
                            x = [x, chance_of(cond)]
                        ids.append(x)
            state_links[(sid, st)] = ids
        out.append(state_links[(sid, st)])
    return out


def summarize(parts):
    coef = sum(p['mul'] * p['hits'] for p in parts if not p.get('cond'))
    hits = sum(p['hits'] for p in parts if not p.get('cond'))
    return coef, hits


def eval_skill(sid, M):
    """Average over cast states (SkillObj cycles them). Returns coef, hits, aoe radius, targets, parts, flags."""
    per_state = skill_casts_of(sid, M)
    if not per_state:
        return None
    flags = set()
    all_parts, coefs, hitss, aoe, targets = [], [], [], 0, 1
    for ids in per_state:
        parts = []
        for link in ids:
            cc, ch, cd = link, 1.0, None
            if isinstance(link, list):
                cc, ch = link[0], cond_chance(link[1], M)
                if ch is None:
                    flags.add('conditional')
                    ch, cd = 1.0, link[1]
            eval_cast(cc, M, 1, parts, flags, 0, ch, cd)
        c, h = summarize(parts)
        coefs.append(c)
        hitss.append(h)
        all_parts.append(parts)
        for p in parts:
            if p.get('cond'):
                continue
            aoe = max(aoe, p['r'])
            if p['r'] and not p['tg']:
                targets = 0
            elif targets:
                targets = max(targets, p['tg'])
    if not any(all_parts):
        return None
    return {'coef': sum(coefs) / len(coefs), 'hits': sum(hitss) / len(hitss), 'aoe': aoe, 'targets': targets,
            'parts': all_parts[0] if len(all_parts) == 1 else [p for ps in all_parts for p in ps], 'states': len(all_parts),
            'flags': flags}


def skill_cd(sid, M):
    s = fs.get(sid) or {}
    base = (s.get('BaseCooldown', 0) + M.g('s', sid, 13201)) * (1 + M.g('s', sid, 13202))
    var = (s.get('VariableCooldown', 0) + M.g('s', sid, 13301)) * (1 + M.g('s', sid, 13302))
    return [num(base, 4), num(var, 4)]


def skill_sing(sid, M):
    s = fs.get(sid) or {}
    base = (s.get('BaseSingTime', 0) + M.g('s', sid, 13902)) * (1 + M.g('s', sid, 13903))
    var = (s.get('VariableSingTime', 0) + M.g('s', sid, 14002)) * (1 + M.g('s', sid, 14003))
    return [num(base, 4), num(var, 4)]


def eval_trigger(tid, M):
    """A proc: chance per event (trigger condition, or a condition shared by all of its casts)
    and the coefficient/hits it deals when it fires."""
    t = out_trigs.get(tid)
    if not t:
        return None
    flags, parts = set(), []
    links_ = (t.get('casts') or []) + M.tcast.get(tid, [])
    conds = [json.dumps(x[1]) for x in links_ if isinstance(x, list)]
    shared = json.loads(conds[0]) if conds and len(conds) == len(links_) and len(set(conds)) == 1 else None
    for link in links_:
        if isinstance(link, list):
            cc, ch = link[0], 1.0 if shared else cond_chance(link[1], M)
        else:
            cc, ch = link, 1.0
        if ch is None:
            flags.add('conditional')
            continue
        eval_cast(cc, M, 1, parts, flags, 0, ch)
    coef, hits = summarize(parts)
    rec = {'id': tid, 'on': t['on']}
    chances = [c for c in (t.get('chance'), shared) if c]
    p = 1.0
    for ch in chances:
        if 'p' in ch:
            p *= ch['p']
        elif 'cast' in ch:
            p *= M.g('c', ch['cast'], 101500)
            if ch.get('stat'):
                rec['chanceStat'] = [ch['stat'], ch['per'], ch['k']]
        else:
            rec['cond'] = ch.get('cond')
    if any('p' in c or 'cast' in c for c in chances):
        rec['chance'] = num(p, 4)
    if t.get('every'):
        rec['every'] = t['every']
    if t.get('cd'):
        rec['cd'] = t['cd']
    if coef:
        rec['coef'] = num(coef, 4)
        rec['hits'] = num(hits, 3)
        rec['f'] = parts[0]['f']
    if flags:
        rec['flags'] = sorted(flags)
    return rec


def buff_values(bid, M):
    b = out_buffs.get(bid)
    if not b:
        return None
    attrs = dict(b.get('attrs', {}))
    for pname, akey in (b.get('params') or {}).items():
        attrs[akey] = num(attrs.get(akey, 0) + M.g('bp', bid, pname), 5)
    for (k, t, a), v in M.v.items():
        if k == 'bp+' and t == bid:
            attrs[a] = num(attrs.get(a, 0) + v, 5)
    # buff matrix seeded with Duration / CoverLayer [code] FightTeamCompFL; BuffDuration = AttrTX(200000, 200100, 200110)
    dur = (b['dur'] + M.g('bf', bid, 200000) + M.g('bf', bid, 200100)) * (1 + M.g('bf', bid, 200110))
    out = {'id': bid, 'on': b['on'], 'dur': num(dur, 3)}
    if attrs:
        out['attrs'] = attrs
    stack = b.get('stack', 1) + M.g('bf', bid, 200300)
    if stack > 1:
        out['stack'] = num(stack)
    return out


def tree_buffs(sid, M):
    """Buffs a skill applies through its own casts (bullets, SPETask) or brand FSTAddBuff."""
    found, seen = [], set()

    def walk_cast(cid, depth=0):
        c = out_casts.get(cid)
        if not c or depth > 6 or cid in seen:
            return
        seen.add(cid)
        b = out_bullets.get(c['b'], {})
        for bf in b.get('buffs') or []:
            found.append(bf)
        for link in (b.get('hit') or []) + (b.get('fire') or []) + M.hit.get(c['b'], []):
            walk_cast(link if not isinstance(link, list) else link[0], depth + 1)

    for st in (M.states.get(sid) or (fs.get(sid) or {}).get('stateIdx') or []):
        cast = skill_casts.get(sid, {}).get(st)
        for pe in (cast or {}).get('phaseEffect', []):
            for k, v in pe.items():
                if k == 'SPEBulletCast':
                    walk_cast(v['Entry'])
                elif k == 'SPETask':
                    cs_, bs_, _, _ = links([v['Entry']])
                    found.extend(bs_)
                    for x in cs_:
                        walk_cast(x if not isinstance(x, list) else x[0])
    return found


def round_parts(parts):
    return [{'b': p['b'], 'mul': num(p['mul'], 4), 'hits': num(p['hits'], 3), 'f': p['f'],
             **({'r': num(p['r'], 3)} if p['r'] else {}), **({'shape': p['shape']} if p['shape'] and p['shape'] != 'circle' else {}),
             **({'tg': p['tg']} if p['tg'] != 1 else {}), **({'cond': p['cond']} if p.get('cond') else {})} for p in parts]


# ---- collect skills ----
skill_specs = {}   # skill id -> set of specs
nodes_by_spec = {}
for r in career_skill:
    nodes_by_spec.setdefault(r['Build'], []).append(r)
    skill_specs.setdefault(r['SkillEntry'], set()).add(r['Build'])
awaken_skills = {}
for t in awaken_tier:
    if t.get('SkillEntry'):
        awaken_skills.setdefault(t['SkillEntry'], [])
        if t['AwakenEntry'] not in awaken_skills[t['SkillEntry']]:
            awaken_skills[t['SkillEntry']].append(t['AwakenEntry'])
normal_skills = {specs_out[str(s)]['normalAttack'] for s in spec_ids if specs_out[str(s)]['normalAttack']}

max_level = {}
for r in career_skill:
    max_level[r['SkillEntry']] = max(max_level.get(r['SkillEntry'], 0), r['UpgradeTimes'])
for sid in awaken_skills:
    max_level[sid] = 1
for sid in normal_skills:
    max_level[sid] = 1

self_mods = {}   # skill -> [mods per level]
replaces = {}
for sid, mx in max_level.items():
    rows = sorted(brands.get(sid, []), key=lambda r: r['SkillLevel'])
    per_level = []
    for lv in range(1, mx + 1):
        per_level.append(combine([brand_mods(b) for b in rows if b['SkillLevel'] <= lv]))
        rep = next((b['BrandReplace'] for b in rows if b['SkillLevel'] <= lv and b.get('BrandReplace')), 0)
        if rep:
            replaces[sid] = rep
    self_mods[sid] = per_level


def level_desc(sid, lv):
    rows = [b for b in brands.get(sid, []) if b['SkillLevel'] == lv]
    if not rows:
        return ''
    b = rows[0]   # SkillBasePanel shows the first brand of (skill, level)
    return L(b.get('Description'), *(b.get('desArg') or []))


def enhances(sid):
    return next((b['EnhanceSkillEntry'] for b in brands.get(sid, []) if b.get('EnhanceSkillEntry')), 0)


out_skills = {}
for sid in sorted(max_level):
    s = fs.get(sid)
    if not s:
        warnings.append(f'skill {sid} missing from fight_skill')
        continue
    first_cast = skill_casts.get(sid, {}).get((s.get('stateIdx') or [1])[0], {})
    act = first_cast.get('actionData') or []
    rec = {
        'name': L(s.get('ShowName')), 'icon': s.get('Icon'), 'spell': s.get('SpellKind', 0),
        'cd': [num(s.get('StartCooldown', 0)), num(s.get('BaseCooldown', 0)), num(s.get('VariableCooldown', 0))],
        'sing': [num(s.get('BaseSingTime', 0)), num(s.get('VariableSingTime', 0))],
        'sp': s.get('MpCost', 0), 'range': num(s.get('AttackRadii', 0)),
        'states': s.get('stateIdx') or [],
        'max': max_level[sid],
    }
    if act:
        rec['anim'] = num(sum(a.get('Time', 0) for a in act), 3)
        rec['animAttr'] = first_cast.get('ActionTimeReductionAttr', 0)
    fire_at = [pe['SPEBulletCast']['Delay'] for pe in first_cast.get('phaseEffect', []) if 'SPEBulletCast' in pe and pe['SPEBulletCast'].get('Delay')]
    if fire_at:
        rec['fireAt'] = num(min(fire_at), 3)
    emits = {}
    for st in sorted(skill_casts.get(sid, {})):
        ln = skill_casts_of(sid, Mods([['st', sid, [st]]]))
        if ln and ln[0]:
            emits[str(st)] = ln[0]
    if emits:
        rec['emits'] = emits
    if s.get('IsActive'):
        rec['auto'] = 1
    if s.get('Condition'):
        rec['cond'] = s['Condition']
    if enhances(sid):
        rec['enhances'] = enhances(sid)
    if sid in replaces:
        rec['replaces'] = replaces[sid]
    if sid in awaken_skills:
        rec['awaken'] = awaken_skills[sid]
    if sid in normal_skills:
        rec['normal'] = 1
    levels = []
    for lv in range(1, max_level[sid] + 1):
        mods = self_mods[sid][lv - 1]
        M = Mods(mods)
        row = {'desc': level_desc(sid, lv)}
        a = csa.get((sid, lv))
        if a:
            attrs = attrmap(a.get('attr'), a.get('numAttr'))
            br = attrs.pop(key(81000), 0)
            row['br'] = br
            if attrs:
                row['attrs'] = attrs
            if a.get('EffectCondition', 1) != 1:
                row['attrsWhen'] = a['EffectCondition']
        ev = eval_skill(sid, M)
        if ev:
            row['coef'] = num(ev['coef'], 4)
            row['hits'] = num(ev['hits'], 3)
            row['targets'] = ev['targets']
            if ev['aoe']:
                row['aoe'] = num(ev['aoe'], 3)
            row['parts'] = round_parts(ev['parts'])
            if ev['states'] > 1:
                row['stateAvg'] = ev['states']
            if ev['flags']:
                row['flags'] = sorted(ev['flags'])
        cd = skill_cd(sid, M)
        if cd != rec['cd'][1:]:
            row['cd'] = cd
        sing = skill_sing(sid, M)
        if sing != rec['sing']:
            row['sing'] = sing
        buff_ids = tree_buffs(sid, M) + [m[1] for m in mods if m[0] in ('buff', 'bf', 'bp', 'bp+', 'bmod')] + \
            [m[2] for m in mods if m[0] in ('hbuff', 'tbuff')]
        for t in M.trigs:
            buff_ids += out_trigs.get(t, {}).get('buffs', [])
        buff_ids = list(dict.fromkeys(buff_ids))
        trig_ids = list(M.trigs)
        for b in buff_ids:
            trig_ids += [t for t in out_buffs.get(b, {}).get('triggers', []) if t not in trig_ids]
        procs = [p for p in (eval_trigger(t, M) for t in trig_ids) if p]
        if procs:
            row['procs'] = procs
        bl_ = [x for x in (buff_values(b, M) for b in buff_ids) if x]
        if bl_:
            row['buffs'] = bl_
        if mods:
            row['mods'] = mods
        levels.append(row)
    rec['lv'] = levels
    out_skills[sid] = rec

# Cross-skill boosts: what a passive's level (or a buff while it is up) adds to another skill's per-cast coefficient
bullet_owner = {}
for sid in out_skills:
    for st in skill_casts.get(sid, {}):   # every cast state, so state switches (Aura Blade, Blast Impact) are covered
        ids = skill_casts_of(sid, Mods([['st', sid, [st]]]))
        stack = [c if not isinstance(c, list) else c[0] for x in ids for c in x]
        seen = set()
        while stack:
            cid = stack.pop()
            if cid in seen or cid not in out_casts:
                continue
            seen.add(cid)
            bullet_owner.setdefault(out_casts[cid]['b'], set()).add(sid)
            b = out_bullets.get(out_casts[cid]['b'], {})
            for link in (b.get('hit') or []) + (b.get('fire') or []):
                stack.append(link if not isinstance(link, list) else link[0])


def buff_mods_with(bid, mods):
    bm = list(out_buffs.get(bid, {}).get('mods') or []) + [m[2] for m in mods if m[0] == 'bmod' and m[1] == bid]
    over = {m[2]: m[3] for m in mods if m[0] == 'bst' and m[1] == bid}
    return [['st', m[1], over[m[1]]] if m[0] == 'st' and m[1] in over else m for m in bm] + \
        [['st', k, v] for k, v in over.items() if not any(m[0] == 'st' and m[1] == k for m in bm)]


def targets_of(mods, me):
    out = set()
    for m in mods:
        if m[0] == 'b':
            out |= bullet_owner.get(m[1], set())
        elif m[0] == 'c' and m[1] in out_casts:
            out |= bullet_owner.get(out_casts[m[1]]['b'], set())
        elif m[0] in ('s', 'st'):
            out.add(m[1])
    out.discard(me)
    return sorted(x for x in out if x in out_skills)


def boost(t, base_mods, extra, at=None):
    base = eval_skill(t, Mods(base_mods))
    withp = eval_skill(t, Mods(base_mods + extra))
    if not withp:
        return None
    b0 = base or {'coef': 0, 'hits': 0}
    d = {'skill': t, 'atLv': at or len(self_mods.get(t, [[]])), 'dCoef': num(withp['coef'] - b0['coef'], 4)}
    cd0, cd1 = skill_cd(t, Mods(base_mods)), skill_cd(t, Mods(base_mods + extra))
    if cd0 != cd1:
        d['cd'] = cd1
    if abs(withp['hits'] - b0['hits']) > 1e-9:
        d['dHits'] = num(withp['hits'] - b0['hits'], 3)
    return d if (d['dCoef'] or 'cd' in d or 'dHits' in d) else None


buff_owner = {}
for sid, rec in out_skills.items():
    for bv in rec['lv'][-1].get('buffs', []):
        buff_owner.setdefault(bv['id'], []).append(sid)

for sid, rec in out_skills.items():
    if rec['spell'] == 1:
        continue
    for lv, row in enumerate(rec['lv'], 1):
        mods = row.get('mods', [])
        boosts = []
        for t in targets_of(mods, sid):
            tmods = [] if replaces.get(sid) == t else (self_mods[t][-1] if t in self_mods else [])
            d = boost(t, tmods, mods)
            if d:
                boosts.append(d)
        for bid in dict.fromkeys(m[1] for m in mods if m[0] == 'bst'):   # passive that changes another skill's buff
            b0, b1 = buff_mods_with(bid, []), buff_mods_with(bid, mods)
            owner = [self_mods[o][-1] for o in buff_owner.get(bid, []) if o in self_mods]
            for t in targets_of(b1, None):
                tmods = (self_mods[t][-1] if t in self_mods else []) + [m for om in owner for m in om]
                d = boost(t, tmods + b0, [m for m in b1 if m not in b0] + mods)
                if d:
                    d['whileBuff'] = bid
                    boosts.append(d)
        if boosts:
            row['boosts'] = boosts
        for bv in row.get('buffs', []):
            bm = buff_mods_with(bv['id'], mods)
            if not bm:
                continue
            bb = []
            for t in targets_of(bm, None):
                tmods = mods if t == sid else (self_mods[t][-1] if t in self_mods else []) + mods
                d = boost(t, tmods, bm, lv if t == sid else None)
                if d:
                    bb.append(d)
            if bb:
                bv['boosts'] = bb


# Spec trees
FRONT = {r['Entry']: r for r in career_skill}
spec_trees = {}
for s in spec_ids:
    nodes = []
    for r in sorted(nodes_by_spec.get(s, []), key=lambda r: (career[r['CareerEntry']]['TierStage'], r['Idx'])):
        try:
            grid = json.loads(r.get('Grid') or '[]')
        except ValueError:
            grid = []
        nodes.append({
            'node': r['Entry'], 'skill': r['SkillEntry'], 'kind': r['SkillKind'], 'career': r['CareerEntry'],
            'tier': career[r['CareerEntry']]['TierStage'], 'idx': r['Idx'], 'autoOrder': r.get('LevelupIdx', 0),
            'grid': grid, 'max': r['UpgradeTimes'],
            'unlock': job_ref(r['UnlockJoblevel']) if r.get('UnlockJoblevel') else None,
            'front': [FRONT[r['FrontSkill']]['SkillEntry'], r['FrontSkillLevel']] if r.get('FrontSkill') else None,
        })
    aw = []
    for a in [a for a in awaken_info if a['CareerSpec'] == s]:
        tiers = []
        for t in sorted([t for t in awaken_tier if t['AwakenEntry'] == a['Entry']], key=lambda t: t['AwakenTierIndex']):
            attrs = attrmap(t.get('awakenTierAttr'), t.get('awakenTierNum'))
            tiers.append({'idx': t['AwakenTierIndex'], 'need': num(t['AwakenTierRequestNum']),
                          **({'skill': t['SkillEntry']} if t.get('SkillEntry') else {}), 'attrs': attrs})
        aw.append({'id': a['Entry'], 'name': L(a['AwakenSkillName']), 'desc': L(a['AwakenSkillDes']),
                   'icon': a.get('AwakenSkillIcon'), 'gate': key(a['AwankenRequestAttr']), 'tiers': tiers})
    spec_trees[str(s)] = {'name': specs_out[str(s)]['name'], 'line': spec_line[s], 'normal': specs_out[str(s)]['normalAttack'],
                          'unreleased': specs_out[str(s)]['unreleased'], 'nodes': nodes, 'awaken': aw}

formulas_used = sorted({b['f'] for b in out_bullets.values() if b.get('f')})
write('skills', {
    'formulas': {str(f): formula_cfg[f]['KeyEn'] for f in formulas_used if f in formula_cfg},
    'specs': spec_trees,
    'skills': {str(k): v for k, v in out_skills.items()},
    'casts': {str(k): v for k, v in sorted(out_casts.items())},
    'bullets': {str(k): v for k, v in sorted(out_bullets.items())},
    'triggers': dict(sorted(out_trigs.items())),
    'buffs': dict(sorted(out_buffs.items())),
})

# Double Strafe check (gear.md §4.5): per-arrow 0.9 -> 1.3, per cast 1.8 -> 2.6, CD 4.8 + 1.2
ds = out_skills.get(40101)
if ds:
    got = [(r['coef'], r['hits'], r['parts'][0]['mul']) for r in ds['lv']]
    want = [(1.8, 2, 0.9), (2.0, 2, 1.0), (2.2, 2, 1.1), (2.4, 2, 1.2), (2.6, 2, 1.3)]
    ok = got == want and ds['cd'] == [0, 4.8, 1.2] and [r['br'] for r in ds['lv']] == [0.036, 0.042, 0.048, 0.054, 0.06]
    print('Double Strafe check:', 'PASS' if ok else f'FAIL {got} cd={ds["cd"]}')
for w in sorted(set(warnings)):
    print('warning:', w)
