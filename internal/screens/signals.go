package screens

import (
	"image"
	"image/color"

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
	BadgeQuest     Badge = "quest"
	BadgeJobChange Badge = "job-change"
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
	BadgeQuest:     {690, 247},
	BadgeJobChange: {690, 350},
}

// Signals is everything one main-screen look says about what needs doing.
type Signals struct {
	QuestDone bool
	Badges    map[Badge]bool
	// Level fingerprints the "BASE nn | JOB n" text; it changes on any
	// level-up, which is when attribute and skill points arrive.
	Level string
}

// levelText covers the base (blue) and job (bright) level numbers.
var levelText = image.Rect(160, 20, 300, 34)

// LevelChanged compares two level fingerprints, tolerating a few pixels of
// anti-aliasing noise. A changed digit flips dozens.
func LevelChanged(a, b string) bool {
	if len(a) != len(b) {
		return true
	}
	diff := 0
	for i := range a {
		if a[i] != b[i] {
			diff++
		}
	}
	return diff > 6
}

// fingerprint masks the coloured digit pixels in r, ignoring the map that
// shows through behind the HUD: stable at a level, different after a level-up.
func fingerprint(frame image.Image, r image.Rectangle) string {
	out := make([]byte, 0, (r.Dx()/2)*(r.Dy()/2))
	for y := r.Min.Y; y < r.Max.Y; y += 2 {
		for x := r.Min.X; x < r.Max.X; x += 2 {
			c := color.RGBAModel.Convert(frame.At(x, y)).(color.RGBA)
			digit := (c.B > 200 && c.R < 130) || (c.R > 220 && c.G > 200 && c.B > 200)
			if digit {
				out = append(out, '1')
			} else {
				out = append(out, '0')
			}
		}
	}
	return string(out)
}

func (s Signals) Has(b Badge) bool { return s.Badges[b] }

// ReadMain extracts signals from a frame already detected as Main.
func ReadMain(frame image.Image) Signals {
	s := Signals{QuestDone: Visible(frame, TMainQuestCompleted), Badges: map[Badge]bool{}, Level: fingerprint(frame, levelText)}
	for b, p := range badgeAt {
		r := image.Rectangle{Min: p.Sub(image.Pt(8, 8)), Max: p.Add(image.Pt(8, 8))}
		s.Badges[b] = vision.Ratio(frame, r, vision.IsBadgeRed) > 0.3
	}
	return s
}
