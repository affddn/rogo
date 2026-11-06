package tasks

import (
	"context"
	"errors"
	"image"
	"time"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/device"
	"github.com/affddn/rogo/internal/screens"
)

var (
	// dungeonTile is the Dungeon tile on the Game Mode page.
	dungeonTile = image.Pt(190, 790)
	// The match popup's Accept button and the rows it sits in. The popup
	// only lasts ~10 s, so these rows are polled with fast band captures.
	dungeonAccept   = image.Pt(510, 872)
	dungeonAcceptRY = [2]int{830, 915}
	// The arrows to the previous and next (harder) dungeon. The page can
	// open on the last one viewed.
	dungeonPrev = image.Pt(170, 320)
	dungeonNext = image.Pt(548, 320)
)

// dungeonRecommended is each dungeon's recommended combat power as the game
// shows it (1. South Gate Beginner, 2. Sewer Nightmare, 3. Deep Sea
// Phantom, which also needs Main Stage 6-12). Harder dungeons pay more.
var dungeonRecommended = []int{976_200, 3_325_600, 23_100_000}

// dungeonTitles identify the dungeon shown, by index.
var dungeonTitles = []string{screens.TDungeon1Title, screens.TDungeon2Title}

// dungeonLevel is how many dungeons past the first to step: the hardest
// whose recommended power the account has. Matched parties are usually far
// stronger, so the recommendation is a safe floor.
func dungeonLevel(power int) int {
	n := 0
	for i, rec := range dungeonRecommended {
		if power >= rec {
			n = i
		}
	}
	return n
}

// Dungeon spends up to n free dungeon attempts: Auto Match (the button turns
// into Cancel Match with a timer), Accept as soon as the party popup shows,
// then wait for the run to finish and the page to come back.
func Dungeon(ctx context.Context, b *bot.Bot, n int) (runs int, err error) {
	return dungeon(ctx, b, n, false)
}

// DungeonAssist joins one run once today's attempts are spent: Auto Match
// stays live at 0/3 and joins as an assist (5 a day), which counts for
// "Join Dungeon" quests.
func DungeonAssist(ctx context.Context, b *bot.Bot) (bool, error) {
	runs, err := dungeon(ctx, b, 1, true)
	return runs > 0, err
}

func dungeon(ctx context.Context, b *bot.Bot, n int, assist bool) (runs int, err error) {
	power := 0
	if err := b.ToMain(ctx); err != nil {
		return 0, err
	}
	if _, f, err := b.Look(ctx); err == nil {
		power, _ = screens.Power(f)
	}
	frame, err := openGameMode(ctx, b, dungeonTile, screens.Dungeon)
	if err != nil {
		return 0, err
	}
	if lvl := dungeonLevel(power); lvl > 0 && lvl < len(dungeonTitles) {
		// The page drops arrow taps while it settles, so step and check
		// the title until it shows the chosen dungeon.
		for i := 0; i < 8 && !screens.Visible(frame, dungeonTitles[lvl]); i++ {
			arrow, what := dungeonNext, "harder dungeon"
			if !screens.Visible(frame, dungeonTitles[0]) && i == 0 {
				arrow, what = dungeonPrev, "easier dungeon" // opened past it
			}
			if err := b.Tap(ctx, arrow, what); err != nil {
				return 0, err
			}
			if _, frame, err = b.Look(ctx); err != nil {
				return 0, err
			}
		}
		if screens.Visible(frame, dungeonTitles[lvl]) {
			b.Log.Info("dungeon difficulty chosen", "dungeon", lvl+1, "power", power)
		} else {
			b.Log.Warn("could not select dungeon", "dungeon", lvl+1, "shot", b.Save(frame))
		}
	}
	if badged(frame, dungeonAchieveBadge) {
		if err := dungeonAchievements(ctx, b); err != nil {
			return 0, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return 0, err
		}
	}
	failed := 0
	for runs < n {
		if !assist && screens.Visible(frame, screens.TDungeonZeroLeft) {
			b.Log.Info("dungeon attempts used up")
			return runs, claimAfterRuns(ctx, b, frame, ErrNoAttempts)
		}
		if err := startMatch(ctx, b, frame); err != nil {
			if errors.Is(err, ErrNoAttempts) {
				b.Log.Info("dungeon attempts used up")
				return runs, claimAfterRuns(ctx, b, frame, ErrNoAttempts)
			}
			return runs, err
		}
		if !awaitAccept(ctx, b, 4*time.Minute) {
			b.Log.Warn("no dungeon match found")
			cancelMatch(ctx, b)
			break
		}
		if !awaitRun(ctx, b) {
			// Someone declined and the game dropped the party without
			// queueing again; match afresh a few times.
			if failed++; failed >= 3 {
				b.Log.Warn("dungeon run did not return to the dungeon page")
				break
			}
			b.Log.Info("dungeon party fell through, matching again", "tries", failed)
			id, f, err := b.Look(ctx)
			if err != nil {
				return runs, err
			}
			if id != screens.Dungeon {
				if err := closePopups(ctx, b, screens.Dungeon); err != nil {
					return runs, err
				}
				if _, f, err = b.Look(ctx); err != nil {
					return runs, err
				}
			}
			frame = f
			continue
		}
		runs++
		b.Log.Info("dungeon run done", "runs", runs, "assist", assist)
		if _, frame, err = b.Look(ctx); err != nil {
			return runs, err
		}
	}
	if err := claimAfterRuns(ctx, b, frame, nil); err != nil {
		return runs, err
	}
	return runs, b.ToMain(ctx)
}

// claimAfterRuns claims achievements the day's runs finished (clears,
// joins) while the page is still open, then returns end.
func claimAfterRuns(ctx context.Context, b *bot.Bot, frame image.Image, end error) error {
	if id := screens.Detect(frame); id == screens.Dungeon && badged(frame, dungeonAchieveBadge) {
		if err := dungeonAchievements(ctx, b); err != nil {
			return err
		}
	}
	return end
}

// DungeonAssists joins up to max runs as a helper once the day's three
// clears are spent; it stops early when a match does not come. The help
// text says the five daily helper attempts pay Helper Coins for the Dungeon
// Shop, but on 6 Nov four such runs paid none and the Game Mode tile still
// read "Assist Attempts: 5/5", so the runner does not call it (rgo dungeon
// assists does).
func DungeonAssists(ctx context.Context, b *bot.Bot, max int) (runs int, err error) {
	for runs < max {
		ok, err := DungeonAssist(ctx, b)
		if err != nil {
			return runs, err
		}
		if !ok {
			break
		}
		runs++
	}
	if runs > 0 {
		b.Log.Info("dungeon assists done", "runs", runs)
	}
	return runs, b.ToMain(ctx)
}

var (
	dungeonAchieveButton = image.Pt(650, 145)
	dungeonAchieveBadge  = image.Pt(678, 116)
	achieveList          = image.Rect(50, 370, 670, 1110)
	// The achievement chest at the top of the popup; it levels up as
	// achievements are claimed.
	achieveChest      = image.Pt(634, 280)
	achieveChestBadge = image.Pt(661, 258)
)

// dungeonAchievements claims the dungeon's achievement rewards (clears,
// kills, joins), which pay coins and enhance metal; one Claim takes every
// finished one. Then the achievement chest, while it is badged.
func dungeonAchievements(ctx context.Context, b *bot.Bot) error {
	if _, _, err := b.TapWait(ctx, screens.Dungeon, dungeonAchieveButton, "dungeon achievements", 8*time.Second, screens.AchieveReward); err != nil {
		return err
	}
	n, err := claimButtons(ctx, b, screens.AchieveReward, achieveList, 2)
	if err != nil {
		return err
	}
	_, frame, err := b.Look(ctx)
	if err != nil {
		return err
	}
	for i := 0; i < 3 && badged(frame, achieveChestBadge); i++ {
		if err := b.Tap(ctx, achieveChest, "achievement chest"); err != nil {
			return err
		}
		n++
		if err := closePopups(ctx, b, screens.AchieveReward); err != nil {
			return err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return err
		}
	}
	b.Log.Info("dungeon achievements claimed", "count", n)
	_, err = b.Dismiss(ctx, screens.Detect(frame), frame)
	return err
}

// ErrNoAttempts means "Challenge Attempts: 0/3": today's attempts are used.
// The Auto Match button stays live at 0 (runs then give no rewards).
const ErrNoAttempts = matchErr("no dungeon attempts left")

// startMatch taps Auto Match until the button shows Cancel Match.
func startMatch(ctx context.Context, b *bot.Bot, frame image.Image) error {
	for try := 0; try < 3; try++ {
		if screens.Visible(frame, screens.TDungeonCancelMatch) {
			return nil
		}
		m := assets.MustGet(screens.TDungeonAutoMatch).Find(frame, screens.Margin)
		if m.Score < screens.MinScore || m.Bright < 0.8 {
			// A popup (Party Invite after a run) or a transition covers or
			// dims the page; look again.
			if err := bot.Sleep(ctx, 1500*time.Millisecond); err != nil {
				return err
			}
			id, f, err := b.Look(ctx)
			if err != nil {
				return err
			}
			if id != screens.Dungeon {
				if _, err := b.Dismiss(ctx, id, f); err != nil {
					return err
				}
				if _, f, err = b.Look(ctx); err != nil {
					return err
				}
			}
			frame = f
			continue
		}
		if err := b.TapTemplate(ctx, frame, screens.TDungeonAutoMatch); err != nil {
			return err
		}
		_, f, err := b.Look(ctx)
		if err != nil {
			return err
		}
		frame = f
	}
	if screens.Visible(frame, screens.TDungeonCancelMatch) {
		return nil
	}
	return errNoMatchStart
}

type matchErr string

func (e matchErr) Error() string { return string(e) }

const errNoMatchStart = matchErr("auto match did not start")

// awaitAccept polls the popup rows and taps Accept the moment it shows.
// maxBadBands is how many failed band captures in a row end a polling loop.
const maxBadBands = 5

// If matching stops without a popup (timer ran out), it is restarted.
func awaitAccept(ctx context.Context, b *bot.Bot, limit time.Duration) bool {
	accept := assets.MustGet(screens.TDungeonAccept)
	deadline := time.Now().Add(limit)
	checked := time.Now()
	bad := 0
	for time.Now().Before(deadline) {
		band, err := b.D.Rows(ctx, 720, dungeonAcceptRY[0], dungeonAcceptRY[1])
		if err != nil {
			if bad++; bad >= maxBadBands || ctx.Err() != nil {
				return false
			}
			b.Log.Warn("match capture failed", "err", err)
			continue
		}
		bad = 0
		if accept.Find(band, 20).Score >= screens.MinScore {
			if err := b.D.Tap(ctx, dungeonAccept.X, dungeonAccept.Y); err != nil {
				return false
			}
			b.Log.Info("dungeon match accepted")
			return true
		}
		// Every ~20 s make sure matching is still running.
		if time.Since(checked) > 20*time.Second {
			checked = time.Now()
			id, f, err := b.Look(ctx)
			if err != nil {
				return false
			}
			if id == screens.DungeonMatch {
				continue
			}
			if id == screens.Dungeon && !screens.Visible(f, screens.TDungeonCancelMatch) {
				if err := startMatch(ctx, b, f); err != nil {
					return false
				}
			}
		}
	}
	return false
}

// awaitRun waits for the party run to end back on the Dungeon page,
// accepting again if a re-match popup shows (someone declined).
func awaitRun(ctx context.Context, b *bot.Bot) bool {
	start := time.Now()
	deadline := start.Add(6 * time.Minute)
	sawBattle := false
	for time.Now().Before(deadline) {
		id, f, err := b.Look(ctx)
		if err != nil {
			// A slow phone link must not end the wait: leaving now would
			// back out of the party's run.
			if errors.Is(err, device.ErrTransport) && ctx.Err() == nil {
				continue
			}
			return false
		}
		switch {
		case id == screens.DungeonMatch:
			_ = b.D.Tap(ctx, dungeonAccept.X, dungeonAccept.Y)
		case id == screens.Dungeon && screens.Visible(f, screens.TDungeonCancelMatch):
			// Someone declined: back in the queue; wait for the next popup.
			if !awaitAccept(ctx, b, 3*time.Minute) {
				return false
			}
		case id == screens.Dungeon && (sawBattle || time.Since(start) > 20*time.Second):
			// Back after the run, or no run came: the party fell through.
			// The page also shows for a moment between Accept and the run
			// loading, so a fall-through only counts after a while.
			return sawBattle
		case id == screens.Dungeon:
			// Between Accept and the run loading; keep waiting.
		case id == screens.Unknown, id == screens.InCombat:
			sawBattle = true
		default:
			_, _ = b.Dismiss(ctx, id, f)
		}
		if err := bot.Sleep(ctx, 2*time.Second); err != nil {
			return false
		}
	}
	return false
}

func cancelMatch(ctx context.Context, b *bot.Bot) {
	if _, f, err := b.Look(ctx); err == nil && screens.Visible(f, screens.TDungeonCancelMatch) {
		_ = b.TapTemplate(ctx, f, screens.TDungeonCancelMatch)
	}
}
