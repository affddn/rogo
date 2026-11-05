// Package tasks holds the in-game chores. Each starts and ends on the main screen.
package tasks

import (
	"context"
	"errors"
	"image"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/vision"
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

	if n, err := yieldBonus(ctx, b); err != nil {
		return ticketLeft, err
	} else if n > 0 {
		b.Log.Info("yield bonus items used", "lots", n)
	}

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

// Income's Yield Bonus panel uses EXP Boost Books and Drop Rate Boost Candy:
// 10 minutes each of +50% idle EXP or resources. Durations add up, so every
// one owned is used at once. Its Use Item tab is badged while any is owned.
var (
	yieldBonusButton = image.Pt(206, 1047)
	yieldUseTab      = image.Pt(513, 378)
	yieldUseBadge    = image.Pt(650, 363)
	yieldUseRows     = []int{496, 636}
	yieldUseX        = 581
	yieldSliderY     = 675
	yieldClose       = image.Pt(665, 297)
)

func yieldBonus(ctx context.Context, b *bot.Bot) (used int, err error) {
	if _, _, err := b.TapWait(ctx, screens.Income, yieldBonusButton, "yield bonus", 8*time.Second, screens.YieldBonus); err != nil {
		return 0, err
	}
	if err := b.Tap(ctx, yieldUseTab, "use item tab"); err != nil {
		return 0, err
	}
	_, frame, err := b.Look(ctx)
	if err != nil {
		return 0, err
	}
	for _, y := range yieldUseRows {
		if !badged(frame, yieldUseBadge) {
			break
		}
		if err := b.Tap(ctx, image.Pt(yieldUseX, y), "use yield item"); err != nil {
			return used, err
		}
		// With none owned, Use does nothing.
		id, _, err := b.Wait(ctx, 3*time.Second, screens.YieldUse)
		if id == screens.YieldBonus && errors.Is(err, bot.ErrTimeout) {
			continue
		}
		if err != nil {
			return used, err
		}
		// Slide to the most owned.
		if err := b.D.Swipe(ctx, 217, yieldSliderY, 560, yieldSliderY, 400*time.Millisecond); err != nil {
			return used, err
		}
		_, dialog, err := b.Look(ctx)
		if err != nil {
			return used, err
		}
		if err := b.TapTemplate(ctx, dialog, screens.TYieldConfirm); err != nil {
			return used, err
		}
		used++
		if err := closePopups(ctx, b, screens.YieldBonus); err != nil {
			return used, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return used, err
		}
	}
	_, _, err = b.TapWait(ctx, screens.YieldBonus, yieldClose, "close yield bonus", 8*time.Second, screens.Income)
	return used, err
}

// incomeDiamonds is the cost line under Quick Idle ("1335/100"): green
// while the diamonds cover the next one.
var incomeDiamonds = image.Rect(488, 984, 580, 1008)

// PaidQuickIdles buys Quick Idles (one hour of adventure income, mostly
// Base and Job EXP) while the Job level is under target, the diamonds cover
// one and the price is at most maxPrice; at most max a run. The price
// starts at 100 and rises 50 a purchase. job is the last level read, 0
// when unread.
func PaidQuickIdles(ctx context.Context, b *bot.Bot, target, maxPrice, max int) (bought, job int, err error) {
	if err := b.ToMain(ctx); err != nil {
		return 0, 0, err
	}
	_, frame, err := b.TapWait(ctx, screens.Main, adventureIncome, "adventure income", 10*time.Second, screens.Income)
	if err != nil {
		return 0, 0, err
	}
	spent := 0
	for bought < max {
		lv, ok := screens.IncomeJobLevel(frame)
		if !ok {
			b.Log.Warn("could not read the job level", "shot", b.Save(frame))
			break
		}
		job = lv
		if job >= target || vision.Ratio(frame, incomeDiamonds, vision.IsGreenText) < 0.03 {
			break
		}
		_, confirm, err := b.TapWait(ctx, screens.Income, quickIdleButton, "quick idle", 10*time.Second, screens.QuickIdleConfirm)
		if err != nil {
			return bought, job, err
		}
		price, ok := screens.QuickIdlePrice(confirm)
		if !ok || price > maxPrice {
			if ok {
				b.Log.Info("quick idle price over the cap, cancelling", "price", price, "cap", maxPrice)
			} else {
				b.Log.Warn("could not read the quick idle price, cancelling", "shot", b.Save(confirm))
			}
			if err := b.TapTemplate(ctx, confirm, screens.TDialogCancel); err != nil {
				return bought, job, err
			}
			break
		}
		if err := b.TapTemplate(ctx, confirm, screens.TDialogOK); err != nil {
			return bought, job, err
		}
		if _, _, err := b.Wait(ctx, 10*time.Second, screens.Reward); err != nil {
			return bought, job, err
		}
		bought++
		spent += price
		if err := closePopups(ctx, b, screens.Income); err != nil {
			return bought, job, err
		}
		if _, frame, err = b.Wait(ctx, 10*time.Second, screens.Income); err != nil {
			return bought, job, err
		}
	}
	if bought > 0 {
		b.Log.Info("paid quick idles", "count", bought, "diamonds", spent, "job", job)
	}
	if err := b.Tap(ctx, bot.IncomeClose, "close income"); err != nil {
		return bought, job, err
	}
	_, _, err = b.Wait(ctx, 10*time.Second, screens.Main)
	return bought, job, err
}
