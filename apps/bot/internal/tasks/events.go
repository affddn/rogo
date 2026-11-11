package tasks

import (
	"context"
	"image"
	"math"
	"time"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/vision"
)

// openRail opens a left-rail event by its label; nil once the event is
// over and its label gone.
func openRail(ctx context.Context, b *bot.Bot, label string, want ...screens.ID) (image.Image, error) {
	if err := b.ToMain(ctx); err != nil {
		return nil, err
	}
	_, frame, err := b.Look(ctx)
	if err != nil {
		return nil, err
	}
	m := assets.MustGet(label).FindIn(frame, screens.LeftRail)
	if m.Score < 0.7 { // white labels over the map: shape only
		return nil, nil
	}
	_, frame, err = b.TapWait(ctx, screens.Main, m.Center().Add(image.Pt(0, railIconDY)), label, 10*time.Second, want...)
	return frame, err
}

// Arcane Card Trove: a card draw event. Draw 1 Time takes a card ticket
// (3 a day from Login Rewards); Draw 5x takes stars, and so does Draw 1
// Time once the tickets are gone: its price then shows a star icon and a
// green star count. Both are deny-listed in that state (CardTroveStars).
var (
	troveDraw1      = image.Pt(316, 1196)
	troveTicketCost = image.Rect(305, 1214, 350, 1240) // "4/1", green while held
)

// CardTrove draws once per ticket held.
func CardTrove(ctx context.Context, b *bot.Bot) (draws int, err error) {
	frame, err := openRail(ctx, b, screens.TRailTrove, screens.CardTrove, screens.CardTroveStars)
	if err != nil || frame == nil {
		return 0, err
	}
	for range 20 {
		if !troveTicketDraw(frame) {
			break
		}
		if err := b.Tap(ctx, troveDraw1, "trove draw"); err != nil {
			return draws, err
		}
		draws++
		if err := closePopups(ctx, b, screens.CardTrove); err != nil {
			return draws, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return draws, err
		}
	}
	if draws > 0 {
		b.Log.Info("card trove draws", "count", draws)
	}
	return draws, b.ToMain(ctx)
}

// troveTicketDraw reports a Draw 1 Time paid with a card ticket held: the
// ticket icon on its price and the count green. Never stars.
func troveTicketDraw(frame image.Image) bool {
	return screens.Detect(frame) == screens.CardTrove &&
		screens.Visible(frame, screens.TTroveTicketCost) &&
		!screens.Visible(frame, screens.TTroveStarCost) &&
		vision.Ratio(frame, troveTicketCost, vision.IsGreenText) >= 0.03
}

// Login Rewards: a seven-day ladder. Each row's right side shows a Claimed
// stamp, "Incomplete" for days not reached, or the claim for today.
var (
	loginList   = image.Rect(450, 420, 680, 1080)
	loginRowGap = 126.5
	loginRowsY  = [2]int{460, 1040} // rows fully in view
	loginTapX   = 560
)

// LoginRewards claims every reached day.
func LoginRewards(ctx context.Context, b *bot.Bot) (claimed int, err error) {
	frame, err := openRail(ctx, b, screens.TRailLogin, screens.LoginRewards)
	if err != nil || frame == nil {
		return 0, err
	}
	for pass := 0; pass < 2; pass++ {
		for range 7 {
			y, ok := loginClaimable(frame)
			if !ok {
				break
			}
			if err := b.Tap(ctx, image.Pt(loginTapX, y), "claim login reward"); err != nil {
				return claimed, err
			}
			claimed++
			if err := closePopups(ctx, b, screens.LoginRewards); err != nil {
				return claimed, err
			}
			if _, frame, err = b.Look(ctx); err != nil {
				return claimed, err
			}
		}
		// Days 6 and 7 sit below the fold.
		if err := b.D.Swipe(ctx, 360, 950, 360, 500, 500*time.Millisecond); err != nil {
			return claimed, err
		}
		if err := bot.Sleep(ctx, time.Second); err != nil {
			return claimed, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return claimed, err
		}
	}
	if claimed > 0 {
		b.Log.Info("login rewards claimed", "count", claimed)
	}
	return claimed, b.ToMain(ctx)
}

// loginClaimable finds a fully visible row with neither a Claimed stamp
// nor "Incomplete". Rows are placed from the statuses that are seen.
func loginClaimable(frame image.Image) (int, bool) {
	var seen []int
	for _, name := range []string{screens.TLoginClaimed, screens.TLoginIncomplete} {
		for _, m := range assets.MustGet(name).FindAll(frame, loginList, 0.85, 60) {
			seen = append(seen, m.Center().Y)
		}
	}
	if len(seen) == 0 {
		return 0, false // not the list we know
	}
	y0 := float64(seen[0])
	for k := -8; k <= 8; k++ {
		y := int(math.Round(y0 + float64(k)*loginRowGap))
		if y < loginRowsY[0] || y > loginRowsY[1] {
			continue
		}
		taken := false
		for _, s := range seen {
			if abs(s-y) < 25 {
				taken = true
				break
			}
		}
		if !taken {
			return y, true
		}
	}
	return 0, false
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}
