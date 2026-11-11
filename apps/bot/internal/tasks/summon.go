package tasks

import (
	"context"
	"image"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/vision"
)

// The Auto toggle left of Summon Elite. Its arrows turn green when on; the
// on and off icons are too alike for template matching. With multi-summon
// the green arrows ring a "4x" badge on the Summon Elite icon instead.
var (
	autoButton      = image.Pt(262, 1022)
	autoIcon        = image.Rect(240, 1004, 286, 1044)
	multiBadge      = image.Rect(305, 980, 350, 1020)
	multiSummonOpen = image.Pt(547, 744)
	multiSummon4x   = image.Pt(545, 686)
)

func autoOn(frame image.Image) bool {
	return vision.Ratio(frame, autoIcon, vision.IsGreenText) > 0.04 ||
		vision.Ratio(frame, multiBadge, vision.IsGreenText) > 0.03
}

// AutoSummon keeps the game's own elite auto-summon running. It spends Dead
// Branches on elite spawns, whose gear drops the game auto-dismantles into
// enhance materials: the main resource loop of the game.
func AutoSummon(ctx context.Context, b *bot.Bot) (enabled bool, err error) {
	if err := b.ToMain(ctx); err != nil {
		return false, err
	}
	_, frame, err := b.Look(ctx)
	if err != nil {
		return false, err
	}
	if autoOn(frame) {
		return false, nil
	}
	if err := b.Tap(ctx, autoButton, "auto summon"); err != nil {
		return false, err
	}
	_, frame, err = b.Wait(ctx, 8*time.Second, screens.AutoSummonHint)
	if err != nil {
		return false, err
	}
	// Multi-summon (Monthly Card) spends 4 branches for 4 elites' drops at
	// once: the same gear per branch, sooner.
	if screens.Visible(frame, screens.TMultiSummonLabel) && !screens.Visible(frame, screens.TMultiSummon4x) {
		if err := b.Tap(ctx, multiSummonOpen, "multi-summon"); err != nil {
			return false, err
		}
		if err := b.Tap(ctx, multiSummon4x, "4x"); err != nil {
			return false, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return false, err
		}
	}
	if err := b.TapTemplate(ctx, frame, screens.THintOK); err != nil {
		return false, err
	}
	id, frame, err := b.Wait(ctx, 8*time.Second, screens.Main, screens.SummonLevelHint)
	if err != nil {
		return false, err
	}
	if id == screens.SummonLevelHint {
		if _, err := b.Dismiss(ctx, id, frame); err != nil {
			return false, err
		}
		if _, frame, err = b.Wait(ctx, 8*time.Second, screens.Main); err != nil {
			return false, err
		}
	}
	if !autoOn(frame) {
		b.Log.Warn("auto summon still off after confirming")
		return false, nil
	}
	b.Log.Info("auto summon enabled")
	return true, nil
}
