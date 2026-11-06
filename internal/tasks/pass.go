package tasks

import (
	"context"
	"image"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
)

var (
	passClaimAll   = image.Pt(188, 1129)
	passClaimBadge = image.Pt(285, 1105)
	// The tab bar (Weapon, Pet, Equipment, Collection Gear, ...) scrolls
	// and gains tabs as features unlock, so tabs are found by their badges
	// (top right of each tab) rather than at fixed spots.
	passTabBadges  = image.Rect(100, 1196, 720, 1220)
	passTabFromDot = image.Pt(-65, 38)
	passTabBarY    = 1245
)

// SeasonPass claims the free track of every pass tab that is badged
// (weapon gacha, pet gacha, elite summon, collection gear). The paid unlock
// is guarded by a deny area.
func SeasonPass(ctx context.Context, b *bot.Bot) (claimed int, err error) {
	if err := b.ToMain(ctx); err != nil {
		return 0, err
	}
	_, frame, err := b.Look(ctx)
	if err != nil {
		return 0, err
	}
	icon, ok := screens.SeasonPassIcon(frame)
	if !ok {
		return 0, nil
	}
	if _, _, err := b.TapWait(ctx, screens.Main, icon, "season pass", 10*time.Second, screens.SeasonPass); err != nil {
		return 0, err
	}
	tried := map[int]bool{} // tab badges already followed, by x/40
	scrolled := false
	for range 10 {
		_, frame, err := b.Wait(ctx, 8*time.Second, screens.SeasonPass)
		if err != nil {
			return claimed, err
		}
		if badged(frame, passClaimBadge) {
			if err := b.Tap(ctx, passClaimAll, "pass claim all"); err != nil {
				return claimed, err
			}
			claimed++
			if err := closePopups(ctx, b, screens.SeasonPass); err != nil {
				return claimed, err
			}
			continue
		}
		dot, ok := nextBadgeIn(frame, passTabBadges, func(p image.Point) bool { return tried[p.X/40] })
		if !ok {
			if scrolled {
				break
			}
			// Tabs past the right edge: scroll the bar and look again.
			scrolled = true
			clear(tried)
			if err := b.D.Swipe(ctx, 600, passTabBarY, 150, passTabBarY, 400*time.Millisecond); err != nil {
				return claimed, err
			}
			if err := bot.Sleep(ctx, time.Second); err != nil {
				return claimed, err
			}
			continue
		}
		tried[dot.X/40] = true
		if err := b.Tap(ctx, dot.Add(passTabFromDot), "pass tab"); err != nil {
			return claimed, err
		}
	}
	if claimed > 0 {
		b.Log.Info("season pass claimed", "tabs", claimed)
	}
	return claimed, b.ToMain(ctx)
}

// nextBadgeIn scans r for a red badge dot and returns its centre, skipping
// those skip reports; false when none is left.
func nextBadgeIn(frame image.Image, r image.Rectangle, skip func(image.Point) bool) (image.Point, bool) {
	for x := r.Min.X; x < r.Max.X; x += 4 {
		for y := r.Min.Y; y < r.Max.Y; y += 4 {
			p := image.Pt(x, y)
			if !badged(frame, p) {
				continue
			}
			// Centre it: walk right and down while still on the dot.
			c := p
			for badged(frame, c.Add(image.Pt(2, 0))) && c.X-p.X < 20 {
				c.X += 2
			}
			c.X = (p.X + c.X) / 2
			for badged(frame, c.Add(image.Pt(0, 2))) && c.Y-p.Y < 20 {
				c.Y += 2
			}
			c.Y = (p.Y + c.Y) / 2
			if skip == nil || !skip(c) {
				return c, true
			}
			x += 24 // past this dot
			break
		}
	}
	return image.Point{}, false
}
