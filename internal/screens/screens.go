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
)

// Template names, shared with the tasks that tap them.
const (
	TMainAdventureIncome = "main_adventure_income"
	TMainStageChallenge  = "main_stage_challenge"
	TMainQuest           = "main_quest"
	TMainQuestCompleted  = "main_quest_completed"
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
)

// MinScore is the NCC score treated as a hit. Templates are cut from the same
// 720x1280 render, so true hits sit above 0.97 and misses below 0.6.
const MinScore = 0.85

// Margin is how far from its reference position a template is searched.
const Margin = 24

type rule struct {
	id      ID
	anchors []string // all must be visible
}

// Modals first: whatever is on top wins.
var rules = []rule{
	{Reward, []string{TRewardCongrats}},
	{QuickIdleConfirm, []string{TQuickIdleTitle, TDialogOK}},
	{AutoSummonHint, []string{THintTitle, TAutoSummonText}},
	{Income, []string{TIncomeTitle, TIncomeClose}},
	{Attribute, []string{TAttrHeader, TNavBack}},
	{CharOverview, []string{TCharOverview, TNavBack}},
	{Equipment, []string{TEquipHeader, TNavBack}},
	{Enhance, []string{TEnhanceHeader, TNavBack}},
	{Main, []string{TMainAdventureIncome, TMainStageChallenge}},
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
		if hit {
			return r.id
		}
	}
	return Unknown
}
