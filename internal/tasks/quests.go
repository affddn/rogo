package tasks

import (
	"context"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
)

// MainQuest claims the main-quest tracker on the main screen for as long as it
// shows "(Completed)". Claiming often completes the next quest at once.
func MainQuest(ctx context.Context, b *bot.Bot) (claimed int, err error) {
	if err := b.ToMain(ctx); err != nil {
		return 0, err
	}
	for claimed < 20 {
		_, frame, err := b.Look(ctx)
		if err != nil {
			return claimed, err
		}
		if !screens.QuestDone(frame) {
			break
		}
		if err := b.Tap(ctx, screens.QuestTagAt, "main quest"); err != nil {
			return claimed, err
		}
		id, frame, err := b.Wait(ctx, 8*time.Second, screens.Reward, screens.Main)
		if err != nil {
			return claimed, err
		}
		if id == screens.Reward {
			if _, err := b.Dismiss(ctx, id, frame); err != nil {
				return claimed, err
			}
		}
		claimed++
	}
	if claimed > 0 {
		b.Log.Info("main quests claimed", "count", claimed)
	}
	return claimed, b.ToMain(ctx)
}
