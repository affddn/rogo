"""Pinned class gates and primary-point recommendations; never choose a class for the user."""
import json
import math
import struct
from functools import cache
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / 'web/public/data'
PRIMARY = ('STR','AGI','VIT','INT','DEX','LUK')
ATTRS = (1011,1021,1031,1041,1051,1061)

@cache
def jobs():
    return json.loads((DATA/'jobs.json').read_bytes())

@cache
def skill_data():
    return json.loads((DATA/'skills.json').read_bytes())

@cache
def stages():
    return {s['entry']:s for s in json.loads((DATA/'stages.json').read_bytes())}


def point_cost(n):
    q,r=divmod(n,5)
    return 5*q*(q+1)//2+r*(q+1)


def allocation(build):
    values={a:0 for a in ATTRS}
    seen=set()
    for row in build.get('attrs',[]):
        key=row.get('attrId');v=row.get('value',0)
        if key not in values or key in seen or not isinstance(v,(float,int)) or not math.isfinite(v) or int(v)!=v or not 0<=v<=100000:
            return None
        seen.add(key);values[key]=int(v)
    return [values[a] for a in ATTRS]


def f32(value):
    return struct.unpack('f',struct.pack('f',value))[0]


def recommend(before, budget, ratios):
    """HeroAddStatusPanel + AttrPointAllocator, including its stop when the next pick is unaffordable."""
    result=list(before)
    indices=[i for i,r in enumerate(ratios) if r>0]
    if not indices:return result,budget
    for i in sorted(indices,key=lambda i:-ratios[i]):
        if result[i]==0:
            if budget<1:break
            result[i]+=1;budget-=1
    base=next((i for i in indices if abs(ratios[i]-1)<0.001),min(indices,key=lambda i:ratios[i]))
    while budget>0:
        divisor=max(1,result[base])
        pick=max(indices,key=lambda i:f32(ratios[i]-f32(result[i]/divisor)))
        cost=result[pick]//5+1
        if cost>budget:break
        result[pick]+=1;budget-=cost
    return result,budget


# Skills: GameLogic.SkillAutoAllocator / HeroSpellPanel (SEA 0.0.163). One point per level, a
# skill's maximum is CareerSkillCfg.UpgradeTimes, five loadout slots (CareerBuildData).
ACTIVE_SKILL = 2  # excelConfig.SpellKind.ActiveSkill
SLOTS = 5


@cache
def skill_tree(spec):
    """CareerSkillCfg rows for one build, or None when the export can't be mapped back exactly."""
    data = skill_data()
    tree = data['specs'].get(str(spec))
    if not tree or not tree['nodes']:
        return None
    by_skill = {n['skill']: n for n in tree['nodes']}
    if len(by_skill) != len(tree['nodes']):
        return None
    job_idx = {(r['tier'], r['lv']): r['idx'] for r in jobs()['jobLevels']}
    rows = []
    for n in tree['nodes']:
        front = by_skill.get(n['front'][0]) if n['front'] else None
        if (n['front'] and not front) or (n['unlock'] and tuple(n['unlock']) not in job_idx):
            return None
        rows.append({'entry': n['node'], 'tier': n['tier'], 'idx': n['idx'], 'levelup': n['autoOrder'],
                     'max': n['max'], 'unlock': job_idx[tuple(n['unlock'])] if n['unlock'] else 0,
                     'front': front['node'] if front else 0, 'frontLevel': n['front'][1] if front else 0,
                     'active': data['skills'].get(str(n['skill']), {}).get('spell') == ACTIVE_SKILL,
                     'name': data['skills'].get(str(n['skill']), {}).get('name') or str(n['skill'])})
    return rows


def allocate_skills(rows, levels, points, job_level, tier):
    """SkillAutoAllocator.AutoAllocateSkillPoints, starting from `levels` with `points` unspent.

    The game's Recommend button runs it from zero over the whole pool; starting from the current
    levels never lowers a skill (no refund), and from zero levels it is the game's recommendation."""
    temp = {r['entry']: levels.get(r['entry'], 0) for r in rows}
    by_entry = {r['entry']: r for r in rows}
    left = points

    def prerequisite(front, need, depth):
        nonlocal left
        if depth > 10:
            return False
        if front is None or temp[front['entry']] >= need:
            return True
        if front['unlock'] > job_level:
            return False
        if front['front'] and front['frontLevel'] and not prerequisite(by_entry.get(front['front']), front['frontLevel'], depth + 1):
            return False
        while temp[front['entry']] < need and left > 0:
            temp[front['entry']] += 1
            left -= 1
        return temp[front['entry']] >= need

    def activate(row, depth):
        nonlocal left
        if depth > 10:
            return False
        if temp[row['entry']] > 0:
            return True
        if row['front'] and row['frontLevel'] and not prerequisite(by_entry.get(row['front']), row['frontLevel'], depth + 1):
            return False
        if left <= 0:
            return False
        temp[row['entry']] += 1
        left -= 1
        return True

    eligible = [r for r in rows if r['tier'] <= tier]
    for group_tier in sorted({r['tier'] for r in eligible}):
        if left <= 0:
            break
        group = sorted((r for r in eligible if r['tier'] == group_tier), key=lambda r: r['idx'])
        for row in group:
            if left <= 0:
                break
            if temp[row['entry']] <= 0 and row['unlock'] <= job_level:
                activate(row, 0)
        for row in sorted(group, key=lambda r: r['levelup']):
            if left <= 0:
                break
            if temp[row['entry']] > 0:
                add = min(row['max'] - temp[row['entry']], left)
                if add > 0:
                    temp[row['entry']] += add
                    left -= add
    return temp, left


def fill_loadout(rows, levels, slots):
    """Put learned, unequipped active skills into empty slots, in the order the game's Recommend
    uses (CareerSkillCfg.Idx, highest first). Equipped skills are never moved or removed."""
    equipped = set(slots)
    waiting = sorted((r for r in rows if r['active'] and levels.get(r['entry'], 0) > 0 and r['entry'] not in equipped),
                     key=lambda r: -r['idx'])
    after = list(slots)
    for i, entry in enumerate(after):
        if entry == 0 and waiting:
            after[i] = waiting.pop(0)['entry']
    return after


def skill_state(info, active, spec):
    """Current levels, loadout and budget for the active build, or None if they don't add up."""
    rows = skill_tree(spec)
    total = info.get('totalSkillPoint', 0)
    if rows is None or active is None or type(total) is not int or not 0 <= total <= 100000:
        return None
    known = {r['entry']: r for r in rows}
    levels = {}
    for s in active.get('skills', []):
        entry, level = s.get('entry'), s.get('level', 0)
        if entry not in known or entry in levels or type(level) is not int or not 0 <= level <= known[entry]['max']:
            return None
        if level:
            levels[entry] = level
    used = active.get('usedSkillPoint', 0)
    raw = active.get('useSkillEntrys', [])
    if sum(levels.values()) != used or used > total or len(raw) > SLOTS:
        return None
    # The client sends 0 for any slot it can't resolve to this build's skills (CareerBuildData).
    slots = [e if e in known else 0 for e in raw] + [0] * (SLOTS - len(raw))
    return {'rows': rows, 'levels': levels, 'used': used, 'total': total, 'slots': slots}


def career_info(entry):
    for line in jobs()['lines']:
        for career in line['jobs']:
            if career['career']==entry:return line,career
    return None,None


def build_state(data, rules, opened):
    info=data.get('jobInfo',{})
    career=info.get('careerEntry',0);spec=info.get('currCareerBuild',0)
    line,config=career_info(career)
    if not config or str(spec) not in jobs()['specs']:return None
    active=next((b for b in info.get('builds',[]) if b.get('build')==spec),{})
    level=rules['jobLevels'].get(str(info.get('jobEntry')),0)
    choices=[]
    for key,s in jobs()['specs'].items():
        n=int(key)
        if s['unreleased'] or (n==11 and spec!=11):continue
        need=rules['specUnlock'].get(key)
        unlock=need is not None and (not need or level>=rules['jobLevels'].get(str(need),10**9))
        same=line['kind']==s['line']
        # A Novice chooses a first class only through completed transfer tasks, not Job Switch.
        available=unlock and (same or config['tier']>0 and opened(302))
        if spec==11 and not same:available=unlock and can_advance(data,config)
        choices.append({'spec':n,'line':s['line'],'name':next(l['name'] for l in jobs()['lines'] if l['kind']==s['line'])+' · '+s['name'],
                        'available':available,'reason':None if available else 'Class switch or specialization is not unlocked.'})
    # Allocation and skill levels let a long run tell whether a retried fight uses a different build.
    skills=sum(int(s.get('level') or 0) for s in active.get('skills',[]) if isinstance(s,dict))
    sk=skill_state(info,active or None,spec)
    return {'career':career,'spec':spec,'line':line['kind'],'className':config['name'],
            'specName':jobs()['specs'][str(spec)]['name'],'freePoints':max(0,info.get('totalAttrPoint',0)-active.get('usedAttrPoint',0)),
            'stats':allocation(active),'skillLevels':skills,
            'freeSkillPoints':sk['total']-sk['used'] if sk else None,
            'loadout':sk['slots'] if sk else None,'choices':choices}


def can_advance(data,config):
    rule=next((r for r in jobs()['jobChange'] if r['fromTier']==config['tier']),None)
    if not rule:return False
    received={t.get('entry') for t in data.get('tasks',{}).get('tasks',[]) if t.get('rewardsReceived')}
    needed={t['id'] for g in rule['groups'] for t in g['tasks']}
    return bool(needed) and needed<=received


def proposals(data, rules, opened, add):
    state=build_state(data,rules,opened)
    if state is None:return
    info=data['jobInfo'];spec=state['spec']
    line,config=career_info(state['career'])
    evidence={'career':state['career'],'spec':spec,'job':info.get('jobEntry')}
    if can_advance(data,config):
        targets=[c for l in jobs()['lines'] for c in l['jobs'] if c['tier']==config['tier']+1 and (config['tier']==0 or l['kind']==line['kind'])]
        for target in targets:
            targetline=career_info(target['career'])[0]['kind']
            add('build',4521,'Advance to '+target['name'],'All class-transfer quest rewards are claimed. Advances one tier; no purchase.',
                {'careerEntry':target['career']},evidence=evidence,
                development={'type':'advance','line':targetline,'career':target['career'],'spec':target['defaultSpec']})
    if config['tier']>0 and opened(302):
        for other in jobs()['lines']:
            if other['kind']==line['kind']:continue
            target=next((c for c in other['jobs'] if c['tier']==config['tier']),None)
            if target:
                add('build',4521,'Switch class: '+target['name'],f"{config['name']} → {target['name']}, same career tier. Uses the game's Job Switch, not a purchase. Your active skills/build may change.",
                    {'careerEntry':target['career']},evidence=evidence,
                    development={'type':'class','line':other['kind'],'career':target['career'],'spec':target['defaultSpec']})
    for choice in state['choices']:
        if choice['available'] and choice['line']==line['kind'] and choice['spec']!=spec:
            add('build',4523,'Activate '+choice['name'],'Switch to this unlocked specialization. Its saved stats and skills become active.',
                {'build':choice['spec']},evidence=evidence,
                development={'type':'spec','line':line['kind'],'career':state['career'],'spec':choice['spec']})
    active=next((b for b in info.get('builds',[]) if b.get('build')==spec),None)
    if active is None:return
    skill_proposals(info,active,state,line,evidence,rules['jobLevels'].get(str(info.get('jobEntry')),0),add)
    before=allocation(active);total=info.get('totalAttrPoint',0);used=active.get('usedAttrPoint',0)
    ratios=jobs()['specs'][str(spec)].get('ratio')
    if before is None or not ratios or type(total) is not int or not 0<total<=100000 or sum(point_cost(n) for n in before)!=used or used>total:return
    ratios=[ratios[k.lower()] for k in PRIMARY]
    for reset in (False,True):
        start=[0]*6 if reset else before
        after,left=recommend(start,total if reset else total-used,ratios)
        if after==before or (reset and not used):continue
        delta=[a-b for a,b in zip(after,start)]
        if not any(delta):continue
        stats=[{'name':name,'before':a,'after':b} for name,a,b in zip(PRIMARY,before,after)]
        label='Rebuild recommended stats' if reset else 'Allocate unused stat points'
        detail=' · '.join(f'{name} {a} → {b}' for name,a,b in zip(PRIMARY,before,after) if a!=b)
        detail+=f'. {left} point(s) remain. '+('Resets this build first, then allocates; two requests, no paid reset.' if reset else 'Existing points stay allocated.')
        add('build',4529,label+' · '+state['specName'],detail,
            {'attrs':[{'attrId':a,'value':n} for a,n in zip(ATTRS,delta) if n]},
            target={'spec':spec,'reset':reset},evidence=[evidence,total,active],
            development={'type':'rebuild' if reset else 'stats','line':line['kind'],'career':state['career'],'spec':spec,
                         'stats':stats,'totalPoints':total,'usedPoints':total-left})


def skill_proposals(info, active, state, line, evidence, level, add):
    """`level` is JobLevelInfo[JobEntry].UnlockJoblevel, the gate SkillAutoAllocator compares with."""
    spec=state['spec']
    sk=skill_state(info,active,spec)
    if sk is None:return
    tier=career_info(state['career'])[1]['tier']
    rows,before=sk['rows'],sk['levels']
    names={r['entry']:r['name'] for r in rows}
    free=sk['total']-sk['used']
    if free>0:
        after,left=allocate_skills(rows,before,free,level,tier)
        after={e:n for e,n in after.items() if n}
        if after!=before:
            changes=[{'entry':r['entry'],'name':r['name'],'before':before.get(r['entry'],0),'after':after.get(r['entry'],0)}
                     for r in rows if before.get(r['entry'],0)!=after.get(r['entry'],0)]
            detail=' · '.join(f"{c['name']} {c['before']} → {c['after']}" for c in changes)
            detail+=f". {left} skill point(s) remain. The game's skill allocator (Recommend) applied to unspent points; no level is lowered and the loadout is unchanged."
            add('build',4525,'Allocate unspent skill points · '+state['specName'],detail,
                {'build':spec,'skills':[{'entry':r['entry'],'level':after[r['entry']]} for r in rows if after.get(r['entry'])],
                 'useSkillEntrys':sk['slots']},
                target={'spec':spec,'skills':True},evidence=[evidence,sk['total'],active],
                development={'type':'skills','line':line['kind'],'career':state['career'],'spec':spec,
                             'skills':changes,'totalPoints':sk['total'],'usedPoints':sum(after.values()),'slots':sk['slots']})
            return  # equip after the points are confirmed, as the client requires
    slots=fill_loadout(rows,before,sk['slots'])
    if slots!=sk['slots']:
        added=[names[e] for e,old in zip(slots,sk['slots']) if e!=old]
        add('build',4533,'Equip learned skills · '+state['specName'],
            'Fills empty skill slots with learned active skills (game Recommend order); equipped skills stay. '+', '.join(added)+'.',
            {'build':spec,'useSkillEntrys':slots},target={'spec':spec,'loadout':True},evidence=[evidence,active],
            development={'type':'loadout','line':line['kind'],'career':state['career'],'spec':spec,
                         'before':sk['slots'],'after':slots,'names':added})

