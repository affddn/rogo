package tasks

import (
	"image"
	"testing"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/screens"
)

// Badges the chores follow, read on 6 Nov when they were left lit.
func TestBadgesChoresFollow(t *testing.T) {
	cases := []struct {
		file, what string
		dot        image.Point
		want       bool
	}{
		{"badges/hunt-reward-badged.png", "guild hunt Reward", guildRewardDot, true},
		{"badges/hunt-reward-claimed.png", "guild hunt Reward", guildRewardDot, false},
		{"badges/colgear-equip-badged.png", "Collection Gear Equip tab", colGearEquipBadge, true},
		{"badges/colgear-equip-badged.png", "One-Tap Enhance", colGearEnhanceBadge, true},
		{"badges/colgear-equip-enhanced.png", "Collection Gear Equip tab", colGearEquipBadge, false},
		{"badges/colgear-equip-enhanced.png", "One-Tap Enhance", colGearEnhanceBadge, false},
		{"badges/equip-card-badged.png", "Card tab", cardTabBadge, true},
		{"badges/equip-no-badges.png", "Card tab", cardTabBadge, false},
		{"badges/dungeon-achieve-badged.png", "dungeon Achievement", dungeonAchieveBadge, true},
	}
	for _, c := range cases {
		if got := badged(capture(t, c.file), c.dot); got != c.want {
			t.Errorf("%s: %s badge read %v, want %v", c.file, c.what, got, c.want)
		}
	}
	list := capture(t, "badges/hunt-reward-list.png")
	if !assets.MustGet(screens.TClaimWord).FindIn(list, guildRewardList).Visible(screens.MinScore) {
		t.Error("guild hunt reward Claim not found")
	}
}

func TestAssassinCrossSkillLabels(t *testing.T) {
	frame := capture(t, "badges/skill-assassin-cross.png")
	plus := map[string]image.Point{}
	for _, label := range []string{screens.TSkillShadowStealth, screens.TSkillKatarSpec, screens.TSkillRapidDual, screens.TSkillShadowKI, screens.TSkillSTRBoost} {
		m := assets.MustGet(label).FindIn(frame, skillTree)
		if m.Score < screens.MinScore {
			t.Errorf("%s not found (%.2f)", label, m.Score)
			continue
		}
		p := m.Center().Add(skillPlusFrom)
		if !p.In(skillTree) {
			t.Errorf("%s: + at %v is off the tree", label, p)
		}
		plus[label] = p
	}
	// Shadow Stealth takes points now; Katar Specialization is locked
	// (Job 10) and has no live +.
	if !plusLive(frame, plus[screens.TSkillShadowStealth]) {
		t.Error("Shadow Stealth's + read as grey")
	}
	if plusLive(frame, plus[screens.TSkillKatarSpec]) {
		t.Error("locked Katar Specialization's + read as live")
	}
}
