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

// font is a digit style: what counts as ink, the shapes each digit takes,
// and the widest single digit (wider runs are touching digits, split evenly).
type font struct {
	ink       func(color.RGBA) bool
	refs      []digitRef
	maxDigitW int
	maxDigits int
}

type digitRef struct {
	digit int
	mask  string
}

// panelFont is the dark or coloured digits on the beige panels: Enhance
// levels (orange current, green next) and Attribute page counts.
// Digits can touch ("70"), so runs wider than one digit are split.
var panelFont = font{ink: levelInk, refs: digitRefs, maxDigitW: 14, maxDigits: 3}

// readNumber reads panel digits in r.
func readNumber(frame image.Image, r image.Rectangle) (int, bool) {
	return panelFont.read(frame, r)
}

// read reads the digits in r: ink columns split into glyphs, each scaled to
// a glyphW x glyphH mask and matched against the font's references.
func (f font) read(frame image.Image, r image.Rectangle) (int, bool) {
	glyphs := f.glyphs(frame, r)
	if len(glyphs) == 0 || len(glyphs) > f.maxDigits {
		return 0, false
	}
	n := 0
	for _, g := range glyphs {
		d, ok := classifyDigit(g, f.refs)
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

func (f font) glyphs(frame image.Image, r image.Rectangle) []string {
	var masks []string
	for _, g := range f.runs(frame, r) {
		masks = append(masks, glyphMask(f.inkAt(frame), g))
	}
	return masks
}

func (f font) inkAt(frame image.Image) func(x, y int) bool {
	return func(x, y int) bool {
		return f.ink(color.RGBAModel.Convert(frame.At(x, y)).(color.RGBA))
	}
}

// runs splits r into glyph boxes: runs of columns holding ink, with runs
// wider than one digit cut evenly.
func (f font) runs(frame image.Image, r image.Rectangle) []image.Rectangle {
	ink := f.inkAt(frame)
	var boxes []image.Rectangle
	add := func(x0, x1 int) {
		parts := 1
		if f.maxDigitW > 0 {
			parts = (x1 - x0 + f.maxDigitW - 1) / f.maxDigitW
		}
		for i := 0; i < parts; i++ {
			a, b := x0+(x1-x0)*i/parts, x0+(x1-x0)*(i+1)/parts
			boxes = append(boxes, image.Rect(a, r.Min.Y, b, r.Max.Y))
		}
	}
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
			add(start, x)
			start = -1
		}
	}
	return boxes
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

// classifyDigit returns the digit whose closest reference differs from m in
// the fewest cells, if that is under a fifth of them and at least 4 cells
// fewer than for any other digit; anything closer is refused rather than
// guessed. Leaving each reference out, a true digit is within 13 cells of
// another of its own, and an unseen shape can come within 2 of another digit.
func classifyDigit(m string, refs []digitRef) (int, bool) {
	var dist [12]int // digits, then suffixes: 10 "K", 11 half an "M"
	for d := range dist {
		dist[d] = len(m)
	}
	for _, ref := range refs {
		diff := 0
		for i := range m {
			if m[i] != ref.mask[i] {
				diff++
			}
		}
		dist[ref.digit] = min(dist[ref.digit], diff)
	}
	best, second := 0, len(m)
	for d := 1; d < len(dist); d++ {
		if dist[d] < dist[best] {
			best = d
		}
	}
	for d := range dist {
		if d != best {
			second = min(second, dist[d])
		}
	}
	return best, dist[best]*5 < len(m) && second-dist[best] >= 4
}

// digitRefs are the shapes each digit takes on the glyph grid, from Enhance
// page levels ("Lv.57", orange and green) and Attribute page counts.
var digitRefs = []digitRef{
	{0, "..####...######..##########..######..######..######..######..######..#######.###.#######..#####."},
	{0, "..####...######..##..###.##..###.#....####....####....####....##.##...##.##..###.###.###..#####."},
	{0, "..####...#####...######..##..#####...#####....####....####....####....##.##..###.###.##...#####."},
	{0, "...###....#####..##########..######...#####...#####...#####...#####...#####..###.##..###.######."},
	{0, "...###....#####..##########...#####...#####...#####...#####...#####...#####..###.#######..#####."},
	{0, "...###....#####..##########...#####...#####...#####...#####...#####...##.##..###.###.###..#####."},
	{0, "...###....#####..#######.##...#####...#####...#####...#####...#####...##.##...##.##..###..#####."},
	{1, "#######.########..######....####....####....####....####....####....####....####....####....####"},
	{1, "..#####.########..######....####....####....####....####....####....####....####....####....####"},
	{1, "..#####.#######.########....####....####....####....####....####....####....####....###.....###."},
	{1, "..#####.#######...######....####....####....####....####....####....####....####....####....###."},
	{1, "..####..#######.########....####....####....####....####....####....####....####....####....####"},
	{1, "##.######################.....###.....##......##......##......##......##......##......##......##"}, // half of a touching "71"
	{2, "..#####..##################..######..###....####...####....####...####...####...################"},
	{2, "..#####..##################..#####...###....####....###....###....###....###....######..########"},
	{2, "..####...##################...####....##....####...####....###....###....###....######..########"},
	{2, "...###...##################...####....##.....###.....###....###...####...####...#####...########"},
	{2, "....#....######.###########..######..###.#..###....####....###....####..#######.###############."},
	{3, "..#####..##########.####.....###.....###...####....#####.....####.....####....######.##########."},
	{3, "..#####...######.#######.##..###....####...#####...#####.....######...##########.#######..#####."},
	{3, "..#####...######.#######.##..###.....###...####....#####.....#####....#####..###########.######."},
	{3, "..####....#####..#######.....###.....###...####....####......#####....#####...#####..###.######."},
	{3, "...###....####...######..##..###.....###...####....####.....####......#####...#####..###.######."},
	{4, "....###....####....####...#####...#####..###.##..###.##.################.#######.....##......##."},
	{4, "....##.....####....####....####...##.##...##.##..##..##..##..##.########....###......##......##."},
	{5, "..######.#######.######..###.....######..#######.##..###.....###.....##################.######.."},
	{5, "..######..######..######..###....#####...#######..#..###.....###.....###.##..###########.######."},
	{5, "..######..######..######..###.....#####...######..#..###......##......##########.#######..#####."},
	{6, "....##.....###....####...####....####....######..###########.######..###.###.###.#######.######."},
	{6, "....##.....###....####....###....######.###################..######..###########.#######..#####."},
	{6, "....##.....###....####....###....######..#######.###########.#######.###########.#######..#####."},
	{6, "....##.....###....####....###....####....######.###########..######..#######.###.#######..#####."},
	{7, "########################.....###....####....###....####....###....####....###.....###.....##...."},
	{7, "########################.....###.....###....###....###.....###....####....###.....###.....##...."},
	{7, ".######.################.....###.....##.....###.....##.....###.....###....###.....##.....###...."},
	{7, "########################.......#......##.....###....####....####...####...#####...####....####.."}, // the 7 of a touching orange "71"
	{8, "..####...######.###########..######..###.######..##########..######...#####..###########.######."},
	{8, "..####...######..#######.###.###.###.###.######..#######.###.######..######..###.#######..#####."},
	{8, "....#.....#####..#######.###.###.###.###.######..###########.#######.###########.#######..#####."},
	{8, "..#####...#####..#######.##..###.##..###..#####...######.##..######...##.##..###.#######..#####."}, // "28" allocated
	{8, "...##....######..##########..#######.###.######.###########..######..###########.#######..#####."}, // the 8 of a touching orange "80"
	{9, "..####...######.###########..######..###########.#######.######....####....###.....###....###..."},
	{9, "..####....######.##########...#####...##.###..##.#######..######....###.....##.....###....###..."},
	{9, "....#.....#####..###########.#######.###########.#######..#####....####....###....####....###..."},
}

// Attribute page: the Total Allocated column for STR, AGI, VIT, INT, DEX and
// LUK, and the unspent Attribute Points.
var (
	AttrRows      = [6]int{673, 742, 811, 880, 949, 1018}
	attrAll       = func(y int) image.Rectangle { return image.Rect(112, y-15, 192, y+15) }
	attrAllocated = func(y int) image.Rectangle { return image.Rect(222, y-15, 292, y+15) }
	attrPoints    = image.Rect(140, 1107, 197, 1134) // below and left of the "!" badge
)

// AttributeAllocation reads how many points each stat has been given.
func AttributeAllocation(frame image.Image) (alloc [6]int, ok bool) {
	for i, y := range AttrRows {
		n, ok := readNumber(frame, attrAllocated(y))
		if !ok {
			return alloc, false
		}
		alloc[i] = n
	}
	return alloc, true
}

// AttributeTotals reads each stat's All column: allocated points plus what
// pets, cards and gear add.
func AttributeTotals(frame image.Image) (total [6]int, ok bool) {
	for i, y := range AttrRows {
		n, ok := readNumber(frame, attrAll(y))
		if !ok {
			return total, false
		}
		total[i] = n
	}
	return total, true
}

// AttributePoints reads the unspent Attribute Points.
func AttributePoints(frame image.Image) (int, bool) { return readNumber(frame, attrPoints) }

// refineRate holds the digits of "(Success Rate: 95%)" on the Refine page.
// The text is right-aligned, so the digits always end just left of the
// "%", and the colon before them stays outside.
var refineRate = image.Rect(623, 876, 654, 904)

// RefineRate reads the selected item's refine success rate in percent.
func RefineRate(frame image.Image) (int, bool) {
	n, ok := readNumber(frame, refineRate)
	return n, ok && n <= 100
}

// diamondBar is the diamond count in the top bar, right of the gem icon.
var diamondBar = image.Rect(610, 20, 712, 50)

// barFont is the top bar's pale digits on its dark pill. Neighbouring digits
// can touch ("6772" reads as 6, 77, 2), so runs wider than one digit split.
var barFont = font{
	ink:       func(c color.RGBA) bool { return c.R > 200 && c.G > 200 && c.B > 160 },
	refs:      barDigitRefs,
	maxDigitW: 12,
	maxDigits: 6,
}

// Diamonds reads the diamond count from the top bar of an undimmed page.
func Diamonds(frame image.Image) (int, bool) { return barFont.read(frame, diamondBar) }

// barDigitRefs are the top bar's digit shapes, from diamond counts seen on
// the main, Weapon Gacha, Attribute, Skill and Mall pages.
var barDigitRefs = []digitRef{
	{0, "..#####...######.##...##.##....####....####....####....####....#.##....#.##...##.###.###..#####."},
	{0, "...####...######.##...##.##....#.##....####....####....#.##....#.##....#.##...##..##.###..#####."},
	{0, "...##......####...######.##...#####....####....####....####....####...##.##...##.###..##..#####."},
	{1, "########..######.....###.....###.....###.....###.....###.....###.....###.....###.....###.....###"},
	{1, "################..######..######..######..######..######..######..######..######..######..######"}, // narrow leading 1 ("1788")
	{2, "..#####..##########...####....##......##.....##.....###....###....###....####...#####...########"},
	{2, "..#####..#########....####....##......##....###.....###....###....###....###....#####...########"},
	{2, "..#####..#########....####....##......##.....##.....###....###....###....###....#####...########"},
	{2, "..#####..#########....####....##......##.....##.....###....###....###....###.....####...########"},
	{3, ".######.##########....##......##.....###...####.....####......##......###.....#####..##########."},
	{3, "..#####..######..##..###.....###.....##.....###.....####......##......####....######.###.######."},
	{3, "..####...######..##..###.....###.....##.....###.....####......##......####....######.###.######."},
	{4, "...###.....####...#####...#####...##.##..##..##.##...##.################...#####.....##......##."},
	{4, "...###.....####....####...#####...##.##..##..##..##..##.##...##.################...#####.....##."},
	{4, "....###....#####...#####..######..##..##.##...####....##################....####......##......#."},
	{4, "....###....#####...#####...#####...#..##..##..##.##...##.###############....####......##......#."},
	{4, "....###.....####...#####...#####...#..##..##..##.##...##.###############....####......##......#."},
	{5, ".#######.#######.##......##......###.....######.......##......##......##......#####.###########."},
	{6, "....##.....###....###.....##.....###....#######.###...####....####....####....#####...#########."},
	{6, "....##.....###....###.....##.....###....#######.###...####....####....####....#####...##.######."},
	{6, "....##.....###.....##.....##......###....######..##...#####...#####...##.##...##.#######..#####."},
	{6, "....##.....###.....##......#......###....######.###...#####...#####...#####...##.#######..#####."},
	{6, "....##.....###.....##......#......###....######.###...#####....####....####...##.###.###..#####."},
	{6, "....##.....###.....##......#......##.....######.###...#####...#####...#####...##.#######.######."},
	{6, "....##.....###.....##......#......##.....######.###...#####...#####...#####...##.###.###.######."},
	{6, "....##.....###.....##......#......##.....######.###...#####...#####....####...##.###.###.######."},
	{6, "....##.....###.....##......#......##.....######.###...#####....####....####...##.###.###..#####."},
	{6, "....##.....###.....##......#......##.....######..###..#####...#####....####...##.###..##..#####."},
	{6, "....##.....###.....##......#......##.....######..###..##.##...#####....#.##...##.###..##..#####."},
	{7, "################......##.....###.....##.....###....###.....##......##.....##......##......#....."},
	{7, "########.#######......##.....###.....##.....###....###.....##......##.....##......##......#....."},
	{7, "########.#######.......#......##......##....###.....###....###.....###....###.....###.....##...."},
	{7, ".######.################.....###.....##.....###.....##....####....###....###.....##......##....."},
	{8, ".######.##########....####....##.##..###.######.###..#####....####....####....#####..###.######."},
	{8, "..#####..###.#####....##.#....##.##...##.######.###...####....####....####....#####..###.######."},
	{8, "..#####...######.###..##.##...##..##..##..#####..###..##.##...#####...##.##...##.###.###..#####."},
	{8, "..#####...##.###.###..##.##...##..##..##..#####..###..#####...#####....####...##.###.###..#####."},
	{8, "...####...##.###.##...##..#...##..##..##..#####..###..##.##....####....####...##.###.###..#####."},
	{9, ".######.##########....####....####....####....##########.#######....####....###.....##....####.."},
	{9, ".######.##########....####....####.....#########.#######....####....###.....##.....###....###..."},
	{9, ".######.##########....####....####.....###....##########.#######....####....###.....##....####.."},
	{9, ".######.##########....####.....###.....###....##########.#######....####....###.....##....####.."},
	{9, ".######.##########....####.....###.....###....######.###.#######....####....###.....##....####.."},
	{9, "..#####..##########...#####....####....#.#######..######....####....###.....##.....###.....##..."},
	{9, "...###....#####.###########...####....####....#####...##.#######....###.....###....###....###..."},
	{9, "...##.....#####..##########...####....####....#####...##.#######.....##.....###....###....###..."},
}

// powerDigits is the combat power under the portrait ("2085.6K"), clear of
// the sparkle at the pill's right end.
var powerDigits = image.Rect(180, 64, 292, 94)

// powerFont is the power's cream digits on the brown pill. Reference 10 is
// the "K" suffix and 11 either half of the "M" suffix, which the font draws
// as two runs; a decimal point is a run no wider than powerDotW.
var powerFont = font{
	ink:       func(c color.RGBA) bool { return c.R > 225 && c.G > 215 && c.B > 170 },
	refs:      powerRefs,
	maxDigitW: 14,
}

const powerDotW = 3

// Power reads combat power, in points ("2085.6K" is 2085600, "11.8M" is
// 11800000), from an undimmed main screen.
func Power(frame image.Image) (int, bool) {
	boxes := powerFont.runs(frame, powerDigits)
	if len(boxes) < 3 {
		return 0, false
	}
	ink := powerFont.inkAt(frame)
	tenths, decimals, dot := 0, 0, false
	for i, g := range boxes {
		if g.Dx() <= powerDotW {
			if dot {
				return 0, false
			}
			dot = true
			continue
		}
		d, ok := classifyDigit(glyphMask(ink, g), powerFont.refs)
		if !ok {
			return 0, false
		}
		switch d {
		case 10: // K, the last glyph
			if i != len(boxes)-1 || decimals > 1 {
				return 0, false
			}
			for ; decimals < 1; decimals++ {
				tenths *= 10
			}
			return tenths * 100, true
		case 11: // M, the last two glyphs
			if i != len(boxes)-2 || decimals > 1 {
				return 0, false
			}
			if m, ok := classifyDigit(glyphMask(ink, boxes[i+1]), powerFont.refs); !ok || m != 11 {
				return 0, false
			}
			for ; decimals < 1; decimals++ {
				tenths *= 10
			}
			return tenths * 100_000, true
		}
		tenths = tenths*10 + d
		if dot {
			decimals++
		}
	}
	return 0, false
}

// powerRefs are the power font's shapes (10 is "K", 11 the halves of "M"),
// from power readings between 474.6K and 2085.6K on 3 and 4 Nov, and 10M and
// 11.8M on 5 Nov.
var powerRefs = []digitRef{
	{11, "....#......###....####....#####...#####..######..###..##.###..#####...#####....###.....###.....#"},
	{11, "...#......###....#####...#####...#####...######..##..##.###...#####...####....####.....###.....#"},
	{11, ".....#......###....####....#####...#####..######..##..##.##...#####...####.....###.....###.....#"},
	{11, "....#......###.....####...#####...#####..#######.##..###.##..######..#####....###.....###......#"},
	{0, "...###....####...##########...#####...####.....###.....###.....###....#####...##.##...##..#####."},
	{1, "..#####.################.....###.....###.....###.....###.....###.....###.....###.....###.....###"},
	{1, "..###...################.....###.....###.....###.....###.....###.....###.....###.....###.....###"},
	{1, "....###.################.....###.....###.....###.....###.....###.....###.....###.....###.....###"},
	{1, "....#...################.....###.....###.....###.....###.....###.....###.....###.....###.....###"},
	{2, "....##....################.....###.....#......##.....###....###....####...###....###....########"},
	{3, "...##.....#####..#######.#....##......##....###....####.....####......##.......###....##.#######"},
	{4, ".....#......###....####...#####...##.##...##.##..##..##..##..##.################.....###.....##."},
	{4, ".....#......###....####...#####...##.##...#..##..##..##..##..##.################.....###......#."},
	{4, ".....#......###....####...##.##...##.##...#..##..##..##..##..##.################.....##......##."},
	{4, ".....#......###....####....#.##...##.##...#..##..##..##..##..##.################.....###.....##."},
	{5, "..######.#######.#######.##......##.....#######..##..###......##.......#.......#......#########."},
	{5, "..######.#######.#######.##......##......######..##..###......##.......#.......#......##########"},
	{5, "...####...######.######..###.....###.....######..###.###......##......##......##......#########."},
	{6, "....##.....###.....###....###.....###....######..##########...#####...#####...#####...##.######."},
	{6, ".....#......##.....###....###.....###....######..##########...#####...#####...#####...##.######."},
	{6, ".....#......##.....###....###.....###....######..##########...#####....####...##.##...##.#######"},
	{6, ".....#......##.....###....###.....###....#####...##########...#####...#####...##.##...##.######."},
	{6, ".....#......##.....###....###.....##.....######..##########..######...#####...#####...##.######."},
	{7, "..######################......##.....###....###.....###....###.....###.....#......##......##...."},
	{7, "..##############.#######......##.....###.....##.....##......##.....###.....##.....###.....##...."},
	{8, "...##.....#####..#######.##...##.##...##.#######..######.###..#####....####....####...##.#######"},
	{8, "...##.....####...######..##...##.##...##.######...#####..##..######...#####...#####...##.######."},
	{8, "....##....#####..######..##...##.##...##..#####...#####..##..######...#####...##.##...##.######."},
	{9, "...###....#####..##########...#####...#####...##.##..###..######...####......#......##.....##..."},
	{10, "##...#####...#####..###.##.###..#####...####....####....#####...##.###..##..##..##...##.##....##"},
	{10, ".#....####...#####...#####..###.######..#####...#####...#####...##..##..##...##.##...###.#....##"},
	{10, ".#.....###....####...#####..###.##.###..#####...#####...######..##..##..##...##.##...###.#....##"},
	{10, ".......###....####...#####..###.##.###..#####...#####...#####...##..##..##...##.##...#####....##"},
	{10, ".......#.#....####...#####..###.##.###..#####...#####...#####...##..##..##...##.##...#####....##"},
}

// incomeJob is the current Job level on the Adventure Income dialog: the
// green two digits after "LV." right of the arrow.
var incomeJob = image.Rect(618, 540, 648, 566)

// IncomeJobLevel reads it; single-digit levels do not read (they sit
// further left), which only matters for a new character.
func IncomeJobLevel(frame image.Image) (int, bool) { return readNumber(frame, incomeJob) }

// quickIdlePrice is the diamond price in the paid Quick Idle confirm
// ("spend Diamond x 150 to gain 1 hour"); it rises with each purchase.
var quickIdlePrice = image.Rect(522, 566, 562, 594)

// QuickIdlePrice reads it (two or three digits).
func QuickIdlePrice(frame image.Image) (int, bool) { return readNumber(frame, quickIdlePrice) }
