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

// jobTarget is the Job level Assassin Cross needs.
const jobTarget = 30

// quickIdleMaxPrice caps a paid Quick Idle: 100, then 150, then 200. The
// game greys the button out after those three a day, so the cap of 300
// (owner's call, 5 Nov) only matters if the limit changes. An hour of
// income returns about 75 diamonds of its own.
const quickIdleMaxPrice = 300

// jobEXPDue holds diamonds for Quick Idles until Job 30 has been seen once
// (the level restarts after the job change). A free account buys none: at
// 100 to 200 diamonds an hour of income they cost 20 to 40 weapon draws,
// and Job 30 comes with the stages anyway (Simao, Hunter: its Job 30 task
// opens only after 7-6, 10 Nov).
func jobEXPDue(s *st) bool { return !s.F2P && s.Counters["job_target_reached"] == 0 }

// wakeQuest unmutes quest-go: a quest whose objective could not be done
// waits 15 minutes, but a new quest or growth may unblock it sooner.
var wakeQuest = []string{"quest-go"}

// actions is the state machine's playbook. Badges and the quest tracker are
// the game telling us something is ready; timers cover what it does not flag.
func actions() []*runner.Action {
	return []*runner.Action{
		{Name: "auto-summon", Priority: 100, Snooze: 30 * time.Minute, Ready: badge(screens.BadgeAuto),
			Run: func(ctx context.Context, b *bot.Bot, _ *st) (out, error) {
				on, err := tasks.AutoSummon(ctx, b)
				return out{Progress: on}, err
			}},
		{Name: "quests", Wakes: wakeQuest, Priority: 90, Snooze: 5 * time.Minute,
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
		{Name: "job-change", Wakes: wakeQuest, Priority: 86, Snooze: time.Hour, Ready: badge(screens.BadgeJobChange),
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.JobChange(ctx, b)
				st.Add("job_tasks_claimed", n)
				return out{Progress: n > 0}, err
			}},
		// Unfinished main quest: let the tracker take us to its objective
		// and do it. Quests pay most of the growth, so this comes right
		// after claiming them and one that moved goes straight on to the
		// next; one that could not be done (no tickets left, nothing to do
		// there yet) waits 15 minutes, or less if a new quest or growth
		// comes first (wakeQuest).
		{Name: "quest-go", Priority: 89,
			Ready: func(s sig, st *st, _ time.Time) bool {
				// A stage quest's objective is the stage fight; hold it while
				// the stage is stuck, like the stage action does.
				return !s.QuestDone && !(s.StageQuest && stageStuck(st))
			},
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				landed, err := tasks.QuestGo(ctx, b)
				if err == nil {
					st.Add("quest_go", 1)
					var o out
					if o, err = runFrom(ctx, b, st, landed); err == nil && o.Progress {
						return o, nil
					}
				}
				st.Snooze["quest-go"] = time.Now().Add(15 * time.Minute)
				return out{}, err
			}},
		// Job 30 is the last level gate for Assassin Cross: diamonds buy
		// Quick Idles (100 for an hour of income) until it is reached, as
		// they arrive. Owner's call, 5 Nov.
		{Name: "job-exp", Wakes: wakeQuest, Priority: 86,
			Ready: func(_ sig, s *st, now time.Time) bool {
				return jobEXPDue(s) && s.Since("job-exp", now) >= time.Hour
			},
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, job, err := tasks.PaidQuickIdles(ctx, b, jobTarget, st.Counters["job_level"], quickIdleMaxPrice, 20)
				st.Add("paid_quick_idles", n)
				// A level below the last one read means the job change came
				// between runs, Job 30 never seen: on 7 Nov the bot last
				// read 28, then Job 1, and kept holding diamonds back.
				if job >= jobTarget || (job > 0 && job < st.Counters["job_level"]) {
					st.Counters["job_target_reached"] = 1
				}
				if job > 0 {
					st.Counters["job_level"] = job
				}
				return out{Progress: n > 0, Growth: n > 0}, err
			}},
		{Name: "summon-upgrade", Wakes: wakeQuest, Priority: 85, Snooze: time.Hour, Ready: badge(screens.BadgeSummon),
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.SummonUpgrade(ctx, b)
				st.Add("summon_upgrade_stages", n)
				return out{Progress: n > 0}, err
			}},
		// Points mostly arrive on level-up, and the Character badge also
		// lights for cosmetics, so wait for the level text to change.
		{Name: "attributes", Wakes: wakeQuest, Priority: 80, Snooze: 10 * time.Minute,
			Ready: func(s sig, st *st, now time.Time) bool {
				// Also every few hours under the badge: points can come back
				// without a level-up (a stat reset), or be left by a run cut
				// short.
				return s.Has(screens.BadgeCharacter) &&
					(screens.LevelChanged(s.Level, st.Level) || st.Since("attributes", now) >= 3*time.Hour)
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
		{Name: "equipment", Wakes: wakeQuest, Priority: 75, Snooze: 30 * time.Minute, Ready: badge(screens.BadgeEquipment),
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.Equipment(ctx, b)
				st.Add("enhance_levels", n)
				return out{Progress: n > 0, Growth: n > 0}, err
			}},
		// Also once a day for the ad draw, which lights no badge without
		// the Lifetime Card.
		{Name: "weapon", Wakes: wakeQuest, Priority: 70, Snooze: 2 * time.Hour,
			Ready: func(s sig, st *st, _ time.Time) bool {
				return s.Has(screens.BadgeWeapon) || !st.Daily["weapon_ad"]
			},
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.WeaponGacha(ctx, b)
				st.Add("gacha_batches", n)
				if err != nil {
					return out{Progress: n > 0}, err
				}
				st.Daily["weapon_ad"] = true
				// Fresh pulls are only worth power once activated and levelled.
				c, err := tasks.WeaponCultivate(ctx, b)
				st.Add("cultivate_steps", c)
				return out{Progress: n+c > 0, Growth: c > 0}, err
			}},
		// Diamonds above the reserve go to weapon draws, then the new
		// weapons get cultivated.
		{Name: "diamond-draws", Wakes: wakeQuest, Priority: 69,
			Ready: func(_ sig, s *st, now time.Time) bool {
				// Pet draws come first until the Draw Level opens the
				// second Blessing slot, then Quick Idles until Job 30.
				return !petDrawsDue(s) && !jobEXPDue(s) && s.Since("diamond-draws", now) >= 3*time.Hour
			},
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
		{Name: "pets", Wakes: wakeQuest, Priority: 68, Snooze: time.Hour,
			Ready: func(s sig, st *st, now time.Time) bool {
				return s.Has(screens.BadgePet) || (petDrawsDue(st) && st.Since("pets", now) >= 3*time.Hour)
			},
			Run: petsRun},
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
		// Mode coins buy metal, refine meteorites and Star Powder; limits
		// reset daily or weekly and coins trickle in, so every few hours.
		{Name: "shop", Priority: 66,
			Ready: func(_ sig, s *st, now time.Time) bool { return s.Since("shop", now) >= 4*time.Hour },
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.Shop(ctx, b)
				st.Add("shop_lots", n)
				return out{Progress: n > 0}, err
			}},
		// Chests land in the Backpack (card albums from events, logins);
		// the System badge covers it among others.
		{Name: "backpack", Priority: 64,
			Ready: func(s sig, st *st, now time.Time) bool {
				return s.Has(screens.BadgeSystem) && st.Since("backpack", now) >= 2*time.Hour
			},
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.Backpack(ctx, b)
				return out{Progress: n > 0, Growth: n > 0}, err
			}},
		// Left-rail events: Login Rewards (daily, card tickets among them)
		// and the Arcane Card Trove, drawn once per ticket.
		{Name: "login-rewards", Priority: 64,
			Ready: func(_ sig, s *st, _ time.Time) bool { return !s.Daily["login_rewards"] },
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.LoginRewards(ctx, b)
				if err == nil {
					st.Daily["login_rewards"] = true
				}
				return out{Progress: n > 0}, err
			}},
		{Name: "card-trove", Priority: 63,
			Ready: func(_ sig, s *st, now time.Time) bool { return s.Since("card-trove", now) >= 4*time.Hour },
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.CardTrove(ctx, b)
				st.Add("trove_draws", n)
				return out{Progress: n > 0, Growth: n > 0}, err
			}},
		// The top three of each ranking tab pay 20 diamonds a like, daily.
		{Name: "ranking", Priority: 64,
			Ready: func(_ sig, s *st, _ time.Time) bool { return !s.Daily["ranking_likes"] },
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.RankingLikes(ctx, b)
				if err == nil {
					st.Daily["ranking_likes"] = true
				}
				return out{Progress: n > 0}, err
			}},
		// Endless Tower: the free daily sweep, then Challenge attempts while
		// they climb; one that clears nothing ends the climb for the day.
		{Name: "tower", Wakes: wakeQuest, Priority: 62,
			Ready: unlocked(screens.BadgeGameMode, func(_ sig, s *st, now time.Time) bool {
				return !s.Daily["tower_swept"] || (!s.Daily["tower_stuck"] && s.Since("tower", now) >= 3*time.Hour)
			}),
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				var o out
				for range 4 {
					res, err := tasks.EndlessTower(ctx, b, !st.Daily["tower_stuck"])
					if err != nil {
						return o, err
					}
					st.Daily["tower_swept"] = true
					o.Progress = o.Progress || res.Swept || res.Climbed
					if res.Spent {
						st.Daily["tower_stuck"] = true
					}
					if !res.Challenged {
						break
					}
					st.Add("tower_challenges", 1)
					if !res.Climbed {
						st.Daily["tower_stuck"] = true
						break
					}
					o.Growth = true
				}
				return o, nil
			}},
		// Collection Wish: tickets (tower sweep and floors) and the daily
		// ad wish draw Collection Equipment shards; the equipment pass then
		// activates what they complete.
		{Name: "collection-wish", Priority: 66,
			Ready: func(_ sig, s *st, now time.Time) bool { return s.Since("collection-wish", now) >= 3*time.Hour },
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				n, err := tasks.CollectionWish(ctx, b)
				st.Add("collection_wishes", n)
				return out{Progress: n > 0}, err
			}},
		{Name: "arena", Priority: 63,
			Ready: unlocked(screens.BadgeGameMode, func(_ sig, s *st, now time.Time) bool { return s.Since("arena", now) >= 3*time.Hour }),
			Run: func(ctx context.Context, b *bot.Bot, st *st) (out, error) {
				return arenaRun(ctx, b, st)
			}},
		{Name: "mvp", Priority: 63, Snooze: time.Hour,
			Ready: unlocked(screens.BadgeGameMode, func(_ sig, st *st, _ time.Time) bool { return !st.Daily["mvp_done"] }),
			Run:   func(ctx context.Context, b *bot.Bot, st *st) (out, error) { return mvpRun(ctx, b, st, false) }},
		// Dungeon: the three daily clears. Helper runs are left to quests
		// that ask for one: on 6 Nov four of them paid no Helper Coins and
		// left "Assist Attempts: 5/5" as it was (rgo dungeon assists).
		{Name: "dungeon", Wakes: wakeQuest, Priority: 62, Snooze: time.Hour,
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
		{Name: "stage", Wakes: wakeQuest, Priority: 50,
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
				if st.Stage != "" && screens.LevelChanged(st.Stage, before) {
					st.StageClear = time.Now() // cleared since the last run
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
					st.StageMisses, st.StageClear = 0, time.Now()
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

// countAssists books helper runs, today's and all-time.
func countAssists(st *st, n int) {
	st.Today["dungeon_assists"] += n
	st.Add("dungeon_assists", n)
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
		return mvpRun(ctx, b, st, true)
	case screens.Dungeon:
		n, err := dungeonRuns(ctx, b, st)
		if err == nil && n == 0 && st.Daily["dungeon_done"] {
			// The quest wants a dungeon joined and today's attempts are
			// spent; an assist counts.
			ok, err := tasks.DungeonAssist(ctx, b)
			if ok {
				countAssists(st, 1)
			}
			return out{Progress: ok}, err
		}
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
		return petsRun(ctx, b, st)
	case screens.Attribute, screens.CharOverview, screens.CharSkill:
		ok, err := tasks.Attributes(ctx, b)
		return out{Progress: ok, Growth: ok}, err
	case screens.SummonUpgrade:
		n, err := tasks.SummonUpgrade(ctx, b)
		return out{Progress: n > 0}, err
	case screens.QuestPanel:
		n, err := tasks.QuestPanel(ctx, b)
		return out{Progress: n > 0}, err
	case screens.Unknown, screens.InCombat, screens.Loading:
		// Stage quests and guide arrows start the stage battle straight
		// from main (often still loading); WaitStage watches from the
		// first second, as the Dodge prompt comes early, and gives up on
		// anything that turns out not to be a stage.
		lost, err := tasks.WaitStage(ctx, b)
		// A new stage label means this fight (or one before it) cleared a
		// stage; book it so the stall check sees quest and guide clears.
		if id, f, lerr := b.Look(ctx); err == nil && lerr == nil && id == screens.Main {
			if s := screens.ReadMain(f).Stage; s != "" {
				if st.Stage != "" && screens.LevelChanged(st.Stage, s) {
					st.StageMisses, st.StageClear = 0, time.Now()
				}
				st.Stage = s
			}
		}
		if lost {
			// Book it like the stage action does, so the stuck-stage rule
			// (and the guide's skip) wait for 5% more power.
			st.Growth, st.LastDefeat = 0, time.Now()
			st.PowerAtDefeat, st.PowerLost = st.PowerNow, st.Power
			st.StageMisses++
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

// mvpRun challenges the MVP bosses and spends the day's sweeps; for a
// quest it also challenges a boss whose tab is not badged.
func mvpRun(ctx context.Context, b *bot.Bot, st *st, quest bool) (out, error) {
	challenged, sweeps, done, err := tasks.MVP(ctx, b, quest)
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

func cmdMVP(ctx context.Context, d *device.Device, args []string) error {
	challenged, sweeps, done, err := tasks.MVP(ctx, newBot(d), len(args) > 0 && args[0] == "quest")
	fmt.Println("challenged", challenged, "sweeps", sweeps, "done", done)
	return err
}

func cmdQuickIdle(ctx context.Context, d *device.Device, args []string) error {
	n, job, err := tasks.PaidQuickIdles(ctx, newBot(d), jobTarget, 0, quickIdleMaxPrice, 1)
	fmt.Println("paid quick idles", n, "job", job)
	return err
}

func cmdWish(ctx context.Context, d *device.Device, _ []string) error {
	n, err := tasks.CollectionWish(ctx, newBot(d))
	fmt.Println("wishes", n)
	return err
}

func cmdTower(ctx context.Context, d *device.Device, args []string) error {
	res, err := tasks.EndlessTower(ctx, newBot(d), len(args) > 0 && args[0] == "challenge")
	fmt.Printf("%+v\n", res)
	return err
}

func cmdTrove(ctx context.Context, d *device.Device, _ []string) error {
	b := newBot(d)
	l, err := tasks.LoginRewards(ctx, b)
	fmt.Println("login rewards", l)
	if err != nil {
		return err
	}
	n, err := tasks.CardTrove(ctx, b)
	fmt.Println("trove draws", n)
	return err
}

func cmdBackpack(ctx context.Context, d *device.Device, _ []string) error {
	n, err := tasks.Backpack(ctx, newBot(d))
	fmt.Println("used", n)
	return err
}

func cmdRanking(ctx context.Context, d *device.Device, _ []string) error {
	n, err := tasks.RankingLikes(ctx, newBot(d))
	fmt.Println("likes", n)
	return err
}

func cmdShop(ctx context.Context, d *device.Device, _ []string) error {
	n, err := tasks.Shop(ctx, newBot(d))
	fmt.Println("lots bought", n)
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
	n, lvl, err := tasks.Pets(ctx, newBot(d), petDrawReserve)
	fmt.Println("steps", n, "draw level", lvl)
	return err
}

// petDrawReserve is kept back from pet draws. The owner chose to spend the
// whole balance on reaching Draw Level 3 (5 Nov); the draw dialog stops at
// the draws left to the next level, so nothing is spent past it.
const petDrawReserve = 0

// petsRun works the pet pages, spending diamonds above petDrawReserve on
// pet draws while the Draw Level is under 3, and keeps the level it read.
func petsRun(ctx context.Context, b *bot.Bot, st *st) (out, error) {
	n, lvl, err := tasks.Pets(ctx, b, petDrawReserve)
	st.Add("pet_steps", n)
	if err == nil {
		st.Counters["pet_draw_level"] = lvl
	}
	return out{Progress: n > 0, Growth: n > 0}, err
}

// petDrawsDue reports a pet Draw Level under 3 (0 is 3 or more, or not
// read yet): diamonds go to pet draws until then.
func petDrawsDue(st *st) bool {
	lvl := st.Counters["pet_draw_level"]
	return lvl == 1 || lvl == 2
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

func cmdDungeon(ctx context.Context, d *device.Device, args []string) error {
	if len(args) > 0 && args[0] == "assists" {
		n, err := tasks.DungeonAssists(ctx, newBot(d), 5)
		fmt.Println("assists", n)
		return err
	}
	n, err := tasks.Dungeon(ctx, newBot(d), 1)
	fmt.Println("runs", n)
	return err
}

func cmdPass(ctx context.Context, d *device.Device, _ []string) error {
	n, err := tasks.SeasonPass(ctx, newBot(d))
	fmt.Println("claimed tabs", n)
	return err
}
