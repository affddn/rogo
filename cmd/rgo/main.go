// Command rgo automates Ragnarok: GO over adb.
package main

import (
	"context"
	"flag"
	"fmt"
	"image/png"
	"log"
	"maps"
	"os"
	"os/signal"
	"path/filepath"
	"slices"
	"strconv"
	"time"

	"github.com/affddn/rogo/internal/device"
)

const pkg = "com.ggv.rogosea.aos"

// serialGiven is set when -s or RGO_SERIAL names the phone. run then talks to
// it over plain adb (a local redroid container, say) instead of opening the
// VMOS tunnel configured in .env.
var serialGiven bool

type command struct {
	usage string
	run   func(ctx context.Context, d *device.Device, args []string) error
	// offline skips the up-front adb connect: the command works on saved
	// screenshots, or connects itself (run opens its tunnel first).
	offline bool
}

var commands = map[string]command{
	"info":          {"", cmdInfo, false},
	"shot":          {"[file.png]", cmdShot, false},
	"tap":           {"x y", cmdTap, false},
	"crop":          {"src.png name x y w h [note]", cmdCrop, true},
	"pixel":         {"shot.png x y [w h]", cmdPixel, true},
	"match":         {"[-f shot.png] [template...]", cmdMatch, false},
	"status":        {"", cmdStatus, false},
	"home":          {"", cmdHome, false},
	"income":        {"", cmdIncome, false},
	"quests":        {"", cmdQuests, false},
	"grow":          {"", cmdGrow, false},
	"boot":          {"", cmdBoot, false},
	"run":           {"", cmdRun, true},
	"stage":         {"", cmdStage, false},
	"gacha":         {"", cmdGacha, false},
	"diamonds":      {"", cmdDiamonds, false},
	"realm":         {"", cmdRealm, false},
	"boss":          {"", cmdBaphomet, false},
	"mvp":           {"[quest]", cmdMVP, false},
	"arena":         {"", cmdArena, false},
	"shop":          {"", cmdShop, false},
	"ranking":       {"", cmdRanking, false},
	"backpack":      {"", cmdBackpack, false},
	"trove":         {"", cmdTrove, false},
	"quickidle":     {"", cmdQuickIdle, false},
	"wish":          {"", cmdWish, false},
	"tower":         {"[challenge]", cmdTower, false},
	"dailies":       {"", cmdDailies, false},
	"guild":         {"", cmdGuild, false},
	"qpanel":        {"", cmdQuestPanel, false},
	"pets":          {"", cmdPets, false},
	"goal":          {"", cmdObjective, false},
	"dungeon":       {"[assists]", cmdDungeon, false},
	"pass":          {"", cmdPass, false},
	"tunnel":        {"", cmdTunnel, true},
	"tunnel-rotate": {"", cmdTunnelRotate, true},
	"report":        {"[-state data/state.json]", cmdReport, true},
	"back":          {"", func(ctx context.Context, d *device.Device, _ []string) error { return d.Back(ctx) }, false},
	"launch":        {"", func(ctx context.Context, d *device.Device, _ []string) error { return d.Launch(ctx, pkg) }, false},
	"stop":          {"", func(ctx context.Context, d *device.Device, _ []string) error { return d.Stop(ctx, pkg) }, false},
}

func main() {
	log.SetFlags(log.Ltime)
	loadEnv(".env")
	serial := flag.String("s", envOr("RGO_SERIAL", "localhost:61644"), "adb serial: host:port of the phone (VMOS tunnel or a redroid container)")
	dry := flag.Bool("dry-run", false, "log taps instead of sending them")
	flag.Usage = usage
	flag.Parse()
	flag.Visit(func(f *flag.Flag) { serialGiven = serialGiven || f.Name == "s" })
	serialGiven = serialGiven || os.Getenv("RGO_SERIAL") != ""
	if flag.NArg() == 0 {
		usage()
		os.Exit(2)
	}
	c, ok := commands[flag.Arg(0)]
	if !ok {
		usage()
		os.Exit(2)
	}

	d := device.New(*serial)
	d.DryRun = *dry
	d.Log = log.Printf

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	if !c.offline {
		if err := d.Connect(ctx); err != nil {
			log.Fatal(err)
		}
	}
	if err := c.run(ctx, d, flag.Args()[1:]); err != nil {
		log.Fatal(err)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: rgo [-s serial] [-dry-run] <command> [args]")
	for _, name := range slices.Sorted(maps.Keys(commands)) {
		fmt.Fprintf(os.Stderr, "  %-8s %s\n", name, commands[name].usage)
	}
	flag.PrintDefaults()
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func cmdInfo(ctx context.Context, d *device.Device, _ []string) error {
	w, h, err := d.Size(ctx)
	if err != nil {
		return err
	}
	model, _ := d.Shell(ctx, "getprop ro.product.model")
	release, _ := d.Shell(ctx, "getprop ro.build.version.release")
	fmt.Printf("device   %s (Android %s) %dx%d\n", model, release, w, h)
	fmt.Printf("game     running=%v focused=%v\n", d.AppRunning(ctx, pkg), d.AppFocused(ctx, pkg))

	start := time.Now()
	if _, err := d.Rows(ctx, w, 0, 200); err != nil {
		return err
	}
	fmt.Printf("capture  200-row band %v", time.Since(start).Round(10*time.Millisecond))
	start = time.Now()
	if _, err := d.Screenshot(ctx); err != nil {
		return err
	}
	fmt.Printf(", full frame %v\n", time.Since(start).Round(10*time.Millisecond))
	return nil
}

func cmdShot(ctx context.Context, d *device.Device, args []string) error {
	path := filepath.Join("captures", time.Now().Format("20060102-150405")+".png")
	if len(args) > 0 {
		path = args[0]
	}
	img, err := d.Screenshot(ctx)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	if err := png.Encode(f, img); err != nil {
		return err
	}
	fmt.Println(path)
	return nil
}

func cmdTap(ctx context.Context, d *device.Device, args []string) error {
	if len(args) != 2 {
		return fmt.Errorf("tap: need x y")
	}
	x, err1 := strconv.Atoi(args[0])
	y, err2 := strconv.Atoi(args[1])
	if err1 != nil || err2 != nil {
		return fmt.Errorf("tap: bad coordinates %q %q", args[0], args[1])
	}
	return d.Tap(ctx, x, y)
}
