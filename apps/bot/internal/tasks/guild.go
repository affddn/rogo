package tasks

import (
	"context"
	"image"
	"time"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
)

// The guild town (bottom nav Guild once a guild is joined). Its buildings
// sit at fixed spots; each carries a badge while something is due.
var (
	guildNav          = image.Pt(528, 1215)
	guildDonationBtn  = image.Pt(659, 352)
	guildDonationDot  = image.Pt(682, 306)
	guildShopBtn      = image.Pt(659, 148)
	guildShopDot      = image.Pt(684, 104)
	guildBargainBtn   = image.Pt(110, 455)
	guildBargainDot   = image.Pt(192, 443)
	guildHuntBtn      = image.Pt(105, 878)
	guildHuntDot      = image.Pt(174, 869)
	guildDonationFree = image.Rect(250, 930, 480, 1010)
	guildDonationAd   = image.Rect(90, 930, 330, 1010)
	// Guild shop: the two daily free items in the top row and their badges.
	guildShopFree = []struct{ tap, badge image.Point }{
		{image.Pt(128, 605), image.Pt(210, 584)},
		{image.Pt(358, 605), image.Pt(444, 584)},
	}
	guildBargainBtnTap = image.Pt(522, 1122)
	guildBargainDotBtn = image.Pt(620, 1100)
	guildBuyTap        = image.Pt(205, 1122)
	guildBuyDot        = image.Pt(305, 1102)
	guildHuntChallenge = image.Pt(535, 1110)
	guildHuntDotBtn    = image.Pt(630, 1089)
	guildHuntSweepBtn  = image.Rect(80, 1086, 290, 1136)
	guildSweepOK       = image.Pt(497, 830)
)

// Guild runs the guild's free dailies: both donations (free, and the ad one
// the Lifetime Card makes free), the shop's two free items, a Bargain tap
// and the deal once the guild has bargained it down to nothing, and the
// Guild Hunt's three daily attempts (the first a Challenge, watched for
// Dodge prompts; Sweep once it unlocks). Diamond donations and paid shop
// items are never touched.
func Guild(ctx context.Context, b *bot.Bot) (done int, err error) {
	frame, err := openGuild(ctx, b)
	if err != nil || frame == nil {
		return 0, err
	}
	steps := []struct {
		dot image.Point
		run func(context.Context, *bot.Bot) (int, error)
	}{
		{guildDonationDot, guildDonate},
		{guildShopDot, guildShop},
		{guildBargainDot, guildBargain},
		{guildHuntDot, guildHunt},
	}
	for _, s := range steps {
		if !badged(frame, s.dot) {
			continue
		}
		n, err := s.run(ctx, b)
		done += n
		if err != nil {
			return done, err
		}
		if frame, err = backToTown(ctx, b); err != nil {
			return done, err
		}
	}
	if done > 0 {
		b.Log.Info("guild dailies done", "count", done)
	}
	return done, b.ToMain(ctx)
}

// openGuild opens the guild town; nil when the account has no guild (the
// nav then opens Join Guild, which is left for the owner to choose).
func openGuild(ctx context.Context, b *bot.Bot) (image.Image, error) {
	if err := b.ToMain(ctx); err != nil {
		return nil, err
	}
	id, frame, err := b.TapWait(ctx, screens.Main, guildNav, "guild", 10*time.Second, screens.GuildTown)
	if err == nil {
		return frame, nil
	}
	b.Log.Info("no guild town (not in a guild?)", "screen", id)
	return nil, b.ToMain(ctx)
}

func backToTown(ctx context.Context, b *bot.Bot) (image.Image, error) {
	for i := 0; i < 6; i++ {
		id, frame, err := b.Look(ctx)
		if err != nil {
			return nil, err
		}
		if id == screens.GuildTown {
			return frame, nil
		}
		if _, err := b.Dismiss(ctx, id, frame); err != nil {
			return nil, err
		}
	}
	_, frame, err := b.Look(ctx)
	return frame, err
}

func guildDonate(ctx context.Context, b *bot.Bot) (int, error) {
	if _, _, err := b.TapWait(ctx, screens.GuildTown, guildDonationBtn, "guild donation", 8*time.Second, screens.GuildDonation); err != nil {
		return 0, err
	}
	n := 0
	for _, btn := range []struct {
		name string
		area image.Rectangle
	}{{screens.TGuildFreeDonation, guildDonationFree}, {screens.TGuildAdDonation, guildDonationAd}} {
		_, frame, err := b.Look(ctx)
		if err != nil {
			return n, err
		}
		m := assets.MustGet(btn.name).FindIn(frame, btn.area)
		if !m.Visible(screens.MinScore) || !mvpButtonLive(frame, image.Rectangle{Min: m.At, Max: m.At.Add(m.Size)}) {
			continue
		}
		if err := b.Tap(ctx, m.Center(), "donate"); err != nil {
			return n, err
		}
		n++
		if err := closePopups(ctx, b, screens.GuildDonation); err != nil {
			return n, err
		}
	}
	return n, nil
}

func guildShop(ctx context.Context, b *bot.Bot) (int, error) {
	_, frame, err := b.TapWait(ctx, screens.GuildTown, guildShopBtn, "guild shop", 8*time.Second, screens.GuildShop)
	if err != nil {
		return 0, err
	}
	n := 0
	for _, item := range guildShopFree {
		if !badged(frame, item.badge) {
			continue
		}
		if err := b.Tap(ctx, item.tap, "free guild item"); err != nil {
			return n, err
		}
		n++
		if err := closePopups(ctx, b, screens.GuildShop); err != nil {
			return n, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return n, err
		}
	}
	return n, nil
}

// guildBargain taps Bargain (each member's tap lowers the deal's diamond
// price; ours pays guild coins) and buys the deal only once the price is
// zero, which the Buy button's badge marks.
func guildBargain(ctx context.Context, b *bot.Bot) (int, error) {
	_, frame, err := b.TapWait(ctx, screens.GuildTown, guildBargainBtn, "guild bargain", 8*time.Second, screens.GuildBargain)
	if err != nil {
		return 0, err
	}
	n := 0
	if badged(frame, guildBargainDotBtn) {
		if err := b.Tap(ctx, guildBargainBtnTap, "bargain"); err != nil {
			return n, err
		}
		n++
		if err := closePopups(ctx, b, screens.GuildBargain); err != nil {
			return n, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return n, err
		}
	}
	if badged(frame, guildBuyDot) && screens.Visible(frame, screens.TGuildBargainFree) {
		if err := b.Tap(ctx, guildBuyTap, "buy free deal"); err != nil {
			return n, err
		}
		n++
		b.Log.Info("guild deal bought at 0 diamonds")
		if err := closePopups(ctx, b, screens.GuildBargain); err != nil {
			return n, err
		}
	}
	return n, nil
}

// guildHunt spends the Guild Hunt's daily attempts: Sweep when it is live
// (after the first challenge of the period), otherwise Challenge, with
// Dodge watched.
func guildHunt(ctx context.Context, b *bot.Bot) (int, error) {
	_, frame, err := b.TapWait(ctx, screens.GuildTown, guildHuntBtn, "guild hunt", 8*time.Second, screens.GuildHunt)
	if err != nil {
		return 0, err
	}
	n := 0
	for i := 0; i < 3 && badged(frame, guildHuntDotBtn); i++ {
		if mvpButtonLive(frame, guildHuntSweepBtn) {
			if _, _, err := b.TapWait(ctx, screens.GuildHunt, centre(guildHuntSweepBtn), "guild hunt sweep", 8*time.Second, screens.DailySweep); err != nil {
				return n, err
			}
			if err := b.Tap(ctx, guildSweepOK, "confirm sweep"); err != nil {
				return n, err
			}
		} else {
			if err := b.Tap(ctx, guildHuntChallenge, "guild hunt challenge"); err != nil {
				return n, err
			}
			dodges, err := watchFight(ctx, b, 2*time.Minute)
			if err != nil {
				return n, err
			}
			b.Log.Info("guild hunt fought", "dodges", dodges)
		}
		n++
		if err := closePopups(ctx, b, screens.GuildHunt); err != nil {
			return n, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return n, err
		}
	}
	if badged(frame, guildLootDot) {
		l, err := guildLoot(ctx, b)
		n += l
		if err != nil {
			return n, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return n, err
		}
	}
	if badged(frame, guildRewardDot) {
		r, err := guildHuntRewards(ctx, b)
		n += r
		if err != nil {
			return n, err
		}
	}
	return n, nil
}

// Guild Hunt's Reward: daily rewards for the guild's total hunt points
// (guild and hunt coins); one Claim takes every tier reached. The Guild Tier
// tab beside it only lists the weekly ranks.
var (
	guildRewardBtn   = image.Pt(662, 245)
	guildRewardDot   = image.Pt(688, 210)
	guildRewardList  = image.Rect(50, 360, 670, 1100)
	guildRewardClose = image.Pt(665, 172)
)

func guildHuntRewards(ctx context.Context, b *bot.Bot) (int, error) {
	if err := b.Tap(ctx, guildRewardBtn, "guild hunt rewards"); err != nil {
		return 0, err
	}
	if err := bot.Sleep(ctx, 1500*time.Millisecond); err != nil {
		return 0, err
	}
	_, list, err := b.Look(ctx)
	if err != nil {
		return 0, err
	}
	n := 0
	if m := assets.MustGet(screens.TClaimWord).FindIn(list, guildRewardList); m.Visible(screens.MinScore) {
		if _, _, err := b.TapWait(ctx, screens.Unknown, m.Center(), "claim hunt rewards", 6*time.Second, screens.Reward); err != nil {
			return 0, err
		}
		n = 1
		b.Log.Info("guild hunt rewards claimed")
		// "Tap empty area to close" the reward, back to the list.
		if err := b.Tap(ctx, image.Pt(360, 1200), "close reward"); err != nil {
			return n, err
		}
		if err := bot.Sleep(ctx, time.Second); err != nil {
			return n, err
		}
	}
	_, _, err = b.TapWait(ctx, screens.Unknown, guildRewardClose, "close hunt rewards", 8*time.Second, screens.GuildHunt)
	return n, err
}

// Guild Hunt's Loot: chests guildmates' hunts bring back for everyone.
var (
	guildLootBtn = image.Pt(662, 345)
	guildLootDot = image.Pt(690, 316)
)

// guildLoot opens every loot chest waiting (Open All).
func guildLoot(ctx context.Context, b *bot.Bot) (int, error) {
	_, frame, err := b.TapWait(ctx, screens.GuildHunt, guildLootBtn, "guild loot", 8*time.Second, screens.GuildLoot)
	if err != nil {
		return 0, err
	}
	n := 0
	if screens.Visible(frame, screens.TGuildLootOpenAll) {
		if err := b.TapTemplate(ctx, frame, screens.TGuildLootOpenAll); err != nil {
			return 0, err
		}
		n = 1
		b.Log.Info("guild loot opened")
		if err := closePopups(ctx, b, screens.GuildLoot); err != nil {
			return n, err
		}
	}
	return n, closePopups(ctx, b, screens.GuildHunt)
}
