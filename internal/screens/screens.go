// Package screens names the game screens and detects which one is showing.
package screens

import (
	"image"

	"github.com/affddn/rogo/assets"
)

type ID string

const (
	Unknown          ID = "unknown"
	Main             ID = "main"
	Income           ID = "income"
	QuickIdleConfirm ID = "quick-idle-confirm"
	Reward           ID = "reward"
	Attribute        ID = "attribute"
	CharOverview     ID = "char-overview"
	CharSkill        ID = "char-skill"
	Resonate         ID = "resonate"
	SummonUpgrade    ID = "summon-upgrade"
	WeaponCultivate  ID = "weapon-cultivate"
	OneClickUpgrade  ID = "one-click-upgrade"
	CardPage         ID = "card"
	CardDetails      ID = "card-details"
	JobChange        ID = "job-change"
	GameMode         ID = "game-mode"
	Realm            ID = "resource-realm"
	Baphomet         ID = "baphomet"
	CombatEnded      ID = "combat-ended"
	QuestPanel       ID = "quest-panel"
	PetGacha         ID = "pet-gacha"
	PetCount         ID = "pet-count"
	PetCultivate     ID = "pet-cultivate"
	Mail             ID = "mail"
	SeasonPass       ID = "season-pass"
	DismantleConfirm ID = "dismantle-confirm"
	PowerSave        ID = "power-save"
	InsertCard       ID = "insert-card"
	Dungeon          ID = "dungeon"
	DungeonMatch     ID = "dungeon-match"
	Equipment        ID = "equipment"
	Enhance          ID = "enhance"
	AutoSummonHint   ID = "auto-summon-hint"
	Title            ID = "title"
	IdleRewards      ID = "idle-rewards"
	StageDefeat      ID = "stage-defeat"
	WeaponGacha      ID = "weapon-gacha"
	GachaCount       ID = "gacha-count"
	GuestBind        ID = "guest-bind"
	Kicked           ID = "kicked"
	Login            ID = "login"
	AccountChooser   ID = "account-chooser"
	InCombat         ID = "in-combat"
	ValuePack        ID = "value-pack"
	MVP              ID = "mvp"
	MVPSweep         ID = "mvp-sweep"
	GrowthGift       ID = "growth-gift"
	LoginEvent       ID = "login-event"
	Mall             ID = "mall"
	SummonLevelHint  ID = "summon-level-hint"
	AchieveReward    ID = "achievement-reward"
	LimitedQuest     ID = "limited-quest"
	VersionOld       ID = "version-old"
	Awakening        ID = "awakening"
	GuildTown        ID = "guild-town"
	GuildDonation    ID = "guild-donation"
	GuildShop        ID = "guild-shop"
	GuildBargain     ID = "guild-bargain"
	GuildHunt        ID = "guild-hunt"
	GuildJoin        ID = "guild-join"
	DailySweep       ID = "daily-sweep"
	Loading          ID = "loading"
	NewDay           ID = "new-day"
	Refine           ID = "refine"
	Enchant          ID = "enchant"
	PartyInvite      ID = "party-invite"
	RuneArena        ID = "rune-arena"
	ArenaOpponents   ID = "arena-opponents"
	ArenaTierRewards ID = "arena-tier-rewards"
	Shop             ID = "shop"
	ShopBuy          ID = "shop-buy"
	YieldBonus       ID = "yield-bonus"
	YieldUse         ID = "yield-use"
	GuildLoot        ID = "guild-loot"
	Ranking          ID = "ranking"
	Backpack         ID = "backpack"
	CardTrove        ID = "card-trove"
	CardTroveStars   ID = "card-trove-stars"
	LoginRewards     ID = "login-rewards"
)

// Template names, shared with the tasks that tap them.
const (
	TMainAdventureIncome = "main_adventure_income"
	TMainStageChallenge  = "main_stage_challenge"
	TMainQuest           = "main_quest"
	TMainQuestCompleted  = "main_quest_completed"
	TMainSystem          = "main_system"
	TMainSummonElite     = "main_summon_elite"
	TMainSeasonPass      = "main_season_pass"
	TIncomeTitle         = "income_title"
	TIncomeClose         = "income_close"
	TIncomeQuickIdle     = "income_quick_idle"
	TIncomeTicketIcon    = "income_ticket_icon"
	TQuickIdleTitle      = "quickidle_title"
	TQuickIdleTicketCost = "quickidle_ticket_cost"
	TQuickIdleFree       = "qi_free_text"
	TIncomeFreeLabel     = "income_free_label"
	TIncomeYieldBonus    = "income_yield_bonus"
	TDialogOK            = "dlg_ok"
	TDialogCancel        = "dlg_cancel"
	TRewardCongrats      = "reward_congrats"
	THintTapEmpty        = "hint_tap_empty"
	TNavBack             = "nav_back"
	TNavEquipment        = "nav_equipment"
	TNavWeapon           = "nav_weapon"
	TNavGameMode         = "nav_gamemode"
	TNavCharacter        = "main_nav_character"
	TAttrHeader          = "attr_header"
	TCharOverview        = "char_overview_header"
	TSkillHeader         = "skill_header"
	TResonateTitle       = "resonate_title"
	TResonateActivate    = "resonate_activate"
	TResonateClose       = "resonate_close"
	TSummonUpTitle       = "summonup_title"
	TSummonUpEnhance     = "summonup_enhance"
	TSummonUpClose       = "summonup_close"
	TSummonUpUpgrade     = "summonup_upgrade_btn"
	TCultHeader          = "cult_header"
	TOneClickTitle       = "oneclick_title"
	TOneClickOK          = "oneclick_ok"
	TCardHeader          = "card_header"
	TCardDetailsTitle    = "card_details_title"
	TCardActivate        = "card_activate"
	TCardDetailsClose    = "card_details_close"
	TJobChangeHeader     = "jobchange_header"
	TGameModeHeader      = "gamemode_header"
	TRealmHeader         = "realm_header"
	TRealmSweep          = "realm_sweep_btn"
	TRealmChallenge      = "realm_challenge_btn"
	TBaphTitle           = "baph_title"
	TBaphChallenge       = "baph_challenge"
	TBaphDodge           = "baph_dodge"
	TCombatEnded         = "combat_ended"
	TCombatLeave         = "combat_leave"
	TQuestTitle          = "questp_title"
	TQuestClose          = "questp_close"
	TQuestClaim          = "questp_claim"
	TNavPet              = "nav_pet"
	TPetGachaHeader      = "petgacha_header"
	TPetCostTicket       = "petgacha_cost_ticket"
	TPetTicketIcon       = "petgacha_ticket_icon"
	TPetHeader           = "pet_header"
	TTutSkip             = "tut_skip"
	TMailTitle           = "mail_title"
	TMailClaimAll        = "mail_claim_all"
	TMailClose           = "mail_close"
	TPassHeader          = "pass_header"
	TPassClaimAll        = "pass_claim_all"
	TDismantleTitle      = "dismantle_title"
	TDismantleOK         = "dismantle_ok"
	TOneClickDismantle   = "equip_one_click_dismantle"
	TPowerSaveSwipe      = "powersave_swipe"
	TCardSlotPlus        = "cardslot_plus"
	TInsertCardTitle     = "insertcard_title"
	TInsertCardButton    = "insertcard_btn"
	TInsertCardClose     = "insertcard_close"
	TDungeonHeader       = "dungeon_header"
	TDungeonAutoMatch    = "dungeon_auto_match"
	TDungeonCancelMatch  = "dungeon_cancel_match"
	TDungeonZeroLeft     = "dungeon_attempts_zero"
	TDungeonAccept       = "dungeon_accept"
	TDungeonDecline      = "dungeon_decline"
	TItemEquip           = "item_equip_btn"
	TItemReplace         = "item_replace_btn"
	TAttrRecommended     = "attr_recommended"
	TAttrConfirm         = "attr_confirm"
	TEquipHeader         = "equip_header"
	TEquipUpgrade        = "equip_upgrade_btn"
	TEnhanceHeader       = "enhance_header"
	TEnhanceButton       = "enhance_btn"
	TAutoSummonText      = "autosummon_text"
	THintTitle           = "hint_title"
	THintOK              = "dlg_ok_hint"
	TTitleAgreeText      = "title_agree_text"
	TTitleAgreeChecked   = "title_agree_checked"
	TTitleStartGame      = "title_start_game"
	TIdleTitle           = "idle_title"
	TIdleClaim           = "idle_claim"
	TStageDefeat         = "stage_defeat"
	TStageLeave          = "stage_leave"
	TGachaHeader         = "gacha_header"
	TGachaDrawMulti      = "gacha_draw_multi"
	TGachaCountHint      = "gacha_count_hint"
	TGachaDrawButton     = "gacha_draw_btn"
	TGachaCostTicket     = "gacha_cost_ticket"
	TGuestBindText       = "guestbind_text"
	TGuestBindCancel     = "guestbind_cancel"
	TKickedText          = "kicked_text"
	TKickedConfirm       = "kicked_confirm"
	TLoginTitle          = "login_title"
	TLoginGoogle         = "login_google"
	TAccountChooser      = "account_chooser"
	TCombatPause         = "combat_pause"
	TMVPHeader           = "mvp_header"
	TMVPChallenge        = "mvp_challenge"
	TMVPSweep            = "mvp_sweep"
	TMVPSweepTitle       = "mvp_sweep_title"
	TMVPSweepText        = "mvp_sweep_text"
	TRailMall            = "rail_mall"
	TRailGrowth          = "rail_growth"
	TRailPulls           = "rail_pulls"
	TClaimWord           = "claim_word"
	TMallFreeWord        = "mall_free_word"
	TBenefitsLabel       = "benefits_label"
	TGrowthTitle         = "growth_title"
	TPullsBanner         = "pulls_banner"
	TMallTopUpTab        = "mall_topup_tab"
	TMallGiftPackTab     = "mall_giftpack_tab"
	TMallAdFreeWord      = "mall_adfree_word"
	TClaimAllWord        = "claimall_word"
	TAutoSummonMulti     = "autosummon_text_multi"
	TMultiSummonLabel    = "multisummon_label"
	TMultiSummon4x       = "multisummon_4x"
	TSummonLevelHint     = "summon_level_hint"
	TAchieveTitle        = "achieve_title"
	TLimitedTitle        = "limited_title"
	TRailLimited         = "rail_limited"
	TVersionOldText      = "version_old_text"
	TAwakeningHeader     = "awakening_header"
	TCanActivate         = "can_activate"
	TDungeon1Title       = "dungeon1_title"
	TDungeon2Title       = "dungeon2_title"
	TGuildTownHall       = "guild_town_hall"
	TGuildDonationTitle  = "guild_donation_title"
	TGuildFreeDonation   = "guild_free_donation"
	TGuildAdDonation     = "guild_ad_donation"
	TGuildShopTitle      = "guild_shop_title"
	TGuildBargainTitle   = "guild_bargain_title"
	TGuildHuntTitle      = "guild_hunt_title"
	TGuildHuntSweep      = "guild_hunt_sweep"
	TGuildBargainFree    = "guild_bargain_free"
	TDailySweepTitle     = "daily_sweep_title"
	TSkillStealthEnh     = "skill_lbl_stealthenh"
	TSkillSupersonic     = "skill_lbl_supersonic"
	TSkillKIR            = "skill_lbl_kir"
	TLoadingText         = "loading_text"
	TQuestClearStage     = "quest_clear_stage"
	TNewDayText          = "new_day_text"
	TMonstersRemaining   = "monsters_remaining"
	TRefineHeader        = "refine_header"
	TEnchantHeader       = "enchant_header"
	TEnchantEmpty        = "enchant_empty"
	TEnchantNormalChip   = "enchant_normal_chip"
	TEnchantButton       = "enchant_button"
	TShopTitle           = "shop_title"
	TShopBuyTitle        = "shop_buy_title"
	TShopBuyBtn          = "shop_buy_btn"
	TShopMetal20         = "shop_metal_20"
	TShopMetal100        = "shop_metal_100"
	TShopMetal200        = "shop_metal_200"
	TShopMeteorite       = "shop_meteorite"
	TShopStarPowder      = "shop_star_powder"
	TShopExpBook3        = "shop_exp_book_3"
	TShopExpBook5        = "shop_exp_book_5"
	TShopCandy3          = "shop_candy_3"
	TYieldTitle          = "yield_title"
	TYieldConfirm        = "yield_confirm"
	TYieldExtended       = "yield_extended"
	TGuildLootTitle      = "guild_loot_title"
	TGuildLootOpenAll    = "guild_loot_open_all"
	TRankingHeader       = "ranking_header"
	TBackpackTitle       = "backpack_title"
	TBackpackUse         = "backpack_use"
	TRailTrove           = "rail_trove"
	TRailLogin           = "rail_login"
	TTroveTitle          = "trove_title"
	TTroveDraw1          = "trove_draw1"
	TTroveStarCost       = "trove_star_cost"
	TTroveTicketCost     = "trove_ticket_cost"
	TLoginRewardsTitle   = "login_rewards_title"
	TLoginIncomplete     = "login_incomplete"
	TLoginClaimed        = "login_claimed"
	TRefineButton        = "refine_btn"
	TPartyInviteTitle    = "party_invite_title"
	TRuneArenaHeader     = "rune_arena_header"
	TArenaOpponents      = "arena_opponents_title"
	TArenaTierRewards    = "arena_tier_rewards_title"
	TMVPTabAngeling      = "mvp_tab_angeling"
	TMVPTabGTB           = "mvp_tab_gtb"
	TPetTokenCost        = "pet_token_cost"
	TPetDrawLevel1       = "pet_draw_level1"
	TPetDrawLevel2       = "pet_draw_level2"
	TValuePackTitle      = "value_pack_title"
	TValuePackClose      = "value_pack_close"
)

// Deny lists buttons that spend real money or lead to a shop. Bot refuses any
// tap that lands on one of these while it is visible.
var Deny = []string{"deny_go_unlock", "deny_accelerate", "deny_mail_delete", "deny_pass_rebate", "deny_rm_price"}

// DenyAreas are screen regions refused outright while a screen is showing,
// for paid buttons whose label changes (pass prices differ per tab).
var DenyAreas = map[ID][]image.Rectangle{
	SeasonPass: {image.Rect(410, 1060, 660, 1170)},
	// The pack's price button ("RM 8.99"); the back key does not close it.
	ValuePack: {image.Rect(240, 915, 480, 1000)},
	// Draw 5x costs stars; so does Draw 1 Time once the tickets are gone.
	CardTrove:      {image.Rect(455, 1160, 690, 1255)},
	CardTroveStars: {image.Rect(200, 1160, 690, 1255)},
}

// MinScore is the NCC score treated as a hit. Templates are cut from the same
// 720x1280 render, so true hits sit above 0.97 and misses below 0.6.
const MinScore = 0.85

// Margin is how far from its reference position a template is searched.
const Margin = 24

type rule struct {
	id      ID
	anchors []string // all must be visible
	// anyOf, when set, also needs at least need of these visible.
	anyOf []string
	need  int
}

// Modals first: whatever is on top wins.
var rules = []rule{
	{id: Reward, anchors: []string{TRewardCongrats}},
	{id: Loading, anchors: []string{TLoadingText}},
	// The daily reset at midnight: Confirm reloads the game's data.
	{id: NewDay, anchors: []string{TNewDayText}},
	// A paid offer that pops over main after progress (a new stage map).
	{id: ValuePack, anchors: []string{TValuePackTitle, TValuePackClose}},
	// Shown over whatever was up, power-save lock included, when the account
	// signs in on another device.
	{id: Kicked, anchors: []string{TKickedText, TKickedConfirm}},
	// A game update: Confirm restarts the game, which downloads it and
	// returns to the title screen signed out.
	{id: VersionOld, anchors: []string{TVersionOldText}},
	{id: PowerSave, anchors: []string{TPowerSaveSwipe}},
	// Guest logins get a bind-your-account nag over the title screen.
	{id: GuestBind, anchors: []string{TGuestBindText, TGuestBindCancel}},
	// Android's Google account picker, opened by Google Login.
	{id: AccountChooser, anchors: []string{TAccountChooser}},
	// The Login dialog leaves the title screen undimmed, so it goes first.
	{id: Login, anchors: []string{TLoginTitle, TLoginGoogle}},
	{id: Title, anchors: []string{TTitleAgreeText}},
	{id: IdleRewards, anchors: []string{TIdleTitle, TIdleClaim}},
	{id: StageDefeat, anchors: []string{TStageDefeat, TStageLeave}},
	{id: CombatEnded, anchors: []string{TCombatEnded, TCombatLeave}},
	{id: GachaCount, anchors: []string{TGachaCountHint, TGachaDrawButton}},
	{id: QuickIdleConfirm, anchors: []string{TQuickIdleTitle, TDialogOK}},
	{id: Resonate, anchors: []string{TResonateTitle, TResonateClose}},
	{id: SummonUpgrade, anchors: []string{TSummonUpTitle, TSummonUpClose}},
	{id: OneClickUpgrade, anchors: []string{TOneClickTitle, TOneClickOK}},
	// Insert Card first: the Card Details title template also matches the
	// header both dialogs share.
	{id: InsertCard, anchors: []string{TInsertCardTitle, TInsertCardClose}},
	{id: DungeonMatch, anchors: []string{TDungeonAccept, TDungeonDecline}},
	{id: MVPSweep, anchors: []string{TMVPSweepTitle, TMVPSweepText}},
	{id: AchieveReward, anchors: []string{TAchieveTitle}},
	{id: GuildDonation, anchors: []string{TGuildDonationTitle}},
	{id: DailySweep, anchors: []string{TDailySweepTitle}},
	{id: LimitedQuest, anchors: []string{TLimitedTitle}},
	// The login event's popup sits over main.
	{id: LoginEvent, anchors: []string{TPullsBanner}},
	{id: CardDetails, anchors: []string{TCardDetailsTitle, TCardDetailsClose}},
	{id: QuestPanel, anchors: []string{TQuestTitle, TQuestClose}},
	{id: Mail, anchors: []string{TMailTitle, TMailClose}},
	{id: DismantleConfirm, anchors: []string{TDismantleTitle, TDismantleOK}},
	// The pet count dialog was first seen under a tutorial dim; title + Draw
	// identify it (the weapon one matches GachaCount above it first).
	{id: PetCount, anchors: []string{THintTitle, TGachaDrawButton}},
	{id: AutoSummonHint, anchors: []string{THintTitle, TAutoSummonText}},
	// With the Monthly Card the dialog gains a Multi-Summon row and its text
	// moves down.
	{id: AutoSummonHint, anchors: []string{THintTitle, TAutoSummonMulti}},
	// "Upgrade the Summon Level for better gear. Continue at this level?"
	{id: SummonLevelHint, anchors: []string{TSummonLevelHint}},
	// The close X sits over the map and dims on dark ones; Yield Bonus is
	// on the dialog's own panel.
	{id: YieldUse, anchors: []string{TYieldExtended, TYieldConfirm}},
	{id: YieldBonus, anchors: []string{TYieldTitle}},
	{id: Income, anchors: []string{TIncomeTitle, TIncomeYieldBonus}},
	{id: Attribute, anchors: []string{TAttrHeader, TNavBack}},
	{id: CharOverview, anchors: []string{TCharOverview, TNavBack}},
	{id: CharSkill, anchors: []string{TSkillHeader, TNavBack}},
	{id: Awakening, anchors: []string{TAwakeningHeader, TNavBack}},
	{id: GuildTown, anchors: []string{TGuildTownHall}},
	{id: ShopBuy, anchors: []string{TShopBuyTitle, TShopBuyBtn}},
	{id: GuildShop, anchors: []string{TGuildShopTitle}},
	{id: Shop, anchors: []string{TShopTitle}},
	{id: GuildBargain, anchors: []string{TGuildBargainTitle}},
	{id: GuildLoot, anchors: []string{TGuildLootTitle}},
	{id: GuildHunt, anchors: []string{TGuildHuntTitle}},
	{id: Ranking, anchors: []string{TRankingHeader}},
	{id: Backpack, anchors: []string{TBackpackTitle}},
	// Tickets gone: both draws cost stars (deny-listed below).
	{id: CardTroveStars, anchors: []string{TTroveTitle, TTroveStarCost}},
	{id: CardTrove, anchors: []string{TTroveTitle, TTroveDraw1}},
	{id: LoginRewards, anchors: []string{TLoginRewardsTitle}},
	{id: Equipment, anchors: []string{TEquipHeader, TNavBack}},
	{id: Enhance, anchors: []string{TEnhanceHeader, TNavBack}},
	{id: Refine, anchors: []string{TRefineHeader, TNavBack}},
	{id: Enchant, anchors: []string{TEnchantHeader, TNavBack}},
	{id: PartyInvite, anchors: []string{TPartyInviteTitle}},
	{id: ArenaOpponents, anchors: []string{TArenaOpponents}},
	{id: ArenaTierRewards, anchors: []string{TArenaTierRewards}},
	{id: RuneArena, anchors: []string{TRuneArenaHeader}},
	{id: WeaponGacha, anchors: []string{TGachaHeader, TNavBack}},
	{id: WeaponCultivate, anchors: []string{TCultHeader, TNavBack}},
	{id: CardPage, anchors: []string{TCardHeader, TNavBack}},
	{id: PetGacha, anchors: []string{TPetGachaHeader, TNavBack}},
	{id: SeasonPass, anchors: []string{TPassHeader, TPassClaimAll}},
	{id: PetCultivate, anchors: []string{TPetHeader, TNavBack}},
	{id: JobChange, anchors: []string{TJobChangeHeader, TNavBack}},
	{id: GameMode, anchors: []string{TGameModeHeader, TNavBack}},
	{id: Realm, anchors: []string{TRealmHeader, TNavBack}},
	{id: Baphomet, anchors: []string{TBaphTitle, TBaphChallenge}},
	{id: MVP, anchors: []string{TMVPHeader, TMVPChallenge}},
	{id: GrowthGift, anchors: []string{TGrowthTitle}},
	{id: Dungeon, anchors: []string{TDungeonHeader},
		anyOf: []string{TDungeonAutoMatch, TDungeonCancelMatch}, need: 1},
}

// Visible reports whether the named template is on screen and not dimmed.
func Visible(frame image.Image, name string) bool {
	return assets.MustGet(name).Find(frame, Margin).Visible(MinScore)
}

func Detect(frame image.Image) ID {
	for _, r := range rules {
		hit := true
		for _, a := range r.anchors {
			if !Visible(frame, a) {
				hit = false
				break
			}
		}
		if hit && r.need > 0 {
			n := 0
			for _, a := range r.anyOf {
				if Visible(frame, a) {
					n++
				}
			}
			hit = n >= r.need
		}
		if hit {
			return r.id
		}
	}
	if onMain(frame) {
		return Main
	}
	if inCombat(frame) {
		return InCombat
	}
	if inMall(frame) {
		return Mall
	}
	return Unknown
}

// mallTabBar is the Mall's bottom tab bar. Every Mall page shows its Top Up
// tab, but the bar scrolls sideways on the Check-in Bonus page.
var mallTabBar = image.Rect(0, 1190, 720, 1280)

// inMall spots the Mall by its bottom tabs. The selected tab is drawn
// differently, so either the Top Up or the Gift Pack tab is in its plain
// form whichever page is open.
func inMall(frame image.Image) bool {
	return assets.MustGet(TMallTopUpTab).FindIn(frame, mallTabBar).Visible(MinScore) ||
		assets.MustGet(TMallGiftPackTab).FindIn(frame, mallTabBar).Visible(MinScore)
}

// mainNav is the main screen's bottom nav. It is opaque enough to read 0.8x
// to 1.05x as bright as the templates over any map (the Ant Cave is the
// darkest yet) and dims to 0.2-0.3x under every modal. The icons above it
// show the map through them and fail on dark maps, so they are not used.
var mainNav = []string{TNavCharacter, TNavWeapon, TNavEquipment, TNavPet, TNavGameMode}

// onMain spots the main screen by its bottom nav icons. A guide arrow's
// ring can sit on one of them, so one may be missing.
func onMain(frame image.Image) bool {
	missing := 0
	for _, name := range mainNav {
		m := assets.MustGet(name).Find(frame, Margin)
		if m.Score < MinScore || m.Bright < 0.6 || m.Bright > 1.25 {
			missing++
		}
	}
	return missing <= 1
}

// LeftRail is the main screen's left rail of feature and event icons. Icons
// come and go with events and unlocks and the rail reflows into two columns,
// so its icons are searched for across the whole rail.
var LeftRail = image.Rect(0, 120, 230, 720)

// SeasonPassIcon finds the Season Pass icon on the main screen's left rail
// (by shape: the map shows through it).
func SeasonPassIcon(frame image.Image) (image.Point, bool) {
	m := assets.MustGet(TMainSeasonPass).FindIn(frame, LeftRail)
	return m.Center(), m.Score >= 0.7
}

// Present reports whether an icon is on screen by shape alone, for main
// screen icons whose see-through backgrounds take on the map's colours
// (0.84+ on any map, under 0.5 where a new character lacks the feature).
func Present(frame image.Image, name string) bool {
	return assets.MustGet(name).Find(frame, Margin).Score >= 0.7
}

// inCombat spots a fight under way (realm, stage, boss) by its pause button.
// The button is see-through, so it reads 0.8x to 1.6x as bright as the
// template depending on the map; a dimmer one sits under a popup, which is
// left Unknown so the usual popup handling still runs.
func inCombat(frame image.Image) bool {
	if m := assets.MustGet(TCombatPause).Find(frame, Margin); m.Score >= MinScore && m.Bright >= 0.75 {
		return true
	}
	// Dungeon runs have no pause button; their HUD shows "Monsters
	// Remaining" (white over the map, so by shape).
	m := assets.MustGet(TMonstersRemaining).Find(frame, Margin)
	return m.Score >= 0.8 && m.Bright >= 0.75
}
