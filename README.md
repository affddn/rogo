# rogo

Headless automation for Ragnarok: GO (SEA, `com.ggv.rogosea.aos`) running on a
VMOS cloud phone. `rgo` drives the real game client over adb: it takes
screenshots, recognises screens by template matching, and taps. It never talks to
the game servers directly and never touches the client process.

## How it fits together

```
Mac / VPS                       VMOS cloud (MY region)
┌─────────────┐  ssh tunnel  ┌──────────────────────────┐
│ rgo (Go)    │─────────────▶│ adbd ─ Android 13         │
│  device     │  adb protocol│        └ Ragnarok: GO     │
│  vision     │              └──────────────────────────┘
│  tasks      │
│  runner     │
└─────────────┘
```

## Quick start

```bash
# 1. open the VMOS adb tunnel (key from the phone's "Local debugging" tab)
ssh -oStrictHostKeyChecking=accept-new s@<host> -p <port> -L <local>:localhost:1 -Nf
adb connect localhost:<local>

# 2. build and run
go build -o bin/rgo ./cmd/rgo
bin/rgo -s localhost:<local> status
```

Work is tracked in GitHub issues.

## Ground rules

- No purchases. Shop, top-up and pass screens are on a deny list and the bot
  backs out of them.
- No client or protocol tampering. The game ships Tencent ACE; the bot only
  does what a player's finger could do.
- Use a throwaway game account: automation is against the game's terms.
