# /// script
# requires-python = ">=3.10"
# dependencies = ["protobuf==6.33.6"]
# ///
"""Rebuild the SEA 0.0.163 gateway action map from local assemblies. No network or account."""
import argparse
import csv
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

from google.protobuf.descriptor import FieldDescriptor

from find_sends import find_sends

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from wire_probe import BUILD, GAME_PROTO, load_schema

GAME_LOGIC = GAME_PROTO.with_name("GameLogic.dll")
LOGIC_HASH = "fed73c201f1f04097b9c44b22bbce3d054e1ece7a5c5e2dd48c233e9e38faa81"
REFLECTIONS = tuple(x + "Reflection" for x in ("Enum", "Common", "Base", "Act", "Play", "TeamPve", "Notify", "Gm"))
EFFECTS = {"read", "session", "change", "claim", "spend", "social", "combat", "restricted", "unclear"}
SCALARS = {v: k[5:].lower() for k, v in vars(FieldDescriptor).items() if k.startswith("TYPE_")}


def field_type(f):
    if f.message_type and f.message_type.GetOptions().map_entry:
        key, value = f.message_type.fields
        return f"map<{field_type(key)}, {field_type(value)}>"
    ref = f.message_type or f.enum_type
    return ("repeated " if f.is_repeated else "") + (ref.full_name if ref else SCALARS[f.type])


def message(pool, name, command):
    d = pool.FindMessageTypeByName("proto." + name)
    return {"id": command, "name": name, "schema": d.file.name,
            "fields": [{"tag": f.number, "name": f.name, "type": field_type(f)} for f in d.fields]}


def collect(ilspy):
    if hashlib.sha256(GAME_LOGIC.read_bytes()).hexdigest() != LOGIC_HASH:
        raise ValueError("GameLogic.dll does not match the catalog build")
    pool = load_schema(ilspy, REFLECTIONS)  # also verifies GameProto.dll SHA-256

    def decompile(typ):
        return subprocess.check_output(
            [ilspy, "--disable-updatecheck", "-t", "Proto." + typ, str(GAME_PROTO)], text=True,
        )

    commands = {name: int(num) for name, num in re.findall(
        r"^\s*(\w+) = (\d+),?\s*$", decompile("ProtoCmd"), re.M)}
    incoming = {name: int(num) for num, name in re.findall(
        r"\{\s*(\d+),\s*\(ByteString bytes\) => \(IMessage\)\(object\)(\w+)\.Parser\.ParseFrom\(bytes\)",
        decompile("ProtoParserRegister"))}
    if len(commands) != 554 or len(set(commands.values())) != len(commands):
        raise ValueError("incomplete or non-unique ProtoCmd enum")
    requests = {n: i for n, i in commands.items() if n.endswith("Req")}
    expected = {n for n in commands if n.endswith("Notify")} | {n[:-3] + "Res" for n in requests}
    if expected != incoming.keys() or commands != requests | incoming:
        raise ValueError("request, reply and notification IDs do not reconcile with the inbound parser registry")

    with tempfile.TemporaryDirectory() as out:
        subprocess.run([ilspy, "--disable-updatecheck", "-p", "-r", str(GAME_PROTO.parent),
                        "-o", out, str(GAME_LOGIC)], check=True, stdout=subprocess.DEVNULL)
        sends = find_sends(Path(out))
    if sends.keys() - requests.keys():
        raise ValueError("unknown outbound command in GameLogic")
    with (HERE / "descriptions.tsv").open() as f:
        notes = list(csv.DictReader(f, delimiter="\t"))
    if sorted(int(n["id"]) for n in notes) != sorted(requests.values()):
        raise ValueError("expected exactly one reviewed description for every request")

    by_id = {i: n for n, i in requests.items()}
    actions = []
    for note in sorted(notes, key=lambda n: int(n["id"])):
        i = int(note["id"])
        if note["effect"] not in EFFECTS or not note["domain"] or not note["action"]:
            raise ValueError(f"incomplete annotation for {i}")
        name = by_id[i]
        reply = name[:-3] + "Res"
        sites = sends.get(name, [])
        actions.append({
            **{k: note[k] for k in ("domain", "effect", "action")},
            "evidence": "live" if i in (4001, 4005, 4651, 4661, 5001, 5003) else "client-send" if sites else "schema-only",
            "sendSites": sites, "request": message(pool, name, i),
            "reply": message(pool, reply, incoming[reply]),
        })
    return {"build": "SEA 0.0.163", "sha256": {"GameProto.dll": BUILD, "GameLogic.dll": LOGIC_HASH},
            "actions": actions, "notifications": [message(pool, n, i) for n, i in
                sorted(incoming.items(), key=lambda p: p[1]) if n.endswith("Notify")]}


def markdown(data):
    actions, notifications = data["actions"], data["notifications"]
    groups = Counter(a["domain"] for a in actions)
    sites = sum(bool(a["sendSites"]) for a in actions)
    lines = [
        "# Rogo gateway action map — " + data["build"], "",
        f"**{len(actions)} request/reply pairs** in the shipped gateway enum. "
        f"The official client contains a direct send site for **{sites}**; **{len(actions)-sites}** are schema-only in this scan. "
        f"**{len(notifications)} notifications** are listed separately. "
        "These are protocol operations, not a count of distinct UI buttons.", "",
        "**What works today:** Connect Rogo verified login (4001 → 4002), character bootstrap (4005 → 4006) card collection and equip (4651 and 4661), and one complete campaign attempt (5001 then engine-generated 5003) on one SEA account. "
        "Other player operations are not live-verified here. A send site is evidence of client code, "
        "not a guarantee that a button is reachable or that the server grants access. "
        f"The {groups['GM & testing']} GM/test pairs are not ordinary player features.", "",
        "**Best first account query:** follow login with the signed-in character bootstrap (4005). "
        "The official client initializes its own player ID and inventory from this reply. "
        "For another character, use Friend search (4373) and the visible player card (4013), not the private bootstrap. "
        "Handle no match and ambiguous names. See the [lookup findings](../FINDINGS.md).", "",
        "**How to read the list:** numbers are actual request → reply command IDs. Each entry has one primary effect: "
        "`read` describes the apparent purpose, not a side-effect guarantee; `session` manages connection/subscription state; "
        "`change`, `social`, `combat` and `claim` can change game state; `spend` can consume currency, materials, points or a paid entitlement; "
        "`restricted` is operator/test and `unclear` means the effect is not established. Costs and prerequisites depend on the account. "
        "Unless marked **schema only**, a direct send was found.", "",
        "[Combat, ad, payment and HTTP boundaries](BOUNDARIES.md) · [Machine-readable fields and send sites](actions.json) · "
        "[Search and reproduce the map](README.md)", "",
    ]
    for domain in sorted(groups, key=lambda d: (d == "GM & testing", d.casefold())):
        lines.extend([f"## {domain} ({groups[domain]})", ""])
        for a in actions:
            if a["domain"] != domain:
                continue
            q, r = a["request"], a["reply"]
            flag = {"live": " · **live verified**", "schema-only": " · **schema only**"}.get(a["evidence"], "")
            lines.append(f"- **{q['id']} → {r['id']}** `{q['name']}` · {a['effect']}{flag} — {a['action']}")
        lines.append("")
    lines += [f"## Incoming notifications ({len(notifications)})", "",
              "Handled by the inbound parser. These are not additional buttons a client can press.", ""]
    lines.extend(f"- **{n['id']}** `{n['name']}`" for n in notifications)
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--ilspycmd", default="ilspycmd")
    args = cli.parse_args()
    data = collect(args.ilspycmd)
    (HERE / "actions.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    (HERE / "ACTION_MAP.md").write_text(markdown(data))
    print(f"{len(data['actions'])} pairs, {len(data['notifications'])} notifications.")
