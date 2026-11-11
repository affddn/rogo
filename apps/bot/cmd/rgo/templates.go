package main

import (
	"context"
	"flag"
	"fmt"
	"image"
	"image/png"
	"os"
	"slices"
	"strconv"
	"strings"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/device"
)

func loadPNG(path string) (image.Image, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return png.Decode(f)
}

func cmdCrop(_ context.Context, _ *device.Device, args []string) error {
	if len(args) < 6 {
		return fmt.Errorf("crop: need src.png name x y w h [note]")
	}
	src, err := loadPNG(args[0])
	if err != nil {
		return err
	}
	var n [4]int
	for i := range n {
		if n[i], err = strconv.Atoi(args[2+i]); err != nil {
			return fmt.Errorf("crop: bad number %q", args[2+i])
		}
	}
	e := assets.Entry{Name: args[1], X: n[0], Y: n[1], W: n[2], H: n[3], Note: strings.Join(args[6:], " ")}
	if err := assets.Save(src, e); err != nil {
		return err
	}
	fmt.Printf("saved %s/%s.png (%d,%d %dx%d); rebuild to embed\n", assets.Dir, e.Name, e.X, e.Y, e.W, e.H)
	return nil
}

func cmdMatch(ctx context.Context, d *device.Device, args []string) error {
	fs := flag.NewFlagSet("match", flag.ContinueOnError)
	file := fs.String("f", "", "match against a saved screenshot instead of the device")
	margin := fs.Int("m", 40, "search margin in pixels")
	if err := fs.Parse(args); err != nil {
		return err
	}
	all, err := assets.Templates()
	if err != nil {
		return err
	}
	names := fs.Args()
	if len(names) == 0 {
		for n := range all {
			names = append(names, n)
		}
		slices.Sort(names)
	}

	var frame image.Image
	if *file != "" {
		frame, err = loadPNG(*file)
	} else {
		frame, err = d.Screenshot(ctx)
	}
	if err != nil {
		return err
	}
	for _, n := range names {
		t, ok := all[n]
		if !ok {
			return fmt.Errorf("match: unknown template %q", n)
		}
		m := t.Find(frame, *margin)
		fmt.Printf("%-28s score=%.3f bright=%.2f visible=%-5v center=%v shift=%v\n",
			n, m.Score, m.Bright, m.Visible(0.85), m.Center(), m.At.Sub(t.At))
	}
	return nil
}

func cmdPixel(_ context.Context, _ *device.Device, args []string) error {
	if len(args) < 3 {
		return fmt.Errorf("pixel: need shot.png x y [w h]")
	}
	img, err := loadPNG(args[0])
	if err != nil {
		return err
	}
	n := []int{0, 0, 1, 1}
	for i, a := range args[1:] {
		if i < 4 {
			if n[i], err = strconv.Atoi(a); err != nil {
				return err
			}
		}
	}
	var r, g, b, cnt int
	for y := n[1]; y < n[1]+n[3]; y++ {
		for x := n[0]; x < n[0]+n[2]; x++ {
			cr, cg, cb, _ := img.At(x, y).RGBA()
			r, g, b, cnt = r+int(cr>>8), g+int(cg>>8), b+int(cb>>8), cnt+1
		}
	}
	fmt.Printf("mean rgb(%d,%d,%d) over %d px\n", r/cnt, g/cnt, b/cnt, cnt)
	return nil
}
