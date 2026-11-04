// Package state persists what the bot has done so restarts lose nothing and
// the planner can tell what is due.
package state

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"
)

// GameZone is the SEA server clock; daily content resets at its midnight.
var GameZone = time.FixedZone("GMT+8", 8*3600)

type State struct {
	// Day is the game day (YYYY-MM-DD, GMT+8) the Daily flags belong to.
	Day   string          `json:"day"`
	Daily map[string]bool `json:"daily"`

	LastRun  map[string]time.Time `json:"last_run"`
	LastWin  map[string]time.Time `json:"last_progress"` // last run that changed something
	Fails    map[string]int       `json:"fails"`
	Snooze   map[string]time.Time `json:"snooze"` // action ignored until then
	Counters map[string]int       `json:"counters"`

	// Level is the level fingerprint attributes were last handled at, Seen
	// the one on screen now; a difference means points arrived.
	Level string `json:"level"`
	Seen  string `json:"seen_level"`

	// Stage is the next-challenge label fingerprint at the last stage run;
	// StageMisses counts runs in a row that cleared nothing.
	Stage       string `json:"stage"`
	StageMisses int    `json:"stage_misses"`
	// PowerAtDefeat is the power fingerprint when the last stage run lost.
	PowerAtDefeat string `json:"power_at_defeat"`
	// PowerNow is the latest power fingerprint read on main.
	PowerNow string `json:"power_now"`
	// Power is the latest combat power read on main, and PowerLost what it
	// was at the last stage defeat.
	Power     int `json:"power"`
	PowerLost int `json:"power_at_defeat_value"`

	// Growth counts upgrades since the last stage defeat; a stage retry
	// before any growth would lose the same way.
	Growth     int       `json:"growth_since_defeat"`
	LastDefeat time.Time `json:"last_defeat"`

	// Waiting is when each action became ready without being run; it
	// survives restarts so a long wait is not forgotten. SavedAt lets
	// downtime be left out of it.
	Waiting map[string]time.Time `json:"waiting"`
	SavedAt time.Time            `json:"saved_at"`

	path string
}

func Load(path string) (*State, error) {
	s := &State{path: path}
	raw, err := os.ReadFile(path)
	switch {
	case errors.Is(err, os.ErrNotExist):
	case err != nil:
		return nil, err
	default:
		if err := json.Unmarshal(raw, s); err != nil {
			return nil, err
		}
	}
	s.init()
	return s, nil
}

func (s *State) init() {
	if s.Daily == nil {
		s.Daily = map[string]bool{}
	}
	if s.LastRun == nil {
		s.LastRun = map[string]time.Time{}
	}
	if s.LastWin == nil {
		s.LastWin = map[string]time.Time{}
	}
	if s.Fails == nil {
		s.Fails = map[string]int{}
	}
	if s.Snooze == nil {
		s.Snooze = map[string]time.Time{}
	}
	if s.Counters == nil {
		s.Counters = map[string]int{}
	}
	if s.Waiting == nil {
		s.Waiting = map[string]time.Time{}
	}
}

// PauseWaits moves every wait forward by d, for time the bot was not
// running: being off, paused or held does not count as waiting.
func (s *State) PauseWaits(d time.Duration) {
	if d <= 0 {
		return
	}
	for k, t := range s.Waiting {
		s.Waiting[k] = t.Add(d)
	}
}

// Save writes atomically so a crash mid-write cannot corrupt the file.
func (s *State) Save() error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	s.SavedAt = time.Now()
	raw, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// Rollover clears daily flags when the game day changes. It reports whether
// a reset happened.
func (s *State) Rollover(now time.Time) bool {
	day := now.In(GameZone).Format("2006-01-02")
	if day == s.Day {
		return false
	}
	s.Day = day
	s.Daily = map[string]bool{}
	return true
}

func (s *State) Since(action string, now time.Time) time.Duration {
	t, ok := s.LastRun[action]
	if !ok {
		return time.Duration(1<<63 - 1)
	}
	return now.Sub(t)
}

func (s *State) Snoozed(action string, now time.Time) bool {
	return now.Before(s.Snooze[action])
}

func (s *State) Add(counter string, n int) { s.Counters[counter] += n }
