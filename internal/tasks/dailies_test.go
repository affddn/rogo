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

func TestDungeonLevel(t *testing.T) {
	for power, want := range map[int]int{0: 0, 976_200: 0, 3_000_000: 0, 3_325_600: 1, 3_926_300: 1, 30_000_000: 2} {
		if got := dungeonLevel(power); got != want {
			t.Errorf("power %d: dungeon level %d, want %d", power, got, want)
		}
	}
}

func TestGuildGates(t *testing.T) {
	town := capture(t, "guild-town.png")
	for name, p := range map[string]image.Point{"donation": guildDonationDot, "shop": guildShopDot, "bargain": guildBargainDot, "hunt": guildHuntDot} {
		if !badged(town, p) {
			t.Errorf("town: %s badge not seen", name)
		}
	}
	shop, sold := capture(t, "guild/shop.png"), capture(t, "guild/shop-2.png")
	for i, it := range guildShopFree {
		if !badged(shop, it.badge) || badged(sold, it.badge) {
			t.Errorf("shop free item %d: badge before %v after %v", i, badged(shop, it.badge), badged(sold, it.badge))
		}
	}
	if !badged(capture(t, "guild/bargain.png"), guildBargainDotBtn) {
		t.Error("bargain button badge not seen")
	}
	if screens.Visible(capture(t, "guild/bargain.png"), screens.TGuildBargainFree) {
		t.Error("deal at 7 diamonds read as free")
	}
	if !screens.Visible(capture(t, "guild/bargain-3.png"), screens.TGuildBargainFree) {
		t.Error("deal at 0 diamonds not read as free")
	}
	if !badged(capture(t, "guild/hunt.png"), guildHuntDotBtn) {
		t.Error("hunt challenge badge not seen")
	}
	if mvpButtonLive(capture(t, "guild/hunt.png"), guildHuntSweepBtn) || !mvpButtonLive(capture(t, "guild/hunt-15.png"), guildHuntSweepBtn) {
		t.Error("hunt sweep liveness wrong")
	}
}

func TestSkillPlusLive(t *testing.T) {
	one, none := capture(t, "skills/one-point.png"), capture(t, "skills/clean.png")
	for _, c := range []struct {
		label   string
		withOne bool
	}{
		{screens.TSkillStealthEnh, true},
		{screens.TSkillSupersonic, true},
		{screens.TSkillKIR, true},
	} {
		m := assets.MustGet(c.label).FindIn(one, skillTree)
		if m.Score < screens.MinScore {
			t.Fatalf("%s not found", c.label)
		}
		p := m.Center().Add(skillPlusFrom)
		if plusLive(one, p) != c.withOne || plusLive(none, p) {
			t.Errorf("%s: live with a point %v, with none %v", c.label, plusLive(one, p), plusLive(none, p))
		}
	}
	// The same check further down the tree, with one point free.
	two := capture(t, "skills/one-point-2.png")
	m2 := assets.MustGet(screens.TSkillStealthEnh).FindIn(two, skillTree)
	if p := m2.Center().Add(skillPlusFrom); p != image.Pt(422, 666) || !plusLive(two, p) {
		t.Errorf("Stealth Enhancement + at %v live %v, want (422,666) live", p, plusLive(two, p))
	}
	// Katar Mastery is 5/5: never live.
	m := assets.MustGet("skill_lbl_katar").FindIn(one, skillTree)
	if plusLive(one, m.Center().Add(skillPlusFrom)) {
		t.Error("maxed Katar Mastery read as live")
	}
}

func TestRefineOnlyWhenSure(t *testing.T) {
	if !screens.Visible(capture(t, "refine/page.png"), screens.TRefineSure) {
		t.Error("100% success not seen for +1")
	}
	if screens.Visible(capture(t, "refine/after1.png"), screens.TRefineSure) {
		t.Error("95% success read as 100%")
	}
}

func TestArenaPicksTheWeakerOpponent(t *testing.T) {
	row, ok := weakerOpponent(capture(t, "arena/opponents.png"))
	if !ok || row != 2 {
		t.Errorf("picked row %d (found %v), want the green 1155.5K row 2", row, ok)
	}
}

func TestArenaBadges(t *testing.T) {
	page := capture(t, "arena/page.png")
	if !badged(page, arenaChallengeBadge) || badged(page, arenaRewardBadge) {
		t.Error("fresh page: want the Challenge badge only")
	}
	after := capture(t, "arena/page-badged.png")
	if !badged(after, arenaRewardBadge) || !badged(after, arenaTierBadge) {
		t.Error("after a win: Reward and tier badges not seen")
	}
	empty := capture(t, "arena/page-empty.png")
	if badged(empty, arenaChallengeBadge) || badged(empty, arenaRewardBadge) || badged(empty, arenaTierBadge) {
		t.Error("no tickets, rewards claimed: want no badges")
	}
}

func TestArenaTierRewardsClaimable(t *testing.T) {
	frame := capture(t, "arena/tier-rewards.png")
	ms := assets.MustGet(screens.TClaimWord).FindAll(frame, tierRewardsList, screens.MinScore, 40)
	if len(ms) != 2 {
		t.Errorf("found %d Claim buttons, want 2", len(ms))
	}
}
