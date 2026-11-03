package screens

import (
	"image"

	"github.com/affddn/rogo/internal/vision"
)

// Badge is a red notification dot on the main screen.
type Badge string

const (
	BadgeSystem    Badge = "system"
	BadgeCharacter Badge = "character"
	BadgeWeapon    Badge = "weapon"
	BadgeEquipment Badge = "equipment"
	BadgeGameMode  Badge = "game-mode"
	BadgeAuto      Badge = "auto"
	BadgeSummon    Badge = "summon-upgrade"
)

// badgeAt are dot centres measured on 720x1280 main-screen captures.
var badgeAt = map[Badge]image.Point{
	BadgeSystem:    {690, 150},
	BadgeAuto:      {281, 1022},
	BadgeCharacter: {110, 1188},
	BadgeWeapon:    {222, 1188},
	BadgeEquipment: {338, 1188},
	BadgeGameMode:  {676, 1188},
	BadgeSummon:    {475, 1022},
}

// Signals is everything one main-screen look says about what needs doing.
type Signals struct {
	QuestDone bool
	Badges    map[Badge]bool
}

func (s Signals) Has(b Badge) bool { return s.Badges[b] }

// ReadMain extracts signals from a frame already detected as Main.
func ReadMain(frame image.Image) Signals {
	s := Signals{QuestDone: Visible(frame, TMainQuestCompleted), Badges: map[Badge]bool{}}
	for b, p := range badgeAt {
		r := image.Rectangle{Min: p.Sub(image.Pt(8, 8)), Max: p.Add(image.Pt(8, 8))}
		s.Badges[b] = vision.Ratio(frame, r, vision.IsBadgeRed) > 0.3
	}
	return s
}
