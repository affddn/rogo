package tasks

import (
	"context"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
)

// QuestGo taps an unfinished main quest on the tracker, which makes the game
// jump to the quest's objective, and reports where it landed so the caller
// can run the matching chore from there.
func QuestGo(ctx context.Context, b *bot.Bot) (screens.ID, error) {
	if err := b.ToMain(ctx); err != nil {
		return screens.Unknown, err
	}
	if err := b.Tap(ctx, screens.QuestTagAt, "main quest objective"); err != nil {
		return screens.Unknown, err
	}
	if err := bot.Sleep(ctx, 2*time.Second); err != nil {
		return screens.Unknown, err
	}
	id, _, err := b.Look(ctx)
	if err != nil {
		return screens.Unknown, err
	}
	b.Log.Info("quest objective", "screen", id)
	return id, nil
}
