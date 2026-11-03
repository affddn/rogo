package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"slices"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/device"
	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/tasks"
)

func newBot(d *device.Device) *bot.Bot {
	level := slog.LevelInfo
	if os.Getenv("RGO_DEBUG") != "" {
		level = slog.LevelDebug
	}
	return bot.New(d, slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level})))
}

func cmdStatus(ctx context.Context, d *device.Device, _ []string) error {
	id, frame, err := newBot(d).Look(ctx)
	if err != nil {
		return err
	}
	fmt.Println("screen", id)
	all, err := assets.Templates()
	if err != nil {
		return err
	}
	var seen []string
	for name, t := range all {
		if t.Find(frame, screens.Margin).Visible(screens.MinScore) {
			seen = append(seen, name)
		}
	}
	slices.Sort(seen)
	fmt.Println("visible", seen)
	return nil
}

func cmdHome(ctx context.Context, d *device.Device, _ []string) error {
	return newBot(d).ToMain(ctx)
}

func cmdIncome(ctx context.Context, d *device.Device, _ []string) error {
	left, err := tasks.Income(ctx, newBot(d))
	fmt.Println("free quick idle left", left)
	return err
}

func cmdQuests(ctx context.Context, d *device.Device, _ []string) error {
	n, err := tasks.MainQuest(ctx, newBot(d))
	fmt.Println("claimed", n)
	return err
}

func cmdGrow(ctx context.Context, d *device.Device, _ []string) error {
	b := newBot(d)
	if _, err := tasks.Attributes(ctx, b); err != nil {
		return err
	}
	n, err := tasks.Equipment(ctx, b)
	fmt.Println("enhanced", n)
	return err
}
