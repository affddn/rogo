"""Extract one Octopus login-success record for your own Rogo account (no login sent)."""
import argparse
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

SUCCESS = "UGSDK: Octopus 登录成功 "
LIMIT = 128 * 1024


class ExtractError(Exception):
    """Messages must never include record contents."""


def extract(raw):
    if len(raw) > LIMIT:
        raise ExtractError("SDK record exceeds size limit")
    try:
        record = json.loads(raw)
        message = record["message"]
        if not isinstance(message, str) or not message.startswith(SUCCESS):
            raise ExtractError("not a Rogo Octopus login-success record")
        payload = json.loads(message[len(SUCCESS):])
        session = {key: payload[key] for key in ("profileId", "token")}
    except (KeyError, ValueError, TypeError, RecursionError):
        raise ExtractError("incomplete or unrecognized SDK record") from None
    # Newtonsoft deserializes LoginResult.profileId into a C# string even when
    # Octopus encodes the ID as a JSON integer. Never round it through a float.
    if type(session["profileId"]) is int and session["profileId"] > 0:
        session["profileId"] = str(session["profileId"])
    for key, value in session.items():
        if not isinstance(value, str) or not value.strip():
            raise ExtractError(f"{key} missing, empty or unsupported ({type(value).__name__})")
    return session


# Filter on the phone. Only transfer a single, recent success record; never pull
# all SDK diagnostics (they can include unrelated account or device details).
_DEVICE_CHECK = r'''
dir=/sdcard/Android/data/com.ggv.rogosea.aos/files/octopus_pending_logs
[ -r "$dir" ] && [ -d "$dir" ] || exit 3
started=$(date +%s)
end=$((started + WAIT_SECONDS))
existing=' '
if [ WAIT_SECONDS -gt 0 ]; then
    for f in "$dir"/*.json; do existing="$existing${f##*/} "; done
fi
RELAUNCH_IF_REQUESTED
while :; do
    if [ -n "${launch_pid:-}" ] && ! kill -0 "$launch_pid" 2>/dev/null; then
        wait "$launch_pid" || exit 6
        launch_pid=''
    fi
    now=$(date +%s)
    match=''
    for f in "$dir"/*.json; do
        [ -f "$f" ] && [ ! -L "$f" ] || continue
        name=${f##*/}
        stem=${name%.json}
        case "$stem" in *[!a-f0-9]*) continue;; esac
        [ "${#stem}" = 32 ] || continue
        case "$existing" in *" $name "*) continue;; esac
        mtime=$(stat -c %Y "$f" 2>/dev/null) || continue
        [ "$mtime" -ge $((now - 120)) ] && [ "$mtime" -le "$now" ] || continue
        size=$(stat -c %s "$f" 2>/dev/null) || continue
        [ "$size" -le 131072 ] || continue
        grep -qE '"message"[[:blank:]]*:[[:blank:]]*"UGSDK: Octopus 登录成功 ' "$f" 2>/dev/null || continue
        [ -z "$match" ] || exit 5
        match=$f
    done
    if [ -n "$match" ] && [ -f "$match" ]; then
        head -c 131073 "$match" 2>/dev/null && exit 0
    fi
    [ "$now" -lt "$end" ] || exit 4
    sleep 0.25
done
'''


def read_device(serial, wait, *, relaunch=False):
    if relaunch and not wait:
        raise ExtractError("relaunch requires a fresh sign-in wait")
    # Run after collecting existing IDs, on the same shell. A fast automatic
    # sign-in can otherwise finish before the watcher takes its baseline.
    restart = """
am force-stop com.ggv.rogosea.aos >/dev/null 2>&1 || exit 6
monkey -p com.ggv.rogosea.aos -c android.intent.category.LAUNCHER 1 </dev/null >/dev/null 2>&1 &
launch_pid=$!
""" if relaunch else ""
    script = _DEVICE_CHECK.replace("WAIT_SECONDS", str(wait)).replace("RELAUNCH_IF_REQUESTED", restart)
    try:
        result = subprocess.run(
            ["adb", "-s", serial, "shell", "-T", "sh", "-s"],
            input=script.encode(), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            timeout=wait + 15,
        )
    except subprocess.TimeoutExpired:
        raise ExtractError("ADB check timed out") from None
    if result.returncode != 0:
        raise ExtractError({
            3: "SDK queue missing or unreadable",
            4: "no recent SDK login-success record; the queue may already have flushed",
            5: "multiple recent login records; refusing to choose an account",
            6: "ADB could not reopen the official game",
        }.get(result.returncode, "ADB failed; check the device serial and connection"))
    return result.stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--adb", metavar="SERIAL", help="your connected Rogo Android device")
    source.add_argument("--record", metavar="FILE", type=Path, help="one saved SDK pending-log JSON")
    parser.add_argument("--wait", type=int, default=0, metavar="SECONDS",
                        help="wait up to 120 seconds for a normal sign-in on the device")
    parser.add_argument("--pipe", action="store_true",
                        help="send profileId/token to a pipe instead of only reporting presence")
    args = parser.parse_args()
    if not 0 <= args.wait <= 120 or (args.wait and not args.adb):
        parser.error("--wait requires --adb and a duration of 0–120 seconds")
    if args.adb and args.pipe and not args.wait:
        parser.error("use --wait with --adb --pipe to export only a fresh sign-in")
    if args.pipe and not stat.S_ISFIFO(os.fstat(sys.stdout.fileno()).st_mode):
        parser.error("--pipe requires a pipe as stdout (not a terminal or file)")
    try:
        if args.adb is not None:
            if args.wait:
                print("Waiting for a new Rogo sign-in on the selected phone…", file=sys.stderr)
            raw = read_device(args.adb, args.wait)
        else:
            with args.record.open("rb") as file:
                raw = file.read(LIMIT + 1)
        session = extract(raw)
        if args.pipe:
            print(json.dumps(session))
        else:
            print("Session fields found (values withheld; validity not tested).")
    except (OSError, ExtractError) as e:
        parser.exit(1, f"session extraction: {e if isinstance(e, ExtractError) else type(e).__name__}\n")


if __name__ == "__main__":
    main()
