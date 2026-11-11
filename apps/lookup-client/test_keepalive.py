"""Offline: the worker keepalive used by the progression job's long waits."""
import contextlib
import io
import json
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import gateway_ops
from gateway_ops import handle, IDLE_EXIT, PING_INTERVAL


def run(op, channel):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        handle(json.dumps(op).encode(), None, channel)
    return json.loads(out.getvalue())


def channel():
    return SimpleNamespace(heartbeat=Mock(return_value=SimpleNamespace(time=1_762_000_000)))


class Keepalive(unittest.TestCase):
    def test_sends_exactly_one_heartbeat_and_returns_only_the_server_time(self):
        ch = channel()
        reply = run({'id': 'k1', 'mode': 'prepare', 'command': -9102, 'payload': {}}, ch)
        self.assertEqual(reply, {'id': 'k1', 'ok': True, 'result': {'serverTime': 1_762_000_000}})
        ch.heartbeat.assert_called_once_with()

    def test_needs_a_session_and_the_exact_shape(self):
        self.assertEqual(run({'id': 'k', 'mode': 'prepare', 'command': -9102, 'payload': {}}, None)['error'], 'session_required')
        for op in ({'mode': 'execute', 'payload': {}}, {'mode': 'prepare', 'payload': {'time': 1}}):
            ch = channel()
            self.assertEqual(run({'id': 'k', 'command': -9102, **op}, ch)['error'], 'invalid_request')
            ch.heartbeat.assert_not_called()

    def test_a_user_sent_heartbeat_stays_blocked_on_the_public_path(self):
        ch = channel()
        reply = run({'id': 'k', 'mode': 'execute', 'command': 4009, 'payload': {'time': 1}, 'confirm': 'HeartbeatReq'}, ch)
        self.assertEqual(reply['error'], 'operation_blocked')
        ch.heartbeat.assert_not_called()

    def test_the_heartbeat_reschedules_the_regular_ping(self):
        ch = gateway_ops.Channel.__new__(gateway_ops.Channel)
        ch.pool = None
        ch.exchange = Mock(return_value=SimpleNamespace(time=5))
        with patch('gateway_ops.msg', return_value=lambda **kw: kw), patch('gateway_ops.time.monotonic', return_value=100.0):
            ch.heartbeat()
        self.assertEqual(ch.next_ping, 100.0 + PING_INTERVAL)
        self.assertEqual(ch.exchange.call_args.args[0], 4009)


class IdleExit(unittest.TestCase):
    def test_a_keepalive_line_resets_the_worker_idle_exit(self):
        clock = {'t': 0.0}
        lines = {IDLE_EXIT - 10: b'{"id":"k","mode":"prepare","command":-9102,"payload":{}}\n'}
        ended = {}

        def monotonic():
            clock['t'] += 1.0
            return clock['t']

        def readable(fds, *_):
            due = [t for t in lines if t <= clock['t']]
            # End the input stream well after the first idle limit would have passed.
            return (fds if due or clock['t'] >= IDLE_EXIT + 200 else [], [], [])

        def read(fd, n):
            due = sorted(t for t in lines if t <= clock['t'])
            if due:
                return lines.pop(due[0])
            ended['at'] = clock['t']
            return b''

        ws = Mock();ws.recv.side_effect = TimeoutError
        fake = SimpleNamespace(next_ping=10 ** 9, heartbeat=Mock(return_value=SimpleNamespace(time=7)), lost=False)
        with patch('gateway_ops.Channel', return_value=fake), patch('gateway_ops.Routine'), \
                patch('gateway_ops.time.monotonic', side_effect=monotonic), \
                patch('gateway_ops.select.select', side_effect=readable), patch('gateway_ops.os.read', side_effect=read), \
                contextlib.redirect_stdout(io.StringIO()):
            gateway_ops.serve(None, ws, player_id=1, last_seq=0, current_stage=0, profile='p', realm=1)
        fake.heartbeat.assert_called_once()
        # Without the keepalive the loop would have exited at IDLE_EXIT; it ran on until the input ended.
        self.assertGreater(ended['at'], IDLE_EXIT)


if __name__ == '__main__':
    unittest.main()
