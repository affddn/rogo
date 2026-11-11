"""Find explicit outbound Req sites in ILSpy 9.1 project output (SEA 0.0.163).

Use `ilspycmd --disable-updatecheck -p -r <bin> -o <dir> <bin>/GameLogic.dll`.
Run this file with <dir> to emit the mapping. Registration, response handling,
and generic replay/forwarding aren't evidence of another outbound request.
"""
import re
from collections import defaultdict
from pathlib import Path

_SEND = re.compile(r"^\s*(GameModule\.Net\.GameWebSocket\.)?SendMessage\(ProtoCmd\.(\w+Req),")
_MEMBER = re.compile(r"^\t(?:private|protected|internal|public)\b")
_METHOD = re.compile(r"\b(\w+)(?:<[^>]+>)?\(")
_ASYNC_STATE = re.compile(r"\bstruct _003C(\w+)_003Ed__\d+ : IAsyncStateMachine\b")
_CLOSURE = re.compile(r"^\t\t(?:internal|private) void _003C(\w+)_003Eb__\w*\(")


def find_sends(decompiled_root: Path) -> dict[str, list[str]]:
    """Request name -> sorted unique enclosing Class.Method names (static only)."""
    hits = defaultdict(set)
    for path in decompiled_root.rglob("*.cs"):
        source = path.read_text(encoding="utf-8-sig")
        if "SendMessage(ProtoCmd." not in source:
            continue
        method = None
        for lineno, line in enumerate(source.splitlines(), 1):
            # Use ILSpy's outer member indentation. Recover the human method
            # name for an async state machine or a generated lambda body.
            if _MEMBER.match(line):
                declaration = _ASYNC_STATE.search(line) or _METHOD.search(line)
                method = declaration[1] if declaration else None
            elif closure := _CLOSURE.match(line):
                method = closure[1]
            site = _SEND.match(line)
            if not site:
                continue
            if not site[1] and path.stem != "GameWebSocket":
                continue
            if not method:
                raise ValueError(f"cannot locate enclosing method at {path.name}:{lineno}")
            hits[site[2]].add(f"{path.stem}.{method}")

    # The caller pins this build. A missing reference DLL or partial tree can
    # otherwise quietly turn real sends into apparent 'schema-only' entries.
    if len(hits) != 228:
        raise ValueError(f"expected 228 direct-send request types for this build, got {len(hits)}; "
                         "use the full ILSpy project and include GameProto.dll in the reference path")
    return {req: sorted(methods) for req, methods in sorted(hits.items())}


if __name__ == "__main__":
    import argparse
    import json

    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("decompiled_root", type=Path)
    print(json.dumps(find_sends(cli.parse_args().decompiled_root), indent=2))
