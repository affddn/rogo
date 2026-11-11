"""Derive recommendations from one account read. No I/O or gateway sends in the planner."""
import hashlib
import json
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from routine.progression import proposals, stages

ROOT = Path(__file__).resolve().parent
RULES = json.loads((ROOT / 'rules.json').read_bytes())

@cache
def modes():
    return json.loads((ROOT.parents[1] / 'web/public/data/modes.json').read_bytes())['modes']

FREE = {4103,4203,4209,4219,4223,4225,4233,4235,4237,4239,4247,4483,4491,4495,
        4615,4623,4647,4665,4703,4721,5071,6011,7001,7007,7023,7029}
SWEEP = {5011,5047,5057,4477}
FIGHTS = {4473,5001,5013,5033,5043}

@dataclass(frozen=True)
class Step:
    kind: str
    title: str
    detail: str
    command: int
    payload: dict
    key: str
    # State token is not a credential. It prevents a newer milestone or tier being substituted under review.
    proof: str
    power_ratio: float | None = None
    auto_group: str | None = None
    available: int | None = None
    development: dict | None = None
    stage_entry: int | None = None
    next_stage: int | None = None
    assist: dict | None = None
    def view(self):
        return {'key':self.key,'kind':self.kind,'title':self.title,'detail':self.detail,'command':self.command,'powerRatio':self.power_ratio,
                'revision':self.proof,'autoGroup':self.auto_group,'available':self.available,'development':self.development,'stageEntry':self.stage_entry,'nextStage':self.next_stage,'assist':self.assist}

def num(v):
    return int(v or 0)

def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def function_open(data, now, offset, entry):
    f=RULES['functions'].get(str(entry))
    if not f:return False
    _,level,stage,job,days,task,_,_=f
    player=data['player']['player']
    ts=num(player.get('playerCreateTime'))
    age=(now+offset)//86400-(ts+offset)//86400+1 if 0<ts<=now else 0
    tasks=data.get('tasks',{})
    done={num(k) for k,v in tasks.get('mainTaskReceived',{}).items() if v}
    done.update(r['entry'] for r in tasks.get('tasks',[]) if r.get('rewardsReceived'))
    job_level=RULES['jobLevels'].get(str(data.get('jobInfo',{}).get('jobEntry')),0)
    return (num(player.get('level'))>=level and num(data.get('stage',{}).get('last_stage'))>=stage and
            job_level>=job and (not days or age>=days) and (not task or task in done))


def build(data, emails, guild, now, offset, tower=None, arena=None, world=None,opponents=None):
    steps = {}
    def add(kind, cmd, title, detail, payload=None, target=None, evidence=None, power_ratio=None, auto_group=None, available=None, development=None, stage_entry=None, next_stage=None):
        assert cmd in {'claim':FREE,'sweep':SWEEP,'fight':FIGHTS,'duel':{5063},'offer':{4191},'build':{4521,4523,4525,4529,4533}}[kind]
        payload = payload or {}
        key = f'{kind}:{cmd}:' + digest(target if target is not None else payload)[:20]
        steps[key] = Step(kind,title,detail,cmd,payload,key,digest([payload,evidence]),power_ratio,auto_group,available,development,stage_entry,next_stage)
    def claim(cmd,title,detail,payload=None,**kw):
        add('claim',cmd,title,detail,payload,**kw)
    def day_since(ts):
        ts = num(ts)
        return (now+offset)//86400 - (ts+offset)//86400 if 0 < ts <= now else -1
    def active(row,start='startTime',end='endTime'):
        return num(row.get(start)) <= now and (not num(row.get(end)) or now < num(row[end]))
    player = data['player']['player']
    tasks = data.get('tasks',{})
    done = {num(k) for k,v in tasks.get('mainTaskReceived',{}).items() if v}
    done.update(r['entry'] for r in tasks.get('tasks',[]) if r.get('rewardsReceived'))
    def opened(n):
        return function_open(data,now,offset,n)

    # Most urgent first, then prerequisites (tasks unlock score and preview rewards on the next scan).
    carnival_start=num(tasks.get('carnivalTaskInfo',{}).get('openTime'))
    carnival_day=day_since(carnival_start)+1 if carnival_start and now<carnival_start+30*86400 and opened(1201) else 0
    for q in data.get('timeLimitedQuests',[]):
        deadline=num(q.get('deadLineTime')) or num(q.get('startTime'))+RULES['questDeadlines'].get(str(q.get('questEntry')),0)
        if deadline and deadline<=now: continue
        if (q.get('id') and not q.get('received') and (q.get('complete') or q.get('canReceive')) and
                all(not num(q.get(x)) or num(q[x])>now for x in ('expireTime','deadLineTime'))):
            claim(4237,'Limited-time quest','Completed; claim before its deadline.',{'id':q['id']})
    if emails is not None:
        ids=sorted({e['id'] for e in emails if e.get('id') and not e.get('received') and
                    any(e.get('rewards',{}).get(k) for k in ('items','equips','weapons','cards','pets','equip_previews','legacies'))})
        if ids:
            claim(4103,'Mail attachments',f'{len(ids)} messages with uncollected attachments. Mail is not deleted.',{'emailIds':ids})
    groups={1:'Main quest',2:'Daily quest',3:'Achievement',5:'Weekly quest',6:'Class / dungeon task',8:'Carnival',9:'Guild quest'}
    for r in tasks.get('tasks',[]):
        entry=num(r.get('entry')); cfg=RULES['tasks'].get(str(entry)); progress=num(r.get('progress'))
        if not cfg or entry in done or progress<cfg[1]: continue
        kind,threshold,name,group=cfg
        if kind==8 and not (0<group<=min(14,carnival_day)):continue
        if str(entry) in RULES['weapons']:
            claim(4615,'Weapon mastery',name,{'achievement_entry':RULES['weapons'][str(entry)]})
        elif kind in groups:
            claim(4223,groups[kind],f'{name} ({progress}/{threshold})',{'taskEntry':entry})
    for section,key,cmd in [('dailyTaskInfo','daily',4225),('weeklyTaskInfo','weekly',4233),
                            ('guildDailyTaskInfo','guild',4247),('carnivalTaskInfo','carnival',4235)]:
        if key=='carnival' and not carnival_day:continue
        score=tasks.get(section,{}).get('scoreInfo',{})
        ready=[x for x in RULES['score'][key] if x<=num(score.get('score')) and x not in score.get('receivedRewards',[])]
        if ready: claim(cmd,key.capitalize()+' activity rewards','Reached score: '+', '.join(map(str,ready)),evidence=ready)
    for row in data.get('bps',[]):
        if row.get('allCompleted') or not active(row,'activeTime','disappearTime'): continue
        bp=num(row.get('entry')); lvl=num(row.get('level'))
        flags={i['rewardEntry']:i.get('receiveStatus',[]) for i in row.get('receives',[]) if i.get('rewardEntry')}
        ids=RULES['bpEntitlements'].get(str(bp)) or []
        paid=bool(set(ids if isinstance(ids,list) else [ids]) & set(row.get('rechargeEntry',[])))
        ready=[]
        for entry,parent,need in RULES['bp']:
            if bp!=parent or lvl<need: continue
            free,premium=(flags.get(entry,[])+[False,False])[:2]
            if not free or (paid and not premium):ready.append(entry)
        if ready: claim(4209,f'Pass {bp} rewards',f'{len(ready)} earned reward rows; no levels purchased.',{'bpEntry':bp,'buyLevel':0},evidence=ready)
    for row in data.get('signins',[]):
        if not active(row,'activeTime','expireTime'):continue
        today=day_since(row.get('activeTime'))+1
        flags={i['rewardEntry']:i.get('receiveStatus',[]) for i in row.get('receives',[]) if i.get('rewardEntry')}
        for entry,parent,day in RULES['signins']:
            free,paid=(flags.get(entry,[])+[False,False])[:2]
            if row.get('entry')==parent and ((day==today and not free) or (row.get('bought') and free and day<=today and not paid)):
                claim(7007,f'Day {day} sign-in','Regular earned reward; no paid catch-up.',{'rewardEntry':entry})
    # The free gift is a distinct zero-argument claim. No shop or recharge request is used.
    if opened(20) and not data.get('monthCardDailyFreeRewardReceived'):
        claim(4239,'Daily free gift','Monthly-card page free reward; no purchase.')
    if any(r.get('lastDay') and not r.get('dailyRewardReceived') for r in data.get('monthCards',[])):
        claim(4219,'Monthly-card rewards','Daily rewards on an already active entitlement.')
    for r in data.get('firstRecharges',[]):
        entry=num(r.get('entry'));flags=r.get('rewardsStatus',[])
        due=[i for i in range(RULES['firstRecharge'].get(str(entry),0)) if i<=day_since(r.get('activeTime')) and not (i<len(flags) and flags[i])]
        if due:claim(4203,'First-recharge entitlement','Claim an existing entitlement only.',{'entry':entry},evidence=due)
    for field,sys,items,key,cmd,title in [('cardInfo','card_sys','cards','cards',4665,'Card album'),('legacy_info','legacy_sys','legacies','legacy',4703,'Collection Gear')]:
        block=data.get(field,{})
        if sys not in block:continue
        entry=num(block[sys].get('bonus_received_entry'))+1
        threshold=RULES[key].get(str(entry))
        stars=sum(num(r.get('star')) for r in block.get(items,[]))
        if threshold is not None and stars>=threshold:
            claim(cmd,title+' milestone',f'{stars} stars; {threshold} required.',{'bonus_entry':entry} if cmd==4703 else {},evidence=entry)
    for summon in data.get('summons',[]):
        entry=summon.get('entry')
        if entry not in (1000,2000): continue
        try: ext=json.loads(summon.get('extData') or '{}')
        except (ValueError,TypeError): continue
        if not isinstance(ext,dict):continue
        level=ext.get('level');claimed=ext.get('claimed_level',0)
        if type(level) is int and type(claimed) is int and level>=2 and level>claimed:
            claim(4623 if entry==1000 else 4647,('Weapon' if entry==1000 else 'Pet')+' summon level reward',f'Reached summon level {level}; does not summon.',evidence=[level,claimed])
    team=data.get('team_pve_player_data',{})
    if num(team.get('achievement_level'))>num(team.get('claimed_level')):
        claim(6011,'Team dungeon achievement',f"Reached level {team['achievement_level']}.",evidence=team['achievement_level'])
    collected=set(data.get('function_preview_reward',{}).get('entry',[]))
    for sid,cfg in RULES['functions'].items():
        entry=int(sid)
        if cfg[6] and entry not in collected and opened(entry):
            claim(4491,'Feature unlocked: '+cfg[7],'Unclaimed feature preview reward.',{'functionEntry':entry})
    for r in data.get('legacy_summons',[]):
        ready=[(n.get('round'),n.get('progress')) for n in r.get('progress',{}).get('nodes',[]) if n.get('can_claim') and not n.get('claimed')]
        if ready and r.get('summon_entry'):
            claim(4721,'Collection Wish progress','Earned milestone; does not draw.',{'summon_entry':r['summon_entry']},evidence=ready)
    act=data.get('actInfo',{})
    film=act.get('filmSummonInfo',{})
    ready=[x for x in RULES['score']['film'] if x<=num(film.get('totalCount')) and x not in film.get('claimedProgress',[])]
    if ready and active(film):claim(7029,'Film summon milestones','Existing summon progress only; no ad or draw.',evidence=ready)
    live={r['actId']:r for r in act.get('actInfos',[]) if r.get('actId') and not r.get('isEnd') and active(r)}
    for r in act.get('actTasks',[]):
        entry=num(r.get('taskEntry'));need=RULES['events'].get(str(entry))
        if need and r.get('actId') in live and r.get('groupId') and not r.get('received') and num(r.get('progress'))>=need:
            claim(7001,'Event task rewards',f"Completed tasks in event {r['actId']}, group {r['groupId']}.",{'actId':r['actId'],'groupId':r['groupId']})
    for r in act.get('summonActInfo',[]):
        cfg=r.get('config',{});state=r.get('data',{});common=cfg.get('commonActInfo',{})
        if not common.get('actId') or common.get('actId')!=state.get('actId') or not active(common):continue
        try: targets=[row[0] for row in json.loads(cfg.get('progressReward') or '[]') if isinstance(row,list) and len(row)>=4 and type(row[0]) is int]
        except (ValueError,TypeError):continue
        targets=targets or RULES['treasure'].get(str(state.get('actId')),[])
        ready=[x for x in targets if 0<x<=num(state.get('totalCount')) and x not in state.get('status',[])]
        if ready: claim(7023,'Treasure summon milestones','Claim milestones already reached; no summons.',{'actId':state['actId']},evidence=ready)
    if guild:
        if num(guild.get('loot_chest_count'))>0:
            claim(4495,'Guild Hunt loot',f"{guild['loot_chest_count']} chest(s) earned.",evidence=guild['loot_chest_count'])
        ready=[k for k,v in RULES['guildScore'].items() if v<=num(guild.get('total_score')) and int(k) not in set(map(int,guild.get('personRewardStatus',[])))]
        if ready:claim(4483,'Guild Hunt score rewards','Personal milestones reached.',evidence=ready)
        left=modes()['guildBoss']['dailyChallenges']-num(guild.get('challengeCount'))
        if left>0 and num(guild.get('GuildBossEntry')):
            add('fight',4473,'Guild Hunt challenge',f"Stage {guild['GuildBossEntry']}. Uses one of {left} attempts.",{},evidence=num(guild['GuildBossEntry']),auto_group='guild',available=left)
        if left>0 and num(guild.get('history_week_score'))>0:
            add('sweep',4477,'Sweep Guild Hunt once',f'{left} challenge(s) left; consumes one.',evidence=guild.get('GuildBossEntry'),auto_group='guild',available=left)
    if tower and tower.get('stage_entry') and not tower.get('has_unsettled_fight'):
        left=modes()['endlessTower']['dailyFreeSweeps']-num(tower.get('daily_free_sweep_used'))
        if left>0:add('sweep',5057,'Free Endless Tower sweep',f'{left} free sweep(s) left. No ad.',{'sweep_type':0},evidence=tower['stage_entry'],auto_group='tower',available=left)
    if arena:
        claimed={r.get('tier') for r in arena.get('award_time',[]) if num(r.get('award_time'))>0}
        ready=[r['entry'] for r in modes()['arena']['tiers'] if r['minScore']<=max(num(arena.get('max_score')),num(arena.get('score'))) and r['entry'] not in claimed and r.get('reward')]
        if ready:claim(5071,'Rune Arena tier rewards','Reached an unclaimed tier.',evidence=ready)

    # Sweep highest proven clear; keep every limited attempt out of the claim batch.
    power=num(player.get('ability'))
    def difficulties(stages,passed):
        cleared=next((s for s in stages if s['entry']==passed),None)
        if passed and not cleared:return None,None
        index=stages.index(cleared)+1 if cleared else 0
        return cleared, stages[index] if index<len(stages) else None
    def challenge(cmd,label,stage,field,cost,group,available):
        req=stage.get('recommendedPower') or 0
        hint=(f' Suggested power {req:,}; yours {power:,}.' if req and power else '')
        add('fight',cmd,label+' · '+stage['name'],cost+hint,{field:stage['entry']},power_ratio=round(power/req,4) if req and power else None,auto_group=group,available=available)
    bags={num(r.get('entry')):num(r.get('count')) for r in data.get('items',[])}
    if 'store' in data:
        bought={r['entry']:num(r.get('buyCount')) for r in data['store'].get('goods',[]) if r.get('entry')}
        for shop in free_shop_offers():
            if not opened(shop['func']) or (shop['name']=='Guild Shop' and not guild): continue
            if bought.get(shop['entry'],0)>=shop['limit']: continue
            add('offer',4191,shop['name']+' · '+shop['gift'],'One zero-price catalog listing. Separate from earned rewards.',{'goodEntry':shop['entry'],'buyCount':'1'},evidence=bought.get(shop['entry'],0))
    arena_tickets=bags.get(int(modes()['arena']['tickets']['item'].split(':')[1]),0)
    if arena_tickets and opened(809) and opponents:
        choices=sorted(opponents,key=lambda r:num(r.get('player',{}).get('ability')))
        for r in choices:
            enemy=r.get('player',{}); target=str(enemy.get('playerId') or '')
            if not target.isdecimal() or num(target)<=0 or num(target)==num(player['id']):continue
            add('duel',5063,'Arena: '+(enemy.get('nickname') or 'opponent'), f"Power {num(enemy.get('ability')):,}; one of {arena_tickets} tickets. No reroll or purchase.",{'target_player_id':target},auto_group='arena',available=arena_tickets,power_ratio=round(power/num(enemy['ability']),4) if power and num(enemy.get('ability')) else None)
    for cat in modes()['resInstances']['categories']:
        if not opened(cat['unlock']['func']):continue
        item=int(cat['ticket']['item'].split(':')[1]); tickets=bags.get(item,0)
        if tickets<=0:continue
        passed=num(data.get('resStageEntrys',{}).get(str(cat['category'])))
        cleared,nxt=difficulties(cat['stages'],passed)
        if nxt:challenge(5013,cat['name'],nxt,'res_stage_entry',f'One ticket; {tickets} held.',f"realm:{cat['category']}",tickets)
        if cleared:add('sweep',5011,'Sweep '+cat['name'],f"Highest clear: {cleared['name']}. One of {tickets} tickets.",{'res_stage_entry':passed},auto_group=f"realm:{cat['category']}",available=tickets)
    records={r['mvp_entry']:r for r in data.get('mvp_player_data',{}).get('challenges',[]) if r.get('mvp_entry')}
    extra=sum(RULES['mvpBonus'].get(str(m['entry']),0) for m in data.get('monthCards',[]) if m.get('entry') and m.get('lastDay'))
    for boss in modes()['mvp']['bosses']:
        if not opened(807) or not opened(boss['unlock']['func']):continue
        mvp=boss['entry'];r=records.get(mvp,{});passed=num(r.get('max_cleared_stage_entry'))
        cleared,nxt=difficulties(boss['stages'],passed)
        if nxt:challenge(5043,'MVP',nxt,'stage_entry','One challenge for the next difficulty.',f'mvp:{mvp}',1)
        left=boss['dailySweeps']+extra-num(r.get('daily_sweep_used'))
        if cleared and left>0:
            add('sweep',5047,'Sweep '+boss['name'],f"{cleared['name']}; use one of {left} sweeps.",{'mvp_entry':mvp,'stage_entry':passed,'count':1},auto_group=f'mvp:{mvp}',available=left)
    if world and world.get('boss_entry') and opened(806):
        stage=num(world['boss_entry'])
        add('fight',5033,'Baphomet challenge',f'Fight current world boss {stage} once. No manual dodges.',{},evidence=stage,auto_group='world',available=1)
    proposals(data,RULES,opened,add)
    current=num(data.get('stage',{}).get('curr_stage'))
    stage=stages().get(current)
    if stage:
        entries=list(stages())
        idx=entries.index(current)
        next_stage=entries[idx+1] if idx+1<len(entries) else None
        add('fight',5001,'Campaign boss · '+stage['id'],'Challenge the current campaign stage once; the local battle engine supplies the real settlement. Stop on defeat.',
            {'stage_entry':current},evidence=current,auto_group='campaign',available=1,stage_entry=current,next_stage=next_stage)
    return steps

@cache
def free_shop_offers():
    stores=json.loads((ROOT.parents[1]/'web/public/data/shops.json').read_bytes())['stores']
    return [{'name':s['name'],'func':s['funcId'],'entry':g['id'],'limit':g['limit'],
             'gift':', '.join(f"{i['name']} ×{i['amount']}" for i in g['items'])}
            for s in stores if s['kind'] in ('mall','shop')
            for g in s['goods'] if g['pay']=='free' and g.get('limit',0)>0]
