# Rogo

Tools for Ragnarok: GO (SEA): a browser guide, an Android bot and a character lookup probe.

| Workspace                                                  | Purpose                                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [apps/web](apps/web/README.md)                             | React guide and planners; owns the browser UI, saved characters and published data.          |
| [apps/bot](apps/bot/README.md)                             | Go CLI that runs the game on an Android phone over adb.                                      |
| [apps/lookup-client](apps/lookup-client/FINDINGS.md)       | VMOS session helper, character snapshot and guarded gateway operations.                      |
| [packages/game](packages/game)                             | Shared TypeScript formulas and game-data types. Import subpaths such as `@rogo/game/damage`. |
| [packages/stage-extract](packages/stage-extract/README.md) | Python utilities for rebuilding game tables from client bundles.                             |

The [gateway action map](apps/lookup-client/catalog/ACTION_MAP.md) lists what the game
protocol defines, what the official client sends and what has been verified live.
Search it offline with `vp run @rogo/lookup-client#actions`, followed by a keyword or command ID.

To see your own character and send operations from this computer, use
[Connect Rogo](apps/lookup-client/CONNECT.md). Normal guide builds have no account connector.

## Development

Run from the repository root with Vite+ and pnpm (pinned in `package.json`):

```sh
vp install --frozen-lockfile
vp run dev                 # guide dev server
vp run build               # guide + Go binary
vp run test                # existing guide and Go tests
vp check                   # workspace formatting, lint and TypeScript checks
```

To work on just one app, use e.g. `vp run @rogo/web#build` or `vp run @rogo/bot#test`.
Go builds use the toolchain in `apps/bot/go.mod`. The lookup demo uses Python, uv, ILSpy and a
local DLL; see its [setup instructions](apps/lookup-client/FINDINGS.md#try-the-wire-format-offline).

The bot still builds with `make build` and runs as `bin/rgo` from the repository root.
The root `.env`, runtime state and captures are not workspace packages and are not committed.

Work is tracked in GitHub issues; #1 is the overview.
