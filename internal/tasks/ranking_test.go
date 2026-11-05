package tasks

import (
	"image"
	"testing"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/screens"
)

func TestRankingBadges(t *testing.T) {
	stages := capture(t, "claims/ranking.png")
	if id := screens.Detect(stages); id != screens.Ranking {
		t.Fatalf("ranking page detected as %s", id)
	}
	// Only the Power tab had likes left.
	for i, x := range rankingTabs {
		if got := badged(stages, image.Pt(x, rankingTabY).Add(rankingTabBadge)); got != (i == 1) {
			t.Errorf("tab %d badged %v", i, got)
		}
	}
	before, after := capture(t, "claims/ranking-power.png"), capture(t, "claims/ranking-after.png")
	for i, l := range rankingLikes {
		if !badged(before, l.badge) {
			t.Errorf("like %d: badge missed", i)
		}
		if badged(after, l.badge) {
			t.Errorf("like %d: badged after liking", i)
		}
	}
}

func TestGuildLoot(t *testing.T) {
	hunt := capture(t, "claims/guild-hunt.png")
	if id := screens.Detect(hunt); id != screens.GuildHunt {
		t.Fatalf("guild hunt detected as %s", id)
	}
	if !badged(hunt, guildLootDot) {
		t.Error("loot badge missed with 3 chests waiting")
	}
	loot := capture(t, "claims/guild-loot.png")
	if id := screens.Detect(loot); id != screens.GuildLoot {
		t.Errorf("loot popup detected as %s", id)
	}
	if !screens.Visible(loot, screens.TGuildLootOpenAll) {
		t.Error("Open All not seen")
	}
}

func TestBackpackBadgedChest(t *testing.T) {
	bag := capture(t, "claims/backpack.png")
	if id := screens.Detect(bag); id != screens.Backpack {
		t.Fatalf("backpack detected as %s", id)
	}
	// Two Magic Card Albums, badged, in the first cell; nothing else is.
	c, ok := nextBadgedCell(bag, map[image.Point]bool{})
	if !ok || c != image.Pt(96, 403) {
		t.Fatalf("badged cell %v (%v); want the first", c, ok)
	}
	if c, ok := nextBadgedCell(bag, map[image.Point]bool{c: true}); ok {
		t.Errorf("another badged cell at %v", c)
	}
	item := capture(t, "claims/backpack-pack.png")
	if !assets.MustGet(screens.TBackpackUse).FindIn(item, backpackUseArea).Visible(screens.MinScore) {
		t.Error("Use not found on the album popup")
	}
}
