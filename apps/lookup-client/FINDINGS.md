# What a Rogo lookup can read — SEA 0.0.163 (10 Nov 2026)

**A power user can be the lookup target without giving the tool their login.** The Friend
screen uses two reads: search for a character, then request the selected character's
visible player card. The card is useful for build analysis; it isn't a private account
export. A standalone tool can already encode the request and decode the reply offline.
The standalone client successfully logged in to one live SEA realm with a fresh
publisher session issued to the official app. [Connect Rogo](CONNECT.md) also verified the private character bootstrap and card collection read. Live Friend search and detail reads have not been tested.

For the complete gateway inventory (not just lookup), see the [action map](catalog/ACTION_MAP.md).
It separates live verification, sends found in the official client, and schema-only requests.

## The call to build first

| Websocket request → reply           | Input                                                  | What comes back                                                               |
| ----------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `4373 → 4374` SearchFriend          | `SearchFriendReq.Nickname` or signed 64-bit `PlayerId` | Zero or more `Players[].BaseInfo` with server ID, character ID and nickname.  |
| `4013 → 4014` QueryPlayerDetailInfo | `QueryPlayerDetailInfoReq.PlayerId`                    | `PlayerDetailInfo` (the visible card) plus `Relation` relative to the viewer. |

Use **server + nickname or character ID**, not an Octopus account ID. The search UI trims
input and treats a parseable integer as an ID. Reject an empty query instead of falling
back to friend recommendations. If a name has multiple matches, show server and ID and let
the user pick; don't take the first. A known target ID needs only the detail call once the
viewer is connected. See [FriendAddPage](decompiled/FriendAddPage.cs#L232),
[PlayerInfoDialog](decompiled/PlayerInfoDialog.cs#L118) and
[PlayerProtoHandler](decompiled/PlayerProtoHandler.cs#L40).

Each binary **websocket message** carries one protobuf `Packet`: `head` is field 1 and
`body` (serialized request/reply bytes) is **field 3**. The client sets service 2, an odd
request sequence advancing by 2, and `Refer = (uint)viewerCharacterId` — the target's ID
belongs in the **body**. Correlate the expected reply command **and** sequence (request + 1);
a nonzero head status is an error, not a player record. Other messages can arrive between
request and reply. Heartbeat is `4009 → 4010` with Unix seconds. `8070` is a kick notification;
`4680` is a batch online-status **reply**, not needed for lookup. Stop on kick, including
close code 4001 (other device); don't reconnect against the player. See
[BaseWebSocket](decompiled/BaseWebSocket.cs#L165) and [kick handling](decompiled/GameWebSocketUtils.cs#L37).

## What to export

- **Visible:** identity, level, battle power, build, raw attributes, equipment and active
  enchant scheme, weapon, equipped skills, legacy/Collection Gear data and active pet,
  when present. Keep character/server IDs as decimal strings in JSON; battle power
  (`SimplePlayer.Ability`) is already a decimal string. Do not round them through a JS number.
- **Not established by this reply:** all owned cards and their stars, every learned skill,
  bag contents, stat-point allocations or a losing fight's completion %. `4005 → 4006`
  is a **different** post-login read for the _signed-in character_, not a way for the
  viewer to read the target's inventory.
- For [the guide](../../packages/game/src/profile.ts), import a **partial snapshot** keyed
  by server ID and character ID. Map `CurrBuild` to a known spec; `AttrInfo.Attrs` is an
  ID → double map which the client applies to its attribute matrix, not a set of
  ready-to-display percentages. Don't overwrite manually entered data with missing
  fields. In particular [migrate](../web/src/lib/game/characters.ts#L86) fills missing
  stats with a reference character's values. It isn't a lookup importer.

## Where a live call would get its session

1. **Publisher sign-in.** UGSDK supplies a UID/token. `UGSdkImp.OctopusUgLogin` exchanges
   these via `LoginGaSdkRequest`. The APK's `assets/AotDll/OctopusSDK.dll.bytes`
   contains managed code: `OctopusSDK.bean.LoginRequest.PackageRequest` constructs a
   signed JSON `POST /account/login/v2`. The SDK uses publisher app credentials; that
   is not a public third-party login contract. The response's **profileId and token**
   become the game login's account ID and token, **not** the original UG pair.
   See [UGSdkImp](decompiled/UGSdkImp.cs#L109).
2. **Choose a gateway.** The game login UI uses the **version service**, distinct from
   Octopus's signed `NewAreaServerListRequest`. With no usable saved server, it requests
   `/recommend_servers` and can fall back to `/server_list` on an empty list. For a selected
   server it sends `QueryServerInfoReq` to `/server_status` (protobuf POST). It prefers
   the returned `WsDomains`; the packaged `GameURL` is a fallback, not the address for
   every realm. See [VersionServerService](decompiled/VersionServerService.cs#L1135);
   managed callers: `QueryRecommendServerState`, `LoginView.StartLoginWithServerStatusCheckAsync`,
   `ServerModel.GetGameWsUrls`, `ConnectGatewayState`.
3. **Enter the game session.** `4001 → 4002`: `LoginReq { ServerId, LoginInfo { Token,
AccountId, SdkPlatform = 1 } }`. The client saves **another token** from `LoginRes` for
   reconnects. It normally follows with `4005 → 4006` (`QueryPlayerDataReq` with account
   ID and client info), initializing the viewer's character ID. Whether a minimal client
   can skip this bootstrap is unknown; don't retain a private login payload for a public
   lookup. Stop on status `10203` (no character), never create one. See
   [QueryLoginReqState](decompiled/QueryLoginReqState.cs#L98), `QueryPlayerDataState.OnEnter`
   and [reconnect handling](decompiled/GameWebSocketReconnectReqState.cs#L43).

**Release configuration found:** `assets/Rog.json` in the locally retained base APK
(`com.ggv.rogosea.aos`, version code 163, `Sea-Obt-Release`). These are packaged defaults; the gateway for a particular realm comes from discovery.

| Config key                 | Packaged value                                  |
| -------------------------- | ----------------------------------------------- |
| `Octopus.OctopusChannelId` | `"19"`                                          |
| `Octopus.OctopusHost`      | `https://pjgo-sea-obt-ali-account.ggagame.com`  |
| `VersionURL`               | `https://pjgo-sea-obt-s132-version.ggagame.com` |
| `GameURL` (fallback)       | `wss://pjgo-sea-obt-s132-game.ggagame.com/ws`   |

Do not dump the entire config or log login bodies: they contain credentials. To check
another local APK without printing keys, use
`unzip -p base.apk assets/Rog.json | jq '{Version, VersionURL, GameURL, Octopus: (.Octopus | {OctopusChannelId, OctopusHost})}'`.

## Try the wire format offline

[wire_probe.py](wire_probe.py) reads the embedded protobuf file descriptors from the
operator's local `bin/GameProto.dll` via ILSpy. It neither loads the DLL into the game
nor opens a socket. It only decodes the two lookup replies; it will refuse login packets.
From this directory, with `ilspycmd` 9.1.0.7988 on PATH (.NET 8) and Python with
`protobuf==6.33.6` installed:

```sh
python3 wire_probe.py demo
python3 wire_probe.py decode ./detail-packet.bin | jq '.playerDetailInfo.skills'
```

Alternatively, `uv run wire_probe.py demo` uses the inline Python dependency pin.
If ILSpy isn't on PATH, pass `--ilspycmd /path/to/ilspycmd` before `demo` or `decode`.

The demo is synthetic, not a successful server call. A viewer ID of 1234, sequence 101
and target ID of 9007199254740993 produced the `4013` request payload
`0a0a1865200230ad1f38d2091a09088180808080808010`. The matching synthetic `4014`
decoded to the same ID as a **string**. For a saved reply, supply one complete binary
websocket **payload**, not a pcap, websocket headers, a bare reply body or a login
transcript. The output is protobuf JSON, not a complete guide profile.

## Extract a session from your own VMOS sign-in

The inspected SEA build calls `OctopusLog.Debug("UGSDK: Octopus 登录成功 " + s, …)`
in the [success callback](decompiled/UGSdkImp.cs#L698). In the packaged Octopus SDK,
`OctopusLog.Persist` writes a JSON record with a `message` field to
`Application.persistentDataPath/octopus_pending_logs/<id>.json` when reporting is
enabled and the queue is ready. The login result is JSON **inside** that message.
These records are transient: the SDK removes uploaded records. This is not a
permanent session store and an already-running game need not have a record left.

With your VMOS ADB tunnel connected, run from the repository root:

```sh
python3 apps/lookup-client/extract_session.py --adb localhost:15555 --wait 120
```

Wait for the prompt, then sign in normally on the phone with the account you want
to check. The extractor never taps or restarts the app. By default it only reports
whether both fields were present; it doesn't display them or check validity. Without
`--wait` it checks once for a pending record from the last two minutes. If ADB isn't
connected, start `bin/rgo tunnel` in another terminal and run `adb connect localhost:15555`;
don't start the bot. Stop that temporary tunnel when finished.

To send a **fresh** session directly into one game login instead of discarding it after
the presence check, set up ILSpy as above and run this pipeline **before signing in**.
A successful second login can disconnect the phone:

```sh
cd apps/lookup-client
python3 extract_session.py --adb localhost:15555 --wait 120 --pipe |
  uv run login_smoke.py --live --server-id 1321017
```

Replace the serial and internal realm if using a different device or character.
Use the commands directly, not a task runner that could capture stdout. The pipe
contains a bearer credential: don't use `tee`, paste it into chat, or run it through
a logger. For a saved diagnostic from your own test build, `--record FILE` reads one
record instead of using ADB. The extractor checks the exact success event, discards
unrelated fields and refuses to export to a terminal or regular file. It does not
dump logcat, inspect other apps, hook the process, or change SDK settings.

**Verified on VMOS, 10 Nov 2026:** a check against the already-running app found an empty
queue. A fresh sign-in in the official app produced the expected success event; the
check-only extractor decoded both fields and discarded them. The parser accepts numeric
as well as string profile IDs and retains their precision. No live token was printed,
saved or submitted to a third-party gateway login in this check.

## Check one game login

[login_smoke.py](login_smoke.py) starts **after publisher sign-in**. Supply the Octopus
`LoginResult.profileId` and `LoginResult.token` from your authorized SDK integration, not a
Google password, UG token, reconnect token or VMOS API key. The login command itself does
not read Android storage; the optional extractor above provides the two fields via stdin.

A second game login can sign the phone out. If using the VMOS character, coordinate with
whoever is playing and pause the bot first. From the repository root, using the same
local DLL and ILSpy setup as the offline probe:

```sh
vp run @rogo/lookup-client#login --live --server-id <internal-server-id>
```

It prompts for the ID and token locally (token hidden); a local SDK can instead pipe one
JSON object with string fields `profileId` and `token` on stdin. Do not put secrets in shell
arguments. It resolves the selected open realm via the version service, opens one TLS
WebSocket to a returned publisher gateway, sends `4001`, and closes after the matching
`4002` with status 0 and a session token. It neither prints the token nor sends a player-data
request or retries after a kick. Nonzero exit means the check did not verify a login.

**Live verification (10 Nov 2026):** after a fresh official-app sign-in on VMOS, the
extractor piped the issued session directly to the standalone client. For realm
`1321017`, the client discovered the gateway and sent one `LoginReq` (`4001`). It
received the matching `LoginRes` (`4002`, status `0`) with a nonempty reconnect token
and disconnected. Neither token was printed or saved. No retry, character bootstrap,
or player lookup was sent. This verifies gateway login for that session, not token
lifetime, reconnect behavior or independent publisher sign-in.

**Evidence scope:** apart from the live checks noted above, findings are from static
analysis of the local build, not proof of server enforcement.
The original APK and install-time split can be identified with
`adb shell pm path com.ggv.rogosea.aos`; neither device nor APK is needed by the probe
once the local game schema DLL is available. The ignored `bin/` also contains
`GameLogic.dll` (callers), `Cross.dll` (fight/config code) and IL2CPP metadata.
For game configuration tables and stat IDs see [stage extraction](../../packages/stage-extract/README.md).
Base APK SHA-256: `bfeda98c202606469bc28b256c82523700e44cb85651c23f5588f08fdf8eb5c4`;
GameProto SHA-256: `8005d3a3f193469a56d180ff94120e5aed2214d052a0e3c3d4e183db531b607b`.
For schema and caller details not in the excerpts, use
`ilspycmd --disable-updatecheck -t Proto.PlayerDetailInfo bin/GameProto.dll` or select
the named `GameLogic.<type>` in `bin/GameLogic.dll`. Static managed evidence IDs:
`ev_bf651825cbfdba7d8de6b9ddf74b5cc5bbc6805d83dbba2a195a89bae3d7deaf`
(schema), `ev_2cd8bd987737fe6c2a2ba9f04a62fb32b55d5f84435677df04a38a2940a1c379`
(login callers), `ev_4c421a17e5d14a9f8471c965481aace882a17f2ac069634b5875dc849ac4139d`
(Octopus request construction),
`ev_2dbe9723f38605b2070a4e2b11f5d22267c7424d20801ed3b3bceb41353fe0c7`
(OctopusLog / LoginResult members).
