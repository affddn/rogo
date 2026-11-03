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
	TNavCharacter        = "main_nav_character"
	TAttrHeader          = "attr_header"
	TCharOverview        = "char_overview_header"
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
	{id: GachaCount, anchors: []string{TGachaCountHint, TGachaDrawButton}},
	{id: QuickIdleConfirm, anchors: []string{TQuickIdleTitle, TDialogOK}},
	{id: AutoSummonHint, anchors: []string{THintTitle, TAutoSummonText}},
	{id: Income, anchors: []string{TIncomeTitle, TIncomeClose}},
	{id: Attribute, anchors: []string{TAttrHeader, TNavBack}},
	{id: CharOverview, anchors: []string{TCharOverview, TNavBack}},
	{id: Equipment, anchors: []string{TEquipHeader, TNavBack}},
	{id: Enhance, anchors: []string{TEnhanceHeader, TNavBack}},
	{id: WeaponGacha, anchors: []string{TGachaHeader, TNavBack}},
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
