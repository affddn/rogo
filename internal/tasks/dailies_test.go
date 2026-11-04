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
