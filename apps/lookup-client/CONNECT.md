# Connect Rogo on this computer

The official SEA app on your VMOS phone signs in. The local guide reads that fresh Octopus session, logs in to the selected realm and fetches your character. Once connected, operations use the same game WebSocket; they do **not** tap the phone. Only a projection of the character is saved in your browser: realm, character ID, nickname, level, power, build, stage, activated card stars and reported skill levels. An absent field is not a zero.

## Start the guide

1. Install the workspace dependencies, build the tunnel helper with `make build`, and configure the bot's existing VMOS connection as usual (or attach the intended phone at `localhost:15555`). You need `adb`, `uv`, .NET 8, ILSpy 9.1, and the pinned [GameProto.dll](FINDINGS.md#try-the-wire-format-offline) locally. The first run can download the pinned Python dependencies.
2. **Pause gameplay automation first.** Launch the guide from this checkout:

   ```sh
   cd apps/web
   ROGO_CONNECT=1 vp dev --host 127.0.0.1 --port 5176 --strictPort
   ```

   Set `ROGO_ILSPYCMD` if ILSpy isn't on PATH, and `DOTNET_ROOT` if required by your .NET installation. The helper reads the selected realm from the phone; `ROGO_CONNECT_SERVER_ID` can pin it or supply a fallback. No publisher or Google credentials belong in Vite's public environment.

3. Open [Character](http://127.0.0.1:5176/character) and choose **Connect Rogo → Relaunch and connect**. This restarts the official app once and can disconnect it from the game. If prompted, finish account selection **in VMOS**. Failure stops the attempt; the guide doesn't tap through account dialogs, create a character or start the bot.
4. Open [Operations](http://127.0.0.1:5176/operations). Search for `4651` and **Validate without sending** with `{}` for an example read. **Review and send** shows the request before it goes to the game. Use **Disconnect** when done. The socket also closes after five idle minutes, a gateway kick or helper shutdown. The saved snapshot remains; **Forget snapshot** clears that browser copy, not an imported planner profile.

Without the opt-in local dev helper, the app is a guide and catalog, not an authenticated game client. Don't proxy or expose the connector. A browser-only Google login for the guide was [investigated separately](WEB_AUTH.md); the official storefront login does not supply a game session to this origin.

## Automation endpoint

`GET /api/rogo/catalog` lists all 260 request/reply pairs and the local availability policy. A request being sendable is **not** a claim that the account or server will accept it. Of these, 40 are managed or blocked, including GM/test, payment orders, SDK ad callbacks and fabricated fight settlements. Other operations may be conditional on payload, progress, role or resources. See [operation-policy.json](catalog/operation-policy.json).

Use `POST /api/rogo/operations` from the same loopback origin with `Content-Type: application/json` and `X-Rogo-Connect: 1`. Keep credentials same-origin. The owner uses an HttpOnly, SameSite=Strict cookie, **not** an Octopus token. Requests are serialized; don't automatically retry sends.

| Operation            | Request and result                                                                                                                                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `character.sync`     | No payload. Explicitly initiate a fresh VMOS sign-in. Returns `{character}` and establishes the local session.                                                                                                                                                                                                                  |
| `gateway.prepare`    | `command` (numeric request ID), `payload` (protobuf JSON object). Type-checks and applies local policy; sends nothing to the game. When connected and confirmation is required, returns a top-level single-use `ticket` alongside `result`.                                                                                     |
| `gateway.execute`    | Same command and payload. For changes and schema-only commands, explicitly approve the effect, send the request name as `confirm`, and supply the `ticket` from prepare. A newer review for a change supersedes the old one; tickets expire after two minutes or at disconnect. One operation per call; no replay or reconnect. |
| `session.disconnect` | Discards this owner's game session. No game logout or phone restart is needed.                                                                                                                                                                                                                                                  |

Example: `{"operation":"gateway.prepare","command":4651,"payload":{}}`. A successful **execute** returns `result.command`, `result.reply`, `result.status` and decoded `result.data`. Use quoted decimal strings for large integer IDs. Validation checks wire shape and known restrictions, not game rules, prices, or whether an individual action is sensible. Don't log private payloads or replies. If the connection disappears after sending, **the outcome is unknown**: inspect state instead of replaying.

## Play from the web guide

Use the [daily optimizer](routine/README.md) for account-specific reward batches, free shop listings, sweeps and supported mode fights.

Character has shortcuts for **Apply a card**, **Retry campaign boss**, and **All game actions**. Card album and Planner → Cards can preselect a card. Select its destination slot, validate, review the character and send once. This equips it in game; the album's ownership and star buttons still edit only the local planner. Other operations also have field-based inputs; complex fields and the advanced editor accept protobuf JSON.

For campaign retries, install the [pinned .NET replay host](replay/README.md) on the machine running the helper. The browser requests `campaign.prepare` with `payload:{}` and shows the current stage. `campaign.retry` requires the same session, the issued single-use ticket, `confirm:"campaign.retry"` and the reviewed `payload:{stage_entry:…}`. After connecting, **no phone gameplay** is involved. The generic API still blocks user-authored campaign settlement packets. The daily optimizer uses distinct adapters for resource realms, MVP, World Boss and Guild Hunt. A raw start request alone is not a result.

## Run a recipe

From this directory with the helper running:

```sh
python3 run_operations.py recipes/collection-check.json         # validate only; no VMOS or game access
python3 run_operations.py recipes/collection-check.json --run   # relaunch VMOS and execute once
```

A recipe is an ordered JSON list of up to 30 `{command,payload}` steps. The example reads cards and Collection Gear. Dry-run checks the entire list first. Live mode obtains **one** session, revalidates each step, and disconnects at the end; VMOS isn't used between steps. Disconnect an existing browser-owned live session before running a separate recipe. The runner stops at the first error; already completed steps aren't rolled back. By default it prints only command, reply and status. Use `--show-data` only if you intend to output private account data. Writes and schema-only commands require `--review-changes` and a per-step typed confirmation in a terminal. No scheduling or background bot is installed.

## Live check

On 10 Nov 2026, from the Character page on loopback, the guide relaunched the official app on the operator's VMOS device, received an issued session, and matched login `4001 → 4002` and private character bootstrap `4005 → 4006` on realm `1321017`. The browser displayed the mapped nickname, level, power, build, stage, cards and skills. After temporary device access was released, the Operations page prepared and sent **one** read-only card collection query on the same socket (`4651 → 4652`, status 0). Disconnect cleared the game session; returning to Character retained the saved snapshot. No claims, spending, combat or social writes were tested during that first connection check. No game credentials or raw bootstrap were saved by the guide.

A later web UI test on the same realm ran one live stage 7-6 campaign attempt without phone gameplay. The game returned a successful settlement reply (`5004`) and a **defeat**. The card picker read the active loadout, equipped an activated card in weapon slot 5 (`4661 → 4662`, status 0), then restored the original card in that same slot (also status 0). The operator disconnected afterwards. These checks do not establish that a different battle mode or all other catalog entries work.

The Python projection and operation-policy tests run offline against the local schema. From this directory run `uv run test_connect_character.py` and `uv run test_gateway_ops.py`; set `ILSPYCMD` for the tests if needed.
