# /// script
# requires-python = ">=3.10"
# dependencies = ["protobuf==6.33.6", "websockets==15.0.1"]
# ///
"""Offline only: use ILSPYCMD to point at ILSpy for the pinned local game schema."""
import contextlib
import io
import json
import os
import unittest
from unittest.mock import Mock, patch

from gateway_ops import ACTIONS, ALL_REFLECTIONS, POLICY, Channel, Rejected, handle, prepare, redact
from wire_probe import load_schema, msg


class OperationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pool = load_schema(os.getenv("ILSPYCMD", "ilspycmd"), ALL_REFLECTIONS)

    def op(self, n, body=None, **kw):
        return {"id": "local", "mode": "prepare", "command": n, "payload": body or {}, **kw}

    def test_schema_includes_every_catalog_message(self):
        for action in ACTIONS.values():
            for field in ("request", "reply"):
                msg(self.pool, action[field]["name"])
        self.assertTrue({int(n) for n in POLICY["conditional"] | POLICY["blocked"]} <= ACTIONS.keys())

    def test_typed_prepare_only_preserves_int64(self):
        channel = Mock()
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            handle(json.dumps(self.op(4013, {"playerId": "9007199254740993"})), self.pool, channel)
        self.assertEqual(json.loads(out.getvalue())["result"]["normalized"], {"playerId": "9007199254740993"})
        channel.exchange.assert_not_called()

    def test_wrong_type_extra_keys_and_unknown_command(self):
        for op, code in [(self.op(True), "unknown_command"), (self.op(4666666), "unknown_command"),
                         (self.op(4013, {"unknown": "private"}), "invalid_payload"),
                         (self.op(4013, {"playerId": "not-int64"}), "invalid_payload"),
                         (self.op(4217, {"buy_type": 100}), "invalid_payload"),
                         (self.op(4013, body=None, endpoint="anywhere"), "invalid_request")]:
            with self.subTest(op=op), self.assertRaisesRegex(Rejected, code):
                prepare(self.pool, op)

    def test_blocked_commands_never_reach_socket(self):
        channel = Mock()
        for key in POLICY["blocked"]:
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                handle(json.dumps(self.op(int(key), mode="execute", confirm=ACTIONS[int(key)]["request"]["name"])), self.pool, channel)
            self.assertEqual(json.loads(out.getvalue())["error"], "operation_blocked")
        channel.exchange.assert_not_called()

    def test_variant_policy(self):
        variants = {
            4069: ({"item": {"selectEntry": 12, "count": 1}}, {"item": {"count": 1}}),
            4191: ({"goodEntry": 108, "buyCount": "1"}, {"goodEntry": 302, "buyCount": "1"}),
            4209: ({"bpEntry": 1}, {"buyLevel": 1}),
            4217: ({"buy_type": 1}, {"buy_type": 0}),
            4457: ({"isAd": False}, {"isAd": True}),
            4489: ({"item": {"selectEntry": 12, "count": 1}}, {"item": {"selectEntry": 12}}),
            4621: ({"gacha_type": 2}, {"gacha_type": 3}),
            4637: ({"gacha_type": 1}, {"gacha_type": 3}),
            4719: ({"gacha_type": 1}, {"gacha_type": 2}),
            5057: ({"sweep_type": 0}, {"sweep_type": 1}),
            7021: ({"isFree": True}, {"isAd": True}),
            7025: ({"actId": 1, "goodEntry": 1600101, "buyCount": 1},
                   {"actId": 1, "goodEntry": 1600103, "buyCount": 1}),
        }
        self.assertEqual(set(variants), set(map(int, POLICY["conditional"])))
        for n, (allow, deny) in variants.items():
            with self.subTest(n=n):
                prepare(self.pool, self.op(n, allow))
                with self.assertRaisesRegex(Rejected, "variant_blocked"):
                    prepare(self.pool, self.op(n, deny))

    def test_confirmation_state(self):
        for n, needs_confirmation in [(4043, True), (4041, True), (4013, False)]:
            with self.subTest(n=n):
                self.assertEqual(prepare(self.pool, self.op(n))[1]["requiresConfirmation"], needs_confirmation)
                if needs_confirmation:
                    with self.assertRaisesRegex(Rejected, "confirmation_required"):
                        prepare(self.pool, self.op(n, mode="execute", confirm="yes"))
                prepare(self.pool, self.op(n, mode="execute", confirm=ACTIONS[n]["request"]["name"]))

    def test_socket_correlation_and_unknown_outcome(self):
        packet = msg(self.pool, "Packet")
        def frame(cmd, seq=0, status=0):
            return packet(head={"command": cmd, "seq": seq, "status": status})
        ws = Mock()
        channel = Channel(self.pool, ws, 0x10000000F, 101)
        merge = msg(self.pool, "MergePacketNotify")(packets=[frame(4014, 12), frame(4014, 104)])
        ws.recv.side_effect = [frame(4042, 104).SerializeToString(),
                               packet(head={"command": 2108}, body=merge.SerializeToString()).SerializeToString()]
        channel.exchange(4013, msg(self.pool, "QueryPlayerDetailInfoReq")(playerId=17))
        actual = packet.FromString(ws.send.call_args.args[0])
        self.assertEqual((actual.head.command, actual.head.refer, actual.head.seq, actual.head.service), (4013, 15, 103, 2))
        ws.recv.side_effect = [frame(4014, 106, 77).SerializeToString()]
        with self.assertRaisesRegex(Rejected, "gateway_status_77"):
            channel.exchange(4013, msg(self.pool, "QueryPlayerDetailInfoReq")())
        ws.recv.side_effect = TimeoutError()
        out = io.StringIO()
        with self.assertRaises(ConnectionError), contextlib.redirect_stdout(out):
            handle(json.dumps(self.op(4013, mode="execute")), self.pool, channel)
        self.assertEqual(json.loads(out.getvalue())["error"], "session_lost")
        self.assertEqual(ws.send.call_count, 3)

    def test_gateway_paces_repeated_commands_and_heartbeats(self):
        packet=msg(self.pool,'Packet')
        ws=Mock()
        channel=Channel(self.pool,ws,15,101)
        clock=[10.0]
        def advance(seconds):clock[0]+=seconds
        ws.recv.side_effect=[packet(head={'command':4010,'seq':104}).SerializeToString(),
                             packet(head={'command':4010,'seq':106}).SerializeToString(),
                             packet(head={'command':4014,'seq':108}).SerializeToString(),
                             packet(head={'command':4014,'seq':110}).SerializeToString()]
        with patch('gateway_ops.time.monotonic',side_effect=lambda:clock[0]),patch('gateway_ops.time.sleep',side_effect=advance) as sleep:
            channel.exchange(4009,msg(self.pool,'HeartbeatReq')())
            channel.exchange(4009,msg(self.pool,'HeartbeatReq')())
            channel.exchange(4013,msg(self.pool,'QueryPlayerDetailInfoReq')())
            channel.exchange(4013,msg(self.pool,'QueryPlayerDetailInfoReq')())
        self.assertEqual(sleep.call_count,2)
        self.assertAlmostEqual(sleep.call_args_list[0].args[0],5)
        self.assertAlmostEqual(sleep.call_args_list[1].args[0],0.2)
        self.assertEqual(ws.send.call_count,4)

    def test_redact_nested_secrets(self):
        self.assertEqual(redact({"results": [{"SDK_Token": "xx", "account_id": "xx", "player_id": "11"}]}),
                         {"results": [{"player_id": "11"}]})

if __name__ == "__main__":
    unittest.main()
