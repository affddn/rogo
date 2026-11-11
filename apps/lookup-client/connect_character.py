# /// script
# requires-python = ">=3.10"
# dependencies = ["protobuf==6.33.6", "websockets==15.0.1"]
# ///
"""Obtain one character snapshot locally, without exporting the SDK or game session."""
import argparse
import http.client
import json
import re
import subprocess
from pathlib import Path

from google.protobuf.message import DecodeError
from websockets.exceptions import WebSocketException
from websockets.sync.client import connect

from extract_session import ExtractError, extract, read_device
from login_smoke import LoginError, TIMEOUT, _receive, check_gateway, discover
from wire_probe import load_schema, msg
from routine.runner import query_request


class SnapshotError(Exception):
    """Only fixed, public machine codes should leave this process."""


def skill_levels(job):
    if not job.currCareerBuild:
        return None
    active = next((b for b in job.builds if b.build == job.currCareerBuild), None)
    if active is None:
        return None
    # HeroCareerSkillModel keys the protocol skill by CareerSkillCfg.Entry. The
    # guide keys levels by FightSkillCfg.Entry; they are different namespaces.
    skill_table = Path(__file__).resolve().parents[1] / "web/public/data/skills.json"
    tree = json.loads(skill_table.read_bytes())["specs"].get(str(active.build))
    if not tree:
        return None
    ids = {n["node"]: str(n["skill"]) for n in tree["nodes"]}
    levels = {}
    for skill in active.skills:
        if skill.level > 0:
            if skill.entry not in ids:
                return None  # unknown build/version: don't replace manual levels
            levels[ids[skill.entry]] = skill.level
    return levels


def project(data, realm, expected_id):
    player = data.player.player
    if (not player.nickname.strip() or player.id <= 0 or not player.level
            or (expected_id and player.id != expected_id)
            or (player.server_id and player.server_id != str(realm))):
        raise SnapshotError("snapshot_invalid")
    return {
        "serverId": str(realm),
        "playerId": str(player.id),
        "name": player.nickname,
        "level": player.level,
        "power": player.ability if re.fullmatch(r"[0-9]+", player.ability) else None,
        "spec": data.jobInfo.currCareerBuild or None,
        "stageEntry": data.stage.last_stage or None,
        "cards": ({str(c.entry): c.star for c in data.cardInfo.cards if c.entry and c.star > 0}
                  if data.HasField("cardInfo") else None),
        "skills": skill_levels(data.jobInfo),
    }


def query_character(pool, ws, seq, profile, realm, expected_id):
    # LoginModel.BuildQueryPlayerDataReq, pinned SEA code package. Omit device
    # and ad identifiers: these aren't fields required by the guide.
    query = query_request(pool, profile)
    # Refer is zero on the official first bootstrap: LoginModel doesn't populate
    # PlayerInfoData.Id until it applies the 4006 response.
    ws.send(msg(pool, "Packet")(head={"command": 4005, "service": 2, "seq": seq},
                                body=query.SerializeToString()).SerializeToString())
    reply = _receive(pool, ws, seq, 4006, "QueryPlayerDataRes")
    return project(reply.login_data, realm, expected_id), reply.login_data.stage.curr_stage


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", required=True)
    parser.add_argument("--server-id", type=int, required=True)
    parser.add_argument("--ilspycmd", default="ilspycmd")
    parser.add_argument("--wait", type=int, default=90)
    parser.add_argument("--relaunch", action="store_true",
                        help="reopen the official game once after arming the SDK watcher")
    parser.add_argument("--serve-ops", action="store_true",
                        help="after emitting the snapshot, accept local commands on stdin")
    args = parser.parse_args()
    if not 0 < args.server_id < 2**63 or not 0 < args.wait <= 120:
        parser.error("invalid realm or wait interval")
    stage = "schema_unavailable"
    try:
        if args.serve_ops:
            from gateway_ops import ALL_REFLECTIONS, serve
            pool = load_schema(args.ilspycmd, ALL_REFLECTIONS)
        else:
            pool = load_schema(args.ilspycmd)
        stage = "device_unavailable"
        session = extract(read_device(args.adb, args.wait, relaunch=args.relaunch))
        account = session["profileId"]
        stage = "realm_unavailable"
        url = discover(pool, args.server_id, account)
        stage = "gateway_rejected"
        with connect(url, proxy=None, compression=None, ping_interval=None,
                     max_size=4 * 1024 * 1024, open_timeout=TIMEOUT, close_timeout=2) as ws:
            seq, expected_id = check_gateway(pool, ws, args.server_id, account, session["token"])
            del session
            stage = "snapshot_unavailable"
            snapshot, current_stage = query_character(pool, ws, seq, account, args.server_id, expected_id)
            print(json.dumps(snapshot, ensure_ascii=True), flush=True)
            if args.serve_ops:
                stage = "session_closed"
                serve(pool, ws, player_id=int(snapshot["playerId"]), last_seq=seq, current_stage=current_stage, profile=account, realm=args.server_id)
    except ExtractError as e:
        stage = "sign_in_timeout" if "no recent" in str(e) or "timed out" in str(e) else "device_unavailable"
        parser.exit(1, stage + "\n")
    except SnapshotError:
        parser.exit(1, "snapshot_invalid\n")
    except (OSError, ValueError, http.client.HTTPException, WebSocketException, DecodeError,
            LoginError, subprocess.SubprocessError, ImportError, KeyError):
        parser.exit(1, stage + "\n")


if __name__ == "__main__":
    main()
