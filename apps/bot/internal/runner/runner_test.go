package runner

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"path/filepath"
	"testing"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/device"
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

func TestPickRunsAStarvedActionFirst(t *testing.T) {
	st, _ := state.Load(filepath.Join(t.TempDir(), "s.json"))
	always := func(screens.Signals, *state.State, time.Time) bool { return true }
	r := New(nil, st,
		&Action{Name: "stage", Priority: 50, Ready: always},
		&Action{Name: "guide", Priority: 87, Ready: always},
	)
	t0 := time.Now()
	if a := r.pick(screens.Signals{}, t0); a.Name != "guide" {
		t.Fatalf("picked %s first, want guide", a.Name)
	}
	if a := r.pick(screens.Signals{}, t0.Add(30*time.Minute)); a.Name != "guide" {
		t.Fatalf("picked %s after 30 min, want guide", a.Name)
	}
	if a := r.pick(screens.Signals{}, t0.Add(46*time.Minute)); a.Name != "stage" {
		t.Fatalf("picked %s after stage waited 46 min, want stage", a.Name)
	}
	if a := r.pick(screens.Signals{}, t0.Add(47*time.Minute)); a.Name != "guide" {
		t.Fatalf("picked %s right after stage ran, want guide", a.Name)
	}
}

func TestWaitsSurviveARestartButNotDowntime(t *testing.T) {
	path := filepath.Join(t.TempDir(), "s.json")
	st, _ := state.Load(path)
	always := func(screens.Signals, *state.State, time.Time) bool { return true }
	actions := func() []*Action {
		return []*Action{{Name: "stage", Priority: 50, Ready: always}, {Name: "guide", Priority: 87, Ready: always}}
	}
	t0 := time.Now().Add(-time.Hour)
	New(nil, st, actions()...).pick(screens.Signals{}, t0) // stage starts waiting
	if err := st.Save(); err != nil {
		t.Fatal(err)
	}

	st2, _ := state.Load(path)
	r := New(nil, st2, actions()...)
	if a := r.pick(screens.Signals{}, t0.Add(46*time.Minute)); a.Name != "stage" {
		t.Fatalf("after a restart picked %s, want stage (waited 46 min)", a.Name)
	}

	// Ten hours off: the wait is moved past the downtime.
	st3, _ := state.Load(path)
	st3.Waiting["stage"] = t0
	st3.PauseWaits(10 * time.Hour)
	r = New(nil, st3, actions()...)
	if a := r.pick(screens.Signals{}, t0.Add(10*time.Hour+30*time.Minute)); a.Name != "guide" {
		t.Fatalf("after downtime picked %s, want guide (stage waited 30 min of running time)", a.Name)
	}
}

func TestTransportErrorsAreMarked(t *testing.T) {
	err := fmt.Errorf("equipment: %w", fmt.Errorf("%w: adb exec-out screencap -p: signal: killed", device.ErrTransport))
	if !errors.Is(err, device.ErrTransport) {
		t.Fatal("wrapped transport error not recognised")
	}
	if errors.Is(fmt.Errorf("could not reach main screen"), device.ErrTransport) {
		t.Fatal("a game error read as transport")
	}
}

func TestLinkFailedBacksOffAndCounts(t *testing.T) {
	st, _ := state.Load(filepath.Join(t.TempDir(), "s.json"))
	r := New(&bot.Bot{Log: slog.New(slog.NewTextHandler(io.Discard, nil))}, st)
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // the sleep returns at once; only the count matters here
	_ = r.linkFailed(ctx)
	_ = r.linkFailed(ctx)
	if st.LinkFails != 2 {
		t.Fatalf("link fails %d, want 2", st.LinkFails)
	}
}

func TestProgressWakesMutedActions(t *testing.T) {
	st, _ := state.Load(filepath.Join(t.TempDir(), "s.json"))
	now := time.Now()
	r := New(nil, st)
	st.Snooze["quest-go"] = now.Add(15 * time.Minute)
	claim := &Action{Name: "quests", Snooze: 5 * time.Minute, Wakes: []string{"quest-go"}}

	r.settle(claim, Outcome{}, now)
	if !st.Snoozed("quest-go", now) {
		t.Fatal("a run without progress woke quest-go")
	}
	r.settle(claim, Outcome{Progress: true}, now)
	if st.Snoozed("quest-go", now) {
		t.Fatal("a claimed quest left quest-go muted")
	}
}
