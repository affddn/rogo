package tasks

import (
	"image/png"
	"os"
	"testing"
)

func TestSliderKnob(t *testing.T) {
	for file, want := range map[string][2]int{
		"dia/dialog-6828.png": {200, 235}, // 12 of 717: at the left end
		"dia/dialog-lv7.png":  {490, 520}, // the maximum
	} {
		f, err := os.Open("../../captures/" + file)
		if err != nil {
			t.Skipf("reference capture %s not present", file)
		}
		img, _ := png.Decode(f)
		f.Close()
		if x, ok := sliderKnob(img); !ok || x < want[0] || x > want[1] {
			t.Errorf("%s: knob at %d %v, want %d-%d", file, x, ok, want[0], want[1])
		}
	}
}

func TestSliderTargetNeverPastWant(t *testing.T) {
	// 3295 diamonds, 1000 kept: 459 of at most 659 draws.
	x := sliderTarget(459, 659)
	if x <= sliderMinX || x >= sliderMaxX {
		t.Fatalf("target %d outside the track", x)
	}
	// Even with the knob as far right as accepted, no more than wanted.
	count := minDraws + (x+knobSlack-sliderMinX)*(659-minDraws)/(sliderMaxX-sliderMinX)
	if count > 459 {
		t.Errorf("knob up to %d means %d draws, want at most 459", x+knobSlack, count)
	}
	if x := sliderTarget(5, 659); x != sliderMinX {
		t.Errorf("fewer than the minimum draws: target %d, want the left end", x)
	}
}
