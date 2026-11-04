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
)

// Deny lists buttons that spend real money or lead to a shop. Bot refuses any
// tap that lands on one of these while it is visible.
var Deny = []string{"deny_go_unlock", "deny_accelerate", "deny_mail_delete", "deny_pass_rebate"}

// DenyAreas are screen regions refused outright while a screen is showing,
// for paid buttons whose label changes (pass prices differ per tab).
var DenyAreas = map[ID][]image.Rectangle{
	SeasonPass: {image.Rect(410, 1060, 660, 1170)},
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
	// Shown over whatever was up, power-save lock included, when the account
	// signs in on another device.
	{id: Kicked, anchors: []string{TKickedText, TKickedConfirm}},
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
	{id: CardDetails, anchors: []string{TCardDetailsTitle, TCardDetailsClose}},
	{id: QuestPanel, anchors: []string{TQuestTitle, TQuestClose}},
	{id: Mail, anchors: []string{TMailTitle, TMailClose}},
	{id: DismantleConfirm, anchors: []string{TDismantleTitle, TDismantleOK}},
	// The pet count dialog was first seen under a tutorial dim; title + Draw
	// identify it (the weapon one matches GachaCount above it first).
	{id: PetCount, anchors: []string{THintTitle, TGachaDrawButton}},
	{id: AutoSummonHint, anchors: []string{THintTitle, TAutoSummonText}},
	{id: Income, anchors: []string{TIncomeTitle, TIncomeClose}},
	{id: Attribute, anchors: []string{TAttrHeader, TNavBack}},
	{id: CharOverview, anchors: []string{TCharOverview, TNavBack}},
	{id: CharSkill, anchors: []string{TSkillHeader, TNavBack}},
	{id: Equipment, anchors: []string{TEquipHeader, TNavBack}},
	{id: Enhance, anchors: []string{TEnhanceHeader, TNavBack}},
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
	{id: Dungeon, anchors: []string{TDungeonHeader},
		anyOf: []string{TDungeonAutoMatch, TDungeonCancelMatch}, need: 1},
	// The bottom nav dims under every modal, so it gates Main; the other
	// anchors get covered by effects and auto-equip popups now and then. A
	// new character has no quest or system icons yet.
	{id: Main, anchors: []string{TNavCharacter},
		anyOf: []string{TMainAdventureIncome, TMainStageChallenge, TMainQuest, TMainSystem, TMainSummonElite}, need: 2},
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
	if inCombat(frame) {
		return InCombat
	}
	return Unknown
}

// inCombat spots a fight under way (realm, stage, boss) by its pause button.
// The button is see-through, so it reads 0.8x to 1.6x as bright as the
// template depending on the map; a dimmer one sits under a popup, which is
// left Unknown so the usual popup handling still runs.
func inCombat(frame image.Image) bool {
	m := assets.MustGet(TCombatPause).Find(frame, Margin)
	return m.Score >= MinScore && m.Bright >= 0.75
}
