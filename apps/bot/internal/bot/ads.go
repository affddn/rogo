package bot

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// GameActivity is the game's own activity. Ads run in the same package
// (com.google.android.gms.ads.AdActivity), so the package alone does not
// say the game is on top.
const GameActivity = Package + "/com.ug.sdk.bridge.unity.UGUnityActivity"

// Rewarded ads, seen on 10 Nov on an account without the Kafra Lifetime
// Card: the free draw buttons play a Google ad before the reward. Back at
// 35 s closed the ad with no reward and left the day's ad unused. By 60 s
// the ad showed "Reward granted" and opened a Google Play sheet by itself;
// one back then returned to the game and the reward (10 pet draws) popped
// up. The bot never taps inside an ad: an Install button sits on most of
// them.
const (
	adStartWait = 15 * time.Second // for the ad to come up after the tap
	adMaxWait   = 95 * time.Second // longest it waits before backing out
	adPoll      = 5 * time.Second
	adBacks     = 4
)

func isAd(top string) bool { return strings.Contains(top, "AdActivity") }

// WatchAd waits out a rewarded ad that the last tap started, then backs out
// of it, and any store page it opened, to the game. With no ad on top
// within adStartWait (an ad-free account) it returns false at once. The
// ad is left alone until it gives way to another page by itself (its end)
// or adMaxWait passes; backing out earlier forfeits the reward.
func (b *Bot) WatchAd(ctx context.Context) (bool, error) {
	var top string
	for start := time.Now(); ; {
		var err error
		if top, err = b.D.TopActivity(ctx); err != nil {
			return false, err
		}
		if top != GameActivity && top != "" {
			break
		}
		if time.Since(start) >= adStartWait {
			return false, nil
		}
		if err := sleep(ctx, 2*time.Second); err != nil {
			return false, err
		}
	}
	b.Log.Info("watching ad", "activity", top)
	for start := time.Now(); isAd(top) && time.Since(start) < adMaxWait; {
		if err := sleep(ctx, adPoll); err != nil {
			return true, err
		}
		var err error
		if top, err = b.D.TopActivity(ctx); err != nil {
			return true, err
		}
	}
	// "" (dumpsys listed nothing) is not known to be off the game, so no
	// back is pressed for it.
	for i := 0; i < adBacks && top != GameActivity && top != ""; i++ {
		if err := b.D.Back(ctx); err != nil {
			return true, err
		}
		if err := sleep(ctx, 3*time.Second); err != nil {
			return true, err
		}
		var err error
		if top, err = b.D.TopActivity(ctx); err != nil {
			return true, err
		}
	}
	if top != GameActivity {
		return true, fmt.Errorf("ad did not close: %q on top", top)
	}
	b.Log.Info("ad done")
	return true, nil
}
