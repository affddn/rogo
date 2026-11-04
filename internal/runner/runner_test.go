package runner

import (
	"fmt"
	"io"
	"log/slog"
	"path/filepath"
	"testing"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/state"
)

func TestPickPrefersReadyHighPriorityAndSkipsSnoozed(t *testing.T) {
	st, _ := state.Load(filepath.Join(t.TempDir(), "s.json"))
	always := func(screens.Signals, *state.State, time.Time) bool { return true }
	never := func(screens.Signals, *state.State, time.Time) bool { return false }
	r := New(nil, st,
		&Action{Name: "low", Priority: 1, Ready: always},
		&Action{Name: "high", Priority: 9, Ready: always},
		&Action{Name: "top-not-ready", Priority: 10, Ready: never},
	)
	now := time.Now()
	if a := r.pick(screens.Signals{}, now); a.Name != "high" {
		t.Fatalf("picked %s, want high", a.Name)
	}
	st.Snooze["high"] = now.Add(time.Minute)
	if a := r.pick(screens.Signals{}, now); a.Name != "low" {
		t.Fatalf("picked %s with high snoozed, want low", a.Name)
	}
}

func TestKickHoldsUnlessJustResumed(t *testing.T) {
	st, _ := state.Load(filepath.Join(t.TempDir(), "s.json"))
	r := New(&bot.Bot{Log: slog.New(slog.NewTextHandler(io.Discard, nil))}, st)
	if r.kicked(fmt.Errorf("other")) {
		t.Fatal("unrelated error treated as a kick")
	}

	r.resumed = time.Now()
	if !r.kicked(fmt.Errorf("quests: %w", bot.ErrKicked)) || !r.holdUntil.IsZero() {
		t.Fatalf("kick right after resume should log back in, hold until %v", r.holdUntil)
	}

	r.resumed = time.Now().Add(-time.Hour)
	if !r.kicked(bot.ErrKicked) || time.Until(r.holdUntil) < r.KickHold-time.Minute {
		t.Fatalf("kick mid-run should hold for %v, hold until %v", r.KickHold, r.holdUntil)
	}
	if st.Counters["kicks"] != 2 {
		t.Fatalf("kicks counted %d, want 2", st.Counters["kicks"])
	}
}
