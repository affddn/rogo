"""Offline: the free-only Quick Idle and the idle settlement each scan reports."""
import json
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from gateway_ops import ACTIONS, Rejected
from routine.idle import IdleIncome, IdleError
from routine.planner import RULES
from routine.runner import Routine, offline_summary


def bootstrap(free=0, paid=0):
    return {'stage': {'curr_stage': 706}, 'daily_fast_idle_free_times': free, 'daily_fast_idle_times': paid}


def plan(idle, data=None, opened=lambda n: True):
    steps = {}
    idle.plan(data or bootstrap(), opened, steps)
    return steps


class Rules(unittest.TestCase):
    def test_only_the_quick_idle_allowance_comes_from_the_tables(self):
        self.assertEqual(RULES['idle'], {'fastIdleFree': 1})


class NoOnlineClaim(unittest.TestCase):
    def test_the_scan_never_offers_an_online_idle_claim(self):
        steps = plan(IdleIncome(RULES), bootstrap(free=1))
        self.assertEqual(steps, {})
        self.assertFalse(any(s.command in (4087, 4089) for s in plan(IdleIncome(RULES)).values()))


class QuickIdle(unittest.TestCase):
    def setUp(self):
        self.idle = IdleIncome(RULES)

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

    def test_second_quick_idle_is_never_offered_or_sent(self):
        self.assertIn('idle:4095', plan(self.idle))
        self.idle.reserve_fast()
        # The scan still (wrongly) reports the free allowance as unused.
        self.assertNotIn('idle:4095', plan(self.idle))
        with self.assertRaises(IdleError):
            self.idle.reserve_fast()


class RunnerReceipts(unittest.TestCase):
    def routine(self, data):
        routine = Routine(None, Mock(), 'profile', 1, ACTIONS, Rejected)
        steps = {}
        routine.idle.plan(data, lambda n: True, steps)
        routine.collect = Mock(return_value=(steps, [], {}))
        routine.actions_by_reply = Mock(return_value=4096)
        return routine, routine.scan()

    def final(self):
        final = Mock(DESCRIPTOR=Mock());final.DESCRIPTOR.name = 'FastIdleRewardRes'
        return final

    def test_free_quick_idle_receipt(self):
        routine, scan = self.routine(bootstrap(free=0, paid=0))
        routine.call = Mock(return_value=self.final())
        reply = {'rewards': {'items': [{'entry': 1, 'count': '50'}]}, 'idle_duration': 7200,
                 'level_info': {'old_level': 56, 'new_level': 57}, 'daily_fast_idle_free_times': 1, 'daily_fast_idle_times': 0}
        with patch('routine.runner.as_dict', return_value=reply):
            out = routine.run({'scanId': scan['scanId'], 'keys': ['idle:4095']})
        r = out['receipts'][0]
        self.assertEqual((r['status'], r['reply'], r['idleDuration'], r['level']), ('confirmed', 4096, 7200, {'before': 56, 'after': 57}))
        self.assertEqual(r['idle'], {'freeUsed': 1, 'paidUsed': 0})
        routine.call.assert_called_once_with(4095, {})

    def test_paid_quick_idle_reply_stops_the_run(self):
        routine, scan = self.routine(bootstrap(free=0, paid=0))
        routine.call = Mock(return_value=self.final())
        with patch('routine.runner.as_dict', return_value={'daily_fast_idle_free_times': 0, 'daily_fast_idle_times': 1}):
            out = routine.run({'scanId': scan['scanId'], 'keys': ['idle:4095']})
        self.assertEqual(out['receipts'][0]['status'], 'stopped')
        self.assertIn('free allowance', out['receipts'][0]['note'])
        routine.call.assert_called_once_with(4095, {})


class OfflineSummary(unittest.TestCase):
    def test_numbers_when_the_login_data_settled_idle_time(self):
        data = {'offline_idle_info': {'curr_stage': 706, 'offline_duration': 83, 'max_offline_duration': 43200,
                                      'rewards': {'items': [{'entry': 1, 'count': '9'}, {'entry': 2, 'count': '3'}],
                                                  'equips': [{'id': '77', 'entry': 5}, {'id': '78', 'entry': 6}]},
                                      'level_info': {'old_level': 56, 'new_level': 57}}}
        summary = offline_summary(data)
        self.assertEqual(summary, {'duration': 83, 'max': 43200, 'items': 4, 'levelBefore': 56, 'levelAfter': 57})
        # Never reward contents: only numbers (or missing levels) leave the helper.
        self.assertTrue(all(v is None or type(v) is int for v in summary.values()))

    def test_null_when_nothing_was_settled(self):
        self.assertIsNone(offline_summary({}))
        self.assertIsNone(offline_summary({'offline_idle_info': {}}))
        self.assertEqual(offline_summary({'offline_idle_info': {'offline_duration': 12}}),
                         {'duration': 12, 'max': 0, 'items': 0, 'levelBefore': None, 'levelAfter': None})


class Policy(unittest.TestCase):
    def test_online_idle_claim_stays_unblocked_though_the_job_never_sends_it(self):
        policy = json.loads((Path(__file__).parent / 'catalog/operation-policy.json').read_text())
        self.assertNotIn('4089', policy['blocked'])
        self.assertEqual(len(policy['blocked']), 39)
        self.assertIn('4221', policy['blocked'])


if __name__ == '__main__':
    unittest.main()
