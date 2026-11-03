// Package runner schedules tasks forever and keeps the game alive between them.
package runner

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/affddn/rogo/internal/bot"
)

type Job struct {
	Name  string
	Every time.Duration
	Run   func(ctx context.Context, b *bot.Bot) error

	next  time.Time
	fails int
}

type Runner struct {
	B    *bot.Bot
	Jobs []*Job
	// JobTimeout bounds one task run; a hung UI flow should not stall the loop.
	JobTimeout time.Duration
	// RestartAfter consecutive failed runs (any job) force-stops and relaunches the game.
	RestartAfter int
}

func New(b *bot.Bot, jobs ...*Job) *Runner {
	return &Runner{B: b, Jobs: jobs, JobTimeout: 6 * time.Minute, RestartAfter: 3}
}

func (r *Runner) Run(ctx context.Context) error {
	log := r.B.Log
	streak := 0
	for {
		if err := r.ensureGame(ctx); err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			log.Error("game not ready", "err", err)
			if err := sleep(ctx, time.Minute); err != nil {
				return err
			}
			continue
		}

		j := r.due()
		if wait := time.Until(j.next); wait > 0 {
			if err := sleep(ctx, wait); err != nil {
				return err
			}
			continue // re-check the game before running
		}

		start := time.Now()
		jctx, cancel := context.WithTimeout(ctx, r.JobTimeout)
		err := j.Run(jctx, r.B)
		cancel()
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err != nil {
			j.fails++
			streak++
			j.next = time.Now().Add(backoff(j.Every, j.fails))
			log.Error("job failed", "job", j.Name, "err", err, "fails", j.fails, "retry", j.next.Format("15:04:05"))
			if errors.Is(err, bot.ErrDenied) {
				// A deny-listed screen means the flow went somewhere unexpected;
				// let a restart put the game back in a known state.
				streak = r.RestartAfter
			}
			if streak >= r.RestartAfter {
				r.restart(ctx)
				streak = 0
			}
			continue
		}
		j.fails, streak = 0, 0
		j.next = time.Now().Add(j.Every)
		log.Info("job done", "job", j.Name, "took", time.Since(start).Round(time.Second), "next", j.next.Format("15:04:05"))
	}
}

// due returns the job with the earliest next run time.
func (r *Runner) due() *Job {
	best := r.Jobs[0]
	for _, j := range r.Jobs[1:] {
		if j.next.Before(best.next) {
			best = j
		}
	}
	return best
}

func backoff(every time.Duration, fails int) time.Duration {
	d := time.Minute << min(fails-1, 5)
	return min(d, every)
}

// ensureGame reconnects adb and brings the game to the main screen.
func (r *Runner) ensureGame(ctx context.Context) error {
	d := r.B.D
	if !d.Online(ctx) {
		r.B.Log.Warn("device offline, reconnecting")
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
	_ = r.B.D.Stop(ctx, bot.Package)
	_ = sleep(ctx, 3*time.Second)
	if err := r.B.D.Launch(ctx, bot.Package); err != nil {
		r.B.Log.Error("relaunch failed", "err", err)
		return
	}
	if err := r.B.WaitBoot(ctx, 4*time.Minute); err != nil {
		r.B.Log.Error("game did not reach main screen", "err", err)
	}
}

func sleep(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}
