# /// script
# requires-python = ">=3.10"
# dependencies = ["protobuf==6.33.6", "websockets==15.0.1"]
# ///
"""Catalog-typed operations for one already-authenticated socket; never reconnects."""
import argparse
from functools import cache
import json
import os
import re
import select
import sys
import time
from pathlib import Path

from google.protobuf import json_format
from google.protobuf.descriptor import FieldDescriptor
from google.protobuf.message import DecodeError
from websockets.exceptions import WebSocketException

from routine.runner import Routine, RoutineError
from routine.dungeon import DungeonEvents, DungeonError
from campaign import CampaignError, preflight, run_campaign
from wire_probe import frames, load_schema, msg

ROOT = Path(__file__).resolve().parent
ALL_REFLECTIONS = tuple(x + "Reflection" for x in ("Enum", "Common", "Base", "Act", "Play", "TeamPve", "Notify", "Gm"))
ACTIONS = {a["request"]["id"]: a for a in json.loads((ROOT / "catalog/actions.json").read_bytes())["actions"]}
POLICY = json.loads((ROOT / "catalog/operation-policy.json").read_bytes())
MAX_INPUT = 65536
MAX_OUTPUT = 1024 * 1024


class Rejected(Exception):
    """Fixed error codes only (no data, exception details, or remote text)."""


@cache
def shop_prices():
    shops = json.loads((ROOT.parent / "web/public/data/shops.json").read_bytes())
    return {g["id"]: (s["kind"], g["pay"]) for s in shops["stores"] for g in s["goods"]}


def permitted_variant(n, m):
    if n in (4069, 4489):
        return m.item.selectEntry > 0 and m.item.count > 0
    if n in (4191, 7025):
        kind, price = shop_prices().get(m.goodEntry, (None, None))
        expected_shop = kind == "event" if n == 7025 else kind in ("shop", "mall")
        return expected_shop and price in ("free", "item") and m.buyCount > 0
    if n == 4209:
        return m.buyLevel == 0
    if n == 4217:
        return m.buy_type in (1, 2)
    if n in (4457, 7021):
        return not m.isAd
    if n in (4621, 4637):
        return m.gacha_type in (1, 2)
    if n == 4719:
        return m.gacha_type == 1
    if n == 5057:
        return m.sweep_type == 0
    return True


def known_enums(message):
    # Proto3 preserves unknown numeric enum values on the wire. Don't let a
    # payload select an undocumented mode just because the wire permits it.
    for field, value in message.ListFields():
        if field.message_type and field.message_type.GetOptions().map_entry:
            field, values = field.message_type.fields_by_name["value"], value.values()
        else:
            values = value if field.is_repeated else (value,)
        if field.type == FieldDescriptor.TYPE_ENUM and any(v not in field.enum_type.values_by_number for v in values):
            return False
        if field.type == FieldDescriptor.TYPE_MESSAGE and not all(known_enums(v) for v in values):
            return False
    return True


def prepare(pool, op):
    if op.keys() - {"id", "mode", "command", "payload", "confirm"} or op.get("mode") not in ("prepare", "execute"):
        raise Rejected("invalid_request")
    n = op.get("command")
    if type(n) is not int or n not in ACTIONS:
        raise Rejected("unknown_command")
    a = ACTIONS[n]
    if str(n) in POLICY["blocked"] or a["effect"] == "restricted":
        raise Rejected("operation_blocked")
    if not isinstance(op.get("payload"), dict):
        raise Rejected("invalid_payload")
    try:
        m = json_format.ParseDict(op["payload"], msg(pool, a["request"]["name"])(), descriptor_pool=pool)
    except (ValueError, TypeError, OverflowError, json_format.ParseError, RecursionError):
        raise Rejected("invalid_payload") from None
    if not known_enums(m):
        raise Rejected("invalid_payload")
    if not permitted_variant(n, m):
        raise Rejected("variant_blocked")
    confirm = a["effect"] != "read" or a["evidence"] == "schema-only"
    if op["mode"] == "execute" and confirm and op.get("confirm") != a["request"]["name"]:
        raise Rejected("confirmation_required")
    return m, {"command": n, "request": a["request"]["name"], "reply": a["reply"]["id"], "effect": a["effect"],
               "bytes": m.ByteSize(), "requiresConfirmation": confirm,
               "normalized": json_format.MessageToDict(m, preserving_proto_field_name=True)}


# Some messages carry account/contact/SDK fields below otherwise-public nested players.
def redact(value):
    if isinstance(value, dict):
        return {k: redact(v) for k, v in value.items() if not re.search(
            r"token|session|password|secret|signature|credential|encrypteddata|accountid|channeluserid|deviceid|phone|openid",
            k.replace("_", ""), re.I)}
    if isinstance(value, list):
        return [redact(v) for v in value]
    return value


class Channel:
    def __init__(self, pool, ws, player_id, last_seq, current_stage=0):
        self.player_id, self.current_stage = player_id, current_stage
        self.pool, self.ws, self.refer, self.seq = pool, ws, player_id & 0xffffffff, last_seq
        self.last_sent = {}
        self.events = DungeonEvents(pool,player_id)

    def exchange(self, n, m):
        # Match the official client's minimum ping interval and repeated-command spacing.
        interval = 5.0 if n == 4009 else 0.2
        previous = self.last_sent.get(n)
        if previous is not None:
            delay = interval - (time.monotonic() - previous)
            if delay > 0:
                time.sleep(delay)
        self.last_sent[n] = time.monotonic()
        self.seq += 2
        a = ACTIONS[n]
        self.ws.send(msg(self.pool, "Packet")(head={"command": n, "service": 2, "seq": self.seq, "refer": self.refer},
                                              body=m.SerializeToString()).SerializeToString())
        deadline = time.monotonic() + 10
        while (left := deadline - time.monotonic()) > 0:
            packets=frames(self.pool,self.ws.recv(timeout=left))
            for packet in packets:self.events.packet(packet)
            for p in packets:
                if p.head.command != a["reply"]["id"] or p.head.seq != self.seq + 1:
                    continue
                if p.head.status:
                    raise Rejected(f"gateway_status_{p.head.status}_command_{n}")
                return msg(self.pool, a["reply"]["name"]).FromString(p.body)
        raise TimeoutError()


    def wait_for_dungeon(self,team_id,stage,seconds):
        deadline=time.monotonic()+seconds
        while time.monotonic()<deadline:
            team=self.events.team
            member=self.events.member()
            if not team or team.teamId!=team_id or team.teamPveStageEntry!=stage or not member or not member.only_assist:
                raise DungeonError('The room, stage or Assist-only setting changed while waiting. No fight was submitted.')
            if team_id in self.events.starts:
                self.events.starts.remove(team_id)
                return True
            if time.monotonic()-self.last_sent.get(4009,0)>20:
                self.exchange(4009,msg(self.pool,'HeartbeatReq')(time=int(time.time())))
                continue
            try:packets=frames(self.pool,self.ws.recv(timeout=min(1,max(0.01,deadline-time.monotonic()))))
            except TimeoutError:continue
            for packet in packets:self.events.packet(packet)
        return False


def emit(result):
    line = json.dumps(result, ensure_ascii=True, separators=(",", ":"))
    if len(line) > MAX_OUTPUT:
        line = json.dumps({"id": result["id"], "ok": False, "error": "reply_too_large"})
    print(line, flush=True)


def handle(line, pool, channel=None):
    ident = None
    try:
        op = json.loads(line)
        if not isinstance(op, dict) or not isinstance(op.get("id"), str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", op["id"]):
            raise Rejected("invalid_request")
        ident = op["id"]
        if op.get("command") in (-9100,-9101):
            if channel is None or not getattr(channel,"routine",None):
                raise Rejected("session_required")
            routine = channel.routine
            if op["command"] == -9100 and op.get("mode") == "prepare" and op.get("payload") == {}:
                result = routine.scan()
            elif op["command"] == -9101 and op.get("mode") == "prepare":
                result = routine.review(op.get("payload"))
            elif op["command"] == -9101 and op.get("mode") == "execute" and op.get("confirm") == "routine.run":
                result = routine.run(op.get("payload"))
            else:
                raise Rejected("invalid_request")
            emit({"id":ident,"ok":True,"result":result})
            return
        if op.get("command") == -5001:
            if channel is None or not channel.current_stage:
                raise Rejected("campaign_sync_required")
            stage = channel.current_stage
            payload = op.get("payload")
            expected = {"stage_entry": stage}
            if not isinstance(payload, dict) or (payload != {} and (payload != expected or type(payload["stage_entry"]) is not int)):
                raise Rejected("campaign_stage_changed")
            if op.get("mode") == "prepare":
                preflight(pool)
                result = {"request":"campaign.retry", "effect":"combat", "requiresConfirmation":True, "normalized":expected}
            elif op.get("mode") == "execute" and payload == expected and op.get("confirm") == "campaign.retry":
                final = run_campaign(pool, channel, stage)
                result = {"command":5001, "reply":5004, "status":0, "stageEntry":stage, "won":final.fight_result,
                          "data":redact(json_format.MessageToDict(final, preserving_proto_field_name=True))}
            else:
                raise Rejected("confirmation_required")
            emit({"id":ident, "ok":True, "result":result})
            return
        m, result = prepare(pool, op)
        if op["mode"] == "execute":
            if channel is None:
                raise Rejected("session_required")
            reply = channel.exchange(result["command"], m)
            result = {"command": result["command"], "reply": result["reply"], "status": 0,
                      "data": redact(json_format.MessageToDict(reply, preserving_proto_field_name=True))}
        emit({"id": ident, "ok": True, "result": result})
    except (Rejected, CampaignError, RoutineError) as e:
        emit({"id": ident, "ok": False, "error": str(e)})
    except (ValueError, RecursionError):
        emit({"id": ident, "ok": False, "error": "invalid_json"})
    except (ConnectionError, TimeoutError, WebSocketException, DecodeError, OSError):
        emit({"id": ident, "ok": False, "error": "session_lost"})
        raise ConnectionError() from None


def serve(pool, ws, *, player_id, last_seq, current_stage,profile,realm):
    channel = Channel(pool, ws, player_id, last_seq, current_stage)
    channel.routine=Routine(pool,channel,profile,realm,ACTIONS,Rejected,prepare)
    channel.lost=False
    next_ping = time.monotonic() + 30
    idle_until = time.monotonic() + 300
    buf = bytearray()
    try:
        while time.monotonic() < idle_until:
            if time.monotonic() >= next_ping:
                channel.exchange(4009, msg(pool, "HeartbeatReq")(time=int(time.time())))
                next_ping = time.monotonic() + 30
            if select.select([sys.stdin.fileno()], [], [], 0)[0]:
                chunk = os.read(sys.stdin.fileno(), 8192)
                if not chunk:
                    return
                buf.extend(chunk)
            if len(buf) > MAX_INPUT:
                return
            while (end := buf.find(b"\n")) >= 0:
                line = bytes(buf[:end])
                del buf[:end + 1]
                handle(line, pool, channel)
                if channel.lost: return
                idle_until = time.monotonic() + 300
            try:
                raw = ws.recv(timeout=0.15)
            except TimeoutError:
                continue
            for packet in frames(pool,raw):channel.events.packet(packet)
    except (OSError, WebSocketException, DecodeError, Rejected):
        return


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--prepare", required=True, action="store_true")
    cli.add_argument("--ilspycmd", default="ilspycmd")
    args = cli.parse_args()
    line = sys.stdin.buffer.readline(MAX_INPUT + 1)
    if not line or len(line) > MAX_INPUT:
        cli.exit(1, "invalid_request\n")
    handle(line, load_schema(args.ilspycmd, ALL_REFLECTIONS))
