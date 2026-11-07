package tasks

import (
	"context"
	"fmt"
	"image"
	"image/color"
	"math"
	"slices"
	"time"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/vision"
)

// attributeTab is the Attribute tab in the Character page's bottom bar.
var attributeTab = image.Pt(350, 1235)

// open goes from the main screen to a bottom-nav page.
func open(ctx context.Context, b *bot.Bot, nav string, want ...screens.ID) (image.Image, error) {
	if id, frame, err := b.Look(ctx); err != nil {
		return nil, err
	} else if slices.Contains(want, id) {
		return frame, nil
	}
	if err := b.ToMain(ctx); err != nil {
		return nil, err
	}
	// The bottom nav never moves, but badges, guide arrows and highlights
	// sit on its labels, so tap by position.
	p, ok := navAt[nav]
	if !ok {
		return nil, fmt.Errorf("open: no position for nav %s", nav)
	}
	_, frame, err := b.TapWait(ctx, screens.Main, p, nav, 10*time.Second, want...)
	return frame, err
}

var navAt = map[string]image.Point{
	screens.TNavCharacter: {77, 1215},
	screens.TNavWeapon:    {190, 1215},
	screens.TNavEquipment: {304, 1215},
	screens.TNavPet:       {412, 1215},
	screens.TNavGameMode:  {643, 1215},
}

var (
	// skillTab is the Skill tab in the Character page's bottom bar, and
	// skillTabBadge the badge it shows while skill points are unspent.
	skillTab      = image.Pt(453, 1235)
	skillTabBadge = image.Pt(490, 1192)
	// statPlusX is the column of the Attribute page's + buttons.
	statPlusX = 651
)

var statNames = [6]string{"STR", "AGI", "VIT", "INT", "DEX", "LUK"}

// Attributes spends free attribute points where they add the most damage
// (see build.go) instead of the game's Recommended Allocation, which the
// model puts about 3% behind. Unspent skill points go by our own skill
// order (skilltree.go); which actives sit on the skill bar is chosen by
// hand.
func Attributes(ctx context.Context, b *bot.Bot) (bool, error) {
	// Character opens on whichever tab is badged.
	frame, err := open(ctx, b, screens.TNavCharacter, screens.Attribute, screens.CharOverview, screens.CharSkill, screens.Awakening)
	if err != nil {
		return false, err
	}
	skillsDone := false
	if badged(frame, skillTabBadge) {
		if id := screens.Detect(frame); id != screens.CharSkill {
			if _, frame, err = b.TapWait(ctx, id, skillTab, "skill tab", 10*time.Second, screens.CharSkill); err != nil {
				return false, err
			}
		}
		// A skill that will not take its point must not hold up the
		// attribute points: on 7 Nov a locked skill did, for 12 runs.
		if skillsDone, err = skills(ctx, b, frame); err != nil {
			b.Log.Warn("skill points not spent", "err", err)
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return skillsDone, err
		}
	}
	if id := screens.Detect(frame); id != screens.Attribute {
		if _, frame, err = b.TapWait(ctx, id, attributeTab, "attribute tab", 10*time.Second, screens.Attribute); err != nil {
			return false, err
		}
	}
	spent := 0
	// After a reset (nothing allocated) the whole pool goes to bestBuild;
	// otherwise new points go point by point.
	var target [6]int
	// The game drops a tap now and then; confirm, read the page again and
	// spend what is left.
	for pass := 0; pass < 3; pass++ {
		// The counter first: a power-up banner can cover the stat rows
		// right after a confirm, when nothing is left to spend anyway.
		points, okPoints := screens.AttributePoints(frame)
		if okPoints && points == 0 {
			break
		}
		alloc, okAlloc := screens.AttributeAllocation(frame)
		if !okAlloc || !okPoints {
			b.Log.Warn("could not read the attribute page", "shot", b.Save(frame))
			break
		}
		readBonuses(b, frame, alloc)
		// Points on top drift from the best split; once a rebuild beats them
		// by rebuildGain, reset (free) and spend the whole pool again.
		if pass == 0 && alloc != ([6]int{}) {
			if best, ok := rebuildBeats(alloc, points); ok {
				b.Log.Info("attributes reset for a rebuild", "alloc", alloc, "points", points)
				if frame, err = resetAttributes(ctx, b); err != nil {
					return skillsDone || spent > 0, err
				}
				points, okPoints = screens.AttributePoints(frame)
				alloc, okAlloc = screens.AttributeAllocation(frame)
				if !okPoints || !okAlloc || alloc != ([6]int{}) {
					b.Log.Warn("attribute reset left points allocated", "shot", b.Save(frame))
					break
				}
				target = best
			}
		}
		if alloc == ([6]int{}) && points >= rebuildPoints {
			if target == ([6]int{}) {
				target = bestBuild(points)
			}
			b.Log.Info("attribute pool rebuilt", "points", points, "str", target[statSTR], "agi", target[statAGI],
				"vit", target[statVIT], "dex", target[statDEX], "luk", target[statLUK])
		}
		taps := 0
		for {
			s, ok := towards(target, alloc, points)
			if !ok {
				s, ok = nextStat(alloc, points)
			}
			if !ok {
				break
			}
			if err := b.Tap(ctx, image.Pt(statPlusX, screens.AttrRows[s]), "add "+statNames[s]); err != nil {
				return skillsDone || spent > 0, err
			}
			points -= pointCost(alloc[s])
			alloc[s]++
			taps++
		}
		if taps == 0 {
			break
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return skillsDone || spent > 0, err
		}
		if err := b.TapTemplate(ctx, frame, screens.TAttrConfirm); err != nil {
			return skillsDone || spent > 0, err
		}
		spent += taps
		b.Log.Info("attribute points allocated", "taps", taps,
			"str", alloc[statSTR], "agi", alloc[statAGI], "vit", alloc[statVIT], "dex", alloc[statDEX], "luk", alloc[statLUK])
		if _, frame, err = b.Look(ctx); err != nil {
			return true, err
		}
	}
	awoken, err := awaken(ctx, b)
	if err != nil {
		return true, err
	}
	return spent > 0 || skillsDone || awoken > 0, b.ToMain(ctx)
}

var (
	awakeningTab = image.Pt(553, 1235)
	// The build's two awakenings (Assassin: Shadow Assault on Skill CRIT,
	// Killing Intent Rhythm on STR) and the tier list under them.
	awakenings     = []image.Point{{213, 140}, {507, 140}}
	awakeningTiers = image.Rect(120, 440, 705, 1170)
)

// awaken activates every Awakening tier whose stat threshold is met. Tiers
// add Skill DMG, PATK and skill effects; they do nothing until activated.
func awaken(ctx context.Context, b *bot.Bot) (int, error) {
	_, frame, err := b.Look(ctx)
	if err != nil {
		return 0, err
	}
	if id := screens.Detect(frame); id != screens.Awakening {
		if _, _, err = b.TapWait(ctx, id, awakeningTab, "awakening tab", 8*time.Second, screens.Awakening); err != nil {
			return 0, err
		}
	}
	can := assets.MustGet(screens.TCanActivate)
	n := 0
	for _, a := range awakenings {
		if err := b.Tap(ctx, a, "awakening"); err != nil {
			return n, err
		}
		for i := 0; i < 6; i++ {
			_, frame, err := b.Look(ctx)
			if err != nil {
				return n, err
			}
			m := can.FindIn(frame, awakeningTiers)
			if !m.Visible(screens.MinScore) {
				break
			}
			if err := b.Tap(ctx, m.Center(), "activate awakening tier"); err != nil {
				return n, err
			}
			n++
			if err := closePopups(ctx, b, screens.Awakening); err != nil {
				return n, err
			}
		}
	}
	if n > 0 {
		b.Log.Info("awakening tiers activated", "count", n)
	}
	return n, nil
}

// attrResetConfirm is Confirm on the reset's System Notice.
var attrResetConfirm = image.Pt(497, 830)

// resetAttributes returns every allocated point to the pool (the reset is
// free) and hands back the Attribute page after it.
func resetAttributes(ctx context.Context, b *bot.Bot) (image.Image, error) {
	_, frame, err := b.Look(ctx)
	if err != nil {
		return nil, err
	}
	if err := b.TapTemplate(ctx, frame, screens.TAttrReset); err != nil {
		return nil, err
	}
	for i := 0; i < 4; i++ {
		if _, frame, err = b.Look(ctx); err != nil {
			return nil, err
		}
		if screens.Visible(frame, screens.TAttrResetNotice) {
			if err := b.Tap(ctx, attrResetConfirm, "confirm attribute reset"); err != nil {
				return nil, err
			}
			_, frame, err = b.Wait(ctx, 10*time.Second, screens.Attribute)
			return frame, err
		}
	}
	return nil, fmt.Errorf("attribute reset: the confirmation notice never showed")
}

// rebuildPoints is the smallest unspent pool, with nothing allocated, that
// Attributes treats as a reset to rebuild rather than a new character.
const rebuildPoints = 50

// towards returns a stat still below target that the points can pay for.
func towards(target, alloc [6]int, points int) (int, bool) {
	for s := range target {
		if alloc[s] < target[s] && pointCost(alloc[s]) <= points {
			return s, true
		}
	}
	return 0, false
}

// readBonuses updates statBonus from the Attribute page, so Awakening
// thresholds (on total stats) are planned with today's pets and cards.
func readBonuses(b *bot.Bot, frame image.Image, alloc [6]int) {
	total, ok := screens.AttributeTotals(frame)
	if !ok {
		return
	}
	var bonus [6]int
	for i := range total {
		if bonus[i] = total[i] - alloc[i]; bonus[i] < 0 {
			return // a misread
		}
	}
	if bonus != statBonus {
		statBonus = bonus
		b.Log.Info("stat bonuses", "str", bonus[statSTR], "agi", bonus[statAGI], "vit", bonus[statVIT],
			"int", bonus[statINT], "dex", bonus[statDEX], "luk", bonus[statLUK])
	}
	// The rates set the CRIT, Skill CRIT and Aspd bases the plan builds on.
	if crit, sc, aspd, ok := screens.AttributeRates(frame); ok {
		before := [3]float64{baseCRIT, baseSkillCR, aspdBonus}
		calibrate(total, crit, sc, aspd)
		if after := [3]float64{baseCRIT, baseSkillCR, aspdBonus}; after != before {
			b.Log.Info("attribute bases", "crit", baseCRIT, "skill_crit", baseSkillCR, "aspd_bonus", aspdBonus)
		}
	}
}

// skills spends unspent skill points in our own order (skilltree.go). The
// game's Recommended Allocation is never used: it resets every skill to its
// own plan. Points no skill in our order takes (all maxed, or new skills
// after a job change) stay unspent until the order learns those skills.
func skills(ctx context.Context, b *bot.Bot, frame image.Image) (bool, error) {
	n, err := skillByPriority(ctx, b, 20)
	if err != nil {
		return n > 0, err
	}
	if _, frame, err = b.Look(ctx); err != nil {
		return n > 0, err
	}
	if badged(frame, skillTabBadge) {
		b.Log.Warn("skill points left that no skill in our order takes", "shot", b.Save(frame))
	}
	return n > 0, nil
}

// Enhance slots on the Enhance page: the item icon and its upgrade badge.
var enhanceSlots = [...]struct{ icon, badge image.Point }{
	{image.Pt(67, 163), image.Pt(118, 115)},  // armor
	{image.Pt(67, 275), image.Pt(118, 227)},  // belt
	{image.Pt(67, 387), image.Pt(118, 339)},  // pants
	{image.Pt(653, 163), image.Pt(704, 115)}, // cape
	{image.Pt(653, 275), image.Pt(704, 227)}, // gloves
	{image.Pt(653, 387), image.Pt(704, 339)}, // boots
	{image.Pt(67, 497), image.Pt(118, 449)},  // accessory left
	{image.Pt(653, 497), image.Pt(704, 449)}, // accessory right
}

// setItems is how many of enhanceSlots, the first ones, are the armour set;
// the rest are accessories. Enhance Resonance counts all eight ("8 items
// enhanced to Level 85"), read 5 Nov.
const setItems = 6

// enhanceLevels caches each slot's level as read on the Enhance page (0: not
// read yet). Every selection reads it again, so it stays in step with the
// game across runs.
var enhanceLevels [len(enhanceSlots)]int

// unreadLevel stands in for a level the digit reader could not read: the
// slot goes last rather than soaking up every level.
const unreadLevel = 1000

// bagTile21 is the top strip of the 21st tile in the Equipment page's gear
// grid (row 4, column 3). Empty slots show the panel's beige.
var bagTile21 = image.Rect(270, 990, 340, 1002)

// BagOver20 reports whether the gear bag holds more than 20 items.
func BagOver20(frame image.Image) bool {
	r, g, b := meanRGB(frame, bagTile21)
	d := math.Abs(r-230) + math.Abs(g-226) + math.Abs(b-216)
	return d > 40
}

func meanRGB(frame image.Image, rect image.Rectangle) (r, g, b float64) {
	n := 0.0
	for y := rect.Min.Y; y < rect.Max.Y; y++ {
		for x := rect.Min.X; x < rect.Max.X; x++ {
			cr, cg, cb, _ := frame.At(x, y).RGBA()
			r, g, b, n = r+float64(cr>>8), g+float64(cg>>8), b+float64(cb>>8), n+1
		}
	}
	return r / n, g / n, b / n
}

// Bag grid geometry on the Equipment page: 6 columns, 109x110 px pitch.
const (
	bagX0, bagY0         = 42, 658
	bagPitchX, bagPitchY = 109, 110
)

// upgradeArrow is the yellow-green up-arrow the game draws on a bag item that
// beats what is equipped in its slot.
func upgradeArrow(c color.RGBA) bool {
	return c.G > 140 && int(c.G)-int(c.B) > 70 && int(c.R)-int(c.G) < 15 && int(c.G) > int(c.R)-15 && c.B < 90
}

// upgradeTile returns the centre of the first bag tile showing the arrow.
func upgradeTile(frame image.Image) (image.Point, bool) {
	for row := 0; row < 4; row++ {
		for col := 0; col < 6; col++ {
			x0, y0 := bagX0+col*bagPitchX, bagY0+row*bagPitchY
			if vision.Ratio(frame, image.Rect(x0+70, y0, x0+96, y0+30), upgradeArrow) > 0.08 {
				return image.Pt(x0+46, y0+47), true
			}
		}
	}
	return image.Point{}, false
}

// equipUpgrades equips every bag item the game marks as an upgrade. The
// game auto-equips most drops but not accessories: a first one shows Equip,
// a better one than worn shows Replace (enhancement levels carry over).
func equipUpgrades(ctx context.Context, b *bot.Bot, frame image.Image) (int, error) {
	n := 0
	for n < 8 {
		p, ok := upgradeTile(frame)
		if !ok {
			break
		}
		if err := b.Tap(ctx, p, "upgrade item"); err != nil {
			return n, err
		}
		_, f, err := b.Look(ctx)
		if err != nil {
			return n, err
		}
		button := screens.TItemEquip
		if !screens.Visible(f, button) {
			button = screens.TItemReplace
		}
		if !screens.Visible(f, button) {
			b.Log.Warn("upgrade item popup has no Equip or Replace button", "shot", b.Save(f))
			_, err := b.Dismiss(ctx, screens.Detect(f), f)
			return n, err
		}
		if err := b.TapTemplate(ctx, f, button); err != nil {
			return n, err
		}
		n++
		b.Log.Info("equipped upgrade")
		if err := closePopups(ctx, b, screens.Equipment); err != nil {
			return n, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return n, err
		}
	}
	return n, nil
}

// dismantle runs One-Click Dismantle when the bag passes 20 items. The
// game's Dismantle Settings ("decompose equipment with lower Combat Power")
// decide what goes, so better gear is never in the list; the output is
// summon-upgrade crystals.
func dismantle(ctx context.Context, b *bot.Bot, frame image.Image) (bool, error) {
	if !BagOver20(frame) {
		return false, nil
	}
	if err := b.TapTemplate(ctx, frame, screens.TOneClickDismantle); err != nil {
		return false, err
	}
	id, f, err := b.Look(ctx)
	if err != nil {
		return false, err
	}
	if id != screens.DismantleConfirm {
		return false, nil // nothing weaker than what is equipped
	}
	if err := b.TapTemplate(ctx, f, screens.TDismantleOK); err != nil {
		return false, err
	}
	b.Log.Info("spare equipment dismantled")
	return true, closePopups(ctx, b, screens.Equipment)
}

// enhanceCost is the "have" count above the Enhance button; green when the
// next level is affordable.
var enhanceCost = image.Rect(160, 1054, 205, 1078)

// "Enhance to Level N" beside it takes the item to the next multiple of 5
// in one tap; N changes, so it is found by position, and its own "have"
// count is green when all those levels are affordable.
var (
	enhanceToButton = image.Pt(535, 1120)
	enhanceToCost   = image.Rect(515, 1054, 560, 1078)
)

// Enhance Resonate: every 5 levels, once all six items reach the next tier,
// its badge lights up and Activate grants a set-wide stat bonus.
var (
	resonateButton = image.Pt(640, 935)
	resonateBadge  = image.Pt(666, 904)
)

// resonate activates the next resonance tier if its badge shows.
func resonate(ctx context.Context, b *bot.Bot, frame image.Image) (bool, error) {
	if !badged(frame, resonateBadge) {
		return false, nil
	}
	_, frame, err := b.TapWait(ctx, screens.Enhance, resonateButton, "enhance resonate", 8*time.Second, screens.Resonate)
	if err != nil {
		return false, err
	}
	if err := b.TapTemplate(ctx, frame, screens.TResonateActivate); err != nil {
		return false, err
	}
	b.Log.Info("enhance resonance activated")
	if err := bot.Sleep(ctx, 2*time.Second); err != nil {
		return true, err
	}
	_, frame, err = b.Look(ctx)
	if err != nil {
		return true, err
	}
	_, err = b.Dismiss(ctx, screens.Detect(frame), frame)
	return true, err
}

func badged(frame image.Image, p image.Point) bool {
	return vision.Ratio(frame, image.Rectangle{Min: p.Sub(image.Pt(7, 7)), Max: p.Add(image.Pt(7, 7))}, vision.IsBadgeRed) > 0.25
}

// Equipment activates cards, equips marked upgrades, dismantles spares once
// the bag passes 20, then enhances gear (see enhance).
func Equipment(ctx context.Context, b *bot.Bot) (levels int, err error) {
	// Equipment opens on whichever tab is badged; Card first if it is.
	frame, err := open(ctx, b, screens.TNavEquipment, screens.Equipment, screens.CardPage, screens.CollectionGear)
	if err != nil {
		return 0, err
	}
	if screens.Detect(frame) == screens.CollectionGear {
		n, err := collectionGear(ctx, b, screens.CollectionGear)
		levels += n
		if err != nil {
			return levels, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return levels, err
		}
	}
	// The page opens on the Equipment tab when that is badged too, so a
	// badged Card tab (a card to activate, a star level to raise) is
	// visited from there.
	if screens.Detect(frame) == screens.Equipment && badged(frame, cardTabBadge) {
		if _, frame, err = b.TapWait(ctx, screens.Equipment, cardTab, "card tab", 8*time.Second, screens.CardPage); err != nil {
			return levels, err
		}
	}
	if screens.Detect(frame) == screens.CardPage {
		n, err := cards(ctx, b)
		levels += n
		if err != nil {
			return levels, err
		}
		if err := b.Tap(ctx, equipmentTab, "equipment tab"); err != nil {
			return levels, err
		}
		if _, frame, err = b.Wait(ctx, 8*time.Second, screens.Equipment); err != nil {
			return levels, err
		}
	}
	if badged(frame, colGearTabBadge) {
		n, err := collectionGear(ctx, b, screens.Equipment)
		levels += n
		if err != nil {
			return levels, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return levels, err
		}
	}
	n, err := equipUpgrades(ctx, b, frame)
	levels += n
	if err != nil {
		return levels, err
	}
	// Closing an unexpected item popup can leave the page; come back to it.
	if frame, err = open(ctx, b, screens.TNavEquipment, screens.Equipment); err != nil {
		return levels, err
	}
	if ok, err := dismantle(ctx, b, frame); err != nil {
		return levels, err
	} else if ok {
		levels++ // crystals feed summon upgrades
		if _, frame, err = b.Look(ctx); err != nil {
			return levels, err
		}
	}
	if err := b.TapTemplate(ctx, frame, screens.TEquipUpgrade); err != nil {
		return 0, err
	}
	// The page reopens on the tab used last: Refine once refining has run,
	// Enchantment once its tutorial has.
	id, _, err := b.Wait(ctx, 10*time.Second, screens.Enhance, screens.Refine, screens.Enchant)
	if err != nil {
		return 0, err
	}
	if id != screens.Enhance {
		if _, _, err := b.TapWait(ctx, id, enhanceTab, "enhance tab", 8*time.Second, screens.Enhance); err != nil {
			return 0, err
		}
	}

	n, err = enhance(ctx, b)
	levels += n
	if err != nil {
		return levels, err
	}
	b.Log.Info("equipment enhanced", "levels", levels, "set", enhanceLevels[:setItems], "accessories", enhanceLevels[setItems:])
	if id, _, err := b.Look(ctx); err == nil && id == screens.Enhance {
		r, err := refineGear(ctx, b)
		levels += r
		if err != nil {
			return levels, err
		}
	}
	if id, _, err := b.Look(ctx); err == nil && (id == screens.Enhance || id == screens.Refine) {
		e, err := enchantGear(ctx, b, id)
		levels += e
		if err != nil {
			return levels, err
		}
	}
	return levels, b.ToMain(ctx)
}

// The Enhance and Refine tabs at the bottom of the gear upgrade page.
var (
	enhanceTab = image.Pt(453, 1240)
	refineTab  = image.Pt(553, 1240)
)

// minRefineRate is the lowest success rate a refine is tried at.
const minRefineRate = 60

// refineMaterial is the Refine Meteorite count under the material icon
// ("4/2"): green when there are enough, red when not.
var refineMaterial = image.Rect(80, 985, 125, 1010)

// refineHeldUntil skips refining after a pass found nothing to try: the
// slot badges stay lit while Refine Meteorites are left, so they do not say
// whether a refine at good odds is waiting.
var refineHeldUntil time.Time

// refineGear refines badged gear one level at a time, round-robin like
// enhancing, while the game's odds for the next level ("Success Rate: 95%")
// are minRefineRate or better. Refine levels carry over to new gear. The
// game does not say what a failure costs, so the screen after each refine
// short of 100% is saved for a look.
func refineGear(ctx context.Context, b *bot.Bot) (tries int, err error) {
	if time.Now().Before(refineHeldUntil) {
		return 0, nil
	}
	if _, _, err := b.TapWait(ctx, screens.Enhance, refineTab, "refine tab", 8*time.Second, screens.Refine); err != nil {
		return 0, err
	}
	for round := 0; round < 4; round++ {
		_, frame, err := b.Look(ctx)
		if err != nil {
			return tries, err
		}
		progressed := false
		for _, s := range enhanceSlots {
			if !badged(frame, s.badge) {
				continue
			}
			if err := b.Tap(ctx, s.icon, "refine slot"); err != nil {
				return tries, err
			}
			_, sel, err := b.Look(ctx)
			if err != nil {
				return tries, err
			}
			rate, ok := screens.RefineRate(sel)
			enough := vision.Ratio(sel, refineMaterial, vision.IsGreenText) > 0.03
			if !ok || rate < minRefineRate || !enough || !screens.Visible(sel, screens.TRefineButton) {
				continue
			}
			if err := b.TapTemplate(ctx, sel, screens.TRefineButton); err != nil {
				return tries, err
			}
			tries++
			progressed = true
			if rate < 100 {
				if _, res, err := b.Look(ctx); err == nil {
					b.Log.Info("refine tried", "rate", rate, "shot", b.Save(res))
				}
			}
			if err := closePopups(ctx, b, screens.Refine); err != nil {
				return tries, err
			}
			if _, frame, err = b.Look(ctx); err != nil {
				return tries, err
			}
		}
		if !progressed {
			break
		}
	}
	if tries > 0 {
		b.Log.Info("gear refined", "tries", tries)
	}
	refineHeldUntil = time.Now().Add(12 * time.Hour)
	return tries, nil
}

// enhance spends materials one level at a time on the lowest-level badged
// slot (see lowestBadged), so the six set items reach the next Enhance
// Resonance tier (every 5 levels) together and the tier is activated as soon
// as it unlocks. It stops when nothing is badged or the next level is
// unaffordable.
func enhance(ctx context.Context, b *bot.Bot) (levels int, err error) {
	selected := -1
	for step := 0; step < 50; step++ {
		id, frame, err := b.Look(ctx)
		if err != nil {
			return levels, err
		}
		if id != screens.Enhance {
			b.Log.Warn("left enhance page", "screen", id)
			return levels, nil
		}
		if ok, err := resonate(ctx, b, frame); err != nil {
			return levels, err
		} else if ok {
			levels++ // counts as growth for the planner
			selected = -1
			continue
		}
		i, ok := lowestBadged(frame)
		if !ok {
			return levels, nil
		}
		if i != selected {
			if err := b.Tap(ctx, enhanceSlots[i].icon, "enhance slot"); err != nil {
				return levels, err
			}
			if _, frame, err = b.Look(ctx); err != nil {
				return levels, err
			}
			selected = i
		}
		firstRead := enhanceLevels[i] == 0
		if lv, ok := screens.EnhanceLevel(frame); ok {
			enhanceLevels[i] = lv
		} else if firstRead {
			b.Log.Warn("could not read enhance level", "slot", i, "shot", b.Save(frame))
			enhanceLevels[i] = unreadLevel
		}
		if firstRead {
			continue // pick again knowing this slot's level
		}
		if vision.Ratio(frame, enhanceToCost, vision.IsGreenText) >= 0.05 {
			// Up to five levels for one tap and one look instead of five.
			from := enhanceLevels[i]
			if err := b.Tap(ctx, enhanceToButton, "enhance to next tier"); err != nil {
				return levels, err
			}
			if err := closePopups(ctx, b, screens.Enhance); err != nil {
				return levels, err
			}
			to := (from/5 + 1) * 5
			if from != unreadLevel {
				levels += to - from
			}
			enhanceLevels[i] = to // read again on the next pass
			continue
		}
		if vision.Ratio(frame, enhanceCost, vision.IsGreenText) < 0.05 {
			b.Log.Info("enhance materials exhausted")
			return levels, nil
		}
		if err := b.TapTemplate(ctx, frame, screens.TEnhanceButton); err != nil {
			return levels, err
		}
		enhanceLevels[i]++
		levels++
	}
	return levels, nil
}

// lowestBadged picks the badged slot with the lowest known level (unread
// ones first, so they get read), accessories included: a low level costs
// far less than a high one, Enhance Resonance waits on the lowest of all
// eight, and every level counts toward the job change's total enhancement
// task.
func lowestBadged(frame image.Image) (int, bool) {
	best := -1
	for i := range enhanceSlots {
		if badged(frame, enhanceSlots[i].badge) && (best < 0 || enhanceLevels[i] < enhanceLevels[best]) {
			best = i
		}
	}
	return best, best >= 0
}
