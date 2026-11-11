# /// script
# requires-python = ">=3.10"
# dependencies = ["protobuf==6.33.6"]
# ///
"""Offline SEA 0.0.163 lookup probe. Takes a single binary WS message, not a pcap."""
import argparse
import base64
import hashlib
import json
import re
import subprocess
from pathlib import Path

from google.protobuf import descriptor_pool, json_format, message_factory
from google.protobuf.message import DecodeError

GAME_PROTO = Path(__file__).parent / "bin" / "GameProto.dll"
BUILD = "8005d3a3f193469a56d180ff94120e5aed2214d052a0e3c3d4e183db531b607b"
PUBLIC_REPLIES = {4374: "SearchFriendRes", 4014: "QueryPlayerDetailInfoRes"}


def load_schema(ilspy, reflections=("EnumReflection", "CommonReflection", "BaseReflection")):
    # ProtoCmd isn't in the descriptors: the two dispatch IDs above are build-specific.
    if hashlib.sha256(GAME_PROTO.read_bytes()).hexdigest() != BUILD:
        raise ValueError("unrecognised GameProto.dll; recheck ProtoCmd and schema first")
    pool = descriptor_pool.DescriptorPool()
    for name in reflections:
        source = subprocess.check_output(
            [ilspy, "--disable-updatecheck", "-t", "Proto." + name, str(GAME_PROTO)],
            text=True, stderr=subprocess.DEVNULL,
        )
        literal = re.search(r'Convert\.FromBase64String\(([^)]+)\)', source)
        if not literal:
            raise ValueError(f"descriptor missing in ILSpy output for {name}")
        encoded = "".join(re.findall(r'"([A-Za-z0-9+/=]+)"', literal[1]))
        pool.AddSerializedFile(base64.b64decode(encoded, validate=True))
    return pool


def msg(pool, name):
    return message_factory.GetMessageClass(pool.FindMessageTypeByName("proto." + name))


def frames(pool, raw):
    if not isinstance(raw, bytes):
        raise ConnectionError("nonbinary gateway reply")
    packet = msg(pool, "Packet").FromString(raw)
    packets = (msg(pool, "MergePacketNotify").FromString(packet.body).packets
               if packet.head.command == 2108 else [packet])
    if any(p.head.command in (4008, 8070) for p in packets):
        raise ConnectionError("gateway ended the session")
    return packets


def decode(pool, payload):
    packet = msg(pool, "Packet").FromString(payload)
    head = packet.head
    if head.command not in PUBLIC_REPLIES:
        raise ValueError(f"not a Friend search/detail reply (command {head.command})")
    if head.status:
        raise ValueError(f"command {head.command} failed with status {head.status}")
    reply = msg(pool, PUBLIC_REPLIES[head.command]).FromString(packet.body)
    return json_format.MessageToDict(reply)


def demo(pool):
    # Synthetic IDs: viewer in the head, selected character in the body.
    target = 9007199254740993
    request = msg(pool, "QueryPlayerDetailInfoReq")(playerId=target)
    packet_type = msg(pool, "Packet")
    wire = packet_type(head={"service": 2, "command": 4013, "seq": 101, "refer": 1234},
                       body=request.SerializeToString()).SerializeToString()
    received = packet_type.FromString(wire)
    reply = msg(pool, "QueryPlayerDetailInfoRes")()
    player = reply.playerDetailInfo.playerInfo
    player.playerId = type(request).FromString(received.body).playerId
    player.nickname, player.ability = "Example", "123456789"
    response = packet_type(head={"command": 4014, "seq": received.head.seq + 1},
                           body=reply.SerializeToString())
    return {"synthetic": True, "requestHex": wire.hex(),
            "reply": decode(pool, response.SerializeToString())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ilspycmd", default="ilspycmd", help="path to ilspycmd 9.1")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("demo", help="encode a detail request and decode a synthetic reply")
    commands.add_parser("decode", help="read one saved 4374/4014 payload").add_argument("file", type=Path)
    args = parser.parse_args()
    try:
        pool = load_schema(args.ilspycmd)
        result = demo(pool) if args.command == "demo" else decode(pool, args.file.read_bytes())
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (OSError, subprocess.CalledProcessError, ValueError, DecodeError) as e:
        parser.exit(1, f"wire probe: {e}\n")


if __name__ == "__main__":
    main()
