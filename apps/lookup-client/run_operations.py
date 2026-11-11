"""Run a bounded recipe through the guide's local operation endpoint. No direct device or game access."""
import argparse
import http.client
import json
import re
import sys
import time
from pathlib import Path

class OperationError(Exception):
    pass


class LocalGuide:
    def __init__(self, port):
        self.port, self.cookie = port, ""

    def post(self, operation, **fields):
        # Fixed loopback peer, no env proxy, HTTP redirect handling, or cookie file.
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=180)
        headers = {"Origin": f"http://127.0.0.1:{self.port}", "X-Rogo-Connect": "1",
                   "Content-Type": "application/json"}
        if self.cookie:
            headers["Cookie"] = self.cookie
        try:
            conn.request("POST", "/api/rogo/operations", json.dumps({"operation": operation, **fields}), headers)
            reply = conn.getresponse()
            raw = reply.read(8 * 1024 * 1024 + 1)
            if len(raw) > 8 * 1024 * 1024 or not (reply.getheader("Content-Type") or "").startswith("application/json"):
                raise OperationError("Not a local helper JSON response.")
            data = json.loads(raw)
            if reply.status != 200:
                raise OperationError(data.get("error") or f"Helper rejected request ({reply.status}).")
            if operation == "character.sync":
                cookie = (reply.getheader("Set-Cookie") or "").partition(";")[0]
                if not re.fullmatch(r"rogo_local=[a-f0-9]{64}", cookie):
                    raise OperationError("No session ownership cookie.")
                self.cookie = cookie
            return data
        finally:
            conn.close()


def recipe(path):
    steps = json.loads(path.read_text())
    if not isinstance(steps, list) or not 1 <= len(steps) <= 30:
        raise OperationError("Use a JSON list of 1–30 steps.")
    for step in steps:
        if (not isinstance(step, dict) or step.keys() != {"command", "payload"}
                or type(step["command"]) is not int or not isinstance(step["payload"], dict)):
            raise OperationError("Each step needs exactly a numeric command and a payload object.")
    return steps


def run(guide, steps, *, live=False, interactive=False, show_data=False, delay=time.sleep, ask=input):
    # Validate the whole recipe before relaunching VMOS or executing the first step.
    for step in steps:
        plan = guide.post("gateway.prepare", **step)["result"]
        print(f"Valid: {plan['command']} {plan['request']} ({plan['effect']})", file=sys.stderr)
        if live and plan["requiresConfirmation"] and not interactive:
            raise OperationError("Recipe requires review. Use --review-changes from a terminal; nothing sent.")
    if not live:
        return
    character = guide.post("character.sync")["character"]
    try:
        print(f"Connected: {character['name']} on realm {character['serverId']}.", file=sys.stderr)
        for i, step in enumerate(steps):
            if i:
                delay(1.1)  # local bridge accepts at most one execute per second
            check = guide.post("gateway.prepare", **step)
            plan = check["result"]
            approval = {}
            if plan["requiresConfirmation"]:
                if not interactive:
                    raise OperationError("Confirmation required; stopped.")
                print(f"{plan['effect']}: {json.dumps(plan['normalized'], ensure_ascii=True)}", file=sys.stderr)
                if ask(f"Type {plan['request']} to send this step, or press Enter to stop: ") != plan["request"]:
                    raise OperationError("Stopped before sending this step.")
                approval = {"ticket": check["ticket"], "confirm": plan["request"]}
            result = guide.post("gateway.execute", **step, **approval)["result"]
            summary = {k: result[k] for k in ("command", "reply", "status")}
            print(json.dumps(result if show_data else summary, ensure_ascii=True), flush=True)
    finally:
        # No second attempt on an uncertain outcome, even if cleanup fails.
        try:
            guide.post("session.disconnect")
        except (OperationError, OSError, http.client.HTTPException, ValueError):
            print("Disconnect unconfirmed; stop the guide or let the session expire.", file=sys.stderr)


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("recipe", type=Path)
    cli.add_argument("--port", type=int, default=5176)
    cli.add_argument("--run", action="store_true", help="relaunch VMOS once and send each validated step in order")
    cli.add_argument("--review-changes", action="store_true", help="allow interactive approval of writes and unverified reads")
    cli.add_argument("--show-data", action="store_true", help="print private decoded replies, not just command/status")
    args = cli.parse_args()
    if not 1 <= args.port <= 65535 or args.review_changes and not sys.stdin.isatty():
        cli.error("Invalid port or no interactive terminal for confirmation.")
    try:
        run(LocalGuide(args.port), recipe(args.recipe), live=args.run, interactive=args.review_changes,
            show_data=args.show_data)
    except (OperationError, OSError, ValueError, EOFError, http.client.HTTPException, KeyError) as e:
        cli.exit(1, f"{e if isinstance(e, OperationError) else type(e).__name__}. Stopped; no automatic retry.\n")
