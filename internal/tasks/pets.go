package tasks

import (
	"context"
	"image"
	"time"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/vision"
)

var (
	petDrawMulti    = image.Pt(548, 1052)
	petGachaTab     = image.Pt(660, 1235)
	petCultivateTab = image.Pt(556, 1235)
	petMainButton   = image.Pt(534, 1120) // Activate All / One-Click Upgrade
	petMainBadge    = image.Pt(632, 1104)
	petFormation    = image.Pt(182, 1120)
	petFormationDot = image.Pt(282, 1100)
	// Skip Animation checkbox; teal when ticked, as on the weapon gacha.
	petGachaSkip    = image.Rect(458, 950, 478, 970)
	petGachaSkipTap = image.Pt(468, 960)
	// The ad button: a free 10-draw a day, ad-free with the Kafra Lifetime
	// Card; badged while unused.
	petAdButton = image.Pt(93, 1052)
	petAdBadge  = image.Pt(127, 1019)
	// Draw 1 Time spends one Pet Gacha Token: the token icon and a green
	// count ("2/1") under it. Without tokens the cost turns to 10 diamonds,
	// whose count is green too, so the icon decides.
	petDrawSingle = image.Pt(282, 1052)
	petSingleCost = image.Rect(225, 1115, 300, 1140)
	petSingleIcon = image.Rect(185, 1100, 240, 1150)

	// Draw Level: its badge top left, and the achievement chest top right
	// (Pet Gacha Tokens every so many draws), badged when ready.
	petLevelBadge       = image.Rect(60, 80, 125, 145)
	petAchievement      = image.Pt(640, 120)
	petAchievementBadge = image.Pt(695, 85)
	petDrawCost         = 10 // diamonds a draw
)

// petDiamondLevel is the Draw Level up to which diamonds are spent on pet
// draws: Level 3 opens the second Blessing (Guardian) slot, and the
// Assassin Cross job change needs two pets deployed there. Level 2 to 3 is
// 600 draws, 6000 diamonds less the tokens the achievements pay.
const petDiamondLevel = 3

// petDrawLevel reads the Draw Level badge: 1 or 2, else 0 (3 or more, or
// unread), which stops diamond draws.
func petDrawLevel(frame image.Image) int {
	for lvl, name := range map[int]string{1: screens.TPetDrawLevel1, 2: screens.TPetDrawLevel2} {
		if assets.MustGet(name).FindIn(frame, petLevelBadge).Score >= 0.9 {
			return lvl
		}
	}
	return 0
}

// petTokenDraw reports whether Draw 1 Time would spend a Pet Gacha Token.
func petTokenDraw(frame image.Image) bool {
	return assets.MustGet(screens.TPetTokenCost).FindIn(frame, petSingleIcon).Score >= 0.9 &&
		vision.Ratio(frame, petSingleCost, vision.IsGreenText) > 0.03
}

// Pets draws pet gacha with free tickets first (achievement tokens, the ad
// draw, Pet Gacha Tokens one at a time, and the multi-draw button while it
// shows the ticket icon), then with diamonds above reserve while the Draw
// Level is under petDiamondLevel (a negative reserve spends none), then
// activates, upgrades and auto-deploys pets. Draws raise the Draw Level,
// which unlocks the Blessing (Guardian) slots: level 2 the first, level 3
// the second. level is the Draw Level read at the end (see petDrawLevel).
func Pets(ctx context.Context, b *bot.Bot, reserve int) (steps, level int, err error) {
	steps, level, err = petGacha(ctx, b, reserve)
	if err != nil {
		return steps, level, err
	}
	n, err := petCultivate(ctx, b)
	steps += n
	if err == nil {
		b.Log.Info("pets done", "steps", steps, "draw_level", level)
	}
	return steps, level, err
}

func petGacha(ctx context.Context, b *bot.Bot, reserve int) (steps, level int, err error) {
	frame, err := open(ctx, b, screens.TNavPet, screens.PetGacha, screens.PetCultivate)
	if err != nil {
		return 0, 0, err
	}
	if screens.Detect(frame) != screens.PetGacha {
		if err := b.Tap(ctx, petGachaTab, "pet gacha tab"); err != nil {
			return 0, 0, err
		}
		if _, frame, err = b.Wait(ctx, 8*time.Second, screens.PetGacha); err != nil {
			return 0, 0, err
		}
	}
	if vision.Ratio(frame, petGachaSkip, isTeal) < 0.2 {
		if err := b.Tap(ctx, petGachaSkipTap, "skip animation"); err != nil {
			return steps, 0, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return steps, 0, err
		}
	}
	for i := 0; i < 5 && badged(frame, petAchievementBadge); i++ {
		if err := b.Tap(ctx, petAchievement, "pet draw achievement"); err != nil {
			return steps, 0, err
		}
		steps++
		b.Log.Info("pet draw achievement claimed")
		if err := closePopups(ctx, b, screens.PetGacha); err != nil {
			return steps, 0, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return steps, 0, err
		}
	}
	if badged(frame, petAdBadge) || screens.Visible(frame, screens.TPetAdReady) {
		if err := b.Tap(ctx, petAdButton, "free pet ad draw"); err != nil {
			return steps, 0, err
		}
		if _, err := b.WatchAd(ctx); err != nil {
			return steps, 0, err
		}
		steps++
		b.Log.Info("free pet ad draw taken")
		if err := bot.Sleep(ctx, 3*time.Second); err != nil {
			return steps, 0, err
		}
		if err := closePopups(ctx, b, screens.PetGacha); err != nil {
			return steps, 0, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return steps, 0, err
		}
	}
	for draws := 0; draws < 5 && shapeSeen(frame, screens.TPetTicketIcon); draws++ {
		if err := b.Tap(ctx, petDrawMulti, "pet draw multiple"); err != nil {
			return steps, 0, err
		}
		_, f, err := b.Wait(ctx, 8*time.Second, screens.PetCount)
		if err != nil {
			return steps, 0, err
		}
		if !shapeSeen(f, screens.TPetCostTicket) {
			b.Log.Warn("pet draw not priced in tickets, backing out")
			_, err := b.Dismiss(ctx, screens.PetCount, f)
			return steps, 0, err
		}
		if err := b.TapTemplate(ctx, f, screens.TGachaDrawButton); err != nil {
			return steps, 0, err
		}
		steps++
		if err := bot.Sleep(ctx, 3*time.Second); err != nil {
			return steps, 0, err
		}
		if err := closePopups(ctx, b, screens.PetGacha); err != nil {
			return steps, 0, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return steps, 0, err
		}
	}
	// Tokens left under a multi-draw's 10 go one at a time.
	for draws := 0; draws < 10 && petTokenDraw(frame); draws++ {
		if err := b.Tap(ctx, petDrawSingle, "pet draw once"); err != nil {
			return steps, 0, err
		}
		steps++
		if err := bot.Sleep(ctx, 3*time.Second); err != nil {
			return steps, 0, err
		}
		if err := closePopups(ctx, b, screens.PetGacha); err != nil {
			return steps, 0, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return steps, 0, err
		}
	}

	level = petDrawLevel(frame)
	if reserve >= 0 && level > 0 && level < petDiamondLevel {
		n, err := petDiamondDraws(ctx, b, reserve)
		steps += n
		if err != nil {
			return steps, 0, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return steps, 0, err
		}
		level = petDrawLevel(frame)
	}
	return steps, level, nil
}

func petCultivate(ctx context.Context, b *bot.Bot) (steps int, err error) {
	if err := b.Tap(ctx, petCultivateTab, "pet cultivation tab"); err != nil {
		return steps, err
	}
	_, frame, err := b.Wait(ctx, 8*time.Second, screens.PetCultivate)
	if err != nil {
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
	return steps, b.ToMain(ctx)
}

// petDiamondDraws spends diamonds above reserve on pet draws, through the
// same draw-count dialog as weapon draws. Its slider tops out at the fewer
// of the draws left to the next Draw Level and the draws the diamonds pay
// for, and the knob is set from the balance, so a misread or a missed drag
// can only draw less. It stops at petDiamondLevel.
func petDiamondDraws(ctx context.Context, b *bot.Bot, reserve int) (draws int, err error) {
	for round := 0; round < 6; round++ {
		if err := closePopups(ctx, b, screens.PetGacha); err != nil {
			return draws, err
		}
		_, frame, err := b.Look(ctx)
		if err != nil {
			return draws, err
		}
		if lvl := petDrawLevel(frame); lvl == 0 || lvl >= petDiamondLevel {
			break
		}
		n, ok := screens.Diamonds(frame)
		if !ok {
			b.Log.Warn("could not read the diamond count", "shot", b.Save(frame))
			break
		}
		surplus := n - reserve
		if surplus < minDraws*petDrawCost {
			break
		}
		if err := b.Tap(ctx, petDrawMulti, "pet draw multiple"); err != nil {
			return draws, err
		}
		if _, frame, err = b.Wait(ctx, 8*time.Second, screens.PetCount); err != nil {
			return draws, err
		}
		if shapeSeen(frame, screens.TPetCostTicket) {
			// Tokens came in since the free draws; draw them first.
			if err := b.Tap(ctx, gachaDrawButton, "draw pet tokens"); err != nil {
				return draws, err
			}
			continue
		}
		target := sliderTarget(surplus/petDrawCost, n/petDrawCost)
		if err := b.D.Swipe(ctx, sliderMaxX, sliderY, 120, sliderY, 400*time.Millisecond); err != nil {
			return draws, err
		}
		if target > sliderMinX+3 {
			if err := b.D.Swipe(ctx, sliderMinX, sliderY, target, sliderY, 800*time.Millisecond); err != nil {
				return draws, err
			}
		}
		if err := bot.Sleep(ctx, time.Second); err != nil {
			return draws, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return draws, err
		}
		knob, found := sliderKnob(frame)
		if !found || knob > target+knobSlack {
			b.Log.Warn("pet draw slider not where planned, cancelling", "knob", knob, "target", target, "shot", b.Save(frame))
			_, err := b.Dismiss(ctx, screens.PetCount, frame)
			return draws, err
		}
		if err := b.Tap(ctx, gachaDrawButton, "draw pets with diamonds"); err != nil {
			return draws, err
		}
		draws++
		if err := bot.Sleep(ctx, 4*time.Second); err != nil {
			return draws, err
		}
	}
	if draws > 0 {
		b.Log.Info("pet diamond draws done", "batches", draws)
	}
	return draws, closePopups(ctx, b, screens.PetGacha)
}

// shapeSeen matches by shape only: ticket and diamond icons differ in shape
// (cross-score ~0.6), and the pet templates come from tutorial-dimmed frames.
func shapeSeen(frame image.Image, name string) bool {
	return assets.MustGet(name).Find(frame, screens.Margin).Score >= 0.9
}

// Mail claims all mail rewards. Delete All is deny-listed.
func Mail(ctx context.Context, b *bot.Bot) error {
	_, frame, err := openSystemEntry(ctx, b, image.Pt(388, 160), "mail", screens.Mail)
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
