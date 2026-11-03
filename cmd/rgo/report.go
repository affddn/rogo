package main

import (
	"context"
	"flag"
	"fmt"
	"maps"
	"slices"
	"time"

	"github.com/affddn/rogo/internal/device"
	"github.com/affddn/rogo/internal/state"
)

func cmdReport(_ context.Context, _ *device.Device, args []string) error {
	fs := flag.NewFlagSet("report", flag.ContinueOnError)
	path := fs.String("state", "data/state.json", "state file written by rgo run")
	if err := fs.Parse(args); err != nil {
		return err
	}
	s, err := state.Load(*path)
	if err != nil {
		return err
	}
	now := time.Now()
	fmt.Printf("game day %s, growth since last stage defeat %d\n\n", s.Day, s.Growth)
	fmt.Println("counters")
	for _, k := range slices.Sorted(maps.Keys(s.Counters)) {
		fmt.Printf("  %-24s %d\n", k, s.Counters[k])
	}
	fmt.Println("\naction                   last run   last progress  fails  snoozed")
	for _, k := range slices.Sorted(maps.Keys(s.LastRun)) {
		snooze := ""
		if s.Snoozed(k, now) {
			snooze = time.Until(s.Snooze[k]).Round(time.Minute).String()
		}
		fmt.Printf("  %-22s %9s %14s %6d  %s\n", k, ago(now, s.LastRun[k]), ago(now, s.LastWin[k]), s.Fails[k], snooze)
	}
	fmt.Println("\ndaily", s.Daily)
	return nil
}

func ago(now, t time.Time) string {
	if t.IsZero() {
		return "-"
	}
	return now.Sub(t).Round(time.Minute).String() + " ago"
}
