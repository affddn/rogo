"""Invitation-only dungeon assistance, with durable reservations against the server's game day."""
import fcntl
import hashlib
import json
import os
import time
import uuid
from collections import OrderedDict
from contextlib import contextmanager
from pathlib import Path
from google.protobuf import json_format
from campaign import preflight, simulate, VERSION, CampaignError
from wire_probe import msg

LIMIT = 5
INVITE_TTL = 45
LEDGER_DIR = Path(__file__).resolve().parents[3] / 'data/automation/dungeon-assists'

class DungeonError(Exception):
    pass


def as_dict(value):
    return json_format.MessageToDict(value,preserving_proto_field_name=True)


class AssistLedger:
    """Only counts and opaque reservation IDs persist. Never chat, room IDs or credentials."""
    def __init__(self, identity, root=LEDGER_DIR):
        self.path=Path(root)/(hashlib.sha256(identity.encode()).hexdigest()+'.json')

    def _read(self):
        if not self.path.exists():return {'days':{}}
        try:
            data=json.loads(self.path.read_bytes())
            if not isinstance(data,dict) or not isinstance(data.get('days'),dict):raise ValueError()
            for key,value in data['days'].items():
                if (not key.isdecimal() or not isinstance(value,dict) or type(value.get('server')) is not int or value['server']<0 or
                        not isinstance(value.get('pending'),dict) or not all(type(v) is bool for v in value['pending'].values())):raise ValueError()
            return data
        except (ValueError,TypeError,KeyError):
            raise DungeonError('The local assist ledger could not be verified. Auto-join is disabled; do not reset the daily counter.') from None

    @contextmanager
    def _update(self):
        self.path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        with open(self.path.with_suffix('.lock'),'a') as lock:
            os.chmod(lock.name,0o600)
            fcntl.flock(lock,fcntl.LOCK_EX)
            data=self._read()
            yield data
            # Preserve the latest seven server reset stamps. Writes are atomic while the separate lock stays held.
            data['days']=dict(sorted(data['days'].items(),key=lambda x:int(x[0]))[-7:])
            temp=self.path.with_suffix('.'+uuid.uuid4().hex+'.tmp')
            try:
                with open(temp,'x') as out:
                    os.chmod(temp,0o600)
                    json.dump(data,out,separators=(',',':'));out.flush();os.fsync(out.fileno())
                os.replace(temp,self.path)
            finally:
                temp.unlink(missing_ok=True)

    @staticmethod
    def _view(data,day,used):
        row=data['days'].get(str(day),{'server':0,'pending':{}})
        count=max(used,row['server'])
        pending=len(row['pending'])
        return {'used':count,'reserved':pending,'remaining':max(0,LIMIT-count-pending),
                'uncertain':any(row['pending'].values())}

    def view(self,day,used):
        return self._view(self._read(),day,used)

    def observe(self,day,used):
        with self._update() as data:
            row=data['days'].setdefault(str(day),{'server':used,'pending':{}})
            row['server']=max(row['server'],used)
        return self.view(day,used)

    def reserve(self,day,used):
        token=uuid.uuid4().hex
        with self._update() as data:
            if data['days'] and day<max(map(int,data['days'])):raise DungeonError('The server day went backwards. Auto-join stopped.')
            view=self._view(data,day,used)
            if view['uncertain']:raise DungeonError('A prior dungeon join or settlement is uncertain. Inspect the game before using auto-assist again.')
            if not view['remaining']:raise DungeonError('The five-assist daily limit has been reached.')
            row=data['days'].setdefault(str(day),{'server':used,'pending':{}})
            row['server']=max(row['server'],used);row['pending'][token]=False
        return token

    def finish(self,day,token,*,used=None,release=False,uncertain=False):
        with self._update() as data:
            row=data['days'].get(str(day))
            if not row or token not in row['pending']:raise DungeonError('Assist reservation missing; inspect the game before continuing.')
            if used is not None:row['server']=max(row['server'],used)
            if release:del row['pending'][token]
            elif uncertain:row['pending'][token]=True


class DungeonEvents:
    def __init__(self,pool,player_id):
        self.pool,self.player_id=pool,player_id
        self.invites=OrderedDict()
        self.subscribed=False
        self.team=None
        self.starts=set()
        self.seen_teams=set()

    def chat(self,chat):
        # Read structured public dungeon invitations only. Never parse ordinary chat text as commands.
        if (chat.type!=6 or chat.target_player_id or not chat.HasField('team_invite') or not chat.HasField('sender') or
                chat.sender.playerId==self.player_id or chat.sender.playerId<=0):return
        invite=chat.team_invite
        if invite.team_type!=1 or not invite.team_id or len(invite.team_id)>128 or not invite.team_pve_stage_entry:return
        if invite.team_id in self.seen_teams:return
        self.invites[invite.team_id]={'team':invite.team_id,'stage':invite.team_pve_stage_entry,'created':chat.create_time}
        self.invites.move_to_end(invite.team_id)
        while len(self.invites)>50:self.invites.popitem(last=False)

    def packet(self,packet):
        if packet.head.status:return
        if packet.head.command==8046:
            self.chat(msg(self.pool,'ChatNotify').FromString(packet.body).msg)
        elif packet.head.command==8062:
            team=msg(self.pool,'TeamPveStartFightNotify').FromString(packet.body).team_id
            if team and len(self.starts)<50:self.starts.add(team)
        elif packet.head.command==8026:
            notification=msg(self.pool,'TeamChangeNotify').FromString(packet.body)
            for item in notification.notifys:
                for field in ('joinData','leaveData','team_pve_stage_changed_data','only_assist_changed_data'):
                    if item.HasField(field) and getattr(item,field).HasField('team'):
                        self.team=getattr(item,field).team
                if item.HasField('kickData') and item.kickData.playerId==self.player_id:self.team=None
                if item.HasField('disbandData') and self.team and item.disbandData.teamId==self.team.teamId:self.team=None

    def member(self,team=None):
        team=team if team is not None else self.team
        return next((m for m in team.members if m.playerId==self.player_id or m.player.playerId==self.player_id),None) if team else None


class DungeonAssist:
    def __init__(self,routine,ledger=None):
        self.routine=routine
        self.events=routine.channel.events
        self.ledger=ledger or AssistLedger(str(routine.realm)+':'+str(routine.channel.player_id))
        self.state=None

    def plan(self,data,now,opened,steps):
        from routine.planner import Step,digest,modes
        daily=data.get('team_pve_player_data',{}).get('daily_data')
        self.state={'day':None,'used':0,'reserved':0,'remaining':0,'watching':self.events.subscribed,'eligible':False,'reason':'Unlock Dungeons and scan the server daily allowance first.'}
        if not opened or daily is None:return
        day=int(daily.get('last_reset_time') or 0);used=int(daily.get('today_assist_count') or 0)
        if not 0<day<=now or not 0<=used<=LIMIT:return
        self.state.update(day=str(day),used=used)
        try: quota=self.ledger.observe(day,used)
        except (DungeonError,OSError) as exc:
            self.state['reason']=str(exc) if isinstance(exc,DungeonError) else 'Local assist quota storage is unavailable.'
            return
        self.state.update(**quota)
        if quota['uncertain']:
            self.state['reason']='A previous join or settlement is uncertain. Inspect the game; no more auto-joins will be sent today.'
            return
        if self.events.member():
            self.state['reason']='Already in a team. Auto-assist will not replace or leave an existing party.'
            return
        self.state.update(eligible=True,reason=None)
        if not quota['remaining']:return
        def add(command,title,detail,payload,kind,target):
            key='assist:'+str(command)+':'+digest(target)[:20]
            proof=digest([payload,day,quota['used'],quota['reserved'],target])
            steps[key]=Step('assist',title,detail,command,payload,key,proof,auto_group='dungeon',available=quota['remaining'],
                            assist={'type':kind,'day':str(day),'used':quota['used'],'clears':int(daily.get('today_challenge_count') or 0),'target':target})
        if not self.events.subscribed:
            add(4343,'Watch posted dungeon invites',f"Use the game's public-channel subscriptions, keeping only structured dungeon invites. No messages posted. {quota['remaining']} of five daily assist reservations remain.",
                {'channels':[{'type':n,'pull_history':True} for n in (1,2,3,6)]},'watch','public-invites')
            return
        stage_map={s['entry']:s for s in modes()['teamPve']['stages']}
        passed=int(data.get('stage',{}).get('last_stage') or 0)
        power=int(data['player']['player'].get('ability') or 0)
        for invite in list(self.events.invites.values()):
            stage=stage_map.get(invite['stage'])
            if not stage or not 0<invite['created']<=now or now+5>=invite['created']+INVITE_TTL:continue
            unlock=stage.get('unlockStage')
            if not unlock:continue
            chapter,index=map(int,unlock.split('-'))
            if passed<chapter*100+index or power<(stage.get('recommendedPower') or 0):continue
            add(4303,'Assist dungeon · '+stage['name'],
                f"Join a recent public invite for difficulty {stage['difficulty']}; enable Assist only, wait up to 40 seconds for the host, complete that fight, then leave. Counts toward the five-per-day cap; normal clear attempts are not authorized.",
                {'teamId':invite['team'],'teamPveStageEntry':invite['stage']},'join',invite)

    def review(self,row):
        stage=row.payload.get('teamPveStageEntry',1)
        preflight(self.routine.pool,6,stage)

    def _record(self,receipt,command,reply):
        receipt.setdefault('substeps',[]).append({'command':command,'reply':reply,'status':'confirmed'})

    def _leave(self,team_id,receipt):
        if not self.events.team or self.events.team.teamId!=team_id or not self.events.member():
            raise DungeonError('Team membership changed. No leave request was sent to an unrelated party.')
        self.routine.call(4305,{})
        self._record(receipt,4305,4306);self.events.team=None

    def run(self,row,receipt):
        r=self.routine;events=self.events
        self.review(row)
        if row.assist['type']=='watch':
            result=r.call(4343,row.payload)
            # ChatModel.JoinChatChannels uses this bundle. SEA rejects a lone virtual
            # TeamInvite channel (11900) and acknowledges the real public channels.
            if not any(v.type in (1,2,6) and v.channel_id for v in result.results):
                raise DungeonError('The public-channel subscription was not confirmed.')
            for channel in result.results:
                for chat in channel.history:events.chat(chat)
            events.subscribed=True
            receipt.update(status='confirmed',reply=4344,note='Watching public dungeon invites while this Auto run stays active. No chat messages posted.')
            return
        target=row.assist['target'];team_id=target['team'];stage=target['stage']
        if events.member():raise DungeonError('Already in a party. Auto-assist did not join or leave another team.')
        unlocked=r.call(6015,{'stage_entry':str(stage),'player_ids':[str(r.channel.player_id)],'check_online':False})
        if r.channel.player_id not in unlocked.unlocked_player_ids:
            events.seen_teams.add(team_id)
            receipt.update(status='skipped',note='The server says this dungeon is not unlocked. No room joined.')
            return
        # The fresh collect in Routine.run rechecked server quota and invitation expiry before this reservation.
        day=int(row.assist['day']);used=row.assist['used']
        token=self.ledger.reserve(day,used)
        joined=False;started=False;reservation_open=True
        try:
            try: result=r.call(4303,row.payload)
            except r.rejected:
                self.ledger.finish(day,token,release=True)
                events.seen_teams.add(team_id)
                receipt.update(status='skipped',note='Invitation no longer joinable; no assist reserved. It will not be retried.')
                return
            team=result.team
            if team.teamId!=team_id or team.teamPveStageEntry!=stage or team.teamType!=1 or team.owner==r.channel.player_id or not events.member(team):
                raise DungeonError('Joined-room response did not match the invitation. Inspect the party; no fight data requested.')
            events.team=team;events.seen_teams.add(team_id);joined=True
            self._record(receipt,4303,4304)
            if team_id in events.starts:
                raise DungeonError('The host started before Assist-only mode was confirmed. No fight submitted; inspect the party before continuing.')
            only=r.call(4325,{'only_assist':True}).team
            if only.teamId!=team_id or only.teamPveStageEntry!=stage or not events.member(only) or not events.member(only).only_assist:
                raise DungeonError('Assist-only mode was not confirmed. No normal clear attempt is authorized.')
            events.team=only;self._record(receipt,4325,4326)
            if team_id in events.starts:
                raise DungeonError('The host started before Assist-only confirmation was received. No fight submitted; inspect the party before continuing.')
            if not r.channel.wait_for_dungeon(team_id,stage,40):
                self._leave(team_id,receipt)
                receipt.update(status='skipped',note='Joined in Assist-only mode, but the host did not start within 40 seconds. Left the room; this acceptance remains reserved against today’s cap.')
                return
            started=True
            fight=r.call(6003,{'team_id':team_id})
            arg=fight.fight_arg
            if not fight.fight_id or arg.stage_entry!=stage or not arg.seed or arg.clientGitVersion not in ('',VERSION):
                raise CampaignError('dungeon_inputs_changed')
            envelope=msg(r.pool,'StageFightRes')(fight_id=fight.fight_id,fight_arg=arg)
            stat=simulate(r.pool,envelope.SerializeToString(),r.channel.player_id,6)
            if stat.fight_id!=fight.fight_id or not stat.max_tick or stat.clientGitVersion!=VERSION:raise CampaignError('dungeon_unsettled')
            final=r.channel.exchange(6005,msg(r.pool,'TeamPveSettleReq')(fight_id=fight.fight_id,stage_entry=stage,fight_result=stat))
            self._record(receipt,6005,6006)
            updated=final.team_pve_data.daily_data
            # Assist reward type is 1; a win without its server quota increment is not counted as an assist.
            receipt.update(reply=6006,won=stat.result,rewards={'rewards':as_dict(final.rewards)},assists=updated.today_assist_count)
            consumed=(final.consumed_reward_type==1 and updated.last_reset_time==day and updated.today_assist_count==used+1 and
                      updated.today_challenge_count==row.assist['clears'])
            if stat.result and not consumed:raise DungeonError('Dungeon settled, but an assist-only reward and quota increment were not confirmed. Inspect the result before another join.')
            if consumed:
                self.ledger.finish(day,token,used=updated.today_assist_count,release=True)
                reservation_open=False
            self._leave(team_id,receipt)
            receipt.update(status='confirmed',note='Dungeon assist completed and room left.' if consumed else 'Dungeon ended in defeat; the accepted invite remains reserved against today’s cap.')
        except Exception:
            # If any post-join effect is uncertain, keep the durable reservation and disable more auto-joins.
            if reservation_open:self.ledger.finish(day,token,uncertain=True)
            if joined and not started and team_id not in events.starts:
                try:self._leave(team_id,receipt)
                except (OSError,DungeonError,r.rejected):
                    receipt['cleanupUncertain']=True  # no second leave request
            raise
