package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"image"
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

// unlocked holds back ready until a new character has unlocked feature b;
// before that its page cannot be opened and every try would count as a fail.
func unlocked(b screens.Badge, ready func(sig, *st, time.Time) bool) func(sig, *st, time.Time) bool {
	return func(s sig, st *st, now time.Time) bool { return s.Unlocked(b) && ready(s, st, now) }
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
				n, landed, err := tasks.FollowGuide(ctx, b, func(p image.Point) bool {
					return stageStuck(st) && p.In(stageButton)
				})
				st.Add("guide_steps", n)
				// The guide often leads to a mode whose chore we already
				// have (the current quest wants it); run it now instead of
				// waiting for its timer.
				if err == nil && landed != screens.Main && landed != screens.Unknown {
					o, rerr := runFrom(ctx, b, st, landed)
					return out{Progress: n > 0 || o.Progress, Growth: o.Growth}, rerr
				}
				// Main-screen arrows mostly point at the current quest's
				// objective, which may not be doable yet (no tickets left);
				// the blink makes "arrow gone" unreliable, so always wait a
				// while before following again. Tutorials are handled on
				// unknown screens regardless.
				st.Snooze["guide"] = time.Now().Add(15 * time.Minute)
				return out{Progress: n > 0}, err
			}},
		{Name: "job-change", Priority: 86, Snooze: time.Hour, Ready: badge(screens.BadgeJobChange),
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.JobChange(ctx, b)
				st.Add("job_tasks_claimed", n)
				return out{Progress: n > 0}, err
			}},
		// Unfinished main quest: let the tracker take us to its objective
		// and do it. Snoozed after each try; some objectives need time.
		{Name: "quest-go", Priority: 84,
			Ready: func(s sig, st *st, _ time.Time) bool {
				// A stage quest's objective is the stage fight; hold it while
				// the stage is stuck, like the stage action does.
				return !s.QuestDone && !(s.StageQuest && stageStuck(st))
			},
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				st.Snooze["quest-go"] = time.Now().Add(15 * time.Minute)
				landed, err := tasks.QuestGo(ctx, b)
				if err != nil {
					return out{}, err
				}
				st.Add("quest_go", 1)
				return runFrom(ctx, b, st, landed)
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
		// Diamonds above the reserve go to weapon draws, then the new
		// weapons get cultivated.
		{Name: "diamond-draws", Priority: 69,
			Ready: func(_ sig, s *st, now time.Time) bool { return s.Since("diamond-draws", now) >= 3*time.Hour },
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				spent, err := tasks.DiamondDraws(ctx, b, diamondReserve)
				st.Add("diamonds_spent", spent)
				if err != nil || spent == 0 {
					return out{Progress: spent > 0}, err
				}
				c, err := tasks.WeaponCultivate(ctx, b)
				st.Add("cultivate_steps", c)
				return out{Progress: true, Growth: c > 0}, err
			}},
		{Name: "pets", Priority: 68, Snooze: time.Hour, Ready: badge(screens.BadgePet),
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.Pets(ctx, b)
				st.Add("pet_steps", n)
				return out{Progress: n > 0, Growth: n > 0}, err
			}},
		{Name: "season-pass", Priority: 45,
			Ready: func(s sig, st *st, now time.Time) bool {
				return s.SeasonPass && st.Since("season-pass", now) >= time.Hour
			},
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.SeasonPass(ctx, b)
				st.Add("pass_claims", n)
				return out{Progress: n > 0}, err
			}},
		{Name: "mail", Priority: 40,
			// Mail is in the system menu.
			Ready: func(s sig, st *st, now time.Time) bool { return s.System && st.Since("mail", now) >= 6*time.Hour },
			Run: func(ctx context.Context, b *bot.Bot, _ *st) (out, error) {
				return out{Progress: true}, tasks.Mail(ctx, b)
			}},
		{Name: "realm", Priority: 65, Snooze: time.Hour,
			Ready: unlocked(screens.BadgeGameMode, func(s sig, st *st, _ time.Time) bool {
				return !st.Daily["realm_done"] || s.Has(screens.BadgeGameMode)
			}),
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
			Ready: unlocked(screens.BadgeGameMode, func(_ sig, st *st, now time.Time) bool {
				return st.Since("baphomet", now) >= 3*time.Hour
			}),
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.Baphomet(ctx, b)
				st.Add("boss_dodges", n)
				return out{Progress: true}, err
			}},
		// Free daily claims: login event, Growth Gift, Mall freebies, Kafra
		// card rewards, check-in. Some come due during the day (Growth Gift
		// tasks), so this runs every 3 hours.
		{Name: "dailies", Priority: 64,
			Ready: func(_ sig, s *st, now time.Time) bool { return s.Since("dailies", now) >= 3*time.Hour },
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.Dailies(ctx, b)
				st.Add("daily_claims", n)
				return out{Progress: n > 0}, err
			}},
		// Guild: donations, free shop items, bargain, Guild Hunt. Its
		// dailies reset at midnight, and the bargain deal refreshes during
		// the day, so it runs every 3 hours.
		{Name: "guild", Priority: 64,
			Ready: func(_ sig, s *st, now time.Time) bool { return s.Since("guild", now) >= 3*time.Hour },
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.Guild(ctx, b)
				st.Add("guild_steps", n)
				return out{Progress: n > 0}, err
			}},
		{Name: "arena", Priority: 63,
			Ready: unlocked(screens.BadgeGameMode, func(_ sig, s *st, now time.Time) bool { return s.Since("arena", now) >= 3*time.Hour }),
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				return arenaRun(ctx, b, st)
			}},
		{Name: "mvp", Priority: 63, Snooze: time.Hour,
			Ready: unlocked(screens.BadgeGameMode, func(_ sig, st *st, _ time.Time) bool { return !st.Daily["mvp_done"] }),
			Run:   mvpRun},
		{Name: "dungeon", Priority: 62, Snooze: time.Hour,
			Ready: unlocked(screens.BadgeGameMode, func(_ sig, st *st, _ time.Time) bool { return !st.Daily["dungeon_done"] }),
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := dungeonRuns(ctx, b, st)
				return out{Progress: n > 0, Growth: n > 0}, err
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
		// Stage: retry as soon as combat power has moved since the last
		// defeat (our upgrades, or auto-equipped drops), with a back-off of
		// 5, 10, 20, 40 min while runs clear nothing; at most 45 min apart.
		{Name: "stage", Priority: 50,
			Ready: func(s sig, st *st, now time.Time) bool {
				wait := min(5*time.Minute<<min(st.StageMisses, 3), 45*time.Minute)
				since := st.Since("stage", now)
				stronger := st.Growth > 0 || screens.LevelChanged(s.Power, st.PowerAtDefeat)
				if st.StageMisses > 0 && st.PowerLost > 0 && st.Power > 0 {
					// Stuck on a stage (a chapter boss): a retry before real
					// growth loses the same way, so wait for 5% more power.
					return since >= 3*time.Hour || (since >= wait && !stageStuck(st))
				}
				return since >= 45*time.Minute || (since >= wait && stronger)
			},
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				// Read the label now: quests and guide arrows also fight
				// stages, so st.Stage can be behind, and a loss on the next
				// stage would read as a clear and reset the misses.
				before := st.Stage
				if id, f, err := b.Look(ctx); err == nil && id == screens.Main {
					if s := screens.ReadMain(f).Stage; s != "" {
						before = s
					}
				}
				lost, err := tasks.Stage(ctx, b)
				if lost {
					st.Growth, st.LastDefeat = 0, time.Now()
					st.PowerAtDefeat, st.PowerLost = st.PowerNow, st.Power
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

// stageButton is the main screen's Stage Challenge button.
var stageButton = image.Rect(600, 990, 720, 1110)

// stageStuck reports a stage that keeps being lost at today's power: no
// retry pays until power is 5% above the last defeat.
func stageStuck(st *st) bool {
	return st.StageMisses > 0 && st.PowerLost > 0 && st.Power > 0 &&
		float64(st.Power) < 1.05*float64(st.PowerLost)
}

// arenaRun spends Rune Arena tickets and claims tier rewards. It is not yet
// known when tickets refill, so it checks every three hours; a check with
// no tickets and nothing to claim costs about a minute.
func arenaRun(ctx context.Context, b *bot.Bot, st *st) (out, error) {
	fights, claimed, err := tasks.Arena(ctx, b)
	st.Add("arena_fights", fights)
	st.Add("arena_tier_rewards", claimed)
	st.LastRun["arena"] = time.Now()
	return out{Progress: fights+claimed > 0}, err
}

// dungeonRuns spends dungeon attempts until the game greys out Auto Match;
// that, not a local count, ends dungeons for the game day.
func dungeonRuns(ctx context.Context, b *bot.Bot, st *st) (int, error) {
	if st.Daily["dungeon_done"] {
		return 0, b.ToMain(ctx)
	}
	n, err := tasks.Dungeon(ctx, b, 5)
	if errors.Is(err, tasks.ErrNoAttempts) {
		st.Daily["dungeon_done"] = true
		err = b.ToMain(ctx)
	}
	st.Add("dungeon_runs", n)
	st.LastRun["dungeon"] = time.Now()
	return n, err
}

// runFrom runs the chore that belongs to the screen a quest or guide arrow
// led to. Unknown means a battle probably started (stage quests).
func runFrom(ctx context.Context, b *bot.Bot, st *st, landed screens.ID) (out, error) {
	switch landed {
	case screens.Baphomet:
		n, err := tasks.Baphomet(ctx, b)
		st.Add("boss_dodges", n)
		st.LastRun["baphomet"] = time.Now()
		return out{Progress: err == nil}, err
	case screens.MVP:
		return mvpRun(ctx, b, st)
	case screens.Dungeon:
		n, err := dungeonRuns(ctx, b, st)
		return out{Progress: n > 0, Growth: n > 0}, err
	case screens.RuneArena, screens.ArenaOpponents, screens.ArenaTierRewards:
		return arenaRun(ctx, b, st)
	case screens.Realm:
		done := map[string]bool{}
		for _, t := range tasks.RealmTabs {
			done[t.Name] = st.Daily["realm_challenge_"+t.Name]
		}
		n, c, err := tasks.Realm(ctx, b, done)
		for _, name := range c {
			st.Daily["realm_challenge_"+name] = true
		}
		st.Add("realm_sweeps", n)
		return out{Progress: n+len(c) > 0, Growth: n > 0}, err
	case screens.WeaponGacha, screens.WeaponCultivate:
		n, err := tasks.WeaponGacha(ctx, b)
		if err != nil {
			return out{}, err
		}
		c, err := tasks.WeaponCultivate(ctx, b)
		return out{Progress: n+c > 0, Growth: c > 0}, err
	case screens.Equipment, screens.Enhance, screens.CardPage:
		n, err := tasks.Equipment(ctx, b)
		st.Add("enhance_levels", n)
		return out{Progress: n > 0, Growth: n > 0}, err
	case screens.PetGacha, screens.PetCultivate:
		n, err := tasks.Pets(ctx, b)
		return out{Progress: n > 0, Growth: n > 0}, err
	case screens.Attribute, screens.CharOverview, screens.CharSkill:
		ok, err := tasks.Attributes(ctx, b)
		return out{Progress: ok, Growth: ok}, err
	case screens.SummonUpgrade:
		n, err := tasks.SummonUpgrade(ctx, b)
		return out{Progress: n > 0}, err
	case screens.QuestPanel:
		n, err := tasks.QuestPanel(ctx, b)
		return out{Progress: n > 0}, err
	case screens.Unknown, screens.InCombat:
		// Stage quests start the stage battle straight from the tracker.
		lost, err := tasks.WaitStage(ctx, b)
		if lost {
			st.Growth, st.LastDefeat = 0, time.Now()
		}
		return out{Progress: !lost}, err
	}
	return out{}, b.ToMain(ctx)
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
	r.ProgressFile = filepath.Join(filepath.Dir(*path), "progress.csv")
	if t, ok := newVMOSTunnel(b.Log); ok && (!serialGiven || d.Serial == "localhost:15555") {
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

// diamondReserve is kept back from diamond spending for weekly Mall deals
// (100 weapon coins for 200 diamonds once unlocked) and events.
const diamondReserve = 1000

func cmdDiamonds(ctx context.Context, d *device.Device, _ []string) error {
	spent, err := tasks.DiamondDraws(ctx, newBot(d), diamondReserve)
	fmt.Println("spent", spent)
	return err
}

// mvpRun challenges the MVP boss and spends the day's sweeps.
func mvpRun(ctx context.Context, b *bot.Bot, st *st) (out, error) {
	challenged, sweeps, done, err := tasks.MVP(ctx, b)
	st.Add("mvp_sweeps", sweeps)
	if done {
		st.Daily["mvp_done"] = true
	}
	return out{Progress: challenged || sweeps > 0}, err
}

func cmdDailies(ctx context.Context, d *device.Device, _ []string) error {
	n, err := tasks.Dailies(ctx, newBot(d))
	fmt.Println("claimed", n)
	return err
}

func cmdGuild(ctx context.Context, d *device.Device, _ []string) error {
	n, err := tasks.Guild(ctx, newBot(d))
	fmt.Println("steps", n)
	return err
}

func cmdMVP(ctx context.Context, d *device.Device, _ []string) error {
	challenged, sweeps, done, err := tasks.MVP(ctx, newBot(d))
	fmt.Println("challenged", challenged, "sweeps", sweeps, "done", done)
	return err
}

func cmdArena(ctx context.Context, d *device.Device, _ []string) error {
	fights, claimed, err := tasks.Arena(ctx, newBot(d))
	fmt.Println("fights", fights, "tier rewards", claimed)
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

func cmdObjective(ctx context.Context, d *device.Device, _ []string) error {
	b := newBot(d)
	s, err := state.Load("data/state.json")
	if err != nil {
		return err
	}
	landed, err := tasks.QuestGo(ctx, b)
	if err != nil {
		return err
	}
	o, err := runFrom(ctx, b, s, landed)
	fmt.Println("landed", landed, "progress", o.Progress)
	if serr := s.Save(); serr != nil && err == nil {
		err = serr
	}
	return err
}

func cmdDungeon(ctx context.Context, d *device.Device, _ []string) error {
	n, err := tasks.Dungeon(ctx, newBot(d), 1)
	fmt.Println("runs", n)
	return err
}
