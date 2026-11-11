# RO GO Guide

A progression guide for Ragnarok: GO (SEA client 0.0.163), built from the game's own data. Anyone can
use it: add your character (class, level, power, furthest stage), and every page shows your own
progress, damage and plan. Nothing is sent anywhere; characters live in the browser, and move between
browsers with a file or a share link.

Vite+ (`vp`), React 19, TypeScript, Tailwind v4, shadcn/ui (Radix), Recharts. The look uses the game's
own UI art (panels, plaque buttons, store tabs, quality frames) and the Cinzel display face.

From the repository root:

```bash
vp install --frozen-lockfile
vp run dev      # http://localhost:5173
vp run @rogo/web#test
vp run @rogo/web#build
```

To load your VMOS character, see [Connect Rogo](../lookup-client/CONNECT.md).
The local helper is opt-in; a hosted guide can still browse the operation catalog.

## Pages

| Page                   | What it does                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Overview               | Where you stand, and an index of the guide                                                                                              |
| Character              | Several characters; quick setup from four numbers, full stats from Attribute Details, progress, share link and file                     |
| Card album             | Tick the cards you own and their stars; album bonus and collection rewards                                                              |
| Automation             | Start, stop and follow a long-running progression job for a connected character in a console view (local helper only)                   |
| Planner                | Upgrades, a game-style attribute screen (+ / − with a before → after preview), and the best card per slot from your album               |
| Stage progression      | Power to clear all 936 stages, walls, per-chapter progress                                                                              |
| Stage                  | Enemies, the boss's full stats and skills, your hit layer by layer, first-clear and idle rewards                                        |
| Game modes             | MVP, Endless Tower, realms, dungeons, Baphomet, arena and guild: each fight matched to a campaign stage and run through the clear model |
| Equipment              | Item stats by grade and level, refine odds and exact expected cost, enhance, resonance, enchant odds, Elite Summon                      |
| Weapons, pets and more | Weapons by star, Collection Gear and sets, pets, awakening, guild skills, costumes                                                      |
| Skills and jobs        | Skill trees with + / − per level, the best next skill point, job changes, base and job levels                                           |
| Items and drops        | Every item, card and pet with every source and its chance                                                                               |
| Summons and shops      | Rates, pity and level-ups for every summon; every shop's goods and limits                                                               |
| Formulas               | Damage, power, attribute and clear rules with their source in the game code                                                             |
| Game data              | Searchable monsters, cards and attributes                                                                                               |

## Where the numbers come from

| What                                                        | Source in the client                                                                                                                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stage and monster stats                                     | `stage_info`, `stage_round`, `fight_lineup`, `fight_soldier`                                                                                                                           |
| Damage per hit                                              | `Cross.Fight.FightFormulaTemplate` (BaseHurt, EDHurt, CondDmgMod) + `fight_formula`                                                                                                    |
| Power                                                       | `Cross.Fight.HeroBattleRateCounter` + `fight_battle_rate`                                                                                                                              |
| Primary stats                                               | `fight_attr` layer formulas + `fight_attr_transfer`                                                                                                                                    |
| Cards, equipment, weapons, pets, Collection Gear, awakening | `card_*`, `equip_*`, `enchant_*`, `weapon_*`, `pet_*`, `legacy_*`, `awaken_*`                                                                                                          |
| Skills and jobs                                             | `career_*`, `fight_skill*`, `fight_bullet*`, `fight_brand`, `jobLevel_info`, `baseLevel_info`                                                                                          |
| Modes, drops, shops, summons                                | `mvp_*`, `endless_tower_*`, `res_instance_*`, `team_pve_*`, `drop_*`, `store_*`, `summon_*`                                                                                            |
| Art                                                         | FairyGUI atlases from the client; icons (cards, items, skills, monsters, pets, weapons, Collection Gear, costumes) from the install-time split APK, listed in `public/game/index.json` |

Checks against the live game, kept in `src/lib/game/model.test.ts`: the predicted normal hit on a 6-10
mob (100.1K vs 101.5K shown), power reproduced to the point, and the in-game Recommended Allocation
reproduced exactly. The skill export reproduces every damage multiplier in the in-game skill text.

The stage model is calibrated on real fights: one reference fight anchors it (until you give your own
progress, which replaces it), and real clears from a second account set how fast rate stats grow.
Chapters 6–10 are backed by clears; chapter 11 onward is extrapolated and drawn dashed.

## Rebuilding the data after a game update

The config tables ship in the game's hot-update bundles, not the APK. With a copy of the client's
`HotUpdate/Release/package` folders:

1. Unpack the current `excelconfigsbytes_{game,fight}` bundles and decompile `Cross.dll` from
   CodePackage (`../../packages/stage-extract/` has the scripts; see its README).
2. `python3 -I ../../packages/stage-extract/export_tables.py <decompiled Cross> <tables> <export>`
3. From `apps/web/`, with `T=<export>/tables`:
   - `python3 -I scripts/build_data.py <export> public/data`
   - `python3 -I scripts/export_cards.py $T public/data/cards.json`
   - `python3 -I scripts/export_equipment.py $T public/data`
   - `python3 -I scripts/export_systems.py $T public/data`
   - `python3 -I scripts/export_skills.py $T public/data`
   - `python3 -I scripts/export_content.py $T public/data`
   - `python3 -I scripts/export_items.py $T public/data`

Each exporter documents its JSON in `../../packages/game/src/data/*.ts`, with every rule tagged as read from the
client code, read from table data, or inferred (server-side rules the client doesn't ship).

## Not modelled yet

- One action at a time: the skill planner adds skill damage rates as if skills never queue.
- Card and set procs, damage over time, and stack mechanics are listed, not priced.
- Survival: VIT, DEF and HP only count toward power.
- Weapon, card and Collection Gear % lines share the attack % pool with STR/DEX/INT. The game's stat
  screen doesn't show that pool, so enter it on the character page (Gear %) for exact stat-point advice.

The art and data belong to the game's publisher. Keep this guide private, or drop `public/game/`
before sharing it anywhere.
