import sys, struct, json
sys.path.insert(0, sys.argv[1])
from pb import rows, packed
SCHEMA = {
 'fight_attr': 'EnumValue:e KeyEn:s KeyCn:s Desc:s Name:s Description:s ShowStyle:i AttrShowFilter:i SortOrder:i SourceCountType:e EnableMin:i MinValue:d EnableMax:i MaxValue:d FormulaTemplateType:e FormulaParams:li Rowid:i',
 'fight_battle_rate': 'EnumValue:e BrMul:i BaseValue:f SpecEntry:li SpecBrRatio:lf Rowid:i',
 'fight_lineup': 'FightStageEntry:i Round:i SoldierEntry:i SoldierRandomGroup:i Active:i TimeFirst:f Turns:i TimeDuration:f HpShowAmount:i Count:i AttrKey:li AttrNum:ld Rowid:i',
 'fight_soldier': 'Entry:i SoldierName:s Career:i Tier:i Spec:i Tags:li Res:i HeadIcon:i DamageType:e ElementType:i Skills:li QteSkill:i MoveSpeed:i AttrPatk:i AttrMatk:i AttrPdef:i AttrMdef:i AttrHp:i AttrMp:i Resistance1:i Resistance2:i Resistance3:i Resistance4:i Rowid:i',
 'stage_round': 'FightStageEntry:i StageRound:i ShowRound:i RoundTime:i BossRaid:i MonsterLimit:i RoundRule:i RoundCut:i StageBuff:i Rowid:i',
 'monster_inherit': 'Entry:i PatkInherit:f MatkInherit:f PdefInherit:f MdefInherit:f HpInherit:f SummonDuration:f Rowid:i',
 'baseLevel_info': 'Entry:i BaseLevel:i CostExp:i BasePoint:i LevelAttr:li AttrNum:ld ArmorLevelRange:s Rowid:i',
}
def conv(t, vs):
    out = []
    for v in vs:
        if t in ('i', 'e'): out.append(v if isinstance(v, int) else packed(v))
        elif t == 's': out.append(v.decode('utf-8', 'replace'))
        elif t == 'f': out.append(struct.unpack('<f', v)[0])
        elif t == 'd': out.append(struct.unpack('<d', v)[0])
        elif t == 'li': out.extend(packed(v) if isinstance(v, bytes) else [v])
        elif t == 'lf': out.extend(struct.unpack(f'<{len(v)//4}f', v))
        elif t == 'ld': out.extend(struct.unpack(f'<{len(v)//8}d', v))
    if t.startswith('l'): return out
    return out[0] if out else None
def load(path, name):
    sch = [x.split(':') for x in SCHEMA[name].split()]
    res = []
    for r in rows(path):
        d = {}
        for f, vs in r.items():
            if f <= len(sch):
                n, t = sch[f-1]; d[n] = conv(t, vs)
            else: d[f'_f{f}'] = vs
        res.append(d)
    return res
if __name__ == '__main__':
    name, path = sys.argv[2], sys.argv[3]
    rs = load(path, name)
    print(len(rs), 'rows', file=sys.stderr)
    for r in rs[:int(sys.argv[4]) if len(sys.argv) > 4 else None]: print(json.dumps(r, ensure_ascii=False))
