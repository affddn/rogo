// Package device drives one Android device through the adb binary.
package device

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"io"
	"os/exec"
	"strings"
	"time"
)

// Raw screencap header: width, height, pixel format, colour space (uint32 LE).
const rawHeader = 16

// rawFile is where band captures stage the frame on the device; cutting from a
// file avoids short reads that dd gets from a pipe.
const rawFile = "/data/local/tmp/rgo.raw"

type Device struct {
	Serial  string
	ADB     string
	Timeout time.Duration
	// DryRun logs input instead of sending it.
	DryRun bool
	Log    func(format string, args ...any)
}

func New(serial string) *Device {
	// A screenshot takes ~4.5 s over the VMOS tunnel but 15-20 s when its
	// gateway is slow; the tunnel's keepalive drops a dead link sooner.
	return &Device{Serial: serial, ADB: "adb", Timeout: 45 * time.Second, Log: func(string, ...any) {}}
}

// ErrTransport marks a failure of the link to the phone (an adb command that
// failed or timed out, a screenshot cut short) rather than of the game.
var ErrTransport = errors.New("phone link")

func (d *Device) run(ctx context.Context, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, d.Timeout)
	defer cancel()
	full := append([]string{"-s", d.Serial}, args...)
	var stdout, stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, d.ADB, full...)
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("%w: adb %s: %w: %s", ErrTransport, strings.Join(args, " "), err, strings.TrimSpace(stderr.String()))
	}
	return stdout.Bytes(), nil
}

// Shell runs a shell command and returns trimmed output.
func (d *Device) Shell(ctx context.Context, command string) (string, error) {
	out, err := d.run(ctx, "shell", command)
	return strings.TrimSpace(strings.ReplaceAll(string(out), "\r", "")), err
}

// Connect runs `adb connect` for network serials (host:port). USB serials are left alone.
func (d *Device) Connect(ctx context.Context) error {
	if !strings.Contains(d.Serial, ":") {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, d.Timeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, d.ADB, "connect", d.Serial).CombinedOutput()
	if err != nil || !strings.Contains(string(out), "connected") {
		return fmt.Errorf("adb connect %s: %v: %s", d.Serial, err, strings.TrimSpace(string(out)))
	}
	return nil
}

// Disconnect drops a network serial from the adb server (no-op for USB).
func (d *Device) Disconnect(ctx context.Context) {
	if !strings.Contains(d.Serial, ":") {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, d.Timeout)
	defer cancel()
	_ = exec.CommandContext(ctx, d.ADB, "disconnect", d.Serial).Run()
}

// Online reports whether adb sees the device in the "device" state.
func (d *Device) Online(ctx context.Context) bool {
	out, err := d.run(ctx, "get-state")
	return err == nil && strings.TrimSpace(string(out)) == "device"
}

// Screenshot returns the full frame as PNG-decoded RGBA. ~1.1 MB over the wire.
func (d *Device) Screenshot(ctx context.Context) (*image.RGBA, error) {
	out, err := d.run(ctx, "exec-out", "screencap -p")
	if err != nil {
		return nil, err
	}
	img, err := png.Decode(bytes.NewReader(out))
	if err != nil {
		return nil, fmt.Errorf("%w: decode screenshot: %w", ErrTransport, err)
	}
	return toRGBA(img), nil
}

// Rows captures rows [y0, y1) of the screen. The cut happens on the device, so
// a short band is several times faster than a full Screenshot. The returned
// image keeps screen coordinates: its Bounds().Min.Y is y0.
func (d *Device) Rows(ctx context.Context, width, y0, y1 int) (*image.RGBA, error) {
	if y1 <= y0 {
		return nil, fmt.Errorf("rows: empty range %d..%d", y0, y1)
	}
	// dd block size of 16 lines up with both the header and the row stride
	// (width*4 is a multiple of 16 for every real screen width).
	rowBlocks := width * 4 / 16
	cmd := fmt.Sprintf("screencap %s && dd if=%s bs=16 skip=%d count=%d 2>/dev/null | gzip -1",
		rawFile, rawFile, rawHeader/16+y0*rowBlocks, (y1-y0)*rowBlocks)
	out, err := d.run(ctx, "exec-out", cmd)
	if err != nil {
		return nil, err
	}
	zr, err := gzip.NewReader(bytes.NewReader(out))
	if err != nil {
		return nil, fmt.Errorf("%w: rows: %w", ErrTransport, err)
	}
	pix, err := io.ReadAll(zr)
	if err != nil {
		return nil, fmt.Errorf("%w: rows: %w", ErrTransport, err)
	}
	if want := (y1 - y0) * width * 4; len(pix) != want {
		return nil, fmt.Errorf("rows: got %d bytes, want %d", len(pix), want)
	}
	return &image.RGBA{Pix: pix, Stride: width * 4, Rect: image.Rect(0, y0, width, y1)}, nil
}

// Size reads the physical screen size from the raw screencap header.
func (d *Device) Size(ctx context.Context) (w, h int, err error) {
	out, err := d.run(ctx, "exec-out", "screencap | head -c 8")
	if err != nil {
		return 0, 0, err
	}
	if len(out) < 8 {
		return 0, 0, fmt.Errorf("size: short header")
	}
	return int(binary.LittleEndian.Uint32(out[0:])), int(binary.LittleEndian.Uint32(out[4:])), nil
}

func (d *Device) input(ctx context.Context, args string) error {
	if d.DryRun {
		d.Log("dry-run input %s", args)
		return nil
	}
	_, err := d.Shell(ctx, "input "+args)
	return err
}

func (d *Device) Tap(ctx context.Context, x, y int) error {
	return d.input(ctx, fmt.Sprintf("tap %d %d", x, y))
}

// Taps taps one point n times, gap apart, in a single shell: one adb round
// trip for a run of + taps instead of one each.
func (d *Device) Taps(ctx context.Context, x, y, n int, gap time.Duration) error {
	if d.DryRun {
		d.Log("dry-run input tap %d %d x%d", x, y, n)
		return nil
	}
	_, err := d.Shell(ctx, strings.Repeat(fmt.Sprintf("input tap %d %d; sleep %.2f; ", x, y, gap.Seconds()), n))
	return err
}

func (d *Device) Swipe(ctx context.Context, x1, y1, x2, y2 int, dur time.Duration) error {
	return d.input(ctx, fmt.Sprintf("swipe %d %d %d %d %d", x1, y1, x2, y2, dur.Milliseconds()))
}

// Back sends the Android back key.
func (d *Device) Back(ctx context.Context) error {
	return d.input(ctx, "keyevent 4")
}

func (d *Device) AppRunning(ctx context.Context, pkg string) bool {
	out, err := d.Shell(ctx, "pidof "+pkg)
	return err == nil && out != ""
}

func (d *Device) AppFocused(ctx context.Context, pkg string) bool {
	out, _ := d.Shell(ctx, "dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'")
	return strings.Contains(out, pkg)
}

// TopActivity returns the resumed activity on top as "package/class", or ""
// when none is listed.
func (d *Device) TopActivity(ctx context.Context) (string, error) {
	out, err := d.Shell(ctx, "dumpsys activity activities | grep -m1 topResumedActivity")
	if err != nil {
		return "", err
	}
	return parseTopActivity(out), nil
}

// parseTopActivity pulls "package/class" out of a dumpsys line such as
// "topResumedActivity=ActivityRecord{b8890ef u0 com.ggv.rogosea.aos/com.google.android.gms.ads.AdActivity t33}".
func parseTopActivity(line string) string {
	for _, f := range strings.Fields(line) {
		if strings.Contains(f, "/") && !strings.Contains(f, "=") {
			return strings.TrimSuffix(f, "}")
		}
	}
	return ""
}

// Launch starts pkg's launcher activity. --pct-syskeys 0 lets monkey run on
// devices without hardware keys (redroid), where it otherwise aborts.
func (d *Device) Launch(ctx context.Context, pkg string) error {
	_, err := d.Shell(ctx, "monkey --pct-syskeys 0 -p "+pkg+" -c android.intent.category.LAUNCHER 1")
	return err
}

func (d *Device) Stop(ctx context.Context, pkg string) error {
	_, err := d.Shell(ctx, "am force-stop "+pkg)
	return err
}

func toRGBA(img image.Image) *image.RGBA {
	if r, ok := img.(*image.RGBA); ok {
		return r
	}
	r := image.NewRGBA(img.Bounds())
	draw.Draw(r, r.Bounds(), img, img.Bounds().Min, draw.Src)
	return r
}
