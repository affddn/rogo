import base64
import io
import json
import os
import time
import unittest
from unittest.mock import Mock, patch
from campaign import PROBE, REPLAY, preflight
from gateway_ops import ALL_REFLECTIONS, ACTIONS, POLICY, Rejected
from routine.planner import build, modes, FREE, SWEEP, FIGHTS
from routine.runner import Routine, RoutineError, mode_fight
from wire_probe import load_schema, msg


def sample():
    return {'player':{'player':{'id':'1','nickname':'Fixture','level':56,'ability':'2500000'}},'items':[{'entry':21,'count':'2'}],
            'stage':{'last_stage':705},'tasks':{'mainTaskReceived':{'26':True,'63':True,'142':True},'tasks':[{'entry':1,'progress':3}]},
            'resStageEntrys':{'1':101},'mvp_player_data':{'challenges':[{'mvp_entry':101,'max_cleared_stage_entry':10101}]},
            'cardInfo':{'card_sys':{},'cards':[{'entry':201,'star':25}]},'monthCardDailyFreeRewardReceived':True}

def plan(data=None,mail=None):
    return build(sample() if data is None else data,mail,None,100000,0)

class Eligibility(unittest.TestCase):
    def test_campaign_and_stat_proposals_are_included(self):
        data=sample()
        data['stage']['curr_stage']=706
        data['jobInfo']={'careerEntry':221,'currCareerBuild':21,'jobEntry':301,'totalAttrPoint':20,
                         'builds':[{'build':21,'attrs':[],'usedAttrPoint':0}]}
        rows=list(plan(data).values())
        self.assertTrue(any(s.command==5001 and s.payload=={'stage_entry':706} for s in rows))
        self.assertTrue(any(s.command==4529 for s in rows))

    def test_auto_metadata_has_revision_and_separate_mode_allowances(self):
        data=sample()
        rows=list(plan(data).values())
        realm=next(s.view() for s in rows if s.command==5011)
        self.assertEqual(realm['autoGroup'],'realm:1')
        self.assertEqual(realm['available'],2)
        self.assertEqual(len(realm['revision']),64)
        mvp=next(s.view() for s in rows if s.command==5047)
        self.assertEqual(mvp['autoGroup'],'mvp:101')
        self.assertGreater(mvp['available'],0)
        self.assertNotEqual(mvp['autoGroup'],realm['autoGroup'])

    def test_server_proof_not_speculative(self):
        data=sample()
        mail=[{'id':'read-only','readed':True},{'id':'already','received':True,'rewards':{'items':[{}]}},{'id':'ready','rewards':{'items':[{}]}}]
        byid={r.command:r for r in plan(data,mail).values()}
        self.assertEqual(byid[4103].payload,{'emailIds':['ready']})
        self.assertEqual(byid[4223].payload,{'taskEntry':1});self.assertIn(4665,byid)
        data['tasks']['tasks'][0]['rewardsReceived']=True
        data['cardInfo']['cards'][0]['star']=24
        self.assertFalse({4223,4665} & {s.command for s in plan(data).values()})
    def test_highest_clear_next_challenge_and_limited_sweeps(self):
        rows=list(plan().values()); sw=next(s for s in rows if s.command==5047)
        self.assertEqual(sw.payload,{'mvp_entry':101,'stage_entry':10101,'count':1})
        self.assertTrue(any(s.command==5043 and s.payload=={'stage_entry':10102} for s in rows))
        self.assertTrue(any(s.command==5011 and s.payload=={'res_stage_entry':101} for s in rows))
        data=sample();data['items']=[];data['mvp_player_data']['challenges'][0]['daily_sweep_used']=99
        self.assertFalse({5011,5013,5047} & {s.command for s in plan(data).values()})
    def test_paid_catchup_and_expired_tasks_excluded(self):
        data=sample(); data.update(signins=[{'entry':1,'activeTime':'1','expireTime':'300000'}],
            timeLimitedQuests=[{'complete':True,'id':'x','expireTime':'100'}])
        byid={s.command:s for s in plan(data).values()}
        self.assertEqual(byid[7007].payload,{'rewardEntry':1002});self.assertNotIn(4237,byid)
        self.assertFalse((FREE|SWEEP|FIGHTS) & set(map(int,POLICY['blocked'])))
        self.assertTrue(all(ACTIONS[n]['effect']=='claim' for n in FREE))

class Batch(unittest.TestCase):
    def setUp(self):
        self.r=Routine(None,Mock(),'private',1,ACTIONS,Rejected)
        self.initial=plan()
        self.r.collect=Mock(return_value=(self.initial,[],{}));self.r.scan()
        self.r.call=Mock(side_effect=AssertionError('unexpected mutation'))
        self.claims=[s.key for s in self.initial.values() if s.kind=='claim']
    def pick(self,keys):return {'scanId':self.r.scan_id,'keys':keys}
    def test_auto_session_identity_survives_rescans_not_reconnects(self):
        first=self.r.scan()
        second=self.r.scan()
        self.assertEqual(first['sessionId'],second['sessionId'])
        self.assertNotEqual(first['scanId'],second['scanId'])
        other=Routine(None,Mock(),'private',1,ACTIONS,Rejected)
        self.assertNotEqual(first['sessionId'],other.session_id)
    def test_cannot_batch_attempts_or_supply_commands(self):
        sw=next(s.key for s in self.initial.values() if s.kind=='sweep')
        for ks in ([sw,self.claims[0]], [self.claims[0]]*2, ['anything'], []):
            with self.assertRaises(RoutineError):self.r.review(self.pick(ks))
        with self.assertRaises(RoutineError):self.r.review(dict(self.pick(self.claims),command=9999))
        self.r.call.assert_not_called()
    def test_recheck_and_no_replay(self):
        p=self.r.review(self.pick(self.claims))['normalized']
        self.r.collect.return_value=({},[],{})
        with patch('routine.runner.time.sleep'):
            result=self.r.run(p)
        self.assertTrue(all(t['status']=='skipped' for t in result['receipts']))
        self.r.call.assert_not_called()
        with self.assertRaises(RoutineError):self.r.run(p)
    def test_failure_is_not_retried_or_silently_replaced(self):
        self.r.call.side_effect=TimeoutError
        result=self.r.run(self.pick(self.claims))
        self.assertEqual(result['receipts'][0]['status'],'unknown')
        self.assertEqual(result['notRun'],len(self.claims)-1)
        self.assertTrue(self.r.channel.lost);self.r.call.assert_called_once()

    def test_success_returns_actual_receipts_in_approved_order(self):
        self.r.call=Mock(side_effect=[Mock(DESCRIPTOR=Mock()),Mock(DESCRIPTOR=Mock())])
        self.r.actions_by_reply=Mock(return_value=4224)
        keys=self.claims[:2]
        with patch('routine.runner.as_dict',return_value={'rewards':{'items':[{'entry':1,'count':'15'}]}}),patch('routine.runner.time.sleep'):
            out=self.r.run(self.pick(keys))
        self.assertEqual([r['status'] for r in out['receipts']],['confirmed','confirmed'])
        self.assertEqual(out['receipts'][0]['rewards']['rewards']['items'][0]['count'],'15')
        self.assertEqual(self.r.call.call_count,2)
    def test_parameterized_claim_rechecked_after_previous_claim(self):
        data=sample()
        data['tasks']['tasks'].append({'entry':2,'progress':999999})
        initial=plan(data)
        rows=[s for s in initial.values() if s.command==4223]
        self.assertEqual(len(rows),2)
        self.r.collect.return_value=(initial,[],{})
        self.r.scan()
        updated={k:v for k,v in initial.items() if k!=rows[1].key}
        self.r.collect.side_effect=[(initial,[],{}),(updated,[],{})]
        self.r.call=Mock(return_value=Mock(DESCRIPTOR=Mock()))
        self.r.actions_by_reply=Mock(return_value=4224)
        with patch('routine.runner.as_dict',return_value={}),patch('routine.runner.time.sleep'):
            out=self.r.run(self.pick([s.key for s in rows]))
        self.assertEqual([r['status'] for r in out['receipts']],['confirmed','skipped'])
        self.r.call.assert_called_once_with(rows[0].command,rows[0].payload)

    def test_nonclaim_never_admitted_to_claim_batch(self):
        data=sample();data['store']={}
        rows=plan(data);free_item=next(r for r in rows.values() if r.kind=='offer')
        self.assertEqual(free_item.command,4191);self.assertEqual(free_item.payload['buyCount'],'1')
        self.r.steps=rows
        with self.assertRaises(RoutineError):self.r.review(self.pick([free_item.key,self.claims[0]]))
    def test_carnival_day_locked_and_expired_not_claimable(self):
        data=sample()
        from routine.planner import RULES
        cfg=next((int(k),v) for k,v in RULES['tasks'].items() if v[0]==8 and v[3]>1)
        data['tasks']['tasks']=[{'entry':cfg[0],'progress':cfg[1][1]}]
        for opened_at in (0,100000):
            data['tasks']['carnivalTaskInfo']={'openTime':str(opened_at)}
            self.assertFalse(any(s.command==4223 for s in plan(data).values()))

@unittest.skipUnless((REPLAY/'host/CampaignReplay.dll').is_file(),'requires local game assets')
class ModeReplay(unittest.TestCase):
    def test_real_actor_to_correlated_mode_settlement(self):
        pool=load_schema(os.getenv('ILSPYCMD','ilspycmd'),ALL_REFLECTIONS)
        ch=Mock(player_id=4);runner=Routine(pool,ch,"profile",1,ACTIONS,Rejected)
        viewer,raw=PROBE.read_bytes().splitlines()
        fixture=msg(pool,'StageFightRes').FromString(base64.b64decode(raw))
        candidates=build(sample(),[],{'GuildBossEntry':1,'challengeCount':0},100000,0,world={'boss_entry':1})
        for cmd,stage,start_name,settle,guild in [
                (4473,1,'GuildBossFightRes',4475,True),(5033,1,'WorldBossFightRes',5035,False),
                (5043,10102,'MvpFightRes',5045,False),(5013,102,'ResStageFightRes',5015,False)]:
            with self.subTest(cmd=cmd):
                row=next(s for s in candidates.values() if s.command==cmd)
                start=msg(pool,start_name)()
                arg=start.fightArgs if guild else start.fight_arg
                arg.CopyFrom(fixture.fight_arg);arg.stage_entry=stage
                if guild:start.fightId=fixture.fight_id;start.bossEntry=stage
                else:start.fight_id=fixture.fight_id
                if cmd==5043:start.stage_entry=stage
                if cmd==5013:start.res_stage_entry=stage
                runner.call=Mock(return_value=start)
                ch.exchange.reset_mock()
                mode_fight(runner,row)
                sent,req=ch.exchange.call_args.args
                self.assertEqual(sent,settle)
                stats=req.fightResult if guild else req.fight_result
                self.assertEqual(stats.fight_id,fixture.fight_id)
                self.assertGreater(stats.max_tick,0)
                if guild:self.assertTrue(req.stage_damages)
    def test_pinned_engine_finishes_all_new_modes_offline(self):
        pool=load_schema(os.getenv('ILSPYCMD','ilspycmd'),ALL_REFLECTIONS)
        for mode,stage in [(3,101),(4,201),(5,301),(7,modes()['worldBoss']['stages'][0]['entry']),(8,10101),(9,1)]:
            with self.subTest(mode=mode):preflight(pool,mode,stage)

if __name__=='__main__':unittest.main()
