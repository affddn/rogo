// Package vision finds UI elements in screenshots by grayscale template matching.
package vision

import (
	"image"
	"image/color"
	"image/draw"
	"math"
	"sort"
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

// Blobs finds clusters of pixels matching pred inside area, sampled on a
// step-pixel grid, and returns their centres. Used to locate every red badge
// in a grid of tiles without knowing the layout.
func Blobs(img image.Image, area image.Rectangle, step, minHits int, pred func(c color.RGBA) bool) []image.Point {
	area = area.Intersect(img.Bounds())
	type cell struct{ x, y int }
	hits := map[cell]bool{}
	for y := area.Min.Y; y < area.Max.Y; y += step {
		for x := area.Min.X; x < area.Max.X; x += step {
			if pred(color.RGBAModel.Convert(img.At(x, y)).(color.RGBA)) {
				hits[cell{x / step, y / step}] = true
			}
		}
	}
	seen := map[cell]bool{}
	var out []image.Point
	for c := range hits {
		if seen[c] {
			continue
		}
		// flood fill over 8-connected cells
		stack := []cell{c}
		seen[c] = true
		var sx, sy, n int
		for len(stack) > 0 {
			p := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			sx, sy, n = sx+p.x, sy+p.y, n+1
			for dy := -1; dy <= 1; dy++ {
				for dx := -1; dx <= 1; dx++ {
					q := cell{p.x + dx, p.y + dy}
					if hits[q] && !seen[q] {
						seen[q] = true
						stack = append(stack, q)
					}
				}
			}
		}
		if n >= minHits {
			out = append(out, image.Pt(sx*step/n+step/2, sy*step/n+step/2))
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Y != out[j].Y {
			return out[i].Y < out[j].Y
		}
		return out[i].X < out[j].X
	})
	return out
}

// Component is a 4-connected group of pixels matching a predicate.
type Component struct {
	Pixels []image.Point
	Bounds image.Rectangle
}

// Centroid is the mean pixel position.
func (c Component) Centroid() (float64, float64) {
	var sx, sy float64
	for _, p := range c.Pixels {
		sx, sy = sx+float64(p.X), sy+float64(p.Y)
	}
	n := float64(len(c.Pixels))
	return sx / n, sy / n
}

// Components labels every connected group of pred pixels inside area whose
// size is within [minArea, maxArea].
func Components(img image.Image, area image.Rectangle, minArea, maxArea int, pred func(c color.RGBA) bool) []Component {
	area = area.Intersect(img.Bounds())
	rgba, ok := img.(*image.RGBA)
	if !ok {
		rgba = image.NewRGBA(img.Bounds())
		draw.Draw(rgba, rgba.Bounds(), img, img.Bounds().Min, draw.Src)
	}
	w, h := area.Dx(), area.Dy()
	hit := make([]bool, w*h)
	for y := 0; y < h; y++ {
		off := rgba.PixOffset(area.Min.X, area.Min.Y+y)
		for x := 0; x < w; x++ {
			p := rgba.Pix[off+x*4 : off+x*4+4]
			hit[y*w+x] = pred(color.RGBA{p[0], p[1], p[2], p[3]})
		}
	}
	var out []Component
	seen := make([]bool, w*h)
	for i := range hit {
		if !hit[i] || seen[i] {
			continue
		}
		var c Component
		stack := []int{i}
		seen[i] = true
		for len(stack) > 0 {
			j := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			pt := image.Pt(area.Min.X+j%w, area.Min.Y+j/w)
			c.Pixels = append(c.Pixels, pt)
			if len(c.Pixels) == 1 {
				c.Bounds = image.Rectangle{Min: pt, Max: pt.Add(image.Pt(1, 1))}
			} else {
				c.Bounds = c.Bounds.Union(image.Rectangle{Min: pt, Max: pt.Add(image.Pt(1, 1))})
			}
			x, y := j%w, j/w
			for _, n := range [4][2]int{{x + 1, y}, {x - 1, y}, {x, y + 1}, {x, y - 1}} {
				if n[0] < 0 || n[1] < 0 || n[0] >= w || n[1] >= h {
					continue
				}
				k := n[1]*w + n[0]
				if hit[k] && !seen[k] {
					seen[k] = true
					stack = append(stack, k)
				}
			}
			if len(c.Pixels) > maxArea*4 {
				break // a large region; no need to finish labelling it
			}
		}
		if len(c.Pixels) >= minArea && len(c.Pixels) <= maxArea {
			out = append(out, c)
		}
	}
	return out
}

// FindAll returns every placement of t inside area scoring at least minScore,
// keeping only the best within minGap pixels of each other.
func (t *Template) FindAll(frame image.Image, area image.Rectangle, minScore float64, minGap int) []Match {
	win := area.Intersect(frame.Bounds())
	if win.Dx() < t.g.W || win.Dy() < t.g.H || t.norm == 0 {
		return nil
	}
	img := GrayOf(frame, win)
	sum, sq := integral(img)
	n := float64(t.g.W * t.g.H)
	var hits []Match
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
			score := dot / (math.Sqrt(variance) * t.norm)
			if score < minScore {
				continue
			}
			m := Match{Score: score, At: image.Pt(win.Min.X+ox, win.Min.Y+oy), Size: t.Size()}
			if t.mean > 0 {
				m.Bright = s / n / t.mean
			}
			merged := false
			for i := range hits {
				d := hits[i].At.Sub(m.At)
				if d.X*d.X+d.Y*d.Y < minGap*minGap {
					if m.Score > hits[i].Score {
						hits[i] = m
					}
					merged = true
					break
				}
			}
			if !merged {
				hits = append(hits, m)
			}
		}
	}
	return hits
}
