package tasks

import (
	"image"
	"image/png"
	"os"
	"testing"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/screens"
)

func capture(t *testing.T, file string) image.Image {
	t.Helper()
	f, err := os.Open("../../captures/" + file)
	if err != nil {
		t.Skipf("reference capture %s not present", file)
	}
	defer f.Close()
	img, err := png.Decode(f)
	if err != nil {
		t.Fatal(err)
	}
	return img
}

func TestDailyClaimGates(t *testing.T) {
	found := func(img image.Image, name string, area image.Rectangle) bool {
		return assets.MustGet(name).FindIn(img, area).Visible(screens.MinScore)
	}
	cases := []struct {
		file string
		gate func(image.Image) bool
		want bool
		what string
	}{
		{"shop/03-mall.png", func(i image.Image) bool {
			return badged(i, mallFreeBadge) && found(i, screens.TMallFreeWord, mallFreeRow)
		}, true, "free x30 due"},
		{"daily/mall-done.png", func(i image.Image) bool {
			return badged(i, mallFreeBadge) && found(i, screens.TMallFreeWord, mallFreeRow)
		}, false, "free x30 sold out"},
		{"daily/giftpack-owned.png", func(i image.Image) bool {
			return badged(i, mallAdBadge) && found(i, screens.TMallAdFreeWord, mallAdRow)
		}, true, "ad-free x100 due"},
		{"daily/giftpack-after.png", func(i image.Image) bool {
			return badged(i, mallAdBadge) && found(i, screens.TMallAdFreeWord, mallAdRow)
		}, false, "ad-free x100 sold out"},
		{"daily/mall-done.png", func(i image.Image) bool {
			return badged(i, mallAdBadge) && found(i, screens.TMallAdFreeWord, mallAdRow)
		}, false, "ad row without the Lifetime Card"},
		{"daily/sp-owned.png", func(i image.Image) bool { return mvpButtonLive(i, claimAllButton) }, false, "Claim All greyed"},
		{"shop/21-sp.png", func(i image.Image) bool { return badged(i, benefitsBadge) }, true, "daily benefits due"},
		{"daily/sp-done.png", func(i image.Image) bool { return badged(i, benefitsBadge) }, false, "daily benefits claimed"},
		{"shop/13-free-4000.png", func(i image.Image) bool { return found(i, screens.TClaimWord, pullsList) }, true, "login day due"},
		{"daily/pulls-done.png", func(i image.Image) bool { return found(i, screens.TClaimWord, pullsList) }, false, "login day claimed"},
		{"shop/23-checkin.png", func(i image.Image) bool { return found(i, screens.TClaimWord, checkinList) }, true, "check-in due"},
		{"daily/checkin-done.png", func(i image.Image) bool { return found(i, screens.TClaimWord, checkinList) }, false, "check-in claimed"},
		{"daily/growth-done.png", func(i image.Image) bool { return found(i, screens.TClaimWord, growthTasks) }, true, "growth task due"},
		{"shop/24-growth.png", func(i image.Image) bool {
			return badged(i, growthDayTab0.Add(image.Pt(0, growthDayStep)).Add(growthDayBadge))
		}, true, "day 2 tab badged"},
		{"shop/24-growth.png", func(i image.Image) bool { return badged(i, growthDayTab0.Add(growthDayBadge)) }, false, "day 1 tab clear"},
	}
	for _, c := range cases {
		if got := c.gate(capture(t, c.file)); got != c.want {
			t.Errorf("%s (%s): %v, want %v", c.file, c.what, got, c.want)
		}
	}
}

func TestRailLabelsOnEveryMap(t *testing.T) {
	for _, file := range []string{"daily/main.png", "main3.png", "after-vp.png"} {
		img := capture(t, file)
		for _, name := range []string{screens.TRailMall, screens.TRailGrowth, screens.TRailPulls} {
			if m := assets.MustGet(name).FindIn(img, leftRail); m.Score < 0.7 {
				t.Errorf("%s: %s scored %.2f", file, name, m.Score)
			}
		}
	}
}

func TestAutoOnWithMultiSummon(t *testing.T) {
	for file, want := range map[string]bool{
		"auto-done.png":       true, // 4x: green ring on the Summon Elite badge
		"daily/after-buy.png": true, // 1x: green arrows on Auto
		"auto-1.png":          false,
	} {
		if got := autoOn(capture(t, file)); got != want {
			t.Errorf("%s: autoOn %v, want %v", file, got, want)
		}
	}
}

func TestDungeonAndGachaBadges(t *testing.T) {
	if !badged(capture(t, "modes/dungeon.png"), dungeonAchieveBadge) {
		t.Error("dungeon achievement badge not seen")
	}
	if !badged(capture(t, "modes/gacha-ad.png"), gachaAdBadge) {
		t.Error("gacha ad draw badge not seen")
	}
	if badged(capture(t, "shop/12-weapon-gacha-draw.png"), gachaAdBadge) {
		t.Error("gacha ad badge seen before the Lifetime Card")
	}
	if m := assets.MustGet(screens.TClaimWord).FindIn(capture(t, "modes/dg-achieve.png"), achieveList); !m.Visible(screens.MinScore) {
		t.Error("achievement Claim not found")
	}
	if m := assets.MustGet(screens.TRailLimited).FindIn(capture(t, "daily/main.png"), leftRail); m.Score < 0.7 {
		t.Errorf("Limited Quest label scored %.2f", m.Score)
	}
}

func TestBetterWeaponMarked(t *testing.T) {
	before, after := capture(t, "star-weapon.png"), capture(t, "star-equip.png")
	if !badged(before, weaponEquipBadge) || badged(after, weaponEquipBadge) {
		t.Errorf("Equipment badge before %v after %v, want true false", badged(before, weaponEquipBadge), badged(after, weaponEquipBadge))
	}
	if tile, ok := badgedWeaponTile(before); !ok || tile != image.Pt(520, 950) {
		t.Errorf("badged tile %v %v, want the Legendary at (520,950)", tile, ok)
	}
}

func TestPetAdDrawBadge(t *testing.T) {
	if !badged(capture(t, "pet-gacha-ad.png"), petAdBadge) {
		t.Error("pet ad draw badge not seen")
	}
	if badged(capture(t, "star-pet.png"), petAdBadge) != badged(capture(t, "pet-gacha-ad.png"), petAdBadge) {
		t.Error("same capture read differently")
	}
}

func TestRaiseStarBadge(t *testing.T) {
	if !badged(capture(t, "card-raise-star.png"), raiseStarBadge) {
		t.Error("raise star badge not seen")
	}
	if badged(capture(t, "card-raise-done.png"), raiseStarBadge) {
		t.Error("raise star badge seen after raising")
	}
}

func TestCanActivateOnlyWhenDue(t *testing.T) {
	can := assets.MustGet(screens.TCanActivate)
	if m := can.FindIn(capture(t, "awaken-2.png"), awakeningTiers); !m.Visible(screens.MinScore) {
		t.Error("Can Activate not found on a due tier")
	}
	if m := can.FindIn(capture(t, "awaken-3.png"), awakeningTiers); m.Visible(screens.MinScore) {
		t.Errorf("Can Activate found with every reachable tier active (score %.2f)", m.Score)
	}
}
