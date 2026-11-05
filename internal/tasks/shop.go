package tasks

import (
	"context"
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

// The System menu's Shop sells growth materials for each mode's own coins
// (Baphomet, Dungeon, Rune Arena and guild coins). Nothing else spends those
// coins, so each pass buys the wanted items in every tab while they last.
var (
	systemMenuBtn = image.Pt(671, 180)
	shopEntry     = image.Pt(580, 165)
	// The item grid between the shopkeeper banner and the tab bar: three
	// columns of cards, searched as strips around their icons.
	shopColumns = []int{128, 360, 592}
	shopRows    = [2]int{310, 1170}
	// A card's price bar sits this far below its icon's centre.
	shopPriceDY = 128
	// The price text inside the bar: red while the coins fall short.
	shopPriceText = image.Rect(-50, -14, 50, 14)
	// Buy dialog: quantity slider buttons, and the cost line ("856/200")
	// whose coin count is green while it covers the quantity.
	shopPlus     = image.Pt(547, 733)
	shopMinus    = image.Pt(173, 733)
	shopCost     = image.Rect(330, 802, 425, 832)
	shopCostIcon = image.Rect(294, 800, 326, 834)
)

type shopTab struct {
	name  string
	tap   image.Point
	items []string // item icon templates, most wanted first
}

// shopTabs lists what each tab's coins go to: refine meteorites and Star
// Powder are scarce and gate refining and enchanting, metal feeds enhancing.
var shopTabs = []shopTab{
	{"baphomet", image.Pt(350, 1240), []string{screens.TShopMeteorite, screens.TShopMetal200}},
	{"dungeon", image.Pt(455, 1240), []string{screens.TShopMetal20}},
	{"rune arena", image.Pt(556, 1240), []string{screens.TShopStarPowder, screens.TShopMetal200}},
	{"guild", image.Pt(660, 1240), []string{screens.TShopMetal100}},
}

// Shop buys every wanted item the coins cover, tab by tab.
func Shop(ctx context.Context, b *bot.Bot) (bought int, err error) {
	if err := b.ToMain(ctx); err != nil {
		return 0, err
	}
	if err := b.Tap(ctx, systemMenuBtn, "system menu"); err != nil {
		return 0, err
	}
	if err := b.Tap(ctx, shopEntry, "shop"); err != nil {
		return 0, err
	}
	if _, _, err := b.Wait(ctx, 8*time.Second, screens.Shop, screens.GuildShop); err != nil {
		return 0, err
	}
	for _, tab := range shopTabs {
		n, err := shopTabBuy(ctx, b, tab)
		bought += n
		if err != nil {
			return bought, err
		}
	}
	if bought > 0 {
		b.Log.Info("shop items bought", "lots", bought)
	}
	return bought, b.ToMain(ctx)
}

// shopTabBuy opens a tab and buys its items from the top of the grid, then
// from the bottom (a tab holds up to four rows; three fit).
func shopTabBuy(ctx context.Context, b *bot.Bot, tab shopTab) (bought int, err error) {
	if err := b.Tap(ctx, tab.tap, tab.name+" shop tab"); err != nil {
		return 0, err
	}
	for _, swipe := range [][2]int{{500, 1100}, {1000, 400}} {
		if err := b.D.Swipe(ctx, 360, swipe[0], 360, swipe[1], 400*time.Millisecond); err != nil {
			return bought, err
		}
		if err := bot.Sleep(ctx, time.Second); err != nil {
			return bought, err
		}
		for range 6 { // each buy changes the grid; look again after it
			_, frame, err := b.Wait(ctx, 8*time.Second, screens.Shop, screens.GuildShop)
			if err != nil {
				return bought, err
			}
			p, ok := shopNext(frame, tab.items)
			if !ok {
				break
			}
			n, err := shopBuy(ctx, b, p)
			bought += n
			if err != nil {
				return bought, err
			}
			if n == 0 {
				break // the dialog found the coins short
			}
		}
	}
	return bought, nil
}

// shopNext finds the price bar of the most wanted item on screen that is not
// sold out (sold-out cards are dimmed) and whose price is not red.
func shopNext(frame image.Image, items []string) (image.Point, bool) {
	for _, name := range items {
		tpl := assets.MustGet(name)
		var found []vision.Match
		for _, cx := range shopColumns {
			strip := image.Rect(cx-56, shopRows[0], cx+56, shopRows[1])
			found = append(found, tpl.FindAll(frame, strip, 0.9, 60)...)
		}
		// Grid order: row by row, left to right (discounted lots lead).
		slices.SortFunc(found, func(a, b vision.Match) int {
			if d := a.At.Y/60 - b.At.Y/60; d != 0 {
				return d
			}
			return a.At.X - b.At.X
		})
		for _, m := range found {
			if !m.Visible(0.9) {
				continue
			}
			price := m.Center().Add(image.Pt(0, shopPriceDY))
			if price.Y+shopPriceText.Max.Y > shopRows[1] {
				continue // the price bar is under the tab bar; next view
			}
			if vision.Ratio(frame, shopPriceText.Add(price), isPriceRed) > 0.05 {
				continue
			}
			return price, true
		}
	}
	return image.Point{}, false
}

// isPriceRed is the price text when short, about rgb(165,25,25); the bar
// behind it is brown, rgb(160,96,80).
func isPriceRed(c color.RGBA) bool { return c.R > 140 && c.G < 60 && c.B < 60 }

// isDiamondPink is the diamond icon's colour; no shop buy here may cost them.
func isDiamondPink(c color.RGBA) bool { return c.R > 200 && c.B > 160 && c.G < 150 }

// shopBuy opens an item's Buy dialog, raises the quantity while the coins
// cover it, and buys. A free daily item is claimed by the tap itself.
func shopBuy(ctx context.Context, b *bot.Bot, price image.Point) (int, error) {
	if err := b.Tap(ctx, price, "shop item price"); err != nil {
		return 0, err
	}
	id, frame, err := b.Wait(ctx, 6*time.Second, screens.ShopBuy, screens.Reward)
	if err != nil {
		return 0, err
	}
	if id == screens.Reward {
		return 1, closePopups(ctx, b, screens.Shop, screens.GuildShop)
	}
	if vision.Ratio(frame, shopCostIcon, isDiamondPink) > 0.1 {
		b.Log.Warn("shop item costs diamonds, not buying", "shot", b.Save(frame))
		return 0, closePopups(ctx, b, screens.Shop, screens.GuildShop)
	}
	if !shopCostCovered(frame) {
		return 0, closePopups(ctx, b, screens.Shop, screens.GuildShop)
	}
	for range 60 {
		if err := b.Tap(ctx, shopPlus, "more"); err != nil {
			return 0, err
		}
		_, next, err := b.Look(ctx)
		if err != nil {
			return 0, err
		}
		if !shopCostCovered(next) {
			if err := b.Tap(ctx, shopMinus, "one less"); err != nil {
				return 0, err
			}
			break
		}
		if sameArea(frame, next, shopCost) {
			break // at the purchase limit
		}
		frame = next
	}
	_, frame, err = b.Look(ctx)
	if err != nil {
		return 0, err
	}
	if !shopCostCovered(frame) || !screens.Visible(frame, screens.TShopBuyBtn) {
		return 0, closePopups(ctx, b, screens.Shop, screens.GuildShop)
	}
	if err := b.TapTemplate(ctx, frame, screens.TShopBuyBtn); err != nil {
		return 0, err
	}
	return 1, closePopups(ctx, b, screens.Shop, screens.GuildShop)
}

func shopCostCovered(frame image.Image) bool {
	return vision.Ratio(frame, shopCost, vision.IsGreenText) > 0.03
}

// sameArea reports whether r looks the same in both frames.
func sameArea(a, b image.Image, r image.Rectangle) bool {
	ga, gb := vision.GrayOf(a, r), vision.GrayOf(b, r)
	var d float64
	for i := range ga.Pix {
		d += math.Abs(ga.Pix[i] - gb.Pix[i])
	}
	return d/float64(len(ga.Pix)) < 2
}
