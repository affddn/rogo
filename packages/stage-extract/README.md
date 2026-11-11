# Stage data extraction

Rebuilds `scratch/stage_enemies.csv` from the game's own config.

1. Pull from the phone (no root): `HotUpdate/Release/package/{RawPackage,CodePackage}` under
   `/sdcard/Android/data/com.ggv.rogosea.aos/files/`. Use the bundles whose md5 is listed in
   `<Pkg>_<Pkg.version>.bytes`.
2. `dump_bundle.py <bundle> <outdir>` (needs UnityPy) for the `excelconfigsbytes_game` and `_fight` bundles.
3. `stages.py <scriptsdir> stage_info.bytes > stages.txt`; `tables.py <scriptsdir> <table> <file>` for
   fight_lineup, stage_round, fight_soldier (-> lineup.jsonl, round.jsonl, soldier.jsonl), fight_attr (-> attr.jsonl).
4. `build.py <workdir> stage_enemies.csv`, then `model.py <workdir> stage_enemies.csv` adds the estimates.

Field layouts come from `excelConfig.*Cfg` in Cross.dll (CodePackage); the damage formula is
`Cross.Fight.FightFormulaTemplate` plus the fight_formula table; power is `Cross.Fight.HeroBattleRateCounter`.

`model.py` holds the character stats (`ME`) and calibration (`CAL_STAGE`, `WAVE_LATE`, `BOSS_X`).
Refresh `ME` from Overview > Attribute ⓘ when the account changes a lot.
