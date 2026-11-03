// Package runner is the bot's state machine: observe the main screen, pick the
// most valuable ready action, run it, record the outcome, repeat.
package runner

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/state"
)

// Outcome reports what an action achieved.
type Outcome struct {
	// Progress is true when the account changed: something claimed, spent or
	// upgraded. A badge-triggered action without progress gets snoozed, so a
	// badge the bot cannot clear (paid content, cosmetics) stops pulling it in.
	Progress bool
	// Growth is true when combat power likely rose; it unlocks a stage retry.
	Growth bool
}

type Action struct {
	Name     string
	Priority int // higher runs first among ready actions
	// Ready decides from the latest main-screen signals and saved state.
	Ready func(sig screens.Signals, st *state.State, now time.Time) bool
	Run   func(ctx context.Context, b *bot.Bot, st *state.State) (Outcome, error)
	// Snooze is how long a run without progress mutes the action.
	Snooze time.Duration
}

type Runner struct {
	B       *bot.Bot
	State   *state.State
	Actions []*Action
	// JobTimeout bounds one action; a hung UI flow must not stall the loop.
	JobTimeout time.Duration
	// RestartAfter consecutive failed actions force-stops and relaunches the game.
	RestartAfter int
	// Idle is the pause between looks when nothing is ready.
	Idle time.Duration
	// Reconnect, when set, re-establishes the transport (e.g. fetches a fresh
	// VMOS tunnel key) before adb reconnects to an offline device.
	Reconnect func(ctx context.Context) error
}

func New(b *bot.Bot, st *state.State, actions ...*Action) *Runner {
	sort.SliceStable(actions, func(i, j int) bool { return actions[i].Priority > actions[j].Priority })
	return &Runner{B: b, State: st, Actions: actions, JobTimeout: 10 * time.Minute, RestartAfter: 3, Idle: 2 * time.Minute}
}

func (r *Runner) Run(ctx context.Context) error {
	log, st := r.B.Log, r.State
	streak := 0
	for {
		now := time.Now()
		if st.Rollover(now) {
			log.Info("new game day", "day", st.Day)
			r.save()
		}
		if err := r.ensureGame(ctx); err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			log.Error("game not ready", "err", err)
			if err := bot.Sleep(ctx, time.Minute); err != nil {
				return err
			}
			continue
		}
		if err := r.B.ToMain(ctx); err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			streak++
			log.Error("cannot reach main", "err", err)
			if streak >= r.RestartAfter {
				r.restart(ctx)
				streak = 0
			}
			continue
		}
		_, frame, err := r.B.Look(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			continue
		}
		sig := screens.ReadMain(frame)

		a := r.pick(sig, now)
		if a == nil {
			if err := bot.Sleep(ctx, r.Idle); err != nil {
				return err
			}
			continue
		}

		start := time.Now()
		actx, cancel := context.WithTimeout(ctx, r.JobTimeout)
		out, err := a.Run(actx, r.B, st)
		cancel()
		if ctx.Err() != nil {
			return ctx.Err()
		}
		st.LastRun[a.Name] = time.Now()
		if err != nil {
			streak++
			st.Fails[a.Name]++
			st.Snooze[a.Name] = time.Now().Add(backoff(st.Fails[a.Name]))
			log.Error("action failed", "action", a.Name, "err", err, "fails", st.Fails[a.Name])
			if errors.Is(err, bot.ErrDenied) {
				streak = r.RestartAfter // went somewhere unexpected; reset the game
			}
			if streak >= r.RestartAfter {
				r.restart(ctx)
				streak = 0
			}
			r.save()
			continue
		}
		streak, st.Fails[a.Name] = 0, 0
		if out.Progress {
			st.LastWin[a.Name] = time.Now()
		} else if a.Snooze > 0 {
			st.Snooze[a.Name] = time.Now().Add(a.Snooze)
		}
		if out.Growth {
			st.Growth++
		}
		log.Info("action done", "action", a.Name, "progress", out.Progress, "took", time.Since(start).Round(time.Second))
		r.save()
	}
}

func (r *Runner) pick(sig screens.Signals, now time.Time) *Action {
	for _, a := range r.Actions {
		if r.State.Snoozed(a.Name, now) {
			continue
		}
		if a.Ready(sig, r.State, now) {
			return a
		}
	}
	return nil
}

func (r *Runner) save() {
	if err := r.State.Save(); err != nil {
		r.B.Log.Error("save state", "err", err)
	}
}

func backoff(fails int) time.Duration {
	return min(time.Minute<<min(fails-1, 6), time.Hour)
}

// ensureGame reconnects adb and brings the game up to the main screen.
func (r *Runner) ensureGame(ctx context.Context) error {
	d := r.B.D
	if !d.Online(ctx) {
		r.B.Log.Warn("device offline, reconnecting")
		if r.Reconnect != nil {
			if err := r.Reconnect(ctx); err != nil {
				return err
			}
		}
		if err := d.Connect(ctx); err != nil {
			return err
		}
		if !d.Online(ctx) {
			return fmt.Errorf("device %s still offline", d.Serial)
		}
	}
	if d.AppRunning(ctx, bot.Package) && d.AppFocused(ctx, bot.Package) {
		return nil
	}
	r.B.Log.Warn("game not in front, launching")
	if err := d.Launch(ctx, bot.Package); err != nil {
		return err
	}
	return r.B.WaitBoot(ctx, 4*time.Minute)
}

func (r *Runner) restart(ctx context.Context) {
	r.B.Log.Warn("restarting game after repeated failures")
	r.State.Add("restarts", 1)
	_ = r.B.D.Stop(ctx, bot.Package)
	_ = bot.Sleep(ctx, 3*time.Second)
	if err := r.B.D.Launch(ctx, bot.Package); err != nil {
		r.B.Log.Error("relaunch failed", "err", err)
		return
	}
	if err := r.B.WaitBoot(ctx, 4*time.Minute); err != nil {
		r.B.Log.Error("game did not reach main screen", "err", err)
	}
}
