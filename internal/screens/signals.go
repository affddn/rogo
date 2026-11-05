package screens

import (
	"github.com/affddn/rogo/assets"
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
	BadgePet       Badge = "pet"
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
	BadgePet:       {450, 1186},
}

// Signals is everything one main-screen look says about what needs doing.
type Signals struct {
	QuestDone bool
	Badges    map[Badge]bool
	// Level fingerprints the "BASE nn | JOB n" text; it changes on any
	// level-up, which is when attribute and skill points arrive.
	Level string
	// Arrow is a guide arrow on the main screen, if any.
	Arrow    GuideArrow
	HasArrow bool
	// Power fingerprints the combat power number under the avatar; it
	// changes whenever power changes, including auto-equipped drops.
	Power string
	// Stage fingerprints the next-challenge label ("4-6") on the Stage
	// Challenge button; it changes whenever a stage is cleared.
	Stage string
	// Locked marks features a new character has not unlocked yet, keyed by
	// their nav badge.
	Locked map[Badge]bool
	// System and SeasonPass report the main-screen icons that open those
	// menus; a new character gets them only after a while.
	System, SeasonPass bool
	// StageQuest is set when the main quest is "Clear Main Stage ...":
	// following it starts the stage fight.
	StageQuest bool
}

// navLabel covers the bottom-nav labels of features that unlock with level.
// A locked feature's label is grey; an unlocked one is cream white.
var navLabel = map[Badge]image.Rectangle{
	BadgeWeapon:   image.Rect(150, 1240, 230, 1264),
	BadgePet:      image.Rect(396, 1240, 436, 1264),
	BadgeGameMode: image.Rect(585, 1240, 700, 1264),
}

func isLabelWhite(c color.RGBA) bool { return c.R > 219 && c.G > 214 && c.B > 191 }

// powerText covers the combat power digits ("884.6K").
var powerText = image.Rect(180, 64, 300, 94)

// stageText covers the next-challenge stage label.
var stageText = image.Rect(640, 980, 686, 1000)

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
	return mask(frame, r, 2, func(c color.RGBA) bool {
		return (c.B > 200 && c.R < 130) || (c.R > 220 && c.G > 200 && c.B > 200)
	})
}

func mask(frame image.Image, r image.Rectangle, step int, on func(color.RGBA) bool) string {
	out := make([]byte, 0, (r.Dx()/step+1)*(r.Dy()/step+1))
	for y := r.Min.Y; y < r.Max.Y; y += step {
		for x := r.Min.X; x < r.Max.X; x += step {
			if on(color.RGBAModel.Convert(frame.At(x, y)).(color.RGBA)) {
				out = append(out, '1')
			} else {
				out = append(out, '0')
			}
		}
	}
	return string(out)
}

func (s Signals) Has(b Badge) bool { return s.Badges[b] }

// questTag is the "(Completed)" tag on the main-quest tracker. The tracker
// panel is translucent, so the map behind it defeats grayscale matching; its
// bright green text does not.
var questTag = image.Rect(40, 920, 136, 944)

// QuestTagAt is where tapping claims the tracker.
var QuestTagAt = image.Pt(130, 932)

func QuestDone(frame image.Image) bool {
	return vision.Ratio(frame, questTag, func(c color.RGBA) bool {
		return c.G > 180 && int(c.G)-int(c.R) > 60 && int(c.G)-int(c.B) > 60
	}) > 0.08
}

// ReadMain extracts signals from a frame already detected as Main.
func ReadMain(frame image.Image) Signals {
	arrow, hasArrow := FindGuideArrow(frame)
	s := Signals{
		Arrow:     arrow,
		HasArrow:  hasArrow,
		QuestDone: QuestDone(frame),
		Badges:    map[Badge]bool{},
		Level:     fingerprint(frame, levelText),
		Power: mask(frame, powerText, 1, func(c color.RGBA) bool {
			return c.R > 225 && c.G > 215 && c.B > 170
		}),
		Stage: mask(frame, stageText, 1, func(c color.RGBA) bool {
			return c.R > 225 && c.G > 225 && c.B > 210
		}),
		StageQuest: StageQuest(frame),
		System:     Present(frame, TMainSystem),
		SeasonPass: seasonPass(frame),
	}
	for b, p := range badgeAt {
		r := image.Rectangle{Min: p.Sub(image.Pt(8, 8)), Max: p.Add(image.Pt(8, 8))}
		s.Badges[b] = vision.Ratio(frame, r, vision.IsBadgeRed) > 0.3
	}
	s.Locked = map[Badge]bool{}
	for b, r := range navLabel {
		// Unlocked labels measure 0.13-0.15 white, locked ones 0.
		s.Locked[b] = vision.Ratio(frame, r, isLabelWhite) < 0.05
	}
	return s
}

// Unlocked reports whether the feature behind nav badge b is open.
func (s Signals) Unlocked(b Badge) bool { return !s.Locked[b] }

// Fingerprint is a coarse grayscale signature of r, for telling whether a
// scroll moved anything.
func Fingerprint(frame image.Image, r image.Rectangle) string {
	return mask(frame, r, 12, func(c color.RGBA) bool { return int(c.R)+int(c.G)+int(c.B) > 420 })
}

// questRow is the main-quest tracker's text row.
var questRow = image.Rect(90, 912, 320, 948)

// StageQuest reports whether the main quest asks for a stage clear. The
// tracker text is white over the map, so it is matched by shape.
func StageQuest(frame image.Image) bool {
	return assets.MustGet(TQuestClearStage).FindIn(frame, questRow).Score >= MinScore
}

func seasonPass(frame image.Image) bool {
	_, ok := SeasonPassIcon(frame)
	return ok
}
