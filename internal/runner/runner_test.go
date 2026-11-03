package runner

import (
	"path/filepath"
	"testing"
	"time"

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
