import sys; sys.path.insert(0, sys.argv[1])
from pb import rows, packed
names = "entry campaign stage category name fightStage firstDownReward stageBg scene stagePic bgm monster difficulty idleExpBase idleExpJob idleItem idleNum idleDrop batterySavingMob checkMinBr autoNext rowid".split()
rs = rows(sys.argv[2])
print(len(rs), "rows")
for r in rs:
    d = {names[f-1]: (v[0] if len(v) == 1 else v) for f, v in r.items()}
    print(d.get('entry'), f"{d.get('campaign')}-{d.get('stage')}", 'cat', d.get('category'), 'fight', d.get('fightStage'), 'mon', d.get('monster',0), 'diff', d.get('difficulty'), 'minBr', d.get('checkMinBr',0), 'auto', d.get('autoNext',0))
