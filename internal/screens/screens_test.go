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
	}
	for file, want := range cases {
		if got := Detect(load(t, file)); got != want {
			t.Errorf("%s: detected %s, want %s", file, got, want)
		}
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

func TestSummonBadge(t *testing.T) {
	if !ReadMain(load(t, "main4.png")).Has(BadgeSummon) {
		t.Error("main4: summon upgrade badge not read")
	}
	if ReadMain(load(t, "main3.png")).Has(BadgeSummon) {
		t.Error("main3: phantom summon upgrade badge")
	}
}
