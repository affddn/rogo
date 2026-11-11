# Search the Rogo action map

[Browse every gateway action by game feature](ACTION_MAP.md) · [Which parts are local, gateway or publisher SDK?](BOUNDARIES.md)

| What a player wants to do                                     | Where to start in the map                                                                                                                                                                                                               |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| See **my** character, including things not on the public card | After login, `4005 → 4006` returns `login_data`. Its schema includes `items`, `jobInfo`, `allEquipInfo`, `weapons`, `petInfo`, `cardInfo`, `legacy_info`, `stage` and `tasks`. Presence varies. There is no target character parameter. |
| Inspect **someone else's** build                              | `4373` finds candidate IDs; `4013` gets the selected visible player card, not the full inventory.                                                                                                                                       |
| Compare a gear change without doing it                        | `4075` previews power; `4043` actually equips an item; `4049` dismantles items. These are different operations.                                                                                                                         |
| See income or mail before claiming it                         | `4087` previews online idle reward count and `4089` claims; `4101` fetches inbox state, `4103` claims attachments and `4107` marks messages as read.                                                                                    |
| Plan a fight                                                  | `5041` reads MVP records; `5043` starts a challenge, `5045` settles an existing fight and `5047` sweeps. Daily uses and clears matter.                                                                                                  |
| Know what my guild can do                                     | `4447` reads the roster, `4457` donates (including a diamond-funded option), `4451` changes roles, and `4453` disbands the guild. Permission matters.                                                                                   |

These are examples from the **map**, not live-tested recipes.

From the repo root, with no session or local game assemblies:

```sh
vp run @rogo/lookup-client#actions sweep
vp run @rogo/lookup-client#actions --effect read cards
vp run @rogo/lookup-client#actions 4005                 # includes request/reply fields and direct send sites
vp run @rogo/lookup-client#actions --evidence schema-only
```

Or run `python3 apps/lookup-client/catalog/browse.py` with the same arguments. These
commands **describe** actions; none can execute them. The bundled [actions.json](actions.json)
records the IDs, types and top-level fields (wire tag, name, scalar/message/enum type,
repeated or map) for each request, reply and notification. Nested message types are named,
not expanded. The schema is build-specific; field presence, defaults, resource costs and
account entitlements are not encoded by the catalog.

## Where the evidence comes from

- **Live:** the [login, character and card reads, card equip and campaign settlement](../CONNECT.md#live-check). The earlier version-service HTTP check is not a second gateway action.
- **Client send:** a literal `GameWebSocket.SendMessage(ProtoCmd.…Req, …)` in decompiled GameLogic, including the unqualified heartbeat. This counts command types, not clicks, successful calls or reachable buttons. A sender method may itself be unused.
- **Schema only:** the request, matching reply and their field schemas exist; this scan did not find a literal sender. For example, the dedicated bag query is defined, but the normal login bootstrap already carries items. A missing sender does not prove the server disables it.
- Descriptions and effects are reviewed interpretations of schema and client behavior. In particular, names starting with `Get` or `Query` are **not** a safe allowlist: `GetExchangeCodePrizesReq` redeems a code; `QueryRechargeCpOrderReq` creates a payment order.

## Reproduce or update

With the same local DLLs and ILSpy 9.1 setup as [the wire probe](../FINDINGS.md#try-the-wire-format-offline):

```sh
cd apps/lookup-client    # from repo root
uv run catalog/build.py --ilspycmd /path/to/ilspycmd
```

The generator pins both DLL hashes, reads `Proto.ProtoCmd` and the generated protobuf
descriptors, verifies **IDs and names** against `Proto.ProtoParserRegister` for every
incoming message, and decompiles GameLogic into a temporary directory for the direct-send
scan. Request/reply pairs are matched by enum names, not guessed by adding one.
[descriptions.tsv](descriptions.tsv) supplies one reviewed label and effect per request;
missing, duplicate or unexpected IDs fail the build. On a game update recheck the enum,
descriptors, send sites and annotations before changing the pinned fingerprints. Don't
carry forward this build's live evidence without a new observation.
