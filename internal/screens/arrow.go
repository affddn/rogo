package screens

import (
	"image"
	"image/color"
	"strings"

	"github.com/affddn/rogo/internal/vision"
)

// GuideArrow is the blinking yellow arrowhead the game draws next to the
// control it wants pressed (tutorials and quest guidance).
type GuideArrow struct {
	At     image.Point // centroid
	Dir    image.Point // unit axis it points along
	Target image.Point // where to tap
	Score  float64     // silhouette overlap with the reference
}

func arrowYellow(c color.RGBA) bool {
	return c.R > 220 && c.G > 160 && c.B < 120 && int(c.R)-int(c.B) > 130
}

// arrowDown is the lit half of a down-pointing arrowhead (tut-1.png). The
// other directions are rotations of it.
const arrowDown = `
..........#.
.........##.
.........###
############
############
.###########
.###########
..##########
...#########
...#########
....########
.....#######
.....#######
......######
.......#####
........####
........####
.........###
..........##
..........#.`

type shape struct {
	set map[image.Point]bool
	dir image.Point
}

var arrowShapes = func() []shape {
	var base []image.Point
	for y, row := range strings.Split(strings.TrimSpace(arrowDown), "\n") {
		for x, ch := range row {
			if ch == '#' {
				base = append(base, image.Pt(x, y))
			}
		}
	}
	// Rotating the shape and its direction together, 90° at a time:
	// down -> left -> up -> right.
	rot := func(p image.Point) image.Point { return image.Pt(-p.Y, p.X) }
	var out []shape
	pts, dir := base, image.Pt(0, 1)
	for i := 0; i < 4; i++ {
		out = append(out, shape{normalise(pts), dir})
		next := make([]image.Point, len(pts))
		for j, p := range pts {
			next[j] = rot(p)
		}
		pts, dir = next, rot(dir)
	}
	return out
}()

// normalise moves a point set so its bounding box starts at (0,0).
func normalise(pts []image.Point) map[image.Point]bool {
	min := pts[0]
	for _, p := range pts {
		if p.X < min.X {
			min.X = p.X
		}
		if p.Y < min.Y {
			min.Y = p.Y
		}
	}
	set := make(map[image.Point]bool, len(pts))
	for _, p := range pts {
		set[p.Sub(min)] = true
	}
	return set
}

// overlap is the best intersection-over-union of two sets over small shifts.
func overlap(a, b map[image.Point]bool) float64 {
	best := 0.0
	for dy := -2; dy <= 2; dy++ {
		for dx := -2; dx <= 2; dx++ {
			d := image.Pt(dx, dy)
			inter := 0
			for p := range a {
				if b[p.Add(d)] {
					inter++
				}
			}
			if iou := float64(inter) / float64(len(a)+len(b)-inter); iou > best {
				best = iou
			}
		}
	}
	return best
}

// arrowReach is how far past the arrow's centroid its target sits (measured
// 63..86 px on five tutorial steps).
const arrowReach = 70

// MinArrowScore is the silhouette overlap needed to accept an arrow.
const MinArrowScore = 0.85 // real arrows 0.87-1.00; a realm-page ornament 0.79

// FindGuideArrow returns the best arrowhead on screen whose silhouette
// matches the reference in some rotation.
func FindGuideArrow(frame image.Image) (GuideArrow, bool) {
	var best GuideArrow
	for _, c := range vision.Components(frame, image.Rect(0, 60, 720, 1275), 95, 190, arrowYellow) {
		long, short := c.Bounds.Dx(), c.Bounds.Dy()
		if short > long {
			long, short = short, long
		}
		if long < 15 || long > 25 || short < 10 || short > 17 {
			continue
		}
		cand := normalise(c.Pixels)
		for _, s := range arrowShapes {
			score := overlap(cand, s.set)
			if score <= best.Score {
				continue
			}
			cx, cy := c.Centroid()
			at := image.Pt(int(cx), int(cy))
			best = GuideArrow{At: at, Dir: s.dir, Target: at.Add(s.dir.Mul(arrowReach)), Score: score}
		}
	}
	if best.Score < MinArrowScore || !best.Target.In(image.Rect(0, 0, 720, 1280)) {
		return GuideArrow{}, false
	}
	return best, true
}
