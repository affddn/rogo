package main

import (
	"image"
	"path/filepath"
	"testing"
	"time"

	"github.com/affddn/rogo/internal/state"
)

func TestStageStuck(t *testing.T) {
	st, _ := state.Load(filepath.Join(t.TempDir(), "s.json"))
	st.StageMisses, st.PowerLost = 2, 4_000_000
	for power, want := range map[int]bool{3_900_000: true, 4_150_000: true, 4_200_000: false} {
		st.Power = power
		if got := stageStuck(st); got != want {
			t.Errorf("power %d: stuck %v, want %v", power, got, want)
		}
	}
	st.StageMisses = 0
	st.Power = 3_900_000
	if stageStuck(st) {
		t.Error("stuck without a defeat")
	}
	if !image.Pt(642, 1054).In(stageButton) {
		t.Error("the guide's stage arrow target is outside stageButton")
	}
}

func TestStageStall(t *testing.T) {
	now := time.Date(2026, 11, 7, 20, 0, 0, 0, time.UTC)
	st, _ := state.Load(filepath.Join(t.TempDir(), "s.json"))
	if _, stalled := stageStall(st, now); stalled {
		t.Error("stalled with no stage clear on record")
	}
	st.StageMisses = 3
	st.LastWin["stage"] = now.Add(-5 * time.Hour)
	if last, stalled := stageStall(st, now); !stalled || !last.Equal(st.LastWin["stage"]) {
		t.Errorf("5h without a clear: last %v stalled %v", last, stalled)
	}
	st.StageClear = now.Add(-time.Hour) // a quest cleared one since
	if _, stalled := stageStall(st, now); stalled {
		t.Error("stalled an hour after a clear")
	}
	st.StageClear = time.Time{}
	st.StageMisses = 1
	if _, stalled := stageStall(st, now); stalled {
		t.Error("stalled after one lost fight")
	}
}
