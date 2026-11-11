"""Export every card as a compact JSON record.
usage: python3 -I export_cards.py <tables_dir> <out.json>
Record: {id,name,quality,slot,slotName,mvp,maxStar,
         stars:[{star,dupCost,equip:{attrKey:value},brand:{id,text}|null,inv:{attrKey:value}}]}
attrKey is "<id>:<KeyEn>" so a planner can parse the id and read the layer from the name."""
import json, os, re, sys
T, OUT = sys.argv[1], sys.argv[2]
def load(n): return json.load(open(os.path.join(T, n + '.json')))
lang = {r['Id']: r.get('Text', '') for r in load('lang_en')}
fa = {r['EnumValue']: r['KeyEn'] for r in load('fight_attr')}
fb = {r['Entry']: r for r in load('fight_brand')}
def key(a): return f"{a}:{fa.get(a, '?')}"
def fill(text, args):
    return re.sub(r'%\{(\d+)\}', lambda m: str(args[int(m.group(1)) - 1]) if int(m.group(1)) <= len(args) else m.group(0), text)
ups = {}
for r in load('card_upgrade'): ups.setdefault(r['CardEntry'], []).append(r)
out = []
for c in sorted(load('card_info'), key=lambda r: r['Entry']):
    rows = sorted(ups.get(c['Entry'], []), key=lambda r: r['Star'])
    stars = []
    for r in rows:
        b = fb.get(r['EquipedBrand'])
        stars.append({
            'star': r['Star'], 'dupCost': r['DuplicateCostNum'],
            'equip': {key(a): v for a, v in zip(r['equipedAttr'], r['equipedAttrNum'])},
            'brand': None if not b else {'id': b['Entry'], 'text': fill(lang.get(b['Description'], ''), b.get('desArg', []))},
            'inv': {key(a): v for a, v in zip(r['inventoryAttr'], r['inventoryAttrNum'])},
        })
    out.append({'id': c['Entry'], 'name': lang.get(c['Name'], c['Name']), 'quality': c['Quality'],
                'slot': c['CardSlotCategory'], 'slotName': lang.get(f"card_slot_category_{c['CardSlotCategory']}", ''),
                'mvp': c['IsMvp'], 'maxStar': len(rows), 'stars': stars})
json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
print(len(out), 'cards ->', OUT)
