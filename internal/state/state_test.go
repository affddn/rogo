package state

import (
	"path/filepath"
	"testing"
	"time"
)

func TestSaveLoadRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	s, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 11, 3, 18, 0, 0, 0, GameZone)
	s.LastRun["quests"] = now
	s.Add("quests_claimed", 3)
	s.Growth = 2
	if err := s.Save(); err != nil {
		t.Fatal(err)
	}
	got, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if !got.LastRun["quests"].Equal(now) || got.Counters["quests_claimed"] != 3 || got.Growth != 2 {
		t.Fatalf("round trip lost data: %+v", got)
	}
}

func TestRolloverAtGameMidnight(t *testing.T) {
	s, _ := Load(filepath.Join(t.TempDir(), "s.json"))
	s.Rollover(time.Date(2026, 11, 3, 23, 59, 0, 0, GameZone))
	s.Daily["quick_idle"] = true
	if s.Rollover(time.Date(2026, 11, 3, 23, 59, 30, 0, GameZone)) {
		t.Fatal("rolled over within the same game day")
	}
	if !s.Rollover(time.Date(2026, 11, 4, 0, 0, 1, 0, GameZone)) || s.Daily["quick_idle"] {
		t.Fatal("daily flags not cleared at game midnight")
	}
}
