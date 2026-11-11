// Package assets embeds the UI templates cut from reference screenshots.
//
// Each template is templates/<name>.png plus an entry in templates/manifest.json
// recording where on the 720x1280 screen it was cut from. `rgo crop` maintains both.
package assets

import (
	"embed"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"sort"
	"sync"

	"github.com/affddn/rogo/internal/vision"
)

//go:embed templates
var files embed.FS

// Dir is the source location `rgo crop` writes to, relative to the repo root.
const Dir = "apps/bot/assets/templates"

type Entry struct {
	Name string `json:"name"`
	X    int    `json:"x"`
	Y    int    `json:"y"`
	W    int    `json:"w"`
	H    int    `json:"h"`
	Note string `json:"note,omitempty"`
}

var (
	once  sync.Once
	byKey map[string]*vision.Template
	err   error
)

// Templates loads every embedded template, keyed by name.
func Templates() (map[string]*vision.Template, error) {
	once.Do(func() {
		byKey = map[string]*vision.Template{}
		var entries []Entry
		raw, e := files.ReadFile("templates/manifest.json")
		if e != nil {
			err = e
			return
		}
		if e := json.Unmarshal(raw, &entries); e != nil {
			err = fmt.Errorf("manifest: %w", e)
			return
		}
		for _, en := range entries {
			f, e := files.Open("templates/" + en.Name + ".png")
			if e != nil {
				err = e
				return
			}
			img, e := png.Decode(f)
			f.Close()
			if e != nil {
				err = fmt.Errorf("%s: %w", en.Name, e)
				return
			}
			byKey[en.Name] = vision.NewTemplate(en.Name, image.Pt(en.X, en.Y), img)
		}
	})
	return byKey, err
}

// MustGet returns a named template or panics; names are compile-time constants
// in the screens and tasks packages, so a miss is a programming error.
func MustGet(name string) *vision.Template {
	all, err := Templates()
	if err != nil {
		panic(err)
	}
	t, ok := all[name]
	if !ok {
		panic("assets: unknown template " + name)
	}
	return t
}

// Save writes a template cut from src into the source tree and updates the
// manifest. The binary must be rebuilt to embed it.
func Save(src image.Image, e Entry) error {
	r := image.Rect(e.X, e.Y, e.X+e.W, e.Y+e.H)
	if !r.In(src.Bounds()) {
		return fmt.Errorf("crop %v outside image %v", r, src.Bounds())
	}
	sub, ok := src.(interface {
		SubImage(image.Rectangle) image.Image
	})
	if !ok {
		return fmt.Errorf("image type %T cannot be cropped", src)
	}
	f, err := os.Create(filepath.Join(Dir, e.Name+".png"))
	if err != nil {
		return err
	}
	if err := png.Encode(f, sub.SubImage(r)); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}

	path := filepath.Join(Dir, "manifest.json")
	var entries []Entry
	if raw, err := os.ReadFile(path); err == nil {
		if err := json.Unmarshal(raw, &entries); err != nil {
			return fmt.Errorf("manifest: %w", err)
		}
	}
	replaced := false
	for i := range entries {
		if entries[i].Name == e.Name {
			entries[i], replaced = e, true
		}
	}
	if !replaced {
		entries = append(entries, e)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name < entries[j].Name })
	out, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(out, '\n'), 0o644)
}
