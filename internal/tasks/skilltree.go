package tasks

import (
	"context"
	"image"
	"time"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
)

// skillPriority is the order skill points go in, best first, by the damage
// model (build.go) with each passive's level text from the game:
//   - Stealth Enhancement: Stealth Strike's two hits +150% each per level,
//     about +12% damage a level
//   - Supersonic Throw: Sonic Throw's 8 hits +25% and the final AoE +200%,
//     about +6% a level
//   - Killing Intent Rising: +1% Skill DMG per skill cast (10 stacks, 5 s);
//     with ~4 casts in 5 s a level adds about +2%
//
// Skills already at 5/5 or still locked take no points; their + is grey.
var skillPriority = []string{
	screens.TSkillStealthEnh,
	screens.TSkillSupersonic,
	screens.TSkillKIR,
}

var (
	skillTree     = image.Rect(0, 140, 720, 900)
	skillPlusFrom = image.Pt(61, -51) // the + button from its skill's label
	skillScrollUp = [2]image.Point{{360, 330}, {360, 820}}
)

// skillByPriority spends unspent skill points on the highest-priority skill
// that still takes one, finding each by its label as the tree scrolls, and
// confirms. It reports false when none of skillPriority could take a point
// (all maxed or not on screen), leaving the caller to fall back to the
// game's Recommended allocation.
func skillByPriority(ctx context.Context, b *bot.Bot, points int) (int, error) {
	spent := 0
	for _, label := range skillPriority {
		if spent >= points {
			break
		}
		plus, ok, err := findSkillPlus(ctx, b, label)
		if err != nil {
			return spent, err
		}
		if !ok {
			continue
		}
		for spent < points {
			_, frame, err := b.Look(ctx)
			if err != nil {
				return spent, err
			}
			if !plusLive(frame, plus) {
				break // maxed
			}
			if err := b.Tap(ctx, plus, "skill +"); err != nil {
				return spent, err
			}
			spent++
		}
	}
	if spent == 0 {
		return 0, nil
	}
	_, frame, err := b.Look(ctx)
	if err != nil {
		return spent, err
	}
	if err := b.TapTemplate(ctx, frame, screens.TAttrConfirm); err != nil {
		return spent, err
	}
	b.Log.Info("skill points allocated", "points", spent)
	return spent, nil
}

// findSkillPlus scrolls the tree (from the top) until label shows and
// returns its + button.
func findSkillPlus(ctx context.Context, b *bot.Bot, label string) (image.Point, bool, error) {
	t := assets.MustGet(label)
	for i := 0; i < 3; i++ { // to the top
		if err := b.D.Swipe(ctx, skillScrollUp[0].X, skillScrollUp[0].Y, skillScrollUp[1].X, skillScrollUp[1].Y, 400*time.Millisecond); err != nil {
			return image.Point{}, false, err
		}
	}
	for i := 0; i < 5; i++ {
		_, frame, err := b.Look(ctx)
		if err != nil {
			return image.Point{}, false, err
		}
		if m := t.FindIn(frame, skillTree); m.Score >= screens.MinScore {
			p := m.Center().Add(skillPlusFrom)
			if p.In(skillTree) {
				return p, true, nil
			}
		}
		if err := b.D.Swipe(ctx, skillScrollUp[1].X, skillScrollUp[1].Y-120, skillScrollUp[0].X, skillScrollUp[0].Y, 600*time.Millisecond); err != nil {
			return image.Point{}, false, err
		}
		if err := bot.Sleep(ctx, 800*time.Millisecond); err != nil {
			return image.Point{}, false, err
		}
	}
	return image.Point{}, false, nil
}

// plusLive reports whether a skill's + button can be tapped: its face is
// cream (~232) then, grey (~170) when the skill is maxed or no points are
// left. The strip sampled is below the + sign.
func plusLive(frame image.Image, p image.Point) bool {
	r, g, bl := meanRGB(frame, image.Rect(p.X-12, p.Y+10, p.X+12, p.Y+18))
	return (r+g+bl)/3 > 200
}
