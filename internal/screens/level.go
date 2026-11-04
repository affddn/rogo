package screens

import (
	"image"
	"image/color"
	"strings"
)

// The Enhance page shows the selected item as "Lv.57 > Lv.58", the current
// level in orange and the next in green. These are the digit areas after
// each "Lv." prefix.
var (
	enhLevelNow  = image.Rect(402, 610, 446, 640)
	enhLevelNext = image.Rect(622, 610, 666, 640)
)

// EnhanceLevel reads the selected item's enhancement level on the Enhance page.
func EnhanceLevel(frame image.Image) (int, bool) { return readNumber(frame, enhLevelNow) }

const glyphW, glyphH = 8, 12

// readNumber reads the digits in r: ink columns split into glyphs, each
// scaled to a glyphW x glyphH mask and matched against digitMasks.
func readNumber(frame image.Image, r image.Rectangle) (int, bool) {
	glyphs := glyphMasks(frame, r)
	if len(glyphs) == 0 || len(glyphs) > 3 {
		return 0, false
	}
	n := 0
	for _, g := range glyphs {
		d, ok := classifyDigit(g)
		if !ok {
			return 0, false
		}
		n = n*10 + d
	}
	return n, true
}

// levelInk is the level text against the beige panel (blue ~200): orange
// and green ink both have little blue (~40 and ~60), so their antialiased
// edges binarise alike.
func levelInk(c color.RGBA) bool { return c.B < 135 }

func glyphMasks(frame image.Image, r image.Rectangle) []string {
	ink := func(x, y int) bool {
		return levelInk(color.RGBAModel.Convert(frame.At(x, y)).(color.RGBA))
	}
	var masks []string
	start := -1
	for x := r.Min.X; x <= r.Max.X; x++ {
		col := false
		for y := r.Min.Y; y < r.Max.Y && x < r.Max.X; y++ {
			if ink(x, y) {
				col = true
				break
			}
		}
		if col && start < 0 {
			start = x
		} else if !col && start >= 0 {
			masks = append(masks, glyphMask(ink, image.Rect(start, r.Min.Y, x, r.Max.Y)))
			start = -1
		}
	}
	return masks
}

// glyphMask crops g to its ink rows and samples it onto the glyph grid: a
// cell is set when at least 40% of the pixels it covers are ink.
func glyphMask(ink func(x, y int) bool, g image.Rectangle) string {
	y0, y1 := g.Max.Y, g.Min.Y
	for y := g.Min.Y; y < g.Max.Y; y++ {
		for x := g.Min.X; x < g.Max.X; x++ {
			if ink(x, y) {
				y0, y1 = min(y0, y), max(y1, y+1)
			}
		}
	}
	g.Min.Y, g.Max.Y = y0, y1
	var b strings.Builder
	for cy := 0; cy < glyphH; cy++ {
		for cx := 0; cx < glyphW; cx++ {
			xa, xb := g.Min.X+cx*g.Dx()/glyphW, g.Min.X+(cx+1)*g.Dx()/glyphW
			ya, yb := g.Min.Y+cy*g.Dy()/glyphH, g.Min.Y+(cy+1)*g.Dy()/glyphH
			xb, yb = max(xb, xa+1), max(yb, ya+1)
			on, n := 0, 0
			for y := ya; y < yb; y++ {
				for x := xa; x < xb; x++ {
					n++
					if ink(x, y) {
						on++
					}
				}
			}
			if on*10 >= n*4 {
				b.WriteByte('#')
			} else {
				b.WriteByte('.')
			}
		}
	}
	return b.String()
}

// classifyDigit returns the digit whose mask differs from m in the fewest
// cells, if that is under a fifth of them and clearly fewer than for any
// other digit. On the reference captures a true digit is within 12 cells and
// every other at least 10 cells further.
func classifyDigit(m string) (int, bool) {
	best, bestD, second := -1, len(m), len(m)
	for d, ref := range digitMasks {
		diff := 0
		for i := range m {
			if m[i] != ref[i] {
				diff++
			}
		}
		if diff < bestD {
			best, bestD, second = d, diff, bestD
		} else if diff < second {
			second = diff
		}
	}
	return best, best >= 0 && bestD*5 < len(m) && second-bestD >= 4
}

// digitMasks are the level digits 0-9 on the glyph grid, built from Enhance
// page captures (orange current and green next levels share the font).
var digitMasks = [10]string{
	"..####...######..##########..######..######..######..######..######..#######.###.#######..#####.",
	"..#####.#######...######....####....####....####....####....####....####....####....####....###.",
	"..#####..##################..######..###....####...####....####...####...####...################",
	"..#####...######.#######.##..###....####...#####...#####.....######...##################.######.",
	"....###....####....####...#####...#####..###.##..###.##.################.#######.....##......##.",
	"..######.#######.#######.####....######..#######.##..###.....###.....##########################.",
	"....##.....###....####....###....######..#######.###########.######..###########.#######..#####.",
	"########################.....###.....###....###....###.....###....####....###.....###.....##....",
	"..####...######..#######.###.###.###.###.######..###########.#######.###########.#######..#####.",
	"..####...######.############.#######.###########.#######.######....####....###....####....###...",
}
