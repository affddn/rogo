package vision

import (
	"image"
	"image/color"
	"math/rand/v2"
	"testing"
)

func noise(w, h int, seed uint64) *image.RGBA {
	r := rand.New(rand.NewPCG(seed, seed))
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for i := range img.Pix {
		img.Pix[i] = uint8(r.IntN(256))
	}
	return img
}

func TestFindLocatesShiftedTemplate(t *testing.T) {
	frame := noise(200, 200, 1)
	tmpl := NewTemplate("box", image.Pt(60, 80), frame.SubImage(image.Rect(70, 90, 100, 110)))

	m := tmpl.Find(frame, 20)
	if m.At != image.Pt(70, 90) {
		t.Fatalf("found at %v, want (70,90)", m.At)
	}
	if m.Score < 0.999 {
		t.Fatalf("score %.4f, want ~1", m.Score)
	}
	if c := m.Center(); c != image.Pt(85, 100) {
		t.Fatalf("center %v, want (85,100)", c)
	}
}

func TestFindRejectsOtherContent(t *testing.T) {
	tmpl := NewTemplate("box", image.Pt(50, 50), noise(30, 20, 2))
	if m := tmpl.Find(noise(200, 200, 3), 20); m.Score > 0.5 {
		t.Fatalf("unrelated frame scored %.3f", m.Score)
	}
}

func TestFindWorksOnBand(t *testing.T) {
	frame := noise(200, 200, 4)
	tmpl := NewTemplate("box", image.Pt(40, 150), frame.SubImage(image.Rect(40, 150, 60, 170)))
	band := frame.SubImage(image.Rect(0, 120, 200, 200))
	if m := tmpl.Find(band, 10); m.At != image.Pt(40, 150) || m.Score < 0.999 {
		t.Fatalf("band match %+v", m)
	}
}

func TestRatioCountsBadgeRed(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 10, 10))
	for x := 0; x < 5; x++ {
		for y := 0; y < 10; y++ {
			img.Set(x, y, color.RGBA{230, 30, 30, 255})
		}
	}
	if r := Ratio(img, img.Bounds(), IsBadgeRed); r != 0.5 {
		t.Fatalf("ratio %.2f, want 0.5", r)
	}
}
