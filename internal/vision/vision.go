// Package vision finds UI elements in screenshots by grayscale template matching.
package vision

import (
	"image"
	"image/color"
	"image/draw"
	"math"
)

// Gray is a float luma plane; float avoids rounding in the correlation sums.
type Gray struct {
	W, H int
	Pix  []float64
}

func (g *Gray) at(x, y int) float64 { return g.Pix[y*g.W+x] }

// GrayOf converts the part of img inside r (clipped to img bounds).
func GrayOf(img image.Image, r image.Rectangle) *Gray {
	r = r.Intersect(img.Bounds())
	g := &Gray{W: r.Dx(), H: r.Dy(), Pix: make([]float64, r.Dx()*r.Dy())}
	rgba, ok := img.(*image.RGBA)
	if !ok {
		rgba = image.NewRGBA(img.Bounds())
		draw.Draw(rgba, rgba.Bounds(), img, img.Bounds().Min, draw.Src)
	}
	for y := 0; y < g.H; y++ {
		off := rgba.PixOffset(r.Min.X, r.Min.Y+y)
		for x := 0; x < g.W; x++ {
			p := rgba.Pix[off+x*4 : off+x*4+3]
			g.Pix[y*g.W+x] = 0.299*float64(p[0]) + 0.587*float64(p[1]) + 0.114*float64(p[2])
		}
	}
	return g
}

// Template is a UI element cut from a reference screenshot, with the screen
// position it was cut from. Matching searches a window around that position.
type Template struct {
	Name string
	At   image.Point // expected top-left on screen
	g    *Gray
	zero []float64 // template minus its mean
	norm float64   // sqrt(sum(zero^2))
	mean float64
}

func NewTemplate(name string, at image.Point, img image.Image) *Template {
	g := GrayOf(img, img.Bounds())
	t := &Template{Name: name, At: at, g: g, zero: make([]float64, len(g.Pix))}
	var mean float64
	for _, v := range g.Pix {
		mean += v
	}
	mean /= float64(len(g.Pix))
	t.mean = mean
	for i, v := range g.Pix {
		t.zero[i] = v - mean
		t.norm += t.zero[i] * t.zero[i]
	}
	t.norm = math.Sqrt(t.norm)
	return t
}

func (t *Template) Size() image.Point { return image.Pt(t.g.W, t.g.H) }

// Rect is where the template sits when found exactly at its reference spot.
func (t *Template) Rect() image.Rectangle {
	return image.Rectangle{Min: t.At, Max: t.At.Add(t.Size())}
}

type Match struct {
	Score float64     // zero-mean normalised cross-correlation, -1..1
	At    image.Point // top-left on screen
	Size  image.Point
	// Bright is the match area's mean luma over the template's. NCC ignores
	// brightness, so this is how a dimmed element behind a modal is told apart.
	Bright float64
}

// Visible reports a confident match that is not dimmed by an overlay.
func (m Match) Visible(minScore float64) bool {
	return m.Score >= minScore && m.Bright > 0.8 && m.Bright < 1.25
}

func (m Match) Center() image.Point { return m.At.Add(m.Size.Div(2)) }

// Find searches frame within margin pixels of the template's reference
// position. frame may be a band capture: only its bounds are searched.
func (t *Template) Find(frame image.Image, margin int) Match {
	return t.FindIn(frame, t.Rect().Inset(-margin))
}

// FindIn searches an explicit screen area, for elements whose position varies.
func (t *Template) FindIn(frame image.Image, area image.Rectangle) Match {
	win := area.Intersect(frame.Bounds())
	best := Match{Score: -1, Size: t.Size()}
	if win.Dx() < t.g.W || win.Dy() < t.g.H || t.norm == 0 {
		return best
	}
	img := GrayOf(frame, win)
	sum, sq := integral(img)
	n := float64(t.g.W * t.g.H)
	for oy := 0; oy+t.g.H <= img.H; oy++ {
		for ox := 0; ox+t.g.W <= img.W; ox++ {
			s := rectSum(sum, img.W+1, ox, oy, t.g.W, t.g.H)
			s2 := rectSum(sq, img.W+1, ox, oy, t.g.W, t.g.H)
			variance := s2 - s*s/n
			if variance <= 1e-6 {
				continue
			}
			var dot float64
			for y := 0; y < t.g.H; y++ {
				row := (oy+y)*img.W + ox
				trow := y * t.g.W
				for x := 0; x < t.g.W; x++ {
					dot += img.Pix[row+x] * t.zero[trow+x]
				}
			}
			if score := dot / (math.Sqrt(variance) * t.norm); score > best.Score {
				best.Score = score
				best.At = image.Pt(win.Min.X+ox, win.Min.Y+oy)
				if t.mean > 0 {
					best.Bright = s / n / t.mean
				}
			}
		}
	}
	return best
}

// integral returns summed-area tables of values and squares, (W+1)x(H+1).
func integral(g *Gray) (sum, sq []float64) {
	w := g.W + 1
	sum = make([]float64, w*(g.H+1))
	sq = make([]float64, w*(g.H+1))
	for y := 0; y < g.H; y++ {
		var rs, rq float64
		for x := 0; x < g.W; x++ {
			v := g.at(x, y)
			rs += v
			rq += v * v
			sum[(y+1)*w+x+1] = sum[y*w+x+1] + rs
			sq[(y+1)*w+x+1] = sq[y*w+x+1] + rq
		}
	}
	return sum, sq
}

func rectSum(t []float64, w, x, y, rw, rh int) float64 {
	return t[(y+rh)*w+x+rw] - t[y*w+x+rw] - t[(y+rh)*w+x] + t[y*w+x]
}

// Ratio returns the fraction of pixels in r for which pred holds.
func Ratio(img image.Image, r image.Rectangle, pred func(c color.RGBA) bool) float64 {
	r = r.Intersect(img.Bounds())
	if r.Empty() {
		return 0
	}
	hit := 0
	for y := r.Min.Y; y < r.Max.Y; y++ {
		for x := r.Min.X; x < r.Max.X; x++ {
			if pred(color.RGBAModel.Convert(img.At(x, y)).(color.RGBA)) {
				hit++
			}
		}
	}
	return float64(hit) / float64(r.Dx()*r.Dy())
}

// IsBadgeRed matches the red of notification dots, about rgb(205,80,50) in
// this game; item art in the same spots stays below R 160.
func IsBadgeRed(c color.RGBA) bool {
	return c.R > 180 && c.G < 115 && c.B < 95 && int(c.R)-int(c.G) > 90
}

// IsGreenText matches the green used for affordable costs and stat gains.
func IsGreenText(c color.RGBA) bool { return int(c.G)-int(c.R) > 30 && c.G > 140 }
