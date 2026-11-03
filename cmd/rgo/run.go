package main

import (
	"context"
	"flag"
	"fmt"
	"path/filepath"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/device"
	"github.com/affddn/rogo/internal/runner"
	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/state"
	"github.com/affddn/rogo/internal/tasks"
)

func cmdBoot(ctx context.Context, d *device.Device, _ []string) error {
	b := newBot(d)
	if !d.AppRunning(ctx, bot.Package) {
		if err := d.Launch(ctx, bot.Package); err != nil {
			return err
		}
	}
	return b.WaitBoot(ctx, 4*time.Minute)
}

type (
	sig = screens.Signals
	st  = state.State
	out = runner.Outcome
)

func badge(b screens.Badge) func(sig, *st, time.Time) bool {
	return func(s sig, _ *st, _ time.Time) bool { return s.Has(b) }
}

// actions is the state machine's playbook. Badges and the quest tracker are
// the game telling us something is ready; timers cover what it does not flag.
func actions() []*runner.Action {
	return []*runner.Action{
		{Name: "auto-summon", Priority: 100, Snooze: 30 * time.Minute, Ready: badge(screens.BadgeAuto),
			Run: func(ctx context.Context, b *bot.Bot, _ *st) (out, error) {
				on, err := tasks.AutoSummon(ctx, b)
				return out{Progress: on}, err
			}},
		{Name: "quests", Priority: 90, Snooze: 5 * time.Minute,
			Ready: func(s sig, _ *st, _ time.Time) bool { return s.QuestDone },
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.MainQuest(ctx, b)
				st.Add("quests_claimed", n)
				return out{Progress: n > 0}, err
			}},
		{Name: "quest-panel", Priority: 88, Snooze: 20 * time.Minute, Ready: badge(screens.BadgeQuest),
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.QuestPanel(ctx, b)
				st.Add("quest_panel_claims", n)
				return out{Progress: n > 0}, err
			}},
		{Name: "guide", Priority: 87, Snooze: 20 * time.Minute,
			Ready: func(s sig, _ *st, _ time.Time) bool { return s.HasArrow },
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.FollowGuide(ctx, b)
				st.Add("guide_steps", n)
				if err != nil {
					return out{}, err
				}
				// Done only if the guidance moved on; an arrow still on main
				// (e.g. towards a mode with no tickets left) gets snoozed.
				_, f, err := b.Look(ctx)
				if err != nil {
					return out{}, err
				}
				_, still := screens.FindGuideArrow(f)
				return out{Progress: !still, Growth: !still}, nil
			}},
		{Name: "job-change", Priority: 86, Snooze: time.Hour, Ready: badge(screens.BadgeJobChange),
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.JobChange(ctx, b)
				st.Add("job_tasks_claimed", n)
				return out{Progress: n > 0}, err
			}},
		{Name: "summon-upgrade", Priority: 85, Snooze: time.Hour, Ready: badge(screens.BadgeSummon),
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.SummonUpgrade(ctx, b)
				st.Add("summon_upgrade_stages", n)
				return out{Progress: n > 0}, err
			}},
		// Points only arrive on level-up, and the Character badge also lights
		// for cosmetics, so wait for the level text to change.
		{Name: "attributes", Priority: 80, Snooze: 10 * time.Minute,
			Ready: func(s sig, st *st, _ time.Time) bool {
				return s.Has(screens.BadgeCharacter) && screens.LevelChanged(s.Level, st.Level)
			},
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				seen := st.Seen
				spent, err := tasks.Attributes(ctx, b)
				if err == nil {
					st.Level = seen
				}
				if spent {
					st.Add("attribute_allocations", 1)
				}
				return out{Progress: spent, Growth: spent}, err
			}},
		{Name: "equipment", Priority: 75, Snooze: 30 * time.Minute, Ready: badge(screens.BadgeEquipment),
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.Equipment(ctx, b)
				st.Add("enhance_levels", n)
				return out{Progress: n > 0, Growth: n > 0}, err
			}},
		{Name: "weapon", Priority: 70, Snooze: 2 * time.Hour, Ready: badge(screens.BadgeWeapon),
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.WeaponGacha(ctx, b)
				st.Add("gacha_batches", n)
				if err != nil {
					return out{Progress: n > 0}, err
				}
				// Fresh pulls are only worth power once activated and levelled.
				c, err := tasks.WeaponCultivate(ctx, b)
				st.Add("cultivate_steps", c)
				return out{Progress: n+c > 0, Growth: c > 0}, err
			}},
		{Name: "pets", Priority: 68, Snooze: time.Hour, Ready: badge(screens.BadgePet),
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.Pets(ctx, b)
				st.Add("pet_steps", n)
				return out{Progress: n > 0, Growth: n > 0}, err
			}},
		{Name: "season-pass", Priority: 45,
			Ready: func(_ sig, st *st, now time.Time) bool { return st.Since("season-pass", now) >= time.Hour },
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.SeasonPass(ctx, b)
				st.Add("pass_claims", n)
				return out{Progress: n > 0}, err
			}},
		{Name: "mail", Priority: 40,
			Ready: func(_ sig, st *st, now time.Time) bool { return st.Since("mail", now) >= 6*time.Hour },
			Run: func(ctx context.Context, b *bot.Bot, _ *st) (out, error) {
				return out{Progress: true}, tasks.Mail(ctx, b)
			}},
		{Name: "realm", Priority: 65, Snooze: time.Hour,
			Ready: func(s sig, st *st, _ time.Time) bool { return !st.Daily["realm_done"] || s.Has(screens.BadgeGameMode) },
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				done := map[string]bool{}
				for _, t := range tasks.RealmTabs {
					done[t.Name] = st.Daily["realm_challenge_"+t.Name]
				}
				sweeps, challenged, err := tasks.Realm(ctx, b, done)
				for _, n := range challenged {
					st.Daily["realm_challenge_"+n] = true
				}
				st.Add("realm_sweeps", sweeps)
				if err == nil && sweeps == 0 {
					st.Daily["realm_done"] = true
				}
				return out{Progress: sweeps+len(challenged) > 0, Growth: sweeps > 0}, err
			}},
		{Name: "baphomet", Priority: 55,
			Ready: func(_ sig, st *st, now time.Time) bool { return st.Since("baphomet", now) >= 3*time.Hour },
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.Baphomet(ctx, b)
				st.Add("boss_dodges", n)
				return out{Progress: true}, err
			}},
		{Name: "income", Priority: 60,
			Ready: func(_ sig, s *st, now time.Time) bool {
				return !s.Daily["quick_idle"] || s.Since("income", now) >= 2*time.Hour
			},
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				left, err := tasks.Income(ctx, b)
				if err == nil && !left {
					st.Daily["quick_idle"] = true
				}
				return out{Progress: true}, err
			}},
		// Stage retries back off while runs clear nothing: 5, 10, 20 ... 120
		// minutes, and each needs some growth since the last defeat.
		{Name: "stage", Priority: 50,
			Ready: func(_ sig, s *st, now time.Time) bool {
				wait := min(5*time.Minute<<min(s.StageMisses, 5), 2*time.Hour)
				since := s.Since("stage", now)
				return since >= 2*time.Hour || (since >= wait && s.Growth > 0)
			},
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				before := st.Stage
				if before == "" { // first run: read the label now
					if _, f, err := b.Look(ctx); err == nil {
						before = screens.ReadMain(f).Stage
					}
				}
				lost, err := tasks.Stage(ctx, b)
				if lost {
					st.Growth, st.LastDefeat = 0, time.Now()
				}
				st.Add("stage_runs", 1)
				if err != nil {
					return out{}, err
				}
				_, frame, lerr := b.Look(ctx)
				if lerr != nil {
					return out{}, lerr
				}
				after := screens.ReadMain(frame).Stage
				st.Stage = after
				cleared := before != "" && screens.LevelChanged(before, after)
				if cleared {
					st.StageMisses = 0
					st.Add("stage_clear_runs", 1)
				} else {
					st.StageMisses++
				}
				return out{Progress: cleared}, nil
			}},
	}
}

func cmdRun(ctx context.Context, d *device.Device, args []string) error {
	fs := flag.NewFlagSet("run", flag.ContinueOnError)
	path := fs.String("state", "data/state.json", "where progress is persisted")
	if err := fs.Parse(args); err != nil {
		return err
	}
	s, err := state.Load(*path)
	if err != nil {
		return err
	}
	b := newBot(d)
	r := runner.New(b, s, actions()...)
	r.PauseFile = filepath.Join(filepath.Dir(*path), "pause")
	if t, ok := newVMOSTunnel(b.Log); ok {
		if err := t.Start(ctx); err != nil {
			return err
		}
		d.Serial = "localhost:15555"
		r.Reconnect = t.Refresh
	}
	return r.Run(ctx)
}

func cmdStage(ctx context.Context, d *device.Device, _ []string) error {
	_, err := tasks.Stage(ctx, newBot(d))
	return err
}

func cmdGacha(ctx context.Context, d *device.Device, _ []string) error {
	n, err := tasks.WeaponGacha(ctx, newBot(d))
	fmt.Println("batches", n)
	return err
}

func cmdRealm(ctx context.Context, d *device.Device, _ []string) error {
	n, c, err := tasks.Realm(ctx, newBot(d), map[string]bool{})
	fmt.Println("sweeps", n, "challenged", c)
	return err
}

func cmdBaphomet(ctx context.Context, d *device.Device, _ []string) error {
	n, err := tasks.Baphomet(ctx, newBot(d))
	fmt.Println("dodges", n)
	return err
}

func cmdQuestPanel(ctx context.Context, d *device.Device, _ []string) error {
	n, err := tasks.QuestPanel(ctx, newBot(d))
	fmt.Println("claimed", n)
	return err
}

func cmdPets(ctx context.Context, d *device.Device, _ []string) error {
	n, err := tasks.Pets(ctx, newBot(d))
	fmt.Println("steps", n)
	return err
}
