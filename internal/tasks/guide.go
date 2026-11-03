package tasks

import (
	"context"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
)

// FollowGuide taps through the chain of guide arrows that starts on the main
// screen (quest guidance, unlocked features), up to a bounded number of
// steps, then returns to main. Every tap is still deny-list guarded.
func FollowGuide(ctx context.Context, b *bot.Bot) (steps int, err error) {
	for steps < 10 {
		id, frame, err := b.Look(ctx)
		if err != nil {
			return steps, err
		}
		a, ok := screens.FindGuideArrow(frame)
		if !ok {
			// The arrow blinks; give it one more look before stopping.
			if err := bot.Sleep(ctx, 700*time.Millisecond); err != nil {
				return steps, err
			}
			if _, frame, err = b.Look(ctx); err != nil {
				return steps, err
			}
			if a, ok = screens.FindGuideArrow(frame); !ok {
				break
			}
		}
		b.Log.Info("guide step", "screen", id, "x", a.Target.X, "y", a.Target.Y)
		if err := b.Tap(ctx, a.Target, "guide arrow"); err != nil {
			return steps, err
		}
		steps++
	}
	return steps, b.ToMain(ctx)
}
