package tasks

import (
	"image/png"
	"os"
	"testing"
)

func TestMVPButtonLive(t *testing.T) {
	for file, want := range map[string][2]bool{ // challenge, sweep
		"mvp.png":       {true, false},
		"mvp-after.png": {true, true},
		"mvp-swd-3.png": {true, false},
		"mvp-swd-4.png": {false, false},
	} {
		f, err := os.Open("../../../../captures/" + file)
		if err != nil {
			t.Skipf("reference capture %s not present", file)
		}
		img, _ := png.Decode(f)
		f.Close()
		if c, s := mvpButtonLive(img, mvpChallenge), mvpButtonLive(img, mvpSweep); c != want[0] || s != want[1] {
			t.Errorf("%s: challenge %v sweep %v, want %v %v", file, c, s, want[0], want[1])
		}
	}
}
