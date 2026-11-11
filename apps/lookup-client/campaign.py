"""A single campaign attempt; settlement can only originate from the pinned local battle engine."""
import base64
from functools import cache
from pathlib import Path
import os
import shutil
import subprocess

from wire_probe import msg
from google.protobuf.message import DecodeError

REPLAY = Path(__file__).resolve().parent / "bin/replay"
PROBE = Path(__file__).resolve().parent / "replay/fixture.txt"
VERSION = "b1bbd7ba-20261104142719"
class CampaignError(Exception):
    pass

def simulate(pool, wire, viewer, kind=2):
    root = os.environ.get("DOTNET_ROOT")
    runtime = str(Path(root) / "dotnet") if root else shutil.which("dotnet")
    if not runtime or not (REPLAY / "host/CampaignReplay.dll").is_file():
        raise CampaignError("replay_unavailable")
    data = str(viewer).encode() + b"\n" + base64.b64encode(wire) + b"\n"
    try:
        proc = subprocess.run([runtime, str(REPLAY / "host/CampaignReplay.dll"), str(REPLAY), str(kind)], input=data,
                              stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=18, check=True)
        return msg(pool, "GuildBossFightCompleteReq" if kind==9 else "FightStatistic").FromString(base64.b64decode(proc.stdout.strip(), validate=True))
    except (OSError, ValueError, DecodeError, subprocess.SubprocessError):
        raise CampaignError("replay_failed") from None

@cache
def preflight(pool,kind=2,stage=None):
    try:
        viewer, encoded = PROBE.read_bytes().splitlines()
        wire=base64.b64decode(encoded, validate=True)
        if stage is not None:
            sample=msg(pool,"StageFightRes").FromString(wire)
            sample.fight_arg.stage_entry=stage
            wire=sample.SerializeToString()
        result = simulate(pool, wire, int(viewer),kind)
        if kind==9: result=result.fightResult
        if result.fight_id != "offline-fixture" or not result.max_tick or result.clientGitVersion != VERSION:
            raise CampaignError("replay_unavailable")
    except (OSError, ValueError, CampaignError):
        raise CampaignError("replay_unavailable") from None

def run_campaign(pool, channel, stage):
    preflight(pool)
    start = channel.exchange(5001, msg(pool, "StageFightReq")(stage_entry=stage))
    # Until a matching settlement is received, the previous stage/attempt isn't safe to replay.
    channel.current_stage = 0
    arg = start.fight_arg
    if (not start.fight_id or arg.stage_entry != stage or not arg.seed or not arg.stage_round
            or arg.clientGitVersion not in ("", VERSION)):
        raise CampaignError("campaign_inputs_changed")
    try:
        stat = simulate(pool, start.SerializeToString(), channel.player_id)
    except CampaignError:
        raise CampaignError("campaign_unsettled") from None
    if stat.fight_id != start.fight_id or stat.clientGitVersion != VERSION or not stat.max_tick:
        raise CampaignError("campaign_unsettled")
    final = channel.exchange(5003, msg(pool, "StageFightCompleteReq")(
        fight_id=start.fight_id, stage_entry=stage, fight_result=stat))
    channel.current_stage = final.stage.curr_stage or (stage if not final.fight_result else 0)
    return final
