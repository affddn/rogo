package tasks

import (
	"image"
	"testing"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/vision"
)

func TestRailEventLabels(t *testing.T) {
	main := capture(t, "claims/main-rail.png")
	for name, icon := range map[string]image.Point{
		screens.TRailTrove: image.Pt(157, 178),
		screens.TRailLogin: image.Pt(55, 623),
	} {
		m := assets.MustGet(name).FindIn(main, screens.LeftRail)
		if m.Score < 0.7 {
			t.Errorf("%s not found (%.2f)", name, m.Score)
			continue
		}
		if d := m.Center().Add(image.Pt(0, railIconDY)).Sub(icon); d.X*d.X+d.Y*d.Y > 15*15 {
			t.Errorf("%s icon at %v, want near %v", name, m.Center().Add(image.Pt(0, railIconDY)), icon)
		}
	}
}

func TestCardTrove(t *testing.T) {
	trove := capture(t, "claims/trove.png")
	if id := screens.Detect(trove); id != screens.CardTrove {
		t.Fatalf("trove detected as %s", id)
	}
	if r := vision.Ratio(trove, troveTicketCost, vision.IsGreenText); r < 0.03 {
		t.Errorf("4 tickets read as none (%.3f)", r)
	}
	for _, r := range screens.DenyAreas[screens.CardTrove] {
		if troveDraw1.In(r) {
			t.Error("Draw 1 Time falls in the deny area")
		}
		if !image.Pt(566, 1208).In(r) {
			t.Error("Draw 5x (stars) is not deny-listed")
		}
	}
}

func TestTroveNeverDrawsWithStars(t *testing.T) {
	tickets, stars := capture(t, "claims/trove.png"), capture(t, "claims/trove-no-tickets.png")
	if !troveTicketDraw(tickets) {
		t.Error("4 tickets held, but no ticket draw")
	}
	// No tickets: Draw 1 Time costs 150 stars and the star count is green.
	if troveTicketDraw(stars) {
		t.Fatal("drew with stars")
	}
	if id := screens.Detect(stars); id != screens.CardTroveStars {
		t.Fatalf("star-priced trove detected as %s", id)
	}
	for _, p := range []image.Point{troveDraw1, image.Pt(566, 1208)} {
		denied := false
		for _, r := range screens.DenyAreas[screens.CardTroveStars] {
			denied = denied || p.In(r)
		}
		if !denied {
			t.Errorf("tap at %v on the star-priced trove is not deny-listed", p)
		}
	}
}

func TestLoginRewards(t *testing.T) {
	login := capture(t, "claims/login.png")
	if id := screens.Detect(login); id != screens.LoginRewards {
		t.Fatalf("login rewards detected as %s", id)
	}
	// Day 1 claimed, days 2-5 not reached: nothing to claim.
	if y, ok := loginClaimable(login); ok {
		t.Errorf("claimable row at y=%d", y)
	}
}

func TestStageDodgePrompt(t *testing.T) {
	dodge := assets.MustGet(screens.TBaphDodge)
	band := func(f string) image.Image {
		img := capture(t, f)
		return img.(interface {
			SubImage(image.Rectangle) image.Image
		}).SubImage(image.Rect(0, fightBand[0], 720, fightBand[1]))
	}
	// 7-12, Mistress: the prompt shows before Hurricane Impact.
	if !dodge.Find(band("claims/stage-dodge.png"), 30).Visible(screens.MinScore) {
		t.Error("stage Dodge prompt missed")
	}
	if dodge.Find(band("claims/stage-nododge.png"), 30).Visible(screens.MinScore) {
		t.Error("Dodge seen with no prompt")
	}
	if dodge.Find(band("claims/main-rail.png"), 30).Visible(screens.MinScore) {
		t.Error("Dodge seen on the main screen")
	}
}
