// Package tasks holds the in-game chores. Each starts and ends on the main screen.
package tasks

import (
	"context"
	"image"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
)

// Income opens Adventure Income, which claims the idle stash on open, and
// spends the daily free Quick Idle ticket. A Quick Idle that costs diamonds is
// never confirmed.
func Income(ctx context.Context, b *bot.Bot) error {
	if err := b.ToMain(ctx); err != nil {
		return err
	}
	_, frame, err := b.Look(ctx)
	if err != nil {
		return err
	}
	if err := b.TapTemplate(ctx, frame, screens.TMainAdventureIncome); err != nil {
		return err
	}
	_, frame, err = b.Wait(ctx, 10*time.Second, screens.Income)
	if err != nil {
		return err
	}
	b.Log.Info("income claimed")

	if screens.Visible(frame, screens.TIncomeTicketIcon) {
		if err := quickIdle(ctx, b, frame); err != nil {
			return err
		}
		if _, frame, err = b.Wait(ctx, 10*time.Second, screens.Income); err != nil {
			return err
		}
	}

	if err := b.TapTemplate(ctx, frame, screens.TIncomeClose); err != nil {
		return err
	}
	_, _, err = b.Wait(ctx, 10*time.Second, screens.Main)
	return err
}

func quickIdle(ctx context.Context, b *bot.Bot, frame image.Image) error {
	if err := b.TapTemplate(ctx, frame, screens.TIncomeQuickIdle); err != nil {
		return err
	}
	_, frame, err := b.Wait(ctx, 10*time.Second, screens.QuickIdleConfirm)
	if err != nil {
		return err
	}
	if !screens.Visible(frame, screens.TQuickIdleTicketCost) {
		b.Log.Warn("quick idle asks for something other than a ticket, cancelling")
		return b.TapTemplate(ctx, frame, screens.TDialogCancel)
	}
	if err := b.TapTemplate(ctx, frame, screens.TDialogOK); err != nil {
		return err
	}
	id, frame, err := b.Wait(ctx, 10*time.Second, screens.Reward)
	if err != nil {
		return err
	}
	b.Log.Info("quick idle used")
	_, err = b.Dismiss(ctx, id, frame)
	return err
}
