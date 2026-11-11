# Rogo gateway action map — SEA 0.0.163

**260 request/reply pairs** in the shipped gateway enum. The official client contains a direct send site for **228**; **32** are schema-only in this scan. **34 notifications** are listed separately. These are protocol operations, not a count of distinct UI buttons.

**What works today:** Connect Rogo verified login (4001 → 4002), character bootstrap (4005 → 4006) card collection and equip (4651 and 4661), and one complete campaign attempt (5001 then engine-generated 5003) on one SEA account. Other player operations are not live-verified here. A send site is evidence of client code, not a guarantee that a button is reachable or that the server grants access. The 9 GM/test pairs are not ordinary player features.

**Best first account query:** follow login with the signed-in character bootstrap (4005). The official client initializes its own player ID and inventory from this reply. For another character, use Friend search (4373) and the visible player card (4013), not the private bootstrap. Handle no match and ambiguous names. See the [lookup findings](../FINDINGS.md).

**How to read the list:** numbers are actual request → reply command IDs. Each entry has one primary effect: `read` describes the apparent purpose, not a side-effect guarantee; `session` manages connection/subscription state; `change`, `social`, `combat` and `claim` can change game state; `spend` can consume currency, materials, points or a paid entitlement; `restricted` is operator/test and `unclear` means the effect is not established. Costs and prerequisites depend on the account. Unless marked **schema only**, a direct send was found.

[Combat, ad, payment and HTTP boundaries](BOUNDARIES.md) · [Machine-readable fields and send sites](actions.json) · [Search and reproduce the map](README.md)

## Arena (9)

- **4681 → 4682** `QueryFightReportReq` · read — Fetch a saved fight report for an arena replay using its report ID and client build.
- **5061 → 5062** `ArenaViewReq` · read — Open the arena overview: score, tier, rank, season timing, allowances and top players.
- **5063 → 5064** `ArenaFightStartReq` · combat — Challenge an arena opponent, including a counterattack linked to a report. The start reply can already contain the result.
- **5065 → 5066** `ArenaFightCompleteReq` · combat — Submit an arena fight completion. A send method exists; normal arena settlement in this build displays the cached start result.
- **5067 → 5068** `ArenaRefreshReq` · change — Refresh the opponent list. The UI enforces a refresh allowance, season check and cooldown.
- **5069 → 5070** `ArenaBuyTicketReq` · spend — Buy a specified number of arena tickets; not the command to start a challenge.
- **5071 → 5072** `ArenaScoreAwardReq` · claim — Claim eligible arena score awards and update reward times.
- **5073 → 5074** `ArenaMatchReq` · read — Request arena match candidates; this is separate from challenging an opponent or rerolling the list.
- **5077 → 5078** `ArenaLogViewReq` · read — View recent arena battle logs; the UI separately clears its local new-record indicator.

## Campaign (2)

- **5001 → 5002** `StageFightReq` · combat · **live verified** — Challenge a campaign stage; receive the fight ID and simulation arguments.
- **5003 → 5004** `StageFightCompleteReq` · combat · **live verified** — Settle that campaign fight with its ID, stage and battle statistics; the reply contains the outcome, progress and any rewards.

## Cards (9)

- **4651 → 4652** `QueryCardInfoReq` · read · **live verified** — View your own card collection, equipped slots and collection-bonus progress.
- **4653 → 4654** `CardActivateReq` · spend — Activate one card when you have enough copies.
- **4655 → 4656** `CardStarUpReq` · spend — Spend copies to raise one activated card's star rank.
- **4657 → 4658** `CardActivateAllReq` · spend · **schema only** — Activate eligible cards in bulk using copies.
- **4659 → 4660** `CardStarUpAllReq` · spend — Raise star ranks of eligible cards in bulk using copies.
- **4661 → 4662** `CardEquipReq` · change · **live verified** — Insert a chosen card into an equipment card slot.
- **4663 → 4664** `CardUnequipReq` · change — Remove the card from a chosen equipment slot.
- **4665 → 4666** `CardCollectionBonusClaimReq` · claim — Claim earned card collection bonuses.
- **4667 → 4668** `CardShardComposeReq` · spend — Combine shards of a selected card into card copies.

## Character (22)

- **4005 → 4006** `QueryPlayerDataReq` · read · **live verified** — Load your private character snapshot: bag, gear, weapons, pets, cards, job, stage, quests and more. There is no target player ID.
- **4011 → 4012** `ChangeNicknameReq` · spend — Change nickname and gender in the name editor; the rename fee depends on prior changes.
- **4013 → 4014** `QueryPlayerDetailInfoReq` · read — Inspect a character's visible player card by ID, including displayed stats and loadout; not their private bag.
- **4017 → 4018** `SubmitExclusiveCustomServiceReq` · change · **schema only** — Submit contact details to exclusive customer service; reply can include a reward. Personal information.
- **4019 → 4020** `QueryExclusiveCustomServiceReq` · read · **schema only** — Retrieve the character's previously submitted customer-service contact details. Personal information.
- **4025 → 4026** `ChangeGenderReq` · change · **schema only** — Change the character's gender; distinct from the name editor's combined nickname/gender request.
- **4031 → 4032** `CreateCharacterReq` · change — Create a character on a realm with a nickname and gender; not required for an existing character.
- **4091 → 4092** `GetPlayerAvatarInfoReq` · read · **schema only** — List unlocked profile portraits and head frames.
- **4093 → 4094** `SetPlayerAvatarReq` · change — Set the profile portrait shown to other players.
- **4117 → 4118** `GetPlayerHeadFrameInfoReq` · read — List the character's profile head frames.
- **4119 → 4120** `SetPlayerHeadFrameReq` · change — Equip an unlocked profile head frame.
- **4121 → 4122** `UnlockPlayerHeadFrameReq` · spend — Unlock a head frame; its configured requirement may include an item cost.
- **4501 → 4502** `ActivateTitleReq` · change — Activate an eligible character title.
- **4503 → 4504** `WearTitleReq` · change — Equip a title or remove the displayed title.
- **4521 → 4522** `CareerChangeReq` · change — Select a new job or advance to a qualifying career tier.
- **4523 → 4524** `CareerBuildChangeReq` · change — Switch the active career specialization to an unlocked build.
- **4525 → 4526** `CareerSkillUpReq` · spend — Commit skill-point allocations to raise skills in a career build.
- **4527 → 4528** `CareerStageUpReq` · change · **schema only** — Request advancement for a career stage; the observed job-transfer UI uses the separate career-change command.
- **4529 → 4530** `CareerAttrUpReq` · spend — Commit available attribute points to selected stats in the current build.
- **4531 → 4532** `CareerAttrResetReq` · change — Reset the current build's allocated attribute points for reassignment.
- **4533 → 4534** `CareerSkillUseReq` · change — Save the ordered skill loadout for the build (including empty slots); this does not cast a combat skill.
- **4535 → 4536** `CareerAwakenActivateReq` · change — Activate an eligible awakening tier for the character.

## Collection Gear (14)

- **4683 → 4684** `QueryLegacyInfoReq` · read — View your Collection Gear inventory, equipped slots and enhancement state.
- **4685 → 4686** `LegacyActivateReq` · spend — Spend shards to activate one Collection Gear piece.
- **4687 → 4688** `LegacyStarUpReq` · spend — Spend shards to raise the star rank of one active Collection Gear piece.
- **4689 → 4690** `LegacyActivateAllReq` · spend — Activate eligible Collection Gear pieces in bulk using shards.
- **4691 → 4692** `LegacyStarUpAllReq` · spend — Star up eligible Collection Gear pieces in bulk using shards.
- **4693 → 4694** `LegacyShardComposeReq` · spend — Combine shards for a selected Collection Gear piece.
- **4695 → 4696** `LegacyEquipReq` · change — Equip a Collection Gear piece in a compatible slot; the UI checks career and base level.
- **4697 → 4698** `LegacyUnequipReq` · change — Unequip the Collection Gear piece in a selected slot.
- **4699 → 4700** `LegacyEnhanceReq` · spend — Spend enhancement materials to upgrade an equipped slot, not the piece itself.
- **4701 → 4702** `LegacyEnhanceAllReq` · spend — Enhance eligible equipped slots in bulk using enhancement materials.
- **4703 → 4704** `LegacyCollectionBonusClaimReq` · claim — Claim an earned Collection Gear collection bonus.
- **4717 → 4718** `QueryLegacySummonInfoReq` · read — Check progress and counts for a selected Collection Gear summon pool.
- **4719 → 4720** `LegacySummonReq` · spend — Draw from a common or career Collection Gear pool; normal draws use tickets and the UI also offers an ad mode.
- **4721 → 4722** `LegacySummonProgressRewardClaimReq` · claim — Claim earned draw-progress rewards for the selected Collection Gear pool.

## Costumes (4)

- **4671 → 4672** `QueryAvatarInfoReq` · read — View your unlocked costume pieces, equipped appearance and collection progress.
- **4673 → 4674** `UnlockAvatarReq` · spend — Unlock a costume piece; depending on the piece, this uses an item or requires a career tier or weapon quality.
- **4675 → 4676** `EquipAvatarReq` · change — Equip an unlocked costume piece.
- **4677 → 4678** `UnequipAvatarReq` · change — Remove the equipped costume piece in a selected category.

## Elite summon (5)

- **4061 → 4062** `EquipSummonCostReq` · spend — Summon an elite monster for gear drops using the configured item cost; supports a multi-drop multiplier.
- **4063 → 4064** `EquipSummonRewardReq` · claim · **schema only** — Request elite-summon rewards. The inspected summon UI also receives rewards directly from 4061.
- **4065 → 4066** `EquipSummonStrongReq` · spend — Pay the configured upgrade materials to advance an Elite Summon strengthening step.
- **4067 → 4068** `EquipSummonUpgradeReq` · change — Start the timed Elite Summon level upgrade after its strengthening steps are complete.
- **4069 → 4070** `EquipSummonCdReq` · spend — Shorten the Elite Summon upgrade timer using items, or after a rewarded ad within its allowance.

## Endless Tower (4)

- **5051 → 5052** `EndlessTowerQueryReq` · read — View current and next floor, daily challenges and sweeps, and whether a fight is still unsettled.
- **5053 → 5054** `EndlessTowerFightReq` · combat — Start the next tower challenge; the response identifies the floor and fight.
- **5055 → 5056** `EndlessTowerFightSettleReq` · combat — Settle a tower floor. The reply can end the run or supply fight data for the next floor.
- **5057 → 5058** `EndlessTowerSweepReq` · combat — Sweep the tower for rewards using the selected sweep type; free and rewarded-ad allowances are tracked separately.

## Equipment (13)

- **4041 → 4042** `QueryEquipInfoReq` · read · **schema only** — Query the signed-in character's equipment, slots, dismantle settings and active enchant scheme.
- **4043 → 4044** `PutOnEquipReq` · change — Put a specific piece of equipment in a gear slot.
- **4045 → 4046** `StrengthenEquipReq` · spend — Spend enhancement materials to strengthen a gear slot once or towards a target level.
- **4047 → 4048** `RefineEquipReq` · spend — Attempt a gear-slot refinement with materials; protection is an explicit option.
- **4049 → 4050** `DecomposeEquipReq` · change — Dismantle selected equipment IDs for materials; the equipment is removed.
- **4051 → 4052** `UpdateEquipDecomposeSettingReq` · change — Set auto-dismantle criteria, including quality and power thresholds.
- **4053 → 4054** `ActivateRefineMasterLvReq` · change — Activate an eligible refine mastery (resonance) tier.
- **4055 → 4056** `EquipEnchantReq` · spend — Reroll enchantments for a slot and category; locks affect the cost.
- **4057 → 4058** `SetEnchantAttrLockReq` · change — Lock or unlock an enchantment attribute line before rerolling.
- **4059 → 4060** `SetEnchantDreamAttrReq` · change · **schema only** — Set the desired enchant attributes for a slot and category.
- **4071 → 4072** `SwitchEnchantSchemeReq` · change — Switch to another saved enchantment scheme.
- **4073 → 4074** `ActivateEnhanceMasterLvReq` · change — Activate an eligible enhancement mastery (resonance) tier.
- **4075 → 4076** `PreviewEquipPowerDiffReq` · read — Preview the power difference between two pieces of equipment without equipping them.

## Events (10)

- **7001 → 7002** `ActReceiveTaskRewardsReq` · claim — Claim event-task rewards for a selected event and group.
- **7003 → 7004** `ActStoreBuyReq` · spend · **schema only** — Buy a listing in an activity shop, by event and goods entry.
- **7005 → 7006** `ReceiveActRewardReq` · claim · **schema only** — Request an activity reward with event-specific arguments.
- **7007 → 7008** `ReceiveSigninRewardReq` · claim — Claim a sign-in reward by entry; receive the updated sign-in state.
- **7009 → 7010** `BuySigninActiveReq` · spend — Unlock a sign-in activity using its configured item purchase; the cash variant goes through recharge instead.
- **7021 → 7022** `SummonActReq` · spend — Draw from a summon activity; count, free and rewarded-ad variants depend on the event and eligibility.
- **7023 → 7024** `ReceiveSummonActScoreRewardReq` · claim — Claim a summon event's earned score rewards.
- **7025 → 7026** `BuySummonActStoreGoodsReq` · spend — Buy a quantity of goods in the summon-event shop.
- **7027 → 7028** `FilmSummonReq` · claim — Draw on the film-summon wheel using an eligible rewarded ad or the account's ad-skip benefit.
- **7029 → 7030** `ReceiveFilmSummonProgressRewardReq` · claim — Claim an earned film-summon progress reward.

## Friends & chat (15)

- **4341 → 4342** `ChatReq` · social — Send a channel message, private message or emote; chat limits apply.
- **4343 → 4344** `JoinChatChannelReq` · session — Subscribe to chat channels and request their history (zone, server, guild and team invites).
- **4345 → 4346** `GetChatFilterSettingsReq` · read — Read the character's saved chat-filter settings.
- **4347 → 4348** `SetChatFilterSettingsReq` · change — Save chat filters such as minimum level or filtering strangers.
- **4351 → 4352** `GetBlacklistReq` · read — List blocked players.
- **4353 → 4354** `AddToBlacklistReq` · social — Block a player.
- **4355 → 4356** `RemoveFromBlacklistReq` · social — Unblock a player.
- **4361 → 4362** `GetFriendListReq` · read — List the character's friends.
- **4363 → 4364** `SendFriendRequestReq` · social — Send a friend request to a player.
- **4365 → 4366** `DeleteFriendReq` · social — Remove a player from the friend list.
- **4367 → 4368** `GetRecommendFriendsReq` · read — Get suggested players to add as friends.
- **4369 → 4370** `GetFriendRequestListReq` · read — List incoming friend requests.
- **4371 → 4372** `HandleFriendRequestReq` · social — Accept or reject pending friend requests; the UI can submit multiple IDs.
- **4373 → 4374** `SearchFriendReq` · read — Find candidate players by nickname or character ID; select a server and ID before requesting the detailed card.
- **4679 → 4680** `BatchQueryPlayerOnlineStatusReq` · read — Check online status for player IDs; the private-chat list batches up to 50 per call.

## Guild (25)

- **4431 → 4432** `GuildViewReq` · read — Open your guild overview, including its hall members.
- **4433 → 4434** `CreateGuildReq` · spend — Found a guild with a name, badge and recruitment policy; creation can cost diamonds or an item.
- **4435 → 4436** `QueryGuildReq` · read — Look up a guild by ID or search by name.
- **4437 → 4438** `ApplyGuildReq` · social — Apply to a guild or join immediately if it allows it; the UI checks the post-leave cooldown.
- **4439 → 4440** `GetGuildApplyReq` · read — List applicants awaiting guild admission.
- **4441 → 4442** `DealGuildApplyReq` · social — Approve or refuse guild applications, including batch decisions where permitted.
- **4443 → 4444** `LeaveGuildReq` · social — Quit your guild, or expel a lower-ranking member if your guild role allows it.
- **4445 → 4446** `ChangeGuildSetReq` · spend — Edit guild name, badge, join policy, notice or recruitment slogan with permission; renaming can cost diamonds.
- **4447 → 4448** `GetGuildPlayerListReq` · read — Get the guild member roster and roles.
- **4449 → 4450** `GetGuildListReq` · read — Browse the list of guilds.
- **4451 → 4452** `SetGuildPlayerJobReq` · social — Change a member's guild role; assigning the president role transfers leadership.
- **4453 → 4454** `GuildDisbandReq` · social — Disband the guild for everyone; the UI presents a president-only control and confirmation.
- **4455 → 4456** `GetGuildLogReq` · read — Read the guild activity log.
- **4457 → 4458** `GuildDonateReq` · spend — Donate to the guild for rewards: free, ad-backed or diamond-funded depending on the option and remaining allowance.
- **4459 → 4460** `GetGuildPddReq` · read — View today's Guild Bargain deal, including its current price.
- **4461 → 4462** `DoingGuildPddReq` · spend — Cut the Guild Bargain price or buy the deal; the buy branch pays the current price unless it is zero.
- **4463 → 4464** `SendGuildInviteReq` · social — Send a guild recruitment invitation; the request does not name a target player.
- **4471 → 4472** `QuickJoinGuildReq` · social — Quick-join an available guild; the UI checks the post-leave cooldown.
- **4485 → 4486** `GetGuildTechInfoReq` · read — Inspect guild technology and research state.
- **4487 → 4488** `StartGuildSkillResearchReq` · spend — Start the next guild skill research level in an available slot; configured research material costs may apply.
- **4489 → 4490** `GuildSkillSpeedUpReq` · spend — Speed up guild research with acceleration items or via the official rewarded-ad flow.
- **4505 → 4506** `GetGuildHelpListReq` · read — List outstanding guild help requests and today's assist-reward count.
- **4507 → 4508** `RequestGuildHelpReq` · social — Request guild help speeding up skill research or an Elite Summon upgrade.
- **4509 → 4510** `AssistGuildHelpReq` · social — Help a guildmate with a specific outstanding request.
- **4513 → 4514** `GetGuildHelpRequestInfoReq` · read — Check guild help cooldowns, daily counts and remaining research or Elite Summon upgrade time.

## Guild boss (7)

- **4465 → 4466** `GetGuildBossInfoReq` · read — View Guild Hunt boss state and progress.
- **4467 → 4468** `AddGuildBossBuffCountReq` · change — Add to the Guild Hunt boss buff count; the request does not specify how the use is earned.
- **4473 → 4474** `GuildBossFightReq` · combat — Start a Guild Hunt boss fight.
- **4475 → 4476** `GuildBossFightCompleteReq` · combat — Settle an existing Guild Hunt fight with its fight ID, run statistics, score and stage damage.
- **4477 → 4478** `GuildBossSweepReq` · combat — Sweep Guild Hunt for rewards using an eligible sweep opportunity.
- **4483 → 4484** `ReceiveGuildBossRewardReq` · claim — Claim an eligible Guild Hunt score reward.
- **4495 → 4496** `OpenGuildBossLootChestReq` · claim — Open a Guild Hunt loot chest and collect its rewards.

## Inventory & idle (7)

- **4081 → 4082** `QueryItemBagReq` · read · **schema only** — List items in the signed-in character's bag.
- **4083 → 4084** `UseItemReq` · spend — Use bag items, including selected or random chests and idle-yield buffs; contents/count can be consumed.
- **4085 → 4086** `QueryPowerRecoverReq` · read · **schema only** — Query recoverable power and its last recovery time; not the character's battle-power score.
- **4087 → 4088** `OnlineIdleRewardPreReq` · read — Check the available online idle reward count before requesting a payout.
- **4089 → 4090** `OnlineIdleRewardReq` · claim — Collect online idle rewards against accrued reward intervals and kills.
- **4095 → 4096** `FastIdleRewardReq` · spend — Collect Quick Idle income; the UI selects a free allowance, ticket or diamond cost depending on current state.
- **4097 → 4098** `QueryIdleYieldBonusInfoReq` · read — Inspect idle-yield bonus state without claiming the income.

## Loadouts (6)

- **4705 → 4706** `SwitchCardSchemeReq` · change — Switch the active card-slot preset.
- **4707 → 4708** `RenameSchemeReq` · change — Rename one enchant, card, pet or Collection Gear preset.
- **4709 → 4710** `SwitchPetSchemeReq` · change — Switch the active pet formation preset.
- **4711 → 4712** `SwitchLegacySchemeReq` · change — Switch the active Collection Gear preset.
- **4713 → 4714** `SwitchSchemeSetReq` · change — Apply a combined loadout set across enchantments, cards, pets and Collection Gear.
- **4715 → 4716** `RenameSchemeSetReq` · change — Rename a combined loadout set.

## Mail (4)

- **4101 → 4102** `EmailGetAllReq` · read — Fetch inbox messages and attachment state; this does not collect the attachments.
- **4103 → 4104** `EmailGetRewardReq` · claim — Collect attachments from an individual message or use the mailbox's Claim All.
- **4105 → 4106** `EmailDeleteReq` · change — Delete messages; the mailbox UI offers bulk deletion of eligible received mail.
- **4107 → 4108** `EmailReadReq` · change — Mark one or more messages as read; this is not the read-only inbox fetch.

## MVP (4)

- **5041 → 5042** `MvpQueryReq` · read — View MVP challenge records, including cleared difficulty and sweep progress.
- **5043 → 5044** `MvpFightReq` · combat — Challenge an MVP at a selected difficulty stage.
- **5045 → 5046** `MvpFightCompleteReq` · combat — Settle the MVP fight and update the challenge record; new clears can return first-clear rewards.
- **5047 → 5048** `MvpSweepReq` · combat — Sweep an eligible MVP stage for the requested count; the reply reports how many daily sweeps were used.

## Pets (11)

- **4627 → 4628** `PetSwapFightGuardReq` · change — Swap your fighting pet with the pet in a selected guard slot.
- **4631 → 4632** `QueryPetInfoReq` · read · **schema only** — View your pet roster and formation.
- **4633 → 4634** `PetActivateReq` · spend — Activate one pet using enough copies of that pet.
- **4635 → 4636** `PetLevelupReq` · spend — Level up a selected pet using copies.
- **4637 → 4638** `PetGachaReq` · spend — Draw pets; normal draws use the selected cost and there are separate free and ad draw modes.
- **4639 → 4640** `PetActivateAllReq` · spend — Activate all pets for which you have the required copies.
- **4641 → 4642** `PetLevelupAllReq` · spend — Level up eligible pets in bulk using their copies.
- **4643 → 4644** `PetPutOnReq` · change — Deploy a pet as your fighting pet, or clear the fighting slot.
- **4645 → 4646** `PetGuardReq` · change — Assign a pet to a guard position, or clear that position.
- **4647 → 4648** `PetGachaLevelRewardClaimReq` · claim — Claim earned pet-summon level rewards.
- **4649 → 4650** `PetOneKeyDeployReq` · change — Apply the one-click pet formation, updating the fighting pet and roster assignments.

## Platform (2)

- **4481 → 4482** `GameClubDataReq` · unclear · **schema only** — Submit signed/encrypted platform Game Club data and receive club data entries; SEA player workflow not identified.
- **4511 → 4512** `SubscribeWxOfflineReq` · change · **schema only** — Opt in to or out of WeChat offline notifications; SEA client availability not established.

## Quests & rewards (15)

- **4021 → 4022** `SetGuideInfoReq` · change — Save tutorial or guide-step progress.
- **4179 → 4180** `GetExchangeCodePrizesReq` · claim — Redeem an exchange code for prizes; this consumes a redemption, not a reward preview.
- **4209 → 4210** `ReceiveBpRewardReq` · claim — Collect eligible season/battle pass rewards; the ordinary claim path uses buyLevel = 0.
- **4221 → 4222** `TriggerTaskProgressReq` · change — Report a task-progress event by requirement type and count; this is not a reward claim.
- **4223 → 4224** `ReceiveTaskRewardReq` · claim — Claim an eligible task reward and update its activity counters.
- **4225 → 4226** `ReceiveDailyTaskScoreRewardReq` · claim — Claim an eligible daily task activity-score reward.
- **4227 → 4228** `TriggerTaskProgressByEntryReq` · change — Report progress for specific task entries, including batched entries.
- **4229 → 4230** `ExtendTimeLimitedQuestReq` · spend — Extend an eligible time-limited quest using its configured extension cost.
- **4231 → 4232** `SkipTaskProgressWithAdReq` · change — Skip guild-task progress after rewarded-ad completion, within the remaining skip allowance.
- **4233 → 4234** `ReceiveWeeklyTaskScoreRewardReq` · claim — Claim an eligible weekly task activity-score reward.
- **4235 → 4236** `ReceiveCarnivalTaskScoreRewardReq` · claim — Claim a Carnival task activity-score reward.
- **4237 → 4238** `ReceiveTimeLimitedQuestRewardReq` · claim — Claim the reward for a completed time-limited quest.
- **4247 → 4248** `ReceiveDailyGuildTaskScoreRewardReq` · claim — Claim an eligible guild daily-task activity-score reward.
- **4491 → 4492** `ReceiveFunctionPreviewRewardReq` · claim — Claim the reward for an eligible feature preview.
- **4727 → 4728** `RateGuideClaimReq` · claim — Claim the one-time review-prompt reward; opening the platform review screen is a separate SDK action.

## Rankings (11)

- **4261 → 4262** `GetStageRankReq` · read — View the campaign-stage leaderboard and your own rank entry.
- **4469 → 4470** `GuildAbilityRankReq` · read — View guilds ranked by battle power.
- **4479 → 4480** `GuildBossRankReq` · read — View individual Guild Hunt scores and your own placement.
- **4493 → 4494** `GuildBossGuildRankReq` · read — View Guild Hunt scores grouped by guild rather than by player.
- **4537 → 4538** `GetZoneAbilityRankReq` · read · **schema only** — View the zone battle-power leaderboard and your placement.
- **4539 → 4540** `GetServerAbilityRankReq` · read — View the server battle-power leaderboard and your placement.
- **4541 → 4542** `AbilityRankThumbUpReq` · social — Give a thumbs-up to a player on the battle-power leaderboard.
- **5037 → 5038** `WorldBossRankReq` · read — View the world-boss leaderboard and your own placement.
- **5059 → 5060** `EndlessTowerGetRankReq` · read — View Endless Tower rankings and your own entry.
- **5075 → 5076** `GetArenaScoreRankReq` · read — View the arena score leaderboard and your own entry.
- **6013 → 6014** `TeamPveQueryRankReq` · read — View team PvE rankings and your own entry.

## Resource realms (4)

- **5011 → 5012** `ResStageSweepReq` · combat — Sweep a resource stage for rewards rather than playing the fight.
- **5013 → 5014** `ResStageFightReq` · combat — Enter a resource-stage challenge and obtain its fight ID and arguments.
- **5015 → 5016** `ResStageFightCompleteReq` · combat — Settle the resource-stage fight; first-clear and ordinary rewards are separate in the reply.
- **5017 → 5018** `ResStageSweepAllReq` · combat · **schema only** — Request a bulk sweep by resource type rather than sweeping a single stage.

## Session (6)

- **4001 → 4002** `LoginReq` · session · **live verified** — Enter the selected realm using an issued publisher session; a second login can disconnect the first client.
- **4003 → 4004** `UpdateServerBeanReq` · unclear · **schema only** — Send a serverBean string and receive a status; no player-facing purpose established.
- **4009 → 4010** `HeartbeatReq` · session — Send a heartbeat and receive server time and time-zone offset.
- **4015 → 4016** `QueryTengxunSdkReportInfoReq` · read · **schema only** — Query the Tencent SDK report timestamp; not a gameplay reward or account export.
- **4023 → 4024** `ReConnectReq` · session — Resume a dropped game connection with the game's reconnect token, not the publisher login token.
- **4241 → 4242** `QueryGmtMessageReq` · unclear — Poll for a GMT message after a server notification; the reply is a success flag, not message contents.

## Settings (2)

- **4723 → 4724** `GetPushSettingsReq` · read — Read the character's saved push-notification preferences.
- **4725 → 4726** `SetPushSettingsReq` · change — Save push-notification preferences; the client sets the idle-reward notification toggle here.

## Shop & payments (9)

- **4191 → 4192** `StoreBuyReq` · spend — Buy a shop listing in a chosen quantity; price and free/ad eligibility depend on the listing.
- **4193 → 4194** `StagePackBuyReq` · spend · **schema only** — Buy a stage pack by pack entry; the message alone does not specify its price.
- **4201 → 4202** `QueryRechargeCpOrderReq` · spend — Initiate a real-money recharge order; the reply supplies the order ID for the separate publisher payment flow.
- **4203 → 4204** `ReceiveFirstRechargeRewardReq` · claim — Collect an unlocked first-recharge reward; this does not perform the recharge.
- **4207 → 4208** `ReceiveTotalRechargeRewardReq` · claim · **schema only** — Claim a cumulative recharge milestone reward at the specified grade.
- **4213 → 4214** `RechargeWithVoucherReq` · spend — Pay for a recharge product with in-game vouchers instead of opening platform checkout.
- **4217 → 4218** `BuyTriggerGiftReq` · spend — Buy a currently available triggered gift with diamonds or items; its real-money variant uses the recharge flow.
- **4219 → 4220** `ReceiveMonthCardDailyRewardReq` · claim — Claim daily rewards from an eligible monthly card.
- **4239 → 4240** `ReceiveMonthCardDailyFreeRewardReq` · claim — Collect the monthly-card page's daily free reward, separate from cardholder rewards.

## Team dungeons (6)

- **6001 → 6002** `TeamPveStartFightReq` · combat — Start a team PvE stage. The direct reply is empty; team fight notifications carry further state.
- **6003 → 6004** `TeamPveGetFightDataReq` · read — Fetch the fight ID and simulation arguments for a team dungeon by team ID.
- **6005 → 6006** `TeamPveSettleReq` · combat — Settle the dungeon fight and receive updated personal team-PvE data, reward type and rewards.
- **6009 → 6010** `TeamPveClaimFreeItemReq` · spend · **schema only** — Request the team PvE item allowance; the body has a use_diamond option, so this is not unconditionally free.
- **6011 → 6012** `TeamPveClaimAchievementReq` · claim — Claim eligible team-dungeon achievement rewards.
- **6015 → 6016** `TeamPveBatchCheckStageUnlockReq` · read — Check which listed players have unlocked a dungeon stage, optionally checking online status.

## Teams (14)

- **4275 → 4276** `GetRecommendPlayersReq` · read — Get recommended players to invite for a team type and stage, excluding specified players.
- **4301 → 4302** `CreateTeamReq` · social — Create a team PvE room for a dungeon stage.
- **4303 → 4304** `JoinTeamReq` · social — Join an existing team by room code or from its invitation.
- **4305 → 4306** `LeaveTeamReq` · social — Leave the current team.
- **4307 → 4308** `KickTeamMemberReq` · social — Remove a player from the room; the client checks that you are the host.
- **4309 → 4310** `DisbandTeamReq` · social · **schema only** — Disband a team, closing the room for its members.
- **4313 → 4314** `JoinTeamFromInvitesReq` · social — Auto-join from a list of pending, unexpired team invitations.
- **4317 → 4318** `TeamMatchReq` · social — Queue the team for matchmaking on an unlocked dungeon stage.
- **4319 → 4320** `CancelTeamMatchReq` · social — Cancel the team's matchmaking queue.
- **4321 → 4322** `ConfirmTeamMatchResultReq` · social — Accept or decline a proposed match before the ready check expires.
- **4323 → 4324** `SetTeamPveStageReq` · change — Choose the dungeon stage for the room as its host.
- **4325 → 4326** `SetTeamOnlyAssistReq` · change — Toggle your own assist-only participation in team PvE.
- **4349 → 4350** `SendTeamInviteReq` · social — Broadcast a team recruitment message or invite selected players to a stage.
- **4813 → 4814** `GetTeamListReq` · read · **schema only** — Retrieve a list of team IDs; the reply is not a roster of team members.

## Weapons (8)

- **4601 → 4602** `QueryWeaponInfoReq` · read · **schema only** — List your weapons and identify the equipped one.
- **4603 → 4604** `WeaponActivateReq` · spend — Activate weapons using collected copies; the quick-activate button requests all eligible qualities.
- **4605 → 4606** `WeaponEquipReq` · change — Equip an activated weapon by quality.
- **4609 → 4610** `WeaponUpgradeStarReq` · spend · **schema only** — Raise the star rank of a weapon using copies of that quality.
- **4615 → 4616** `WeaponAchievementRewardReq` · claim — Claim an earned Weapon Master achievement reward.
- **4621 → 4622** `WeaponGachaReq` · spend — Draw weapons; normal draws use the selected cost and there are separate free and ad draw modes.
- **4623 → 4624** `WeaponGachaLevelRewardClaimReq` · claim — Claim earned weapon-summon level rewards.
- **4625 → 4626** `WeaponActivateAllReq` · spend — Bulk star-up already activated weapons with spare copies (the Quick Awaken confirmation).

## World boss (3)

- **5031 → 5032** `WorldBossQueryReq` · read — View Baphomet's HP ratio, your best score, tier, rank and weekly settlement time.
- **5033 → 5034** `WorldBossFightReq` · combat — Start a world-boss challenge and receive the fight ID and simulation arguments.
- **5035 → 5036** `WorldBossFightCompleteReq` · combat — Settle the world-boss fight with the damage dealt; receive the score, rank and rewards.

## GM & testing (9)

- **9001 → 9002** `FightTestReq` · restricted · **schema only** — Development fight test that returns fight arguments; not an ordinary player action.
- **9003 → 9004** `GmReq` · restricted — General GM console operation; not a player command interface.
- **9005 → 9006** `EquipGmReq` · restricted · **schema only** — Equipment-specific GM operation; not normal equipment management.
- **9007 → 9008** `GmTaskTriggerReq` · restricted — Administrative adjustment of one task's progress; distinct from normal progress reporting.
- **9009 → 9010** `RechargeGmReq` · restricted · **schema only** — Recharge test operation, not a player purchase or proof of payment.
- **9011 → 9012** `GmRefreshDataReq` · restricted · **schema only** — Refresh data for the GM interface, not the normal character bootstrap.
- **9013 → 9014** `GmAttrDebugReq` · restricted · **schema only** — Inspect diagnostic attribute and battle-power calculations.
- **9015 → 9016** `GmTaskTriggerByClassReq` · restricted — Update tasks by class in the GM tools, not an ordinary claim.
- **9017 → 9018** `GmPvpFightStartReq` · restricted — Start a test PvP simulation for chosen players, not normal arena matchmaking.

## Incoming notifications (34)

Handled by the inbound parser. These are not additional buttons a client can press.

- **2108** `MergePacketNotify`
- **4008** `DisconnectNotify`
- **4100** `AbilityChangeNotify`
- **4244** `GmtMessageNotify`
- **4380** `FriendNotify`
- **8002** `NoticeNotify`
- **8004** `MailNotify`
- **8006** `ItemChangeNotify`
- **8008** `EquipChangeNotify`
- **8012** `PlayerInfoChangeNotify`
- **8014** `RechargeCompleteNotify`
- **8016** `TaskChangedNotify`
- **8018** `ReddotChangedNotify`
- **8020** `JobChangeNotify`
- **8022** `GmChangeNotify`
- **8024** `BpActiveChangedNotify`
- **8026** `TeamChangeNotify`
- **8028** `TeamFightFrameNotify`
- **8030** `TeamFightClientCloseNotify`
- **8034** `TeamStartFightNotify`
- **8042** `TriggerGiftChangeNotify`
- **8044** `TimeLimitedQuestChangeNotify`
- **8046** `ChatNotify`
- **8048** `ActChangedNotify`
- **8050** `CombinedGameNotify`
- **8052** `CommonGameNotify`
- **8060** `GuildInviteNotify`
- **8062** `TeamPveStartFightNotify`
- **8064** `TeamMatchSuccessNotify`
- **8066** `TeamFightRoomMemberConfirmNotify`
- **8068** `TeamFightRoomPrepareResultNotify`
- **8070** `PlayerKickNotify`
- **8072** `GuildTechChangedNotify`
- **8074** `SurveyRewardChangedNotify`
