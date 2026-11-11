# /// script
# requires-python = ">=3.10"
# dependencies = ["protobuf==6.33.6", "websockets==15.0.1"]
# ///
"""Check one SEA game login with an issued Octopus session. No retries or reconnects."""
import argparse
import getpass
import http.client
import json
import re
import secrets
import sys
import time

from google.protobuf.message import DecodeError
from websockets.exceptions import ConnectionClosed, WebSocketException
from websockets.sync.client import connect

from wire_probe import frames, load_schema, msg

VERSION_HOST = "pjgo-sea-obt-s132-version.ggagame.com"
TIMEOUT = 10
MAX_MESSAGE = 1 << 20


class LoginError(Exception):
    """Safe to display: no server-supplied text or credentials."""


def read_session():
    if sys.stdin.isatty():
        profile = input("Octopus profile ID: ").strip()
        token = getpass.getpass("Octopus session token (hidden): ")
    else:
        # A local SDK integration can pipe its LoginResult without putting tokens in argv.
        raw = sys.stdin.buffer.read(65537)
        if len(raw) > 65536:
            raise LoginError("session input too large")
        try:
            record = json.loads(raw)
            profile, token = record["profileId"], record["token"]
        except (ValueError, KeyError, TypeError):
            raise LoginError("expected an Octopus LoginResult with profileId and token") from None
    if not all(isinstance(v, str) and v.strip() for v in (profile, token)):
        raise LoginError("profileId and token must be nonempty strings")
    return profile, token


def discover(pool, server_id, profile):
    req = msg(pool, "QueryServerInfoReq")(serverId=server_id, accountId=profile, lang="en")
    conn = http.client.HTTPSConnection(VERSION_HOST, timeout=TIMEOUT)
    try:
        conn.request("POST", "/server_status", req.SerializeToString(),
                     {"Content-Type": "application/x-protobuf"})
        response = conn.getresponse()
        if response.status != 200:
            raise LoginError(f"server discovery returned HTTP {response.status}")
        body = response.read(MAX_MESSAGE + 1)
    finally:
        conn.close()
    if len(body) > MAX_MESSAGE:
        raise LoginError("oversized discovery reply")
    status = msg(pool, "QueryServerInfoRes").FromString(body)
    if status.server.serverId != server_id or status.server.serverStatus != 1:
        raise LoginError("the selected server was not returned as open")
    if not status.server.canRegister and not status.HasField("historyAccount"):
        raise LoginError("server is closed to registration and returned no character history")
    for url in status.wsDomains:
        # Never send a bearer token to a caller-supplied host, a redirect, or a guessed realm.
        if re.fullmatch(r"wss://[a-zA-Z0-9.-]+\.ggagame\.com(?::443)?/ws", url.strip()):
            return url.strip()
    raise LoginError("no trusted SEA WSS gateway returned for this server")


def _receive(pool, ws, seq, command, message):
    deadline = time.monotonic() + TIMEOUT
    while (left := deadline - time.monotonic()) > 0:
        for reply in frames(pool, ws.recv(timeout=left)):
            if reply.head.command != command or reply.head.seq != seq + 1:
                continue
            if reply.head.status:
                raise LoginError(f"command {command} rejected (status {reply.head.status}); no retry")
            return msg(pool, message).FromString(reply.body)
    raise LoginError("timed out waiting for a gateway reply")


def check_gateway(pool, ws, server_id, profile, token):
    packet = msg(pool, "Packet")
    seq = secrets.randbelow(499) * 2 + 3  # odd initial sequence, like BaseWebSocket
    req = msg(pool, "LoginReq")(server_id=server_id,
                               login_info={"accountId": profile, "token": token, "sdk_platform": 1})
    ws.send(packet(head={"command": 4001, "service": 2, "seq": seq},
                   body=req.SerializeToString()).SerializeToString())
    login = _receive(pool, ws, seq, 4002, "LoginRes")
    if not login.token or (login.accountId and login.accountId != profile):
        raise LoginError("invalid login acknowledgement")
    return seq + 2, login.playerId

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server-id", required=True, type=int, help="internal SEA realm ID")
    parser.add_argument("--ilspycmd", default="ilspycmd")
    parser.add_argument("--live", action="store_true", required=True,
                        help="allow one login; this can disconnect the official app")
    args = parser.parse_args()
    if not 0 < args.server_id <= 2**63 - 1:
        parser.error("server ID must be a positive signed 64-bit integer")
    try:
        pool = load_schema(args.ilspycmd)
        profile, token = read_session()
        url = discover(pool, args.server_id, profile)
        with connect(url, proxy=None, compression=None, ping_interval=None, open_timeout=TIMEOUT,
                     close_timeout=2, max_size=MAX_MESSAGE) as ws:
            check_gateway(pool, ws, args.server_id, profile, token)
    except LoginError as e:
        parser.exit(1, f"login check: {e}\n")
    except ConnectionClosed as e:
        code = e.rcvd.code if e.rcvd else "no close frame"
        parser.exit(1, f"login check: connection closed ({code}); no retry\n")
    except (OSError, EOFError, ValueError, http.client.HTTPException, DecodeError, WebSocketException) as e:
        # Protocol/transport exceptions can contain full frames, URLs or response bodies.
        parser.exit(1, f"login check failed: {type(e).__name__}; no retry\n")
    print("Game login accepted (4002, status 0); disconnected.")


if __name__ == "__main__":
    main()
