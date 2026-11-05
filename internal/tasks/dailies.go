package tasks

import (
	"context"
	"image"
	"time"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
)

var (
	// Left-rail icons are found by their labels; the icon sits above its
	// label.
	railIconDY = -35

	// Mall, Gift Pack tab: the daily Diamond x30 and the ad Diamond x100,
	// which the Lifetime Card makes ad-free. Each button's badge sits on its
	// top-right corner.
	mallFreeRow   = image.Rect(500, 470, 700, 540)
	mallFreeBadge = image.Pt(685, 489)
	mallFreeTap   = image.Pt(597, 506)
	mallAdRow     = image.Rect(500, 670, 700, 740)
	mallAdBadge   = image.Pt(685, 689)
	mallAdTap     = image.Pt(597, 706)

	// Mall, Special Pass tab: Claim All for the Kafra cards' daily rewards
	// (grey when nothing is due) and the Daily Benefits icon.
	mallSpecialTab  = image.Pt(510, 1240)
	claimAllButton  = image.Rect(480, 1100, 690, 1148)
	benefitsBadge   = image.Pt(104, 1083)
	benefitsTap     = image.Pt(65, 1105)
	mallCheckinTab  = image.Pt(650, 1240)
	checkinList     = image.Rect(20, 380, 700, 1170)
	pullsList       = image.Rect(60, 400, 670, 1110)
	pullsClose      = image.Pt(662, 155)
	growthTasks     = image.Rect(140, 330, 705, 1160)
	growthDayTab0   = image.Pt(64, 358) // Day 1; each next day 77 px lower
	growthDayStep   = 77
	growthDayBadge  = image.Pt(51, -19) // from a day tab
	growthDaysShown = 11
)

// Dailies claims the free daily rewards outside the quest panel: the login
// event, Growth Gift tasks, and in the Mall the free diamonds, the Kafra
// cards' daily rewards and the check-in bonus. Every tap is gated on a badge
// or a Claim/Free button found on screen; prices are never tapped.
func Dailies(ctx context.Context, b *bot.Bot) (claimed int, err error) {
	for _, step := range []struct {
		rail string
		want screens.ID
		run  func(context.Context, *bot.Bot) (int, error)
	}{
		{screens.TRailPulls, screens.LoginEvent, loginEvent},
		{screens.TRailGrowth, screens.GrowthGift, growthGift},
		{screens.TRailMall, screens.Mall, mall},
		{screens.TRailLimited, screens.LimitedQuest, limitedQuest},
	} {
		if err := b.ToMain(ctx); err != nil {
			return claimed, err
		}
		_, frame, err := b.Look(ctx)
		if err != nil {
			return claimed, err
		}
		m := assets.MustGet(step.rail).FindIn(frame, screens.LeftRail)
		if m.Score < 0.7 { // white labels over the map: shape only
			continue // event over
		}
		p := m.Center().Add(image.Pt(0, railIconDY))
		if _, _, err := b.TapWait(ctx, screens.Main, p, step.rail, 10*time.Second, step.want); err != nil {
			return claimed, err
		}
		n, err := step.run(ctx, b)
		claimed += n
		if err != nil {
			return claimed, err
		}
	}
	if claimed > 0 {
		b.Log.Info("daily rewards claimed", "count", claimed)
	}
	return claimed, b.ToMain(ctx)
}

// limitedQuest claims the timed Limited Quest once it is complete; until
// then its button reads Go.
func limitedQuest(ctx context.Context, b *bot.Bot) (int, error) {
	n, err := claimButtons(ctx, b, screens.LimitedQuest, image.Rect(150, 860, 570, 1010), 0)
	if err != nil {
		return n, err
	}
	return n, b.Tap(ctx, image.Pt(648, 250), "close limited quest")
}

func loginEvent(ctx context.Context, b *bot.Bot) (int, error) {
	n, err := claimButtons(ctx, b, screens.LoginEvent, pullsList, 2)
	if err != nil {
		return n, err
	}
	return n, b.Tap(ctx, pullsClose, "close login event")
}

func growthGift(ctx context.Context, b *bot.Bot) (int, error) {
	n, err := claimButtons(ctx, b, screens.GrowthGift, growthTasks, 1)
	if err != nil {
		return n, err
	}
	// Earlier days keep unclaimed tasks; their tabs carry a badge.
	_, frame, err := b.Look(ctx)
	if err != nil {
		return n, err
	}
	for d := 0; d < growthDaysShown; d++ {
		tab := growthDayTab0.Add(image.Pt(0, d*growthDayStep))
		if !badged(frame, tab.Add(growthDayBadge)) {
			continue
		}
		if err := b.Tap(ctx, tab, "growth gift day"); err != nil {
			return n, err
		}
		k, err := claimButtons(ctx, b, screens.GrowthGift, growthTasks, 1)
		n += k
		if err != nil {
			return n, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return n, err
		}
	}
	return n, b.Tap(ctx, image.Pt(40, 1225), "back")
}

func mall(ctx context.Context, b *bot.Bot) (int, error) {
	n := 0
	_, frame, err := b.Look(ctx)
	if err != nil {
		return 0, err
	}
	for _, free := range []struct {
		word  string
		row   image.Rectangle
		badge image.Point
		tap   image.Point
	}{
		{screens.TMallFreeWord, mallFreeRow, mallFreeBadge, mallFreeTap},
		{screens.TMallAdFreeWord, mallAdRow, mallAdBadge, mallAdTap},
	} {
		if !badged(frame, free.badge) || !assets.MustGet(free.word).FindIn(frame, free.row).Visible(screens.MinScore) {
			continue
		}
		if err := b.Tap(ctx, free.tap, "free diamonds"); err != nil {
			return n, err
		}
		n++
		if err := closePopups(ctx, b, screens.Mall); err != nil {
			return n, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return n, err
		}
	}

	if err := b.Tap(ctx, mallSpecialTab, "special pass tab"); err != nil {
		return n, err
	}
	if _, frame, err = b.Look(ctx); err != nil {
		return n, err
	}
	if mvpButtonLive(frame, claimAllButton) && assets.MustGet(screens.TClaimAllWord).FindIn(frame, claimAllButton.Inset(-10)).Visible(screens.MinScore) {
		if err := b.Tap(ctx, centre(claimAllButton), "claim all card rewards"); err != nil {
			return n, err
		}
		n++
		if err := closePopups(ctx, b, screens.Mall); err != nil {
			return n, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return n, err
		}
	}
	if badged(frame, benefitsBadge) && screens.Visible(frame, screens.TBenefitsLabel) {
		if err := b.Tap(ctx, benefitsTap, "daily benefits"); err != nil {
			return n, err
		}
		n++
		if err := closePopups(ctx, b, screens.Mall); err != nil {
			return n, err
		}
	}

	if err := b.Tap(ctx, mallCheckinTab, "check-in tab"); err != nil {
		return n, err
	}
	k, err := claimButtons(ctx, b, screens.Mall, checkinList, 2)
	n += k
	if err != nil {
		return n, err
	}
	return n, b.Tap(ctx, image.Pt(40, 1225), "back")
}

// claimButtons taps every orange Claim button in area, closing the reward
// popups in between. When none shows it scrolls the list up to scrolls
// times, for rows further down (later login days).
func claimButtons(ctx context.Context, b *bot.Bot, page screens.ID, area image.Rectangle, scrolls int) (int, error) {
	claim := assets.MustGet(screens.TClaimWord)
	n := 0
	for i := 0; i < 20; i++ {
		id, frame, err := b.Look(ctx)
		if err != nil {
			return n, err
		}
		if id != page {
			acted, err := b.Dismiss(ctx, id, frame)
			if err != nil {
				return n, err
			}
			if !acted {
				if err := bot.Sleep(ctx, time.Second); err != nil {
					return n, err
				}
			}
			continue
		}
		if m := claim.FindIn(frame, area); m.Visible(screens.MinScore) {
			if err := b.Tap(ctx, m.Center(), "claim"); err != nil {
				return n, err
			}
			n++
			continue
		}
		if scrolls == 0 {
			break
		}
		scrolls--
		x, y0, y1 := (area.Min.X+area.Max.X)/2, area.Max.Y-100, area.Min.Y+100
		if err := b.D.Swipe(ctx, x, y0, x, y1, 600*time.Millisecond); err != nil {
			return n, err
		}
		if err := bot.Sleep(ctx, time.Second); err != nil {
			return n, err
		}
	}
	return n, nil
}
