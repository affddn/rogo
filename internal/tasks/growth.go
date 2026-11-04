package tasks

import (
	"context"
	"fmt"
	"image"
	"image/color"
	"math"
	"slices"
	"time"

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

// Attributes spends free attribute points with the game's Recommended
// Allocation, which follows the class's intended build.
func Attributes(ctx context.Context, b *bot.Bot) (bool, error) {
	// Character opens on whichever tab is badged.
	frame, err := open(ctx, b, screens.TNavCharacter, screens.Attribute, screens.CharOverview, screens.CharSkill)
	if err != nil {
		return false, err
	}
	if screens.Detect(frame) != screens.Attribute {
		if err := b.Tap(ctx, attributeTab, "attribute tab"); err != nil {
			return false, err
		}
		if _, frame, err = b.Wait(ctx, 10*time.Second, screens.Attribute); err != nil {
			return false, err
		}
	}
	if err := b.TapTemplate(ctx, frame, screens.TAttrRecommended); err != nil {
		return false, err
	}
	_, frame, err = b.Look(ctx)
	if err != nil {
		return false, err
	}
	spent := screens.Visible(frame, screens.TAttrConfirm)
	if spent {
		if err := b.TapTemplate(ctx, frame, screens.TAttrConfirm); err != nil {
			return false, err
		}
		b.Log.Info("attribute points allocated")
	}
	return spent, b.ToMain(ctx)
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

// setItems is how many of enhanceSlots, the first ones, count toward Enhance
// Resonance; the two accessories do not.
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
	frame, err := open(ctx, b, screens.TNavEquipment, screens.Equipment, screens.CardPage)
	if err != nil {
		return 0, err
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
	if _, _, err = b.Wait(ctx, 10*time.Second, screens.Enhance); err != nil {
		return 0, err
	}

	n, err = enhance(ctx, b)
	levels += n
	if err != nil {
		return levels, err
	}
	b.Log.Info("equipment enhanced", "levels", levels, "set", enhanceLevels[:setItems], "accessories", enhanceLevels[setItems:])
	return levels, b.ToMain(ctx)
}

// enhance spends materials one level at a time on the lowest-level badged set
// item, so all six reach the next Enhance Resonance tier (every 5 levels)
// together and the tier is activated as soon as it unlocks. Accessories get
// levels only when no set item can. It stops when nothing is badged or the
// next level is unaffordable.
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

// lowestBadged picks the badged set item with the lowest known level (unread
// ones first, so they get read), else the lowest badged accessory.
func lowestBadged(frame image.Image) (int, bool) {
	pick := func(from, to int) int {
		best := -1
		for i := from; i < to; i++ {
			if badged(frame, enhanceSlots[i].badge) && (best < 0 || enhanceLevels[i] < enhanceLevels[best]) {
				best = i
			}
		}
		return best
	}
	if i := pick(0, setItems); i >= 0 {
		return i, true
	}
	i := pick(setItems, len(enhanceSlots))
	return i, i >= 0
}
