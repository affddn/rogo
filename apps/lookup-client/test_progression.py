import unittest
from dataclasses import replace
from unittest.mock import Mock, patch

from gateway_ops import ACTIONS, Rejected
from routine.planner import build, RULES, function_open
from routine.progression import allocation, build_state, jobs, recommend, point_cost, ATTRS, allocate_skills, skill_tree, fill_loadout
from routine.runner import Routine, ProgressionError, rebuild_stats, verify_development


def character():
    return {'player':{'player':{'id':'1','nickname':'Test','level':56,'ability':'1000'}},
            'stage':{'last_stage':705,'curr_stage':706},
            'tasks':{'mainTaskReceived':{'7':True}},
            'jobInfo':{'careerEntry':221,'currCareerBuild':21,'jobEntry':301,'totalAttrPoint':20,
                       'builds':[{'build':21,'attrs':[],'usedAttrPoint':0}]}}


def proposals(data=None):
    return list(build(data or character(),None,None,100000,0).values())


def allocated(values):
    return [{'attrId':a,'value':n} for a,n in zip(ATTRS,values) if n]


class ProgressionRules(unittest.TestCase):
    def test_recommendation_uses_current_allocation_and_cost_increases(self):
        after,left=recommend([0]*6,20,[2,2,0,0,0,0])
        self.assertEqual(after,[8,7,0,0,0,0]);self.assertEqual(left,0)
        after,left=recommend([50,0,0,0,0,0],20,[2,2,0,0,0,0])
        self.assertEqual(after[0],50)
        self.assertEqual(sum(point_cost(n) for n in after)-point_cost(50)+left,20)
        self.assertGreater(after[1],0)
        self.assertTrue(all(x==0 for x in after[2:]))

    def test_stats_payload_is_additional_points_not_total_attributes(self):
        data=character();active=data['jobInfo']['builds'][0]
        active.update(attrs=allocated([4,4,0,0,0,0]),usedAttrPoint=8)
        row=next(s for s in proposals(data) if s.development and s.development['type']=='stats')
        self.assertEqual(row.payload['attrs'],allocated([4,3,0,0,0,0]))
        self.assertEqual([s['after'] for s in row.development['stats']],[8,7,0,0,0,0])
        self.assertEqual(row.development['usedPoints'],20)

    def test_reset_is_distinct_and_never_proposed_without_proven_points(self):
        data=character();active=data['jobInfo']['builds'][0]
        active.update(attrs=allocated([0,0,8,0,0,0]),usedAttrPoint=11)
        rows=proposals(data)
        reset=next(s for s in rows if s.development and s.development['type']=='rebuild')
        self.assertEqual(reset.payload['attrs'],allocated([8,7,0,0,0,0]))
        active['usedAttrPoint']=5  # state/cost model disagree: do not reset or allocate
        self.assertFalse(any(s.command==4529 for s in proposals(data)))
        active.update(usedAttrPoint=0,attrs=[{'attrId':9999,'value':1}])
        self.assertIsNone(allocation(active))
        self.assertFalse(any(s.command==4529 for s in proposals(data)))

    def test_same_tier_class_switch_and_known_unlocked_specs_only(self):
        rows=proposals()
        choices=[s.payload['careerEntry'] for s in rows if s.development and s.development['type']=='class']
        self.assertEqual(choices,[321,421,521])
        self.assertTrue(any(s.command==4523 and s.payload=={'build':22} for s in rows))
        self.assertFalse(any(s.development and s.development['spec']==42 for s in rows))
        data=character();data['jobInfo']['jobEntry']=134
        self.assertFalse(any(s.command==4523 for s in proposals(data)))
        state=build_state(data,RULES,lambda n:True)
        self.assertFalse(next(c for c in state['choices'] if c['spec']==22)['available'])
        data['tasks']={}
        self.assertFalse(any(s.development and s.development['type']=='class' for s in proposals(data)))

    def test_build_state_exposes_allocation_and_skill_levels_for_fingerprints(self):
        data=character()
        data['jobInfo']['builds']=[{'build':21,'attrs':[{'attrId':1011,'value':4},{'attrId':1021,'value':2}],'usedAttrPoint':6,
                                    'skills':[{'entry':1,'level':3},{'entry':2,'level':0},{'entry':3}]}]
        state=build_state(data,RULES,lambda n:True)
        self.assertEqual(state['stats'],[4,2,0,0,0,0])
        self.assertEqual(state['skillLevels'],3)
        data['jobInfo']['builds']=[]
        state=build_state(data,RULES,lambda n:True)
        self.assertEqual((state['stats'],state['skillLevels']),([0]*6,0))

    def test_advancement_requires_every_claimed_transfer_task(self):
        data=character()
        rule=next(r for r in jobs()['jobChange'] if r['fromTier']==3)
        tasks=[{'entry':t['id'],'rewardsReceived':True} for g in rule['groups'] for t in g['tasks']]
        data['tasks']['tasks']=tasks
        row=next(s for s in proposals(data) if s.development and s.development['type']=='advance')
        self.assertEqual(row.payload,{'careerEntry':231})
        tasks[-1]['rewardsReceived']=False
        self.assertFalse(any(s.development and s.development['type']=='advance' for s in proposals(data)))

    def test_campaign_target_is_current_not_guessed_from_last_clear(self):
        data=character()
        row=next(s for s in proposals(data) if s.command==5001)
        self.assertEqual(row.stage_entry,706);self.assertEqual(row.next_stage,707)
        del data['stage']['curr_stage']
        self.assertFalse(any(s.command==5001 for s in proposals(data)))
        data['stage']['curr_stage']=999999
        self.assertFalse(any(s.command==5001 for s in proposals(data)))


class ProgressionExecution(unittest.TestCase):
    def reset_row(self):
        data=character();data['jobInfo']['builds'][0].update(attrs=allocated([0,0,8,0,0,0]),usedAttrPoint=11)
        return next(s for s in proposals(data) if s.development and s.development['type']=='rebuild')

    def test_reset_then_exact_allocation_and_partial_receipt(self):
        row=self.reset_row();routine=Mock();receipt={}
        routine.call.side_effect=['reset','allocate']
        with patch('routine.runner.as_dict',return_value={'totalAttrPoint':20,'buildInfo':{'build':21}}):
            self.assertEqual(rebuild_stats(routine,row,receipt),'allocate')
        self.assertEqual([a.args[0] for a in routine.call.call_args_list],[4531,4529])
        self.assertEqual(routine.call.call_args.args[1],row.payload)
        self.assertEqual(len(receipt['substeps']),2)
        routine.call.reset_mock();routine.call.side_effect=['reset',Rejected('no')];receipt={}
        with patch('routine.runner.as_dict',return_value={'totalAttrPoint':20,'buildInfo':{'build':21}}):
            with self.assertRaises(Rejected):rebuild_stats(routine,row,receipt)
        self.assertEqual(len(receipt['substeps']),1)

    def test_reset_changed_budget_prevents_followup(self):
        row=self.reset_row();routine=Mock();receipt={}
        for info in ({'totalAttrPoint':21,'buildInfo':{'build':21}}, {'totalAttrPoint':20,'buildInfo':{'build':22}}):
            routine.call.reset_mock()
            with patch('routine.runner.as_dict',return_value=info):
                with self.assertRaises(ProgressionError):rebuild_stats(routine,row,receipt)
            routine.call.assert_called_once_with(4531,{})

    def test_verify_allocations_and_class_receipts(self):
        row=self.reset_row();out={}
        reply={'totalAttrPoint':20,'buildInfo':{'build':21,'usedAttrPoint':20,'attrs':allocated([8,7,0,0,0,0])}}
        verify_development(row,reply,out)
        reply['buildInfo']['build']=22
        with self.assertRaises(ProgressionError):verify_development(row,reply,out)
        row=next(s for s in proposals() if s.development and s.development['type']=='class')
        verify_development(row,{'jobInfo':{'careerEntry':321,'currCareerBuild':31}},out)
        self.assertEqual(out['buildState'],{'career':321,'spec':31})
        with self.assertRaises(ProgressionError):verify_development(row,{'jobInfo':{'careerEntry':221,'currCareerBuild':21}},out)

    def test_campaign_uses_pinned_engine_not_generic_start_call(self):
        row=next(s for s in proposals() if s.command==5001)
        routine=Routine(None,Mock(),'profile',1,ACTIONS,Rejected)
        routine.collect=Mock(return_value=({row.key:row},[],{}));snapshot=routine.scan()
        routine.call=Mock(side_effect=AssertionError('must not send a bare start'))
        final=Mock(DESCRIPTOR=Mock(fields_by_name={'fight_result':True}),fight_result=True)
        routine.actions_by_reply=Mock(return_value=5004)
        with patch('routine.runner.run_campaign',return_value=final) as battle,patch('routine.runner.as_dict',return_value={}):
            out=routine.run({'scanId':snapshot['scanId'],'keys':[row.key]})
        battle.assert_called_once_with(None,routine.channel,706)
        self.assertEqual(out['receipts'][0]['status'],'confirmed')
        self.assertTrue(out['receipts'][0]['won'])

class SkillAllocation(unittest.TestCase):
    """SkillAutoAllocator / HeroSpellPanel port against the pinned spec 21 tree."""
    def rows(self):
        return skill_tree(21)

    def test_matches_the_client_allocator_on_hand_checked_budgets(self):
        after,left=allocate_skills(self.rows(),{},3,67,3)
        self.assertEqual({e:n for e,n in after.items() if n},{2012101:1,2012102:1,2012103:1});self.assertEqual(left,0)
        # 2012105 needs 2012103 at level 5: the prerequisite is filled first, then activation goes on.
        after,left=allocate_skills(self.rows(),{},10,67,1)
        self.assertEqual({e:n for e,n in after.items() if n},{2012101:1,2012102:1,2012103:5,2012104:1,2012105:1,2012106:1})

    def test_budget_max_levels_prerequisites_and_gates_hold(self):
        rows=self.rows();by={r['entry']:r for r in rows}
        for points,level,tier in ((1,67,3),(37,67,3),(200,67,4),(500,200,4),(60,5,2)):
            after,left=allocate_skills(rows,{},points,level,tier)
            self.assertEqual(sum(after.values())+left,points)
            for e,n in after.items():
                r=by[e]
                self.assertLessEqual(n,r['max'])
                if n:
                    self.assertLessEqual(r['tier'],tier)
                    if r['front'] and r['frontLevel']:self.assertGreaterEqual(after[r['front']],r['frontLevel'])
        # A job-level gate is never activated, even with points to spare.
        after,_=allocate_skills(rows,{},50,0,1)
        self.assertEqual(after[2012103],after[2012104]);self.assertEqual(after[2012104],0)

    def test_starts_from_current_levels_and_never_lowers(self):
        before={2012101:5,2012104:2}
        after,left=allocate_skills(self.rows(),before,4,67,3)
        self.assertTrue(all(after[e]>=n for e,n in before.items()))
        self.assertEqual(sum(after.values())-sum(before.values())+left,4)

    def test_loadout_fills_empty_slots_only_highest_idx_first(self):
        rows=self.rows()
        levels={2012101:1,2012102:1,2112108:1,2012105:1}
        self.assertEqual(fill_loadout(rows,levels,[2012101,0,0,0,0]),[2012101,2112108,2012102,0,0])
        self.assertEqual(fill_loadout(rows,levels,[2012101,2112108,2012102,7,7]),[2012101,2112108,2012102,7,7])


def skilled(total, levels=(), slots=None, used=None):
    data=character();info=data['jobInfo'];active=info['builds'][0]
    info['totalSkillPoint']=total
    active['skills']=[{'entry':e,'level':n} for e,n in levels]
    active['usedSkillPoint']=sum(n for _,n in levels) if used is None else used
    if slots is not None:active['useSkillEntrys']=slots
    return data


def skill_rows(data, kind):
    return [s for s in proposals(data) if s.development and s.development['type']==kind]


class SkillProposals(unittest.TestCase):
    def test_spends_unspent_points_with_absolute_levels_and_keeps_the_loadout(self):
        data=skilled(3,slots=[0,0,0,0,0])
        row,=skill_rows(data,'skills')
        self.assertEqual(row.command,4525)
        self.assertEqual(row.payload,{'build':21,'skills':[{'entry':2012101,'level':1},{'entry':2012102,'level':1},{'entry':2012103,'level':1}],
                                      'useSkillEntrys':[0,0,0,0,0]})
        self.assertEqual(row.development['usedPoints'],3);self.assertEqual(row.development['totalPoints'],3)
        self.assertEqual([c['after'] for c in row.development['skills']],[1,1,1])
        self.assertFalse(skill_rows(data,'loadout'))  # equip only after the points are confirmed
        self.assertEqual(build_state(data,RULES,lambda n:True)['freeSkillPoints'],3)

    def test_nothing_proposed_without_points_or_with_an_inconsistent_build(self):
        self.assertFalse(skill_rows(skilled(2,[(2012101,1),(2012102,1)],[2012102,2012101,0,0,0]),'skills'))
        self.assertFalse(skill_rows(skilled(2,[(2012101,1),(2012102,1)],[2012102,2012101,0,0,0]),'loadout'))
        for data in (skilled(5,[(2012101,1)],used=3),          # levels and used points disagree
                     skilled(5,[(999,1)],used=1),              # unknown skill: other version
                     skilled(5,[(2012101,9)],used=9),          # beyond the maximum level
                     skilled(1,[(2012101,2)],used=2)):         # more used than earned
            self.assertFalse(skill_rows(data,'skills')+skill_rows(data,'loadout'))

    def test_equips_learned_active_skills_into_empty_slots(self):
        data=skilled(2,[(2012101,1),(2012102,1)],[2012101])
        row,=skill_rows(data,'loadout')
        self.assertEqual(row.command,4533)
        self.assertEqual(row.payload,{'build':21,'useSkillEntrys':[2012101,2012102,0,0,0]})
        self.assertEqual(row.development['before'],[2012101,0,0,0,0])

    def test_verification_rejects_any_mismatch(self):
        row,=skill_rows(skilled(3,slots=[0,0,0,0,0]),'skills');out={}
        ok={'build':21,'totalSkillPoint':3,'buildInfo':{'build':21,'usedSkillPoint':3,'useSkillEntrys':[0,0,0,0,0],
            'skills':[{'entry':2012101,'level':1},{'entry':2012102,'level':1},{'entry':2012103,'level':1}]}}
        verify_development(row,ok,out)
        for change in ({'totalSkillPoint':4},{'build':22},{'buildInfo':{**ok['buildInfo'],'usedSkillPoint':2}},
                       {'buildInfo':{**ok['buildInfo'],'useSkillEntrys':[2012101,0,0,0,0]}},
                       {'buildInfo':{**ok['buildInfo'],'skills':ok['buildInfo']['skills'][:2]}}):
            with self.assertRaises(ProgressionError):verify_development(row,{**ok,**change},out)
        row,=skill_rows(skilled(2,[(2012101,1),(2012102,1)],[2012101]),'loadout')
        verify_development(row,{'build':21,'useSkillEntrys':[2012101,2012102,0,0,0]},out)
        verify_development(row,{'build':21,'useSkillEntrys':[2012101,2012102]},out)  # trailing empties omitted
        with self.assertRaises(ProgressionError):verify_development(row,{'build':21,'useSkillEntrys':[2012102,2012101]},out)

    def test_single_request_receipts_are_honest_on_rejection_and_mismatch(self):
        row,=skill_rows(skilled(3,slots=[0,0,0,0,0]),'skills')
        routine=Routine(None,Mock(),'profile',1,ACTIONS,Rejected)
        routine.collect=Mock(return_value=({row.key:row},[],{}))
        snapshot=routine.scan()
        routine.call=Mock(side_effect=Rejected('10500'))
        out=routine.run({'scanId':snapshot['scanId'],'keys':[row.key]})
        self.assertEqual(out['receipts'][0]['status'],'rejected');self.assertNotIn('substeps',out['receipts'][0])
        routine.call.assert_called_once_with(4525,row.payload)
        snapshot=routine.scan()
        final=Mock(DESCRIPTOR=Mock(name='CareerSkillUpRes'));routine.actions_by_reply=Mock(return_value=4526)
        routine.call=Mock(return_value=final)
        with patch('routine.runner.as_dict',return_value={'build':21,'totalSkillPoint':3,'buildInfo':{'build':21,'usedSkillPoint':1}}):
            out=routine.run({'scanId':snapshot['scanId'],'keys':[row.key]})
        self.assertEqual(out['receipts'][0]['status'],'stopped')
        self.assertIn('skill reply',out['receipts'][0]['note'])
        routine.call.assert_called_once()

if __name__=='__main__':unittest.main()
