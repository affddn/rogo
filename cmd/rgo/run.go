package main

import (
	"context"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/device"
	"github.com/affddn/rogo/internal/runner"
	"github.com/affddn/rogo/internal/tasks"
)

func cmdBoot(ctx context.Context, d *device.Device, _ []string) error {
	b := newBot(d)
	if !d.AppRunning(ctx, bot.Package) {
		if err := d.Launch(ctx, bot.Package); err != nil {
			return err
		}
	}
	return b.WaitBoot(ctx, 4*time.Minute)
}

// jobs is the 24/7 schedule. Cheap checks run often; income caps out, so
// every couple of hours is enough.
func jobs() []*runner.Job {
	return []*runner.Job{
		{Name: "auto-summon", Every: 10 * time.Minute, Run: func(ctx context.Context, b *bot.Bot) error {
			_, err := tasks.AutoSummon(ctx, b)
			return err
		}},
		{Name: "quests", Every: 15 * time.Minute, Run: func(ctx context.Context, b *bot.Bot) error {
			_, err := tasks.MainQuest(ctx, b)
			return err
		}},
		{Name: "attributes", Every: 30 * time.Minute, Run: func(ctx context.Context, b *bot.Bot) error {
			_, err := tasks.Attributes(ctx, b)
			return err
		}},
		{Name: "equipment", Every: 30 * time.Minute, Run: func(ctx context.Context, b *bot.Bot) error {
			_, err := tasks.Equipment(ctx, b)
			return err
		}},
		{Name: "income", Every: 2 * time.Hour, Run: tasks.Income},
		{Name: "stage", Every: 45 * time.Minute, Run: func(ctx context.Context, b *bot.Bot) error {
			_, err := tasks.Stage(ctx, b)
			return err
		}},
	}
}

func cmdRun(ctx context.Context, d *device.Device, _ []string) error {
	return runner.New(newBot(d), jobs()...).Run(ctx)
}

func cmdStage(ctx context.Context, d *device.Device, _ []string) error {
	_, err := tasks.Stage(ctx, newBot(d))
	return err
}
