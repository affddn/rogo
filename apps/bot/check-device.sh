#!/usr/bin/env bash
# Checks whether an Android device (cloud phone, emulator or real phone) can run
# Ragnarok: GO and be driven over adb. It only launches the game: no taps.
#
# usage: ./apps/bot/check-device.sh <host:port | adb serial> [seconds-to-watch]
set -uo pipefail

TARGET="${1:?usage: $0 <host:port | adb serial> [seconds-to-watch]}"
WATCH="${2:-180}"
OUT="device-check-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

pass() { printf '  \033[32mPASS\033[0m %s\n' "$*"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$*"; }
info() { printf '       %s\n' "$*"; }
sh_()  { adb -s "$TARGET" shell "$@" 2>/dev/null | tr -d '\r'; }

command -v adb >/dev/null || { echo "adb not found: brew install --cask android-platform-tools"; exit 1; }

echo "1. Connection"
case "$TARGET" in *:*) adb connect "$TARGET" >/dev/null 2>&1 ;; esac
if [ "$(adb -s "$TARGET" get-state 2>/dev/null)" = device ]; then
  pass "adb connected to $TARGET"
else
  fail "adb can't reach $TARGET (is ADB enabled for this phone, and is the phone running?)"
  exit 1
fi

echo "2. Device"
info "model:   $(sh_ getprop ro.product.manufacturer) $(sh_ getprop ro.product.model)"
info "android: $(sh_ getprop ro.build.version.release)   abi: $(sh_ getprop ro.product.cpu.abi)"
info "screen:  $(sh_ wm size | tail -1)   $(sh_ wm density | tail -1)"
if sh_ 'command -v su' | grep -q .; then info "root:    su present"; else info "root:    no su"; fi

echo "3. Screenshots"
TIMEFORMAT=%R
secs=$( { time adb -s "$TARGET" exec-out screencap -p > "$OUT/shot-000s.png"; } 2>&1 )
if file "$OUT/shot-000s.png" | grep -q PNG; then
  pass "screencap works (${secs}s per shot)"
else
  fail "screencap returned no image"
fi

echo "4. Game"
# Play package is com.ggv.rogosea.aos; set RGO_PKG to override.
PKG="${RGO_PKG:-}"
[ -n "$PKG" ] || PKG=$(sh_ pm list packages | sed 's/^package://' | grep -i -E 'ragnarok|\.rogo' | head -1)
if [ -z "$PKG" ]; then
  fail "Ragnarok: GO isn't installed. Install it from Google Play on the phone, then rerun."
  exit 1
fi
pass "installed: $PKG $(sh_ dumpsys package "$PKG" | grep -m1 versionName | sed 's/^ *//')"

adb -s "$TARGET" logcat -c 2>/dev/null
sh_ monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
info "launched; watching for ${WATCH}s. If it asks you to log in, use a guest or throwaway account."

died_at=""
for ((t = 15; t <= WATCH; t += 15)); do
  sleep 15
  if ! sh_ pidof "$PKG" | grep -q .; then died_at=$t; break; fi
  if ((t % 45 == 0)); then
    adb -s "$TARGET" exec-out screencap -p > "$OUT/shot-$(printf '%03d' "$t")s.png"
  fi
done
adb -s "$TARGET" exec-out screencap -p > "$OUT/shot-final.png"
adb -s "$TARGET" logcat -d > "$OUT/logcat.txt" 2>/dev/null

if [ -n "$died_at" ]; then
  fail "game process exited within ${died_at}s"
else
  pass "game still running after ${WATCH}s"
fi
if sh_ dumpsys window | grep -E 'mCurrentFocus|mFocusedApp' | grep -q "$PKG"; then
  pass "game is the focused app"
else
  fail "game isn't in front (crashed, kicked out, or a system dialog is on top)"
fi

hits=$(grep -i -E "FATAL EXCEPTION|has died|$PKG.*(crash|killed)|tersafe|anogs|anticheat|emulator detect|abnormal" "$OUT/logcat.txt" | grep -v ' D ' | head -20)
if [ -n "$hits" ]; then
  info "suspicious log lines:"
  printf '%s\n' "$hits" | sed 's/^/         /'
fi

echo
echo "Saved screenshots and logcat to $OUT/. Check the screenshots for an"
echo "'abnormal environment' or similar anti-cheat popup: it can show without killing the game."
