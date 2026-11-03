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
	Equipment        ID = "equipment"
	Enhance          ID = "enhance"
	AutoSummonHint   ID = "auto-summon-hint"
	Title            ID = "title"
	IdleRewards      ID = "idle-rewards"
	StageDefeat      ID = "stage-defeat"
	WeaponGacha      ID = "weapon-gacha"
	GachaCount       ID = "gacha-count"
)

// Template names, shared with the tasks that tap them.
const (
	TMainAdventureIncome = "main_adventure_income"
	TMainStageChallenge  = "main_stage_challenge"
	TMainQuest           = "main_quest"
	TMainQuestCompleted  = "main_quest_completed"
	TMainSystem          = "main_system"
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
)

// Deny lists buttons that spend real money or lead to a shop. Bot refuses any
// tap that lands on one of these while it is visible.
var Deny = []string{"deny_go_unlock"}

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
	{id: Title, anchors: []string{TTitleAgreeText}},
	{id: IdleRewards, anchors: []string{TIdleTitle, TIdleClaim}},
	{id: StageDefeat, anchors: []string{TStageDefeat, TStageLeave}},
	{id: CombatEnded, anchors: []string{TCombatEnded, TCombatLeave}},
	{id: GachaCount, anchors: []string{TGachaCountHint, TGachaDrawButton}},
	{id: QuickIdleConfirm, anchors: []string{TQuickIdleTitle, TDialogOK}},
	{id: Resonate, anchors: []string{TResonateTitle, TResonateClose}},
	{id: SummonUpgrade, anchors: []string{TSummonUpTitle, TSummonUpClose}},
	{id: OneClickUpgrade, anchors: []string{TOneClickTitle, TOneClickOK}},
	{id: CardDetails, anchors: []string{TCardDetailsTitle, TCardDetailsClose}},
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
	{id: JobChange, anchors: []string{TJobChangeHeader, TNavBack}},
	{id: GameMode, anchors: []string{TGameModeHeader, TNavBack}},
	{id: Realm, anchors: []string{TRealmHeader, TNavBack}},
	{id: Baphomet, anchors: []string{TBaphTitle, TBaphChallenge}},
	// The bottom nav dims under every modal, so it gates Main; the other
	// anchors get covered by effects and auto-equip popups now and then.
	{id: Main, anchors: []string{TNavCharacter},
		anyOf: []string{TMainAdventureIncome, TMainStageChallenge, TMainQuest, TMainSystem}, need: 2},
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
	return Unknown
}
