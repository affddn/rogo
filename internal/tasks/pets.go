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
	petDrawMulti    = image.Pt(548, 1052)
	petGachaTab     = image.Pt(660, 1235)
	petCultivateTab = image.Pt(556, 1235)
	petMainButton   = image.Pt(534, 1120) // Activate All / One-Click Upgrade
	petMainBadge    = image.Pt(632, 1104)
	petFormation    = image.Pt(182, 1120)
	petFormationDot = image.Pt(282, 1100)
	petGachaSkip    = image.Rect(458, 950, 478, 970)
	petGachaSkipTap = image.Pt(468, 960)
	// The ad button: a free 10-draw a day, ad-free with the Kafra Lifetime
	// Card; badged while unused.
	petAdButton = image.Pt(93, 1052)
	petAdBadge  = image.Pt(127, 1019)
)

// Pets draws pet gacha with free tickets only (the multi-draw button must
// show the ticket icon; once tickets run out it switches to diamonds, which
// are deny-listed), then activates, upgrades and auto-deploys pets.
func Pets(ctx context.Context, b *bot.Bot) (steps int, err error) {
	frame, err := open(ctx, b, screens.TNavPet, screens.PetGacha, screens.PetCultivate)
	if err != nil {
		return 0, err
	}
	if screens.Detect(frame) != screens.PetGacha {
		if err := b.Tap(ctx, petGachaTab, "pet gacha tab"); err != nil {
			return 0, err
		}
		if _, frame, err = b.Wait(ctx, 8*time.Second, screens.PetGacha); err != nil {
			return 0, err
		}
	}
	if badged(frame, petAdBadge) {
		if err := b.Tap(ctx, petAdButton, "free pet ad draw"); err != nil {
			return steps, err
		}
		steps++
		b.Log.Info("free pet ad draw taken")
		if err := bot.Sleep(ctx, 3*time.Second); err != nil {
			return steps, err
		}
		if err := closePopups(ctx, b, screens.PetGacha); err != nil {
			return steps, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return steps, err
		}
	}
	for draws := 0; draws < 5 && shapeSeen(frame, screens.TPetTicketIcon); draws++ {
		if err := b.Tap(ctx, petDrawMulti, "pet draw multiple"); err != nil {
			return steps, err
		}
		_, f, err := b.Wait(ctx, 8*time.Second, screens.PetCount)
		if err != nil {
			return steps, err
		}
		if !shapeSeen(f, screens.TPetCostTicket) {
			b.Log.Warn("pet draw not priced in tickets, backing out")
			_, err := b.Dismiss(ctx, screens.PetCount, f)
			return steps, err
		}
		if err := b.TapTemplate(ctx, f, screens.TGachaDrawButton); err != nil {
			return steps, err
		}
		steps++
		if err := bot.Sleep(ctx, 3*time.Second); err != nil {
			return steps, err
		}
		if err := closePopups(ctx, b, screens.PetGacha); err != nil {
			return steps, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return steps, err
		}
	}

	if err := b.Tap(ctx, petCultivateTab, "pet cultivation tab"); err != nil {
		return steps, err
	}
	if _, frame, err = b.Wait(ctx, 8*time.Second, screens.PetCultivate); err != nil {
		return steps, err
	}
	for i := 0; i < 4 && badged(frame, petMainBadge); i++ {
		if err := b.Tap(ctx, petMainButton, "pet activate/upgrade"); err != nil {
			return steps, err
		}
		steps++
		if err := closePopups(ctx, b, screens.PetCultivate); err != nil {
			return steps, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return steps, err
		}
	}
	if badged(frame, petFormationDot) {
		if err := b.Tap(ctx, petFormation, "pet auto formation"); err != nil {
			return steps, err
		}
		steps++
	}
	b.Log.Info("pets done", "steps", steps)
	return steps, b.ToMain(ctx)
}

// shapeSeen matches by shape only: ticket and diamond icons differ in shape
// (cross-score ~0.6), and the pet templates come from tutorial-dimmed frames.
func shapeSeen(frame image.Image, name string) bool {
	return assets.MustGet(name).Find(frame, screens.Margin).Score >= 0.9
}

// Mail claims all mail rewards. Delete All is deny-listed.
func Mail(ctx context.Context, b *bot.Bot) error {
	if err := b.ToMain(ctx); err != nil {
		return err
	}
	if err := b.Tap(ctx, image.Pt(671, 180), "system menu"); err != nil {
		return err
	}
	if err := b.Tap(ctx, image.Pt(388, 160), "mail"); err != nil {
		return err
	}
	_, frame, err := b.Wait(ctx, 8*time.Second, screens.Mail)
	if err != nil {
		return err
	}
	if err := b.TapTemplate(ctx, frame, screens.TMailClaimAll); err != nil {
		return err
	}
	if err := closePopups(ctx, b, screens.Mail); err != nil {
		return err
	}
	return b.ToMain(ctx)
}
