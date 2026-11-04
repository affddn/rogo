package main

import (
	"image"
	"path/filepath"
	"testing"

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
