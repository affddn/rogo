// Package tasks holds the in-game chores. Each starts and ends on the main screen.
package tasks

import (
	"context"
	"image"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
)

// adventureIncome is the Adventure Income chest on the main screen.
var adventureIncome = image.Pt(61, 1072)

// Income opens Adventure Income, which claims the idle stash on open, and
// spends free Quick Idles: the daily one ("Free: 1/1", "Free this time" on
// the confirm) and Quick Idle tickets. A Quick Idle that costs diamonds is
// never confirmed. ticketLeft reports whether a free one was still there
// after the run.
func Income(ctx context.Context, b *bot.Bot) (ticketLeft bool, err error) {
	if err := b.ToMain(ctx); err != nil {
		return false, err
	}
	// The icon shows the map through it, so tap it by position.
	_, frame, err := b.TapWait(ctx, screens.Main, adventureIncome, "adventure income", 10*time.Second, screens.Income)
	if err != nil {
		return false, err
	}
	b.Log.Info("income claimed")

	for i := 0; i < 5 && freeQuickIdle(frame); i++ {
		if err := quickIdle(ctx, b, frame); err != nil {
			return false, err
		}
		if _, frame, err = b.Wait(ctx, 10*time.Second, screens.Income); err != nil {
			return false, err
		}
	}
	ticketLeft = freeQuickIdle(frame)

	if err := b.Tap(ctx, bot.IncomeClose, "close income"); err != nil {
		return ticketLeft, err
	}
	_, _, err = b.Wait(ctx, 10*time.Second, screens.Main)
	return ticketLeft, err
}

func freeQuickIdle(frame image.Image) bool {
	return screens.Visible(frame, screens.TIncomeTicketIcon) || screens.Visible(frame, screens.TIncomeFreeLabel)
}

// quickIdleButton is the dialog's Quick Idle button. A guide arrow's ring
// often sits on it, so it is tapped by position; the confirm dialog that
// follows decides whether it is free.
var quickIdleButton = image.Pt(523, 1046)

func quickIdle(ctx context.Context, b *bot.Bot, frame image.Image) error {
	_, frame, err := b.TapWait(ctx, screens.Income, quickIdleButton, "quick idle", 10*time.Second, screens.QuickIdleConfirm)
	if err != nil {
		return err
	}
	if !screens.Visible(frame, screens.TQuickIdleTicketCost) && !screens.Visible(frame, screens.TQuickIdleFree) {
		b.Log.Warn("quick idle is not free, cancelling", "shot", b.Save(frame))
		return b.TapTemplate(ctx, frame, screens.TDialogCancel)
	}
	if err := b.TapTemplate(ctx, frame, screens.TDialogOK); err != nil {
		return err
	}
	if _, _, err := b.Wait(ctx, 10*time.Second, screens.Reward); err != nil {
		return err
	}
	b.Log.Info("quick idle used")
	// One tap does not always close the reward on a slow link.
	return closePopups(ctx, b, screens.Income)
}
