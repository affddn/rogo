package tasks

import (
	"image"
	"testing"

	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/vision"
)

func TestShopScreens(t *testing.T) {
	for file, want := range map[string]screens.ID{
		"shop/baph-top.png":     screens.Shop,
		"shop/arena-top.png":    screens.Shop,
		"shop/dungeon-top.png":  screens.Shop,
		"shop/guild-bottom.png": screens.GuildShop,
		"shop/buy-1.png":        screens.ShopBuy,
		"shop/buy-4.png":        screens.ShopBuy,
	} {
		if got := screens.Detect(capture(t, file)); got != want {
			t.Errorf("%s: detected %s, want %s", file, got, want)
		}
	}
}

func TestShopNextPicksAffordableWantedItems(t *testing.T) {
	near := func(p, q image.Point) bool { d := p.Sub(q); return d.X*d.X+d.Y*d.Y < 15*15 }
	cases := []struct {
		file  string
		items []string
		ok    bool
		at    image.Point
	}{
		// 856 guild coins, metal x100 at 200.
		{"shop/guild-bottom.png", []string{screens.TShopMetal100}, true, image.Pt(360, 814)},
		// Bought out: the card is dimmed under Sold Out.
		{"shop/guild-after.png", []string{screens.TShopMetal100}, false, image.Point{}},
		// 960 Baphomet coins: the 40%-off meteorite comes first.
		{"shop/baph-top.png", []string{screens.TShopMeteorite, screens.TShopMetal200}, true, image.Pt(128, 922)},
		{"shop/baph-bottom.png", []string{screens.TShopMetal200}, true, image.Pt(360, 1131)},
		// Metal's icon shows at the bottom edge but its price is under the
		// tab bar (after buying the meteorites, 30 coins left).
		{"shop/baph-edge.png", []string{screens.TShopMetal200}, false, image.Point{}},
		// 40 arena coins: both Star Powders (80, 100) are priced red.
		{"shop/arena-top.png", []string{screens.TShopStarPowder}, false, image.Point{}},
		// 0 dungeon coins.
		{"shop/dungeon-top.png", []string{screens.TShopMetal20}, false, image.Point{}},
	}
	for _, c := range cases {
		p, ok := shopNext(capture(t, c.file), c.items)
		if ok != c.ok || (ok && !near(p, c.at)) {
			t.Errorf("%s: next %v (%v); want %v (%v)", c.file, p, ok, c.at, c.ok)
		}
	}
}

func TestShopBuyDialogReads(t *testing.T) {
	one, four := capture(t, "shop/buy-1.png"), capture(t, "shop/buy-4.png")
	if !shopCostCovered(one) || !shopCostCovered(four) {
		t.Error("856 coins read as short of 200 or 800")
	}
	if sameArea(one, four, shopCost) {
		t.Error("cost line 856/200 and 856/800 read as the same")
	}
	if !sameArea(one, one, shopCost) {
		t.Error("a frame differs from itself")
	}
	if r := vision.Ratio(one, shopCostIcon, isDiamondPink); r > 0.1 {
		t.Errorf("guild coin icon read as a diamond (%.2f)", r)
	}
}
