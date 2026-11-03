package tasks

import (
	"image/png"
	"os"
	"testing"
)

func TestBagOver20(t *testing.T) {
	for file, want := range map[string]bool{"equip-now.png": true, "equip-empty.png": false} {
		f, err := os.Open("../../captures/" + file)
		if err != nil {
			t.Skipf("reference capture %s not present", file)
		}
		img, _ := png.Decode(f)
		f.Close()
		if got := BagOver20(img); got != want {
			t.Errorf("%s: BagOver20 = %v, want %v", file, got, want)
		}
	}
}
