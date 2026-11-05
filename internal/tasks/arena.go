package tasks

import (
	"context"
	"image"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/vision"
)

var (
	arenaTile = image.Pt(185, 1090) // Game Mode, third row left

	// Rune Arena page. The ticket counter's "+" (401,1069) buys tickets
	// with diamonds and is never tapped.
	arenaChallenge      = image.Pt(360, 1133)
	arenaChallengeBadge = image.Pt(459, 1112) // lit while tickets are left
	arenaRewardBadge    = image.Pt(688, 290)
	arenaRewardTap      = image.Pt(662, 320)
	arenaTierBadge      = image.Pt(418, 724) // the tier emblem; opens Tier Rewards too

	// Select Opponent: three rows, strongest first. An opponent's power reads
	// green when it is below ours and red when above.
	arenaRows         = 3
	arenaRowStep      = 169
	arenaRowPower     = image.Rect(235, 506, 335, 532)
	arenaRowChallenge = image.Pt(585, 495)
	arenaRefresh      = image.Pt(336, 970)
	arenaPopupClose   = image.Pt(665, 297)

	tierRewardsList  = image.Rect(500, 380, 670, 1000)
	tierRewardsClose = image.Pt(665, 270)

	arenaMaxFights  = 6
	arenaFightLimit = 2 * time.Minute
)

// Arena spends Rune Arena tickets, then claims Tier Rewards (100 diamonds
// per tier). Each fight goes to the strongest opponent below our power; with
// none in the list it refreshes once (refreshes are free, 10 a day, and five
// tickets use at most five), then takes the weakest row.
func Arena(ctx context.Context, b *bot.Bot) (fights, claimed int, err error) {
	frame, err := openGameMode(ctx, b, arenaTile, screens.RuneArena)
	if err != nil {
		return 0, 0, err
	}
	for fights < arenaMaxFights && badged(frame, arenaChallengeBadge) {
		if _, _, err := b.TapWait(ctx, screens.RuneArena, arenaChallenge, "arena challenge", 10*time.Second, screens.ArenaOpponents); err != nil {
			return fights, claimed, err
		}
		row, err := pickOpponent(ctx, b)
		if err != nil {
			return fights, claimed, err
		}
		if err := b.Tap(ctx, arenaRowChallenge.Add(image.Pt(0, row*arenaRowStep)), "challenge opponent"); err != nil {
			return fights, claimed, err
		}
		fights++
		if frame, err = awaitArenaPage(ctx, b); err != nil {
			return fights, claimed, err
		}
	}
	if fights > 0 {
		b.Log.Info("arena fights done", "fights", fights)
	}

	if badged(frame, arenaRewardBadge) || badged(frame, arenaTierBadge) {
		if _, _, err := b.TapWait(ctx, screens.RuneArena, arenaRewardTap, "arena rewards", 10*time.Second, screens.ArenaTierRewards); err != nil {
			return fights, claimed, err
		}
		if claimed, err = claimButtons(ctx, b, screens.ArenaTierRewards, tierRewardsList, 2); err != nil {
			return fights, claimed, err
		}
		if _, _, err := b.TapWait(ctx, screens.ArenaTierRewards, tierRewardsClose, "close tier rewards", 8*time.Second, screens.RuneArena); err != nil {
			return fights, claimed, err
		}
		if claimed > 0 {
			b.Log.Info("arena tier rewards claimed", "count", claimed)
		}
	}
	return fights, claimed, b.ToMain(ctx)
}

// pickOpponent returns the row to challenge on the Select Opponent popup.
func pickOpponent(ctx context.Context, b *bot.Bot) (int, error) {
	for refreshed := false; ; refreshed = true {
		_, frame, err := b.Look(ctx)
		if err != nil {
			return 0, err
		}
		if row, ok := weakerOpponent(frame); ok {
			return row, nil
		}
		if refreshed {
			return arenaRows - 1, nil
		}
		if err := b.Tap(ctx, arenaRefresh, "refresh opponents"); err != nil {
			return 0, err
		}
		if err := bot.Sleep(ctx, 2*time.Second); err != nil {
			return 0, err
		}
	}
}

// weakerOpponent finds the first (strongest) row whose power reads green.
func weakerOpponent(frame image.Image) (int, bool) {
	for row := 0; row < arenaRows; row++ {
		r := arenaRowPower.Add(image.Pt(0, row*arenaRowStep))
		if vision.Ratio(frame, r, vision.IsGreenText) > 0.05 {
			return row, true
		}
	}
	return 0, false
}

// awaitArenaPage waits out a fight and its result screen, which closes by
// itself after three seconds.
func awaitArenaPage(ctx context.Context, b *bot.Bot) (image.Image, error) {
	deadline := time.Now().Add(arenaFightLimit)
	for time.Now().Before(deadline) {
		id, frame, err := b.Look(ctx)
		if err != nil {
			return nil, err
		}
		switch id {
		case screens.RuneArena:
			return frame, nil
		case screens.InCombat, screens.Unknown:
			// The fight and its result: wait, never press back.
		default:
			if _, err := b.Dismiss(ctx, id, frame); err != nil {
				return nil, err
			}
			continue
		}
		if err := bot.Sleep(ctx, 2*time.Second); err != nil {
			return nil, err
		}
	}
	_, frame, err := b.Look(ctx)
	return frame, err
}
