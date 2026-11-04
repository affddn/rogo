package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
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
	printProgress(filepath.Join(filepath.Dir(*path), "progress.csv"), now)
	return nil
}

func ago(now, t time.Time) string {
	if t.IsZero() {
		return "-"
	}
	return now.Sub(t).Round(time.Minute).String() + " ago"
}

// printProgress summarises the combat power log: the latest reading and the
// gain over the last 6 and 24 hours.
func printProgress(path string, now time.Time) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	type point struct {
		t time.Time
		p int
	}
	var pts []point
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		ts, ps, ok := strings.Cut(sc.Text(), ",")
		t, err1 := time.Parse(time.RFC3339, ts)
		p, err2 := strconv.Atoi(ps)
		if ok && err1 == nil && err2 == nil {
			pts = append(pts, point{t, p})
		}
	}
	if len(pts) == 0 {
		return
	}
	last := pts[len(pts)-1]
	fmt.Printf("\npower %.1fK (%s ago)\n", float64(last.p)/1000, now.Sub(last.t).Round(time.Minute))
	for _, span := range []time.Duration{6 * time.Hour, 24 * time.Hour} {
		for _, q := range pts {
			if now.Sub(q.t) <= span {
				if h := last.t.Sub(q.t).Hours(); h > 0.5 {
					fmt.Printf("  last %-4s +%.1fK, %.1fK an hour\n", span, float64(last.p-q.p)/1000, float64(last.p-q.p)/1000/h)
				}
				break
			}
		}
	}
}
