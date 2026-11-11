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
    return {'career':career,'spec':spec,'line':line['kind'],'className':config['name'],
            'specName':jobs()['specs'][str(spec)]['name'],'freePoints':max(0,info.get('totalAttrPoint',0)-active.get('usedAttrPoint',0)),
            'choices':choices}


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
