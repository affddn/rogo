# /// script
# requires-python = ">=3.10"
# dependencies = ["protobuf==6.33.6", "websockets==15.0.1"]
# ///
"""Offline bootstrap/projection checks. Set ILSPYCMD to the local ILSpy executable."""
import os
import unittest
from unittest.mock import Mock

from connect_character import SnapshotError, project, query_character
from login_smoke import check_gateway
from wire_probe import load_schema, msg


class BootstrapTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pool = load_schema(os.getenv("ILSPYCMD", "ilspycmd"))

    def setUp(self):
        self.player_id = 9007199254740993
        self.realm = 1000004
        self.data = msg(self.pool, "PlayerLoginData")()
        self.data.player.player.id = self.player_id
        self.data.player.player.nickname = "Example"
        self.data.player.player.level = 95
        self.data.player.player.server_id = str(self.realm)

    def test_projection_is_an_allowlist_and_ids_are_lossless(self):
        self.data.player.player.ability = "99999999999999999999"
        self.data.player.guideInfos = "private bootstrap data"
        self.data.cardInfo.cards.add(entry=15, star=2, count=42)
        self.data.cardInfo.cards.add(entry=16, star=0)
        self.data.stage.last_stage = 1004
        self.data.jobInfo.currCareerBuild = 21
        self.data.jobInfo.builds.add(build=21).skills.add(entry=2012101, level=3)
        self.assertEqual(project(self.data, self.realm, self.player_id), {
            "name": "Example", "playerId": "9007199254740993", "serverId": "1000004",
            "level": 95, "power": "99999999999999999999", "cards": {"15": 2},
            "spec": 21, "skills": {"20102": 3}, "stageEntry": 1004,
        })

    def test_unknown_is_not_empty(self):
        partial = project(self.data, self.realm, 0)
        for key in ("power", "spec", "stageEntry", "cards", "skills"):
            self.assertIsNone(partial[key])
        self.data.cardInfo.SetInParent()
        self.data.jobInfo.currCareerBuild = 21
        build = self.data.jobInfo.builds.add(build=21)
        empty = project(self.data, self.realm, self.player_id)
        self.assertEqual((empty["skills"], empty["cards"]), ({}, {}))
        build.skills.add(entry=123456789, level=5)
        self.assertIsNone(project(self.data, self.realm, self.player_id)["skills"])

    def test_identity_mismatch_is_not_an_import(self):
        for realm, identity in ((self.realm + 1, 0), (self.realm, self.player_id + 1)):
            with self.assertRaises(SnapshotError):
                project(self.data, realm, identity)

    def test_login_and_bootstrap_share_socket_without_retries(self):
        packet = msg(self.pool, "Packet")
        socket = Mock()
        sent = []

        def receive(timeout):
            request = packet.FromString(socket.send.call_args.args[0])
            sent.append((request.head.command, request.head.seq))
            self.assertEqual(request.head.service, 2)
            if len(sent) == 1:
                self.assertEqual(request.head.command, 4001)
                body = msg(self.pool, "LoginRes")(token="game-token", playerId=self.player_id,
                                                  accountId="example")
            else:
                self.assertEqual(request.head.command, 4005)
                self.assertEqual(request.head.refer, 0)
                query = msg(self.pool, "QueryPlayerDataReq").FromString(request.body)
                self.assertEqual(query.accountId, "example")
                self.assertEqual(query.clientInfo.platform, "Android")
                self.assertFalse(query.clientInfo.deviceId)
                body = msg(self.pool, "QueryPlayerDataRes")(login_data=self.data)
            reply = packet(head={"command": request.head.command + 1, "seq": request.head.seq + 1},
                           body=body.SerializeToString())
            if len(sent) == 2:
                batch = msg(self.pool, "MergePacketNotify")(packets=[reply])
                reply = packet(head={"command": 2108}, body=batch.SerializeToString())
            return reply.SerializeToString()

        socket.recv.side_effect = receive
        seq, identity = check_gateway(self.pool, socket, self.realm, "example", "sdk-token")
        out, current = query_character(self.pool, socket, seq, "example", self.realm, identity)
        self.assertEqual(current, self.data.stage.curr_stage)
        self.assertEqual(out["playerId"], str(self.player_id))
        self.assertEqual(sent, [(4001, seq - 2), (4005, seq)])
        socket.recv.side_effect = None
        socket.recv.return_value = packet(head={"command": 8070}).SerializeToString()
        with self.assertRaises(ConnectionError):
            query_character(self.pool, socket, seq + 2, "example", self.realm, identity)
        self.assertEqual(socket.send.call_count, 3)


if __name__ == "__main__":
    unittest.main()
