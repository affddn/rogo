# rogo

Headless automation for Ragnarok: GO (SEA, `com.ggv.rogosea.aos`) running on a
VMOS cloud phone. `rgo` drives the real game client over adb: it takes
screenshots, recognises screens by template matching, and taps. It never talks to
the game servers directly and never touches the client process.

## How it fits together

```
Mac / VPS                          VMOS cloud (MY region)
┌────────────────┐  ssh tunnel  ┌──────────────────────────┐
│ rgo run        │─────────────▶│ adbd ─ Android 13         │
│  runner (FSM)  │  adb protocol│        └ Ragnarok: GO     │
│  tasks         │              └──────────────────────────┘
│  screens/vision│
│  device (adb)  │
└────────────────┘
```

`rgo run` is a state machine. Each cycle it reaches the main screen, reads one
frame for signals (red "!" badges, the main-quest "(Completed)" tag, the level
digits) and runs the highest-priority action that is ready:

| prio | action | ready when |
|---|---|---|
| 100 | auto-summon | Auto toggle is off |
| 90 | quests | main quest tracker shows (Completed) |
| 88 | quest-panel | Quest badge (daily/weekly claims, activity chests) |
| 85 | summon-upgrade | Lv.N badge next to Summon Elite (stages, then free 30 min timer) |
| 80 | attributes | Character badge **and** a level-up since last run |
| 75 | equipment | Equipment badge (cards, enhance resonance, round-robin enhance) |
| 70 | weapon | Weapon badge (gacha in max batches, then cultivation) |
| 65 | realm | daily, or Game Mode badge (challenge once per tab, then sweep) |
| 60 | income | daily free Quick Idle unused, or every 2 h |
| 55 | baphomet | every 3 h; taps Dodge on boss-skill prompts |
| 50 | stage | after any growth since the last defeat, else hourly |

An action that changes nothing is snoozed so a badge the bot cannot clear
(paid offers, cosmetics) stops pulling it in. Progress, failures, snoozes and
daily flags persist in `data/state.json`; daily flags reset at 00:00 GMT+8.
Three failed actions in a row, or a deny-listed tap, restart the game.

## Quick start

```bash
make build

# Option A: VMOS API keys in .env (see .env.example); rgo manages the tunnel
#           itself and renews it before its 7-day expiry.
bin/rgo run

# Option B: tunnel opened by hand from the phone's "Local debugging" tab
ssh -oStrictHostKeyChecking=accept-new s@<host> -p <port> -L <local>:localhost:1 -Nf
bin/rgo -s localhost:<local> run
```

Keep it running: `make install-mac` (launchd + caffeinate) or
`deploy/rgo.service` on a VPS (`make linux` for arm64).

## Commands

| command | does |
|---|---|
| `run` | the 24/7 state machine |
| `report` | counters and per-action status from `data/state.json` |
| `status` | detected screen and visible templates |
| `boot`, `home` | launch to main / back out to main |
| `income`, `quests`, `qpanel`, `grow`, `gacha`, `realm`, `boss`, `stage` | run one chore |
| `shot`, `tap`, `back`, `launch`, `stop`, `info` | device primitives |
| `crop`, `match`, `pixel` | template tooling against saved screenshots |

`touch data/pause` holds the loop so you can use the phone by hand; delete it
to resume. `-dry-run` logs taps instead of sending them.

## Adding a screen

1. `bin/rgo shot captures/x.png`
2. `bin/rgo crop captures/x.png <name> x y w h "note"` for a stable element
3. add an ID and rule in `internal/screens/screens.go`, a case in
   `screens_test.go`, rebuild (templates are embedded)

## Ground rules

- No purchases. Paid buttons (Monthly Card "Go Unlock", "Accelerate") are on a
  deny list: any tap landing on one is refused and the game restarted. Gacha
  and Quick Idle only confirm when the cost icon is a ticket.
- No client or protocol tampering. The game ships Tencent ACE; the bot only
  does what a player's finger could do.
- Use a throwaway game account: automation is against the game's terms.

Work is tracked in GitHub issues; #1 is the overview.
