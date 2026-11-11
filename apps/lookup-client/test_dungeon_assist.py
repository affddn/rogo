import base64
import json
import os
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import Mock,patch

from campaign import PROBE,VERSION,simulate
from gateway_ops import ACTIONS,ALL_REFLECTIONS,Channel,Rejected
from routine.dungeon import AssistLedger,DungeonAssist,DungeonError,DungeonEvents
from routine.runner import Routine
from test_progression import character
from wire_probe import load_schema,msg


class Quota(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.ledger=AssistLedger('realm:character',self.tmp.name)
    def test_reservations_survive_reload_and_never_exceed_five(self):
        token=self.ledger.reserve(1000,2)
        fresh=AssistLedger('realm:character',self.tmp.name)
        self.assertEqual(fresh.view(1000,2)['remaining'],2)
        fresh.finish(1000,token,used=3,release=True)
        fresh.reserve(1000,3);fresh.reserve(1000,3)
        with self.assertRaises(DungeonError):fresh.reserve(1000,3)
        self.assertEqual(fresh.view(1000,3)['remaining'],0)
        self.assertEqual(fresh.view(2000,0)['remaining'],5)
    def test_concurrent_helpers_share_the_same_hard_cap(self):
        def reserve(_):
            try:return AssistLedger('realm:character',self.tmp.name).reserve(1000,0)
            except DungeonError:return None
        with ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(reserve,range(8)))
        self.assertEqual(sum(v is not None for v in results),5)
        self.assertEqual(self.ledger.view(1000,0)['remaining'],0)

    def test_uncertain_join_blocks_future_joins_in_that_game_day(self):
        t=self.ledger.reserve(1000,0);self.ledger.finish(1000,t,uncertain=True)
        with self.assertRaises(DungeonError):self.ledger.reserve(1000,0)
        self.assertEqual(self.ledger.view(1000,0)['reserved'],1)
        self.ledger.reserve(2000,0)
        with self.assertRaises(DungeonError):self.ledger.reserve(1000,0)
    def test_server_assists_count_even_when_another_client_used_them(self):
        self.ledger.reserve(1000,0)
        self.assertEqual(self.ledger.view(1000,4)['remaining'],0)
        with self.assertRaises(DungeonError):self.ledger.reserve(1000,4)
    def test_bad_file_fails_closed_instead_of_resetting_counter(self):
        self.ledger.path.write_text('{')
        with self.assertRaises(DungeonError):self.ledger.reserve(1000,0)
        self.assertEqual(self.ledger.path.read_text(),'{')
    def test_known_rejected_join_releases_only_its_reservation(self):
        a=self.ledger.reserve(1000,0);b=self.ledger.reserve(1000,0)
        self.ledger.finish(1000,a,release=True)
        self.assertEqual(self.ledger.view(1000,0)['reserved'],1)
        self.ledger.finish(1000,b,used=1,release=True)
        self.assertEqual(self.ledger.view(1000,0)['used'],1)


class DungeonFlow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.pool=load_schema(os.environ.get('ILSPYCMD','ilspycmd'),ALL_REFLECTIONS)
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.channel=Mock(player_id=1)
        self.r=Routine(self.pool,self.channel,'profile',1,ACTIONS,Rejected)
        self.d=self.r.dungeon;self.d.ledger=AssistLedger('fixture',self.tmp.name)
        self.e=self.channel.events
        self.data=character();self.data['player']['player']['ability']='999999999'
        self.data['team_pve_player_data']={'daily_data':{'last_reset_time':'1000','today_assist_count':0,'today_challenge_count':2}}
        self.e.subscribed=True
        self.e.invites['room']={'team':'room','stage':1,'created':9999}
    def team(self,assist=False):
        return msg(self.pool,'TeamInfo')(teamId='room',teamType=1,teamPveStageEntry=1,owner=2,
            members=[{'playerId':1,'only_assist':assist},{'playerId':2},{'playerId':3}])
    def row(self):
        steps={};self.d.plan(self.data,10000,True,steps)
        return next(iter(steps.values()))
    def fixture(self):
        _,raw=PROBE.read_bytes().splitlines();f=msg(self.pool,'StageFightRes').FromString(base64.b64decode(raw))
        f.fight_arg.stage_entry=1
        return f
    def test_invite_filters_expired_locked_and_wrong_channel(self):
        for kind,target,owner,team_type,expected in [(6,0,2,1,1),(2,0,2,1,0),(6,1,2,1,0),(6,0,1,1,0),(6,0,2,0,0)]:
            self.e.invites.clear()
            self.e.chat(msg(self.pool,'ChatMessage')(type=kind,target_player_id=target,sender={'playerId':owner},create_time=9999,
                team_invite={'team_id':'room','team_type':team_type,'team_pve_stage_entry':1}))
            self.assertEqual(len(self.e.invites),expected)
        self.e.invites['room']={'team':'room','stage':1,'created':9900}
        steps={};self.d.plan(self.data,10000,True,steps);self.assertFalse(steps)
        self.e.invites['room']['created']=9999;self.data['stage']['last_stage']=101
        steps={};self.d.plan(self.data,10000,True,steps);self.assertFalse(steps)
    def test_watch_matches_client_bundle_without_requiring_virtual_invite_channel(self):
        self.e.subscribed=False
        row=self.row();receipt={}
        # SEA acknowledges the real public channels, not virtual CHAT_TYPE_TEAM_INVITE.
        self.r.call=Mock(return_value=msg(self.pool,'JoinChatChannelRes')(results=[
            {'type':1,'channel_id':'zone'},{'type':2,'channel_id':'server'},{'type':3,'channel_id':'guild'}]))
        with patch('routine.dungeon.preflight'):self.d.run(row,receipt)
        self.assertEqual(self.r.call.call_args.args,(4343,{'channels':[
            {'type':n,'pull_history':True} for n in (1,2,3,6)]}))
        self.assertTrue(self.e.subscribed)
        self.assertEqual(receipt['status'],'confirmed')

    def test_host_start_before_assist_confirmation_never_submits_a_fight(self):
        row=self.row();stat=self.setup_run();original=self.r.call
        def race(n,p):
            if n==4325:self.e.starts.add('room')
            return original(n,p)
        self.r.call=Mock(side_effect=race)
        with patch('routine.dungeon.preflight'),patch('routine.dungeon.simulate',return_value=stat) as replay:
            with self.assertRaises(DungeonError):self.d.run(row,{})
        replay.assert_not_called();self.channel.exchange.assert_not_called()
        self.assertTrue(self.d.ledger.view(1000,0)['uncertain'])

    def test_full_quota_and_existing_party_never_propose_join(self):
        self.data['team_pve_player_data']['daily_data']['today_assist_count']=5
        steps={};self.d.plan(self.data,10000,True,steps);self.assertFalse(steps)
        self.data['team_pve_player_data']['daily_data']['today_assist_count']=0
        self.e.team=self.team()
        steps={};self.d.plan(self.data,10000,True,steps);self.assertFalse(steps);self.assertFalse(self.d.state['eligible'])
    def setup_run(self,assist=True):
        fixture=self.fixture()
        responses={6015:msg(self.pool,'TeamPveBatchCheckStageUnlockRes')(unlocked_player_ids=[1]),
            4303:msg(self.pool,'JoinTeamRes')(team=self.team()),4325:msg(self.pool,'SetTeamOnlyAssistRes')(team=self.team(assist)),
            6003:msg(self.pool,'TeamPveGetFightDataRes')(fight_id=fixture.fight_id,fight_arg=fixture.fight_arg),
            4305:msg(self.pool,'LeaveTeamRes')()}
        self.r.call=Mock(side_effect=lambda n,p:responses[n])
        self.channel.wait_for_dungeon.return_value=True
        self.channel.exchange.return_value=msg(self.pool,'TeamPveSettleRes')(consumed_reward_type=1,
            team_pve_data={'daily_data':{'last_reset_time':1000,'today_assist_count':1,'today_challenge_count':2}})
        return msg(self.pool,'FightStatistic')(fight_id=fixture.fight_id,clientGitVersion=VERSION,max_tick=123,result=True)
    def test_join_assist_only_correlated_simulation_settlement_and_leave(self):
        row=self.row();stat=self.setup_run();receipt={}
        with patch('routine.dungeon.preflight'),patch('routine.dungeon.simulate',return_value=stat) as replay:
            self.d.run(row,receipt)
        self.assertEqual([a.args[0] for a in self.r.call.call_args_list],[6015,4303,4325,6003,4305])
        self.assertEqual(self.channel.exchange.call_args.args[0],6005)
        req=self.channel.exchange.call_args.args[1]
        self.assertEqual(req.fight_id,stat.fight_id);self.assertEqual(req.stage_entry,1)
        self.assertEqual(replay.call_args.args[-1],6)
        self.assertEqual(receipt['status'],'confirmed');self.assertEqual(receipt['assists'],1)
        self.assertEqual(self.d.ledger.view(1000,1)['remaining'],4)
        self.assertIsNone(self.e.team)
    def test_assist_flag_failure_never_requests_fight_or_uses_normal_clear(self):
        row=self.row();self.setup_run(assist=False)
        with patch('routine.dungeon.preflight'),patch('routine.dungeon.simulate') as replay:
            with self.assertRaises(DungeonError):self.d.run(row,{})
        replay.assert_not_called();self.channel.exchange.assert_not_called()
        self.assertNotIn(6003,[a.args[0] for a in self.r.call.call_args_list])
        self.assertTrue(self.d.ledger.view(1000,0)['uncertain'])
    def test_host_timeout_leaves_only_joined_room_and_keeps_acceptance_count(self):
        row=self.row();self.setup_run();self.channel.wait_for_dungeon.return_value=False;receipt={}
        with patch('routine.dungeon.preflight'):self.d.run(row,receipt)
        self.assertEqual(receipt['status'],'skipped')
        self.assertEqual(self.d.ledger.view(1000,0)['reserved'],1)
        self.assertIsNone(self.e.team)
        self.channel.exchange.assert_not_called()
    def test_expired_room_rejection_is_not_replayed(self):
        row=self.row();self.setup_run();call=self.r.call
        def fail(n,p):
            if n==4303:raise Rejected('full')
            return call(n,p)
        self.r.call=Mock(side_effect=fail);receipt={}
        with patch('routine.dungeon.preflight'):self.d.run(row,receipt)
        self.assertEqual(receipt['status'],'skipped');self.assertIn('room',self.e.seen_teams)
        self.assertEqual(self.d.ledger.view(1000,0)['remaining'],5)
    def test_notifications_after_a_reply_in_a_merged_packet_are_not_dropped(self):
        reply=msg(self.pool,'Packet')(head={'command':4304,'seq':4},body=msg(self.pool,'JoinTeamRes')(team=self.team()).SerializeToString())
        notify=msg(self.pool,'Packet')(head={'command':8062},body=msg(self.pool,'TeamPveStartFightNotify')(team_id='room').SerializeToString())
        wire=msg(self.pool,'Packet')(head={'command':2108},body=msg(self.pool,'MergePacketNotify')(packets=[reply,notify]).SerializeToString()).SerializeToString()
        ch=Channel(self.pool,Mock(),1,1);ch.ws.recv.return_value=wire
        ch.exchange(4303,msg(self.pool,'JoinTeamReq')(teamId='room'))
        self.assertIn('room',ch.events.starts)
    def test_real_three_member_dungeon_replay(self):
        f=self.fixture();viewer=f.fight_arg.acks[0].leader.entry
        for i in (1,2):
            t=f.fight_arg.acks.add();t.CopyFrom(f.fight_arg.acks[0]);t.leader.entry=viewer+i
        result=simulate(self.pool,f.SerializeToString(),viewer,6)
        self.assertEqual(result.fight_id,f.fight_id);self.assertGreater(result.max_tick,0)

if __name__=='__main__':unittest.main()
