# rogo

Headless automation for Ragnarok: GO (SEA, `com.ggv.rogosea.aos`) on an
Android phone reachable over adb. `rgo` drives the real game client: it takes
screenshots, recognises screens by template matching, and taps. It never talks to
the game servers directly and never touches the client process.

## How it fits together

`rgo run` is a state machine. Each cycle it reaches the main screen, reads one
frame for signals (red "!" badges, the main-quest "(Completed)" tag, the level
digits) and runs the highest-priority action that is ready:

| prio | action | ready when |
|---|---|---|
| 100 | auto-summon | Auto toggle is off |
| 90 | quests | main quest tracker shows (Completed) (green-text detection) |
| 88 | quest-panel | Quest badge (daily/weekly claims, activity chests) |
| 87 | guide | a blinking yellow guide arrow on main: tap through the arrow chain |
| 85 | summon-upgrade | Lv.N badge next to Summon Elite (stages, then free 30 min timer) |
| 80 | attributes | Character badge **and** a level-up since last run: stat points by the damage model in `internal/tasks/build.go`, skill points by Recommended |
| 75 | equipment | Equipment badge (cards, dismantle when bag > 20, enhance resonance, round-robin enhance) |
| 70 | weapon | Weapon badge (gacha in max batches, then cultivation) |
| 69 | diamond-draws | every 3 h: diamonds above a 1,000 reserve go to weapon draws, then cultivation |
| 68 | pets | Pet badge (free-ticket pet gacha, activate/upgrade, auto formation) |
| 65 | realm | daily, or Game Mode badge (challenge once per tab, then sweep) |
| 63 | mvp | daily: challenge the MVP boss (free; climbs difficulties for first-clear rewards), then 3 sweeps |
| 62 | dungeon | daily: Auto Match, Accept, three runs |
| 60 | income | daily free Quick Idle unused, or every 2 h |
| 55 | baphomet | every 3 h; taps Dodge on boss-skill prompts |
| 50 | stage | after growth since the last defeat; backs off 5 min..2 h while nothing clears |
| 45 | season-pass | hourly: Claim All on the free track of each pass |
| 40 | mail | every 6 h: Claim All |

Unknown screens are handled generically: guide arrows are followed, tutorials
skipped, lone OK prompts confirmed, "tap empty area" popups closed, a fight
already under way is waited out, and the back key is the last resort. An action that changes nothing is snoozed so a badge the bot cannot clear
(paid offers, cosmetics) stops pulling it in. Progress, failures, snoozes and
daily flags persist in `data/state.json`; daily flags reset at 00:00 GMT+8.
Three failed actions in a row, or a deny-listed tap, restart the game.

Signed out, the bot logs back in with Google Login and picks the phone's first
Google account. When the game signs out because the account signed in on
another device, the bot leaves it signed out for 30 minutes so it does not kick
whoever is playing; a kick it finds right after starting or resuming (or
deleting `data/pause`) is treated as a hand-over and it logs straight back in.

## Supported phones

rgo needs Android 13, arm64, and a 720x1280 screen at 320 dpi: every template
and tap is measured on that render.

| phone | how rgo reaches it | status |
|---|---|---|
| VMOS Cloud (MY region) | adb through VMOS's ssh tunnel, which rgo opens and renews from `.env` | runs 24/7 |
| sayadroid in a Lima VM on an M1 Pro Mac | plain adb, `localhost:25555` | tested with a new guest character: boot and `rgo run`; software rendering |
| sayadroid on an arm64 Linux host | plain adb, `localhost:5555` | not tested yet |

## Quick start

```bash
make build

# Option A: VMOS API keys in .env (see .env.example); rgo manages the tunnel
#           itself: a day before its 7-day expiry it closes it and opens a
#           fresh one (VMOS hands back an open tunnel unchanged).
# Option A2: the ssh command + Connection key from "Local debugging" in .env
#           (RGO_TUNNEL_*); rgo serves it natively and redials drops.
bin/rgo run

# Option B: tunnel opened by hand from the phone's "Local debugging" tab
ssh -oStrictHostKeyChecking=accept-new s@<host> -p <port> -L <local>:localhost:1 -Nf
bin/rgo -s localhost:<local> run

# Option C: sayadroid, our own phone in a container (see below). It is plain
# adb: name it with -s and rgo connects; the VMOS tunnel in .env is ignored.
bin/rgo -s localhost:25555 run      # Mac (Lima VM)
bin/rgo -s localhost:5555 run       # arm64 Linux host
```

Keep it running: `make install-mac` (launchd + caffeinate) or
`deploy/rgo.service` on a VPS (`make linux` for arm64).

## sayadroid: our own phone

VMOS runs a private redroid image (Android 13 in a container on ARM servers).
`deploy/sayadroid/Dockerfile` builds our equivalent from official redroid: 64-bit
only, Google Play (MindTheGapps), and the VMOS phone's 720x1280 @ 320dpi screen,
which rgo's templates assume. Any arm64 Linux host with binder runs it
(`compose.yaml`); on an Apple Silicon Mac, `lima.yaml` provides that host as a VM.
Graphics are software-rendered, so give it 4+ cores.

Once per fresh container (data lives in the `sayadroid-data` volume):

1. Skip Google's setup wizard, which crashes on redroid:
   `adb -s <serial> shell 'settings put global device_provisioned 1; settings put secure user_setup_complete 1; pm disable-user com.google.android.setupwizard'`
2. Register it with Google, which blocks sign-in on uncertified builds: read the
   ID with `adb -s <serial> root` then
   `adb -s <serial> shell sqlite3 /data/data/com.google.android.gsf/databases/gservices.db "select value from main where name='android_id'"`
   and submit it at https://www.google.com/android/uncertified.
3. `scrcpy -s <serial>`: sign in to the Play Store and install Ragnarok: GO
   from there. The game's Play license check fails on a sideloaded copy.
4. Open the game once by hand: tick the user agreement and log in. Guest
   logins work; rgo cancels the bind-your-account nag they show at start.

## Commands

| command | does |
|---|---|
| `run` | the 24/7 state machine |
| `report` | counters and per-action status from `data/state.json` |
| `status` | detected screen and visible templates |
| `boot`, `home` | launch to main / back out to main |
| `income`, `quests`, `qpanel`, `grow`, `gacha`, `diamonds`, `realm`, `boss`, `mvp`, `dungeon`, `stage` | run one chore |
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
