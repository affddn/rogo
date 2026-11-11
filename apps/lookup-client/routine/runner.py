"""Session-owned scans and bounded reviewed runs. The browser selects opaque proposals, never arbitrary packets."""
import time
import uuid
from google.protobuf import json_format
from google.protobuf.message import DecodeError
from websockets.exceptions import WebSocketException
from wire_probe import msg
from campaign import CampaignError, preflight, simulate, run_campaign, VERSION
from routine.dungeon import DungeonAssist, DungeonEvents, DungeonError
from routine.progression import build_state, allocation, career_info
from routine.planner import build, modes, digest, RULES, function_open

MAX_STEPS = 24

class ProgressionError(Exception):
    pass

class RoutineError(Exception):
    pass

def as_dict(message):
    return json_format.MessageToDict(message, preserving_proto_field_name=True)

def query_request(pool, profile):
    return msg(pool,'QueryPlayerDataReq')(accountId=profile,clientInfo={
        'appVersion':'0.0.163','bundleId':'com.ggv.rogosea.aos','platform':'Android','systemLang':'en','clientFightVersion':VERSION})

class Routine:
    def __init__(self, pool, channel, profile, realm, actions, rejected, validate=None):
        self.pool,self.channel,self.profile,self.realm=pool,channel,profile,str(realm)
        self.actions,self.rejected,self.validate=actions,rejected,validate
        self.session_id=uuid.uuid4().hex
        self.scan_id=None
        self.steps={}
        self.last_scan=0
        self.battle_uncertain=False
        if not isinstance(getattr(channel,'events',None),DungeonEvents):channel.events=DungeonEvents(pool,channel.player_id)
        self.dungeon=DungeonAssist(self)

    def call(self, command, payload):
        item=self.actions[command]
        request=json_format.ParseDict(payload,msg(self.pool,item['request']['name'])(),descriptor_pool=self.pool)
        return self.channel.exchange(command,request)

    def collect(self):
        clock=self.call(4009,{'time':int(time.time())})
        now,offset=clock.time,clock.time_zone_offset
        if not now: raise RoutineError('routine_clock_unavailable')
        offset=max(-50400,min(50400,offset if abs(offset)>14 else offset*3600))
        info=self.channel.exchange(4005,query_request(self.pool,self.profile)).login_data
        player=info.player.player
        if player.id!=self.channel.player_id or (player.server_id and player.server_id!=self.realm):
            raise RoutineError('snapshot_invalid')
        # Only eligibility and proposal labels leave this worker, never the raw bootstrap or inbox.
        data=as_dict(info)
        warnings=[]
        def optional(n,path,label):
            try:
                reply=as_dict(self.call(n,{}))
                return reply.get(path) if path else reply
            except self.rejected as exc:
                warnings.append(f'{label} not checked ({exc}).')
                return None
        mail=optional(4101,None,'Mail')
        guild=optional(4465,'info','Guild Hunt') if info.guild.guildId else None
        tower=optional(5051,None,'Endless Tower') if info.HasField('endless_tower_player_data') else None
        arena=optional(5061,None,'Rune Arena') if info.HasField('arena_info') else None
        # Function gates may depend on a claimed quest rather than just the level.
        done=info.tasks.mainTaskReceived
        world=optional(5031,None,'Baphomet') if done.get(63,False) else None
        opponents=optional(5073,'targets','Arena opponents') if arena and any(i.entry==11 and i.count>0 for i in info.items) else None
        steps=build(data,None if mail is None else mail.get('emails',[]),guild,now,offset,tower,arena,world,opponents)
        self.dungeon.plan(data,now,function_open(data,now,offset,805),steps)
        if self.battle_uncertain:
            steps={k:s for k,s in steps.items() if s.kind not in ('fight','duel')}
            warnings.append('A previous fight has an uncertain outcome. Reconnect and inspect it before another fight.')
        profile=build_state(data,RULES,lambda n:function_open(data,now,offset,n))
        return steps,warnings,{'build':profile,'id':str(player.id),'name':player.nickname,'realm':self.realm,'level':player.level,'power':player.ability}

    def scan(self):
        self.scan_id=None
        self.steps,warnings,identity=self.collect()
        self.scan_id=uuid.uuid4().hex
        self.last_scan=time.monotonic()
        return {'scanId':self.scan_id,'sessionId':self.session_id,'checkedAt':int(time.time()),'character':identity,'steps':[s.view() for s in self.steps.values()],
                'warnings':warnings,'maxSteps':MAX_STEPS,'dungeon':self.dungeon.state}

    def select(self,payload):
        if not isinstance(payload,dict) or set(payload)!={'scanId','keys'} or payload['scanId']!=self.scan_id or not self.scan_id or time.monotonic()-self.last_scan>300:
            raise RoutineError('routine_scan_expired')
        keys=payload['keys']
        if not isinstance(keys,list) or not 0<len(keys)<=MAX_STEPS or not all(isinstance(k,str) and k in self.steps for k in keys) or len(set(keys))!=len(keys):
            raise RoutineError('routine_invalid_selection')
        rows=[s for k,s in self.steps.items() if k in keys]
        if len(rows)>1 and any(s.kind!='claim' for s in rows): raise RoutineError('routine_one_mode_only')
        return rows

    def review(self,payload):
        rows=self.select(payload)
        if rows[0].kind=='fight': check_mode(self.pool,rows[0])
        if rows[0].kind=='assist':self.dungeon.review(rows[0])
        return {'steps':[s.view() for s in rows],'normalized':{'scanId':self.scan_id,'keys':[s.key for s in rows]}}

    def run(self,payload):
        rows=self.select(payload)
        self.scan_id=None
        # Re-read after consent. A changed eligibility proof is skipped, never replaced with another reward.
        fresh,_,_=self.collect()
        receipts=[]
        deadline=time.monotonic()+80
        for i,old in enumerate(rows):
            row=fresh.get(old.key)
            receipt={'title':old.title,'command':old.command,'status':'skipped'}
            receipts.append(receipt)
            if not row or old.proof!=row.proof:
                receipt['note']='Eligibility changed after review.'
                continue
            if time.monotonic()>=deadline:
                receipt['note']='Run time limit; rescan before continuing.'
                break
            try:
                if i: time.sleep(1)
                # A claim can change another task or milestone, including parameterized claims.
                # Recheck each remaining claim rather than using the batch's initial snapshot.
                if i and row.kind=='claim':
                    current=self.collect()[0].get(row.key)
                    if current is None or current.proof!=row.proof:
                        receipt['note']='New or changed milestones; review them after a rescan.'
                        continue
                if self.validate:
                    self.validate(self.pool,{'mode':'execute','command':row.command,'payload':row.payload,
                                             'confirm':self.actions[row.command]['request']['name']})
                if row.kind=='assist':
                    self.dungeon.run(row,receipt)
                    continue
                if row.kind=='fight':
                    final=run_campaign(self.pool,self.channel,row.payload['stage_entry']) if row.command==5001 else mode_fight(self,row)
                elif row.development and row.development['type']=='rebuild':
                    final=rebuild_stats(self,row,receipt)
                else:
                    final=self.call(row.command,row.payload)
                reply=as_dict(final)
                receipt.update(status='confirmed',reply=self.actions_by_reply(final.DESCRIPTOR.name),
                               rewards={k:reply[k] for k in ('rewards','reward','first_rewards','frist_rewards','total_rewards') if k in reply})
                if row.kind=='build':
                    verify_development(row,reply,receipt)
                    receipt['note']=row.detail
                if row.kind=='duel' and final.HasField('fight_result'):
                    receipt.update(won=final.fight_result.result,rank=final.new_rank)
                if row.kind=='fight':
                    if 'fight_result' in final.DESCRIPTOR.fields_by_name:
                        receipt['won']=final.fight_result
                    for k in ('score','rank','his_max_score','max_cleared_stage_entry','res_stage_entry'):
                        if k in reply:receipt[k]=reply[k]
            except (ProgressionError,DungeonError) as exc:
                receipt.update(status='stopped',note=str(exc))
                break
            except self.rejected as exc:
                prefix=partial_note(receipt)
                receipt.update(status='rejected',note=prefix+str(exc))
                break
            except CampaignError as exc:
                self.battle_uncertain=str(exc)!='replay_unavailable'
                note='Battle state uncertain; reconnect and inspect the mode before another attempt.' if str(exc)!='replay_unavailable' else 'Local simulation unavailable; no fight started.'
                receipt.update(status='stopped',note=note)
                break
            except (OSError,TimeoutError,WebSocketException,DecodeError):
                self.channel.lost=True
                receipt.update(status='unknown',note=partial_note(receipt)+'Connection lost. Do not repeat; reconnect and rescan.')
                break
        return {'receipts':receipts,'notRun':len(rows)-len(receipts)}

    def actions_by_reply(self,name):
        return next(a['reply']['id'] for a in self.actions.values() if a['reply']['name']==name)

def mode_data(row):
    if row.command==5013:
        stage=row.payload['res_stage_entry']
        kind=next(c['stageType'] for c in modes()['resInstances']['categories'] if any(s['entry']==stage for s in c['stages']))
        return kind,stage,5015,'res_stage_entry'
    if row.command==5043:return 8,row.payload['stage_entry'],5045,'stage_entry'
    if row.command==4473:return 9,None,4475,None
    if row.command==5033:return 7,None,5035,None
    raise CampaignError('unsupported_mode')

def check_mode(pool,row):
    if row.command==5001:
        preflight(pool,2,row.payload['stage_entry'])
        return
    kind,stage,_,_=mode_data(row)
    if not stage:stage=1 if kind==9 else modes()['worldBoss']['stages'][0]['entry']
    preflight(pool,kind,stage)

def mode_fight(routine,row):
    check_mode(routine.pool,row)
    kind,stage,settle,field=mode_data(row)
    start=routine.call(row.command,row.payload)
    guild=kind==9
    arg=start.fightArgs if guild else start.fight_arg
    fid=start.fightId if guild else start.fight_id
    if guild and not arg.stage_entry:arg.stage_entry=start.bossEntry
    if not fid or not arg.seed or not arg.stage_entry or arg.clientGitVersion not in ('',VERSION):
        raise CampaignError('mode_inputs_changed_after_start')
    if (stage and (getattr(start,field)!=stage or arg.stage_entry!=stage)) or (not stage and row.proof!=digest([row.payload,arg.stage_entry])):
        raise CampaignError('mode_target_changed_after_start')
    envelope=msg(routine.pool,'StageFightRes')(fight_id=fid,fight_arg=arg)
    result=simulate(routine.pool,envelope.SerializeToString(),routine.channel.player_id,kind)
    if guild:
        if result.fightId!=fid or result.GuildBossEntry!=arg.stage_entry or result.fightResult.fight_id!=fid or not result.fightResult.max_tick or result.fightResult.clientGitVersion!=VERSION:
            raise CampaignError('mode_unsettled')
        return routine.channel.exchange(settle,result)
    if result.fight_id!=fid or result.clientGitVersion!=VERSION or not result.max_tick:
        raise CampaignError('mode_unsettled')
    payload={'fight_id':fid,'fight_result':result}
    if field:payload[field]=stage
    return routine.channel.exchange(settle,msg(routine.pool,routine.actions[settle]['request']['name'])(**payload))


def rebuild_stats(routine,row,receipt):
    if routine.validate:
        routine.validate(routine.pool,{'mode':'execute','command':4531,'payload':{},'confirm':'CareerAttrResetReq'})
    reset=routine.call(4531,{})
    receipt['substeps']=[{'command':4531,'reply':4532,'status':'confirmed'}]
    data=as_dict(reset)
    active=data.get('buildInfo',{})
    if (active.get('build')!=row.development['spec'] or allocation(active)!=[0]*6 or active.get('usedAttrPoint',0)!=0 or
            data.get('totalAttrPoint')!=row.development['totalPoints']):
        raise ProgressionError('Reset replied, but the build or point budget changed. No allocation sent; inspect your character.')
    final=routine.call(4529,row.payload)
    receipt['substeps'].append({'command':4529,'reply':4530,'status':'confirmed'})
    return final


def verify_development(row,reply,receipt):
    target=row.development
    if target['type'] in ('class','advance','spec'):
        info=reply.get('jobInfo',{})
        career=info.get('careerEntry');spec=info.get('currCareerBuild')
        line,config=career_info(career)
        if (career!=target['career'] or not line or line['kind']!=target['line'] or not spec or
                (target['type']=='spec' and spec!=target['spec'])):
            raise ProgressionError('The class reply did not match the reviewed change. Inspect the character; nothing was retried.')
        receipt['buildState']={'career':career,'spec':spec}
    else:
        active=reply.get('buildInfo',{})
        if (active.get('build')!=target['spec'] or allocation(active)!=[s['after'] for s in target['stats']] or
                active.get('usedAttrPoint',0)!=target['usedPoints'] or reply.get('totalAttrPoint')!=target['totalPoints']):
            raise ProgressionError('The allocation reply differed from the reviewed stats. Inspect the character; nothing was retried.')


def partial_note(receipt):
    sent={s['command'] for s in receipt.get('substeps',[])}
    if 6005 in sent:return 'Dungeon settlement confirmed; room cleanup may be incomplete. '
    if 4303 in sent:return 'Dungeon room joined; inspect the party and result before another attempt. '
    if 4531 in sent:return 'Stat reset confirmed; allocation may be incomplete. '
    return ''
