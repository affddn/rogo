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
		"main.png":           Main,
		"income-claimed.png": Income,
		"income-after.png":   Income,
		"quick-idle-1.png":   QuickIdleConfirm,
		"quick-idle-2.png":   Reward,
		"auto-1.png":         AutoSummonHint,
		"character.png":      Attribute,
		"char-unknown.png":   CharOverview,
		"equipment.png":      Equipment,
		"eq-upgrade.png":     Enhance,
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
