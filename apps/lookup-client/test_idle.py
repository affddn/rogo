"""Offline: idle income mirroring battery-saving mode, and the free-only Quick Idle."""
import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from gateway_ops import ACTIONS, Rejected
from routine.idle import IdleIncome, IdleError, reward_times
from routine.planner import RULES
from routine.runner import Routine


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


def bootstrap(stage=706, free=0, paid=0):
    return {'stage': {'curr_stage': stage}, 'daily_fast_idle_free_times': free, 'daily_fast_idle_times': paid}


def plan(idle, data=None, opened=lambda n: True):
    steps = {}
    idle.plan(data or bootstrap(), opened, steps)
    return steps


class FakeRoutine:
    """Records requests; 4087 answers with the queued pending counts."""
    def __init__(self, pending):
        self.pending = list(pending)
        self.sent = []
        self.validate = None

    def call(self, command, payload):
        self.sent.append((command, payload))
        if command == 4087:
            return SimpleNamespace(total_reward_times=self.pending.pop(0))
        return SimpleNamespace()


class RewardTimes(unittest.TestCase):
    def test_matches_try_get_online_reward_count(self):
        # Mathf.CeilToInt((float)(PreRewardCount / 2)) with uint division first, capped at 4.
        table = {0: 0, 1: 1, 2: 1, 3: 1, 4: 2, 5: 2, 8: 4, 9: 4, 10: 4, 100: 4}
        self.assertEqual({p: reward_times(p) for p in table}, table)

    def test_rules_come_from_the_pinned_tables(self):
        self.assertEqual(RULES['idle']['killInterval'], 15)
        self.assertEqual(RULES['idle']['stageMob']['101'], 5)
        self.assertEqual(RULES['idle']['stageMob']['706'], 15)
        self.assertEqual(RULES['idle']['fastIdleFree'], 1)


class OnlineIdle(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.idle = IdleIncome(RULES, self.clock)

    def test_kills_follow_the_battery_saving_timer_and_never_exceed_elapsed_ticks(self):
        self.clock.t += 14
        self.assertNotIn('idle:4089', plan(self.idle))  # no tick yet
        self.clock.t += 1
        self.assertIn('idle:4089', plan(self.idle))
        routine = FakeRoutine([3]);receipt = {}
        self.idle.run_online(routine, receipt)
        self.assertEqual(routine.sent, [(4087, {}), (4089, {'get_reward_times': 1, 'kill_num': 15})])
        self.clock.t += 5
        self.assertNotIn('idle:4089', plan(self.idle))  # one read per 15 s
        self.clock.t += 25  # 45 s since start: ticks 2 and 3 are new
        plan(self.idle)
        routine = FakeRoutine([9]);receipt = {}
        self.idle.run_online(routine, receipt)
        self.assertEqual(routine.sent[1], (4089, {'get_reward_times': 4, 'kill_num': 30}))
        self.assertEqual(receipt['idle'], {'times': 4, 'kills': 30, 'pending': 9})
        total = 15 + 30
        self.assertLessEqual(total, 15 * int((self.clock.t - 1000) // 15))

    def test_nothing_claimed_when_no_interval_is_pending_and_kills_keep_accumulating(self):
        self.clock.t += 30
        plan(self.idle)
        routine = FakeRoutine([0]);receipt = {}
        self.assertIsNone(self.idle.run_online(routine, receipt))
        self.assertEqual(routine.sent, [(4087, {})])
        self.assertIn('nothing claimed', receipt['note'])
        self.clock.t += 15
        plan(self.idle)
        routine = FakeRoutine([1])
        self.idle.run_online(routine, {})
        self.assertEqual(routine.sent[1], (4089, {'get_reward_times': 1, 'kill_num': 45}))

    def test_lowest_stage_rate_since_the_last_claim_is_used(self):
        self.clock.t += 30
        plan(self.idle, bootstrap(stage=101))  # 5 kills per tick
        plan(self.idle, bootstrap(stage=706))  # 15 kills per tick
        routine = FakeRoutine([2])
        self.idle.run_online(routine, {})
        self.assertEqual(routine.sent[1][1]['kill_num'], 10)

    def test_no_step_without_a_stage_rate(self):
        self.clock.t += 60
        self.assertNotIn('idle:4089', plan(self.idle, bootstrap(stage=0)))
        idle = IdleIncome({'idle': {**RULES['idle'], 'stageMob': {'706': 0}}}, self.clock)
        self.clock.t += 60
        self.assertNotIn('idle:4089', plan(idle))

    def test_revision_changes_after_each_read_so_a_later_claim_is_offered(self):
        self.clock.t += 15
        first = plan(self.idle)['idle:4089'].proof
        self.idle.run_online(FakeRoutine([0]), {})
        self.clock.t += 15
        self.assertNotEqual(plan(self.idle)['idle:4089'].proof, first)


class QuickIdle(unittest.TestCase):
    def setUp(self):
        self.idle = IdleIncome(RULES, Clock())

    def test_offered_only_while_the_free_allowance_remains(self):
        row = plan(self.idle, bootstrap(free=0, paid=2))['idle:4095']
        self.assertEqual((row.command, row.payload, row.idle['freeBefore'], row.idle['paidBefore']), (4095, {}, 0, 2))
        self.assertNotIn('idle:4095', plan(self.idle, bootstrap(free=1)))
        self.assertNotIn('idle:4095', plan(self.idle, bootstrap(free=0), opened=lambda n: n != 901))

    def test_reply_must_show_the_free_counter_moved_and_no_paid_use(self):
        row = plan(self.idle, bootstrap(free=0, paid=2))['idle:4095']
        self.idle.verify_fast(row, {'daily_fast_idle_free_times': 1, 'daily_fast_idle_times': 2}, {})
        for reply in ({'daily_fast_idle_free_times': 0, 'daily_fast_idle_times': 3},
                      {'daily_fast_idle_free_times': 1, 'daily_fast_idle_times': 3},
                      {'daily_fast_idle_free_times': 0, 'daily_fast_idle_times': 2}):
            with self.assertRaises(IdleError):self.idle.verify_fast(row, reply, {})


class RunnerReceipts(unittest.TestCase):
    def routine(self, data):
        clock = Clock()
        routine = Routine(None, Mock(), 'profile', 1, ACTIONS, Rejected, clock=clock)
        clock.t += 15
        steps = {}
        routine.idle.plan(data, lambda n: True, steps)
        routine.collect = Mock(return_value=(steps, [], {}))
        routine.actions_by_reply = Mock(side_effect=lambda name: {'OnlineIdleRewardRes': 4090, 'FastIdleRewardRes': 4096}[name])
        return routine, routine.scan(), steps

    def test_online_receipt_carries_rewards_duration_and_level(self):
        routine, scan, steps = self.routine(bootstrap())
        final = Mock(DESCRIPTOR=Mock());final.DESCRIPTOR.name = 'OnlineIdleRewardRes'
        routine.call = Mock(side_effect=[SimpleNamespace(total_reward_times=2), final])
        reply = {'rewards': {'items': [{'entry': 1, 'count': '50'}]}, 'idle_duration': 15, 'level_info': {'old_level': 56, 'new_level': 57}}
        with patch('routine.runner.as_dict', return_value=reply):
            out = routine.run({'scanId': scan['scanId'], 'keys': ['idle:4089']})
        r = out['receipts'][0]
        self.assertEqual((r['status'], r['reply'], r['idleDuration'], r['level']), ('confirmed', 4090, 15, {'before': 56, 'after': 57}))
        self.assertEqual(r['rewards'], {'rewards': reply['rewards']})
        self.assertEqual([s['command'] for s in r['substeps']], [4087, 4089])
        self.assertEqual(routine.call.call_args_list[1].args, (4089, {'get_reward_times': 1, 'kill_num': 15}))

    def test_not_due_is_a_skip_with_only_the_read_sent(self):
        routine, scan, _ = self.routine(bootstrap())
        routine.call = Mock(return_value=SimpleNamespace(total_reward_times=0))
        out = routine.run({'scanId': scan['scanId'], 'keys': ['idle:4089']})
        self.assertEqual(out['receipts'][0]['status'], 'skipped')
        routine.call.assert_called_once_with(4087, {})

    def test_paid_quick_idle_reply_stops_the_run(self):
        routine, scan, _ = self.routine(bootstrap(free=0, paid=0))
        final = Mock(DESCRIPTOR=Mock());final.DESCRIPTOR.name = 'FastIdleRewardRes'
        routine.call = Mock(return_value=final)
        with patch('routine.runner.as_dict', return_value={'daily_fast_idle_free_times': 0, 'daily_fast_idle_times': 1}):
            out = routine.run({'scanId': scan['scanId'], 'keys': ['idle:4095']})
        self.assertEqual(out['receipts'][0]['status'], 'stopped')
        self.assertIn('free allowance', out['receipts'][0]['note'])
        routine.call.assert_called_once_with(4095, {})


class Policy(unittest.TestCase):
    def test_online_idle_claim_is_no_longer_blocked_and_nothing_else_changed(self):
        policy = json.loads((Path(__file__).parent / 'catalog/operation-policy.json').read_text())
        self.assertNotIn('4089', policy['blocked'])
        self.assertNotIn('4089', policy.get('conditional', {}))
        self.assertEqual(len(policy['blocked']), 39)
        self.assertIn('4221', policy['blocked'])


if __name__ == '__main__':
    unittest.main()


class QuickIdleOncePerSession(unittest.TestCase):
    def test_second_quick_idle_is_never_offered_or_sent(self):
        from routine.idle import IdleIncome, IdleError
        from routine.planner import RULES
        idle = IdleIncome(RULES, clock=lambda: 0.0)
        data = {'stage': {'curr_stage': 0}, 'daily_fast_idle_free_times': 0, 'daily_fast_idle_times': 0}
        steps = {}
        idle.plan(data, lambda n: True, steps)
        self.assertIn('idle:4095', steps)
        idle.reserve_fast()
        # The scan still (wrongly) reports the free allowance as unused.
        steps = {}
        idle.plan(data, lambda n: True, steps)
        self.assertNotIn('idle:4095', steps)
        with self.assertRaises(IdleError):
            idle.reserve_fast()
