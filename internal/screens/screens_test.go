package screens

import (
	"image"
	"image/png"
	"os"
	"testing"
)

// Reference screenshots live in captures/ (gitignored: they show account
// details), so these tests only run on a machine that has them.
func load(t *testing.T, name string) image.Image {
	t.Helper()
	f, err := os.Open("../../captures/" + name)
	if err != nil {
		t.Skipf("reference capture %s not present", name)
	}
	defer f.Close()
	img, err := png.Decode(f)
	if err != nil {
		t.Fatal(err)
	}
	return img
}

func TestDetect(t *testing.T) {
	cases := map[string]ID{
		"main.png":                        Main,
		"income-claimed.png":              Income,
		"income-after.png":                Income,
		"quick-idle-1.png":                QuickIdleConfirm,
		"quick-idle-2.png":                Reward,
		"auto-1.png":                      AutoSummonHint,
		"character.png":                   Attribute,
		"char-unknown.png":                CharOverview,
		"equipment.png":                   Equipment,
		"eq-upgrade.png":                  Enhance,
		"boot/04.png":                     Title,
		"boot/12.png":                     Title,
		"boot/26.png":                     IdleRewards,
		"stage-r11.png":                   StageDefeat,
		"main3.png":                       Main,
		"unknown/20261103-182537.076.png": Main, // elite banner over Stage Challenge
		"unknown/20261103-182646.827.png": Main, // auto-equip popup
		"weapon.png":                      WeaponGacha,
		"gacha-after.png":                 WeaponGacha,
		"gacha-result.png":                GachaCount,
		"sayadroid/guest-bind.png":        GuestBind,
		"sayadroid/main-new2.png":         Main, // new character: no quest/system icons
		"sayadroid/main-new3.png":         Main,
		"kicked.png":                      Kicked, // over the power-save lock
		"login-dialog.png":                Login,
		"account-chooser.png":             AccountChooser,
		"title-loggedin.png":              Title,
		"title-loggedout.png":             Title,
		"realm-fight-2.png":               InCombat,
		"value-pack.png":                  ValuePack,
		"mvp.png":                         MVP,
		"mvp-swd-4.png":                   MVP, // both buttons greyed
		"mvp-sweep.png":                   MVPSweep,
		"mvp-1.png":                       InCombat,
		"after-vp.png":                    Main,   // Ant Cave: dark map behind the icons
		"income-cave.png":                 Income, // close X dimmed by the cave
		"income-after-qi.png":             Income,
		"qi-confirm-free.png":             QuickIdleConfirm,
		"value-pack-2.png":                ValuePack,
		"stage-r1.png":                    InCombat,
		"stage-r10.png":                   InCombat, // pause button 1.57x as bright
		"baph-fight/05.png":               InCombat,
		"baph-fight/02.png":               Unknown, // dimmed under the dodge hint
	}
	for file, want := range cases {
		// Subtests, so a capture missing on this machine skips only itself.
		t.Run(file, func(t *testing.T) {
			if got := Detect(load(t, file)); got != want {
				t.Errorf("detected %s, want %s", got, want)
			}
		})
	}
}

func TestTicketIconOnlyWhenFree(t *testing.T) {
	if !Visible(load(t, "income-live.png"), TIncomeTicketIcon) {
		t.Error("ticket icon not seen when a free Quick Idle was available")
	}
	if Visible(load(t, "income-after.png"), TIncomeTicketIcon) {
		t.Error("ticket icon seen after the free Quick Idle was used")
	}
}

func TestReadMainSignals(t *testing.T) {
	s := ReadMain(load(t, "main3.png"))
	for _, b := range []Badge{BadgeSystem, BadgeAuto, BadgeCharacter, BadgeWeapon, BadgeGameMode} {
		if !s.Has(b) {
			t.Errorf("main3: badge %s not read", b)
		}
	}
	if s.Has(BadgeEquipment) || s.QuestDone {
		t.Errorf("main3: false signal %+v", s)
	}
	if on := ReadMain(load(t, "auto-2.png")); on.Has(BadgeAuto) || !on.QuestDone {
		t.Errorf("auto-2: want auto on and quest done, got %+v", on)
	}
}

func TestNavLocks(t *testing.T) {
	// A fresh character on sayadroid: Weapon, Pet and Game Mode locked.
	fresh := ReadMain(load(t, "sayadroid/main-new.png"))
	for _, b := range []Badge{BadgeWeapon, BadgePet, BadgeGameMode} {
		if fresh.Unlocked(b) {
			t.Errorf("main-new: %s read as unlocked", b)
		}
	}
	// The VMOS account: everything but Pet open.
	vmos := ReadMain(load(t, "main3.png"))
	if !vmos.Unlocked(BadgeWeapon) || !vmos.Unlocked(BadgeGameMode) || vmos.Unlocked(BadgePet) {
		t.Errorf("main3: locks read as %v", vmos.Locked)
	}
	// Nor has it the system menu or the season pass yet.
	if fresh.System || fresh.SeasonPass || !vmos.System || !vmos.SeasonPass {
		t.Errorf("menu icons: fresh system=%v pass=%v, vmos system=%v pass=%v",
			fresh.System, fresh.SeasonPass, vmos.System, vmos.SeasonPass)
	}
}

func TestSummonBadge(t *testing.T) {
	if !ReadMain(load(t, "main4.png")).Has(BadgeSummon) {
		t.Error("main4: summon upgrade badge not read")
	}
	if ReadMain(load(t, "main3.png")).Has(BadgeSummon) {
		t.Error("main3: phantom summon upgrade badge")
	}
}

func TestLevelFingerprintTracksLevelUps(t *testing.T) {
	// main.png and main2.png: Base 23 vs 24; main2 and main3 are both 24/4.
	a, b, c := ReadMain(load(t, "main.png")).Level, ReadMain(load(t, "main2.png")).Level, ReadMain(load(t, "main3.png")).Level
	if !LevelChanged(a, b) {
		t.Error("level fingerprint unchanged across a level-up")
	}
	if LevelChanged(b, c) {
		t.Errorf("level fingerprint unstable at the same level:\n%s\n%s", b, c)
	}
}

func TestStageFingerprintTracksClears(t *testing.T) {
	a, b, c := ReadMain(load(t, "main.png")).Stage, ReadMain(load(t, "main3.png")).Stage, ReadMain(load(t, "main5.png")).Stage
	if LevelChanged(a, b) {
		t.Error("stage fingerprint changed without a clear (4-1 vs 4-1)")
	}
	if !LevelChanged(b, c) {
		t.Error("stage fingerprint unchanged across clears (4-1 vs 4-6)")
	}
}

func TestQuestDoneOverMovingBackground(t *testing.T) {
	for _, f := range []string{"main.png", "main4.png", "main5.png", "now.png"} {
		if !QuestDone(load(t, f)) {
			t.Errorf("%s: completed quest not seen", f)
		}
	}
	if QuestDone(load(t, "main3.png")) {
		t.Error("main3: phantom completed quest")
	}
}

func TestFindGuideArrow(t *testing.T) {
	cases := map[string]image.Point{ // file -> control the tutorial wanted
		"tut-1.png":    {412, 1200}, // Pet nav
		"tut-2.png":    {548, 1052}, // Draw Multiple Times
		"petcult.png":  {556, 1225}, // Cultivation tab
		"petcult2.png": {534, 1120}, // Activate All
		"petcult3.png": {182, 1120}, // Auto Formation
	}
	for f, want := range cases {
		a, ok := FindGuideArrow(load(t, f))
		if !ok {
			t.Errorf("%s: arrow not found", f)
			continue
		}
		if d := a.Target.Sub(want); d.X*d.X+d.Y*d.Y > 40*40 {
			t.Errorf("%s: target %v, want near %v", f, a.Target, want)
		}
	}
}

func TestPowerFingerprint(t *testing.T) {
	// main2/main3: 465.0K both; main5: 643.2K.
	a, b, c := ReadMain(load(t, "main2.png")).Power, ReadMain(load(t, "main3.png")).Power, ReadMain(load(t, "main5.png")).Power
	if !LevelChanged(b, c) {
		t.Error("power fingerprint unchanged across a power rise")
	}
	_ = a
}

func TestFeatureIconsOnDarkMap(t *testing.T) {
	s := ReadMain(load(t, "after-vp.png")) // Ant Cave
	if !s.System || !s.SeasonPass {
		t.Errorf("system %v, season pass %v on the Ant Cave map; want both", s.System, s.SeasonPass)
	}
}

func TestQuickIdleFreeSigns(t *testing.T) {
	if !Visible(load(t, "income-cave.png"), TIncomeFreeLabel) {
		t.Error("green Free: label not seen")
	}
	if !Visible(load(t, "qi-confirm-free.png"), TQuickIdleFree) {
		t.Error("(Free this time) not seen on the confirm")
	}
	if Visible(load(t, "income-after-qi.png"), TIncomeFreeLabel) {
		t.Error("Free: label seen where a ticket shows instead")
	}
}
