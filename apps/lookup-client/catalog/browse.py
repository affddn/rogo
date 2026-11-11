"""Search the bundled gateway action map. No account, DLLs or network required."""
import argparse
import json
from pathlib import Path


def describe_message(m):
    fields = ", ".join(f"{f['name']}: {f['type']} (#{f['tag']})" for f in m["fields"])
    return f"{m['id']} {m['name']} [{m['schema']}]\n    {fields or '(empty message)'}"


def main():
    catalog = json.loads(Path(__file__).with_name("actions.json").read_text())
    actions = catalog["actions"]
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("query", nargs="*", help="words such as 'dismantle', or a command ID for details")
    cli.add_argument("--effect", choices=sorted({a["effect"] for a in actions}))
    cli.add_argument("--evidence", choices=["live", "client-send", "schema-only"])
    args = cli.parse_args()
    if len(args.query) == 1 and args.query[0].isdigit():
        number = int(args.query[0])
        for n in catalog["notifications"]:
            if n["id"] == number and not (args.effect or args.evidence):
                print("Incoming notification (not a player action):", describe_message(n))
                return
    else:
        number = None
    words = " ".join(args.query).casefold().split()
    found = False
    for a in actions:
        if (args.effect and a["effect"] != args.effect) or (args.evidence and a["evidence"] != args.evidence):
            continue
        req, res = a["request"], a["reply"]
        if number is not None:
            if number not in (req["id"], res["id"]):
                continue
            print(f"{a['domain']} | {a['effect']} | {a['evidence']}\n{a['action']}")
            print("Request:", describe_message(req))
            print("Reply:  ", describe_message(res))
            print("Direct send:", ", ".join(a["sendSites"]) or "not found in this scan")
            return
        haystack = " ".join([a["domain"], a["action"], req["name"], res["name"]]).casefold()
        if all(w in haystack for w in words):
            print(f"{req['id']} → {res['id']}  {req['name']}  [{a['effect']}; {a['evidence']}]  {a['action']}")
            found = True
    if not found:
        cli.exit(1, "No matching action or command ID.\n")


if __name__ == "__main__":
    main()
