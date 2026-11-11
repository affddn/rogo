"""Decode every config table to JSON, with schemas read from the decompiled C#.

usage: python3 -I export_tables.py <decompiled Cross dir> <tables dir> <out dir>

<decompiled Cross dir> is ilspycmd's project output for Cross.dll (has excelConfig/ and
excelConfig.pb/). <tables dir> holds the TextAssets from the excelconfigsbytes bundles,
any depth. Writes <out>/tables/<name>.json (list of rows), <out>/enums.json and
<out>/schemas.json.
"""
import json
import os
import re
import struct
import sys

SRC, TABLES, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
PB = os.path.join(SRC, 'excelConfig.pb')
CFG = os.path.join(SRC, 'excelConfig')

SCALAR = {'ReadInt32': 'int32', 'ReadUInt64': 'uint64', 'ReadBool': 'bool', 'ReadFloat': 'float',
          'ReadDouble': 'double', 'ReadString': 'string', 'ReadEnum': 'enum'}
CODEC = {'ForInt32': 'int32', 'ForFloat': 'float', 'ForDouble': 'double', 'ForString': 'string',
         'ForEnum': 'enum', 'ForMessage': 'message'}


def read(p):
    return open(p, encoding='utf-8', errors='replace').read()


def merge_body(text):
    i = text.find('void IBufferMessage.InternalMergeFrom')
    if i < 0:
        return None
    j = text.find('\n\t}\n', i)
    return text[i:j]


def parse_message(text):
    """field number -> {name, type, repeated, msg?, enum?}"""
    body = merge_body(text)
    if body is None:
        return None
    codecs = {}
    for m in re.finditer(r'FieldCodec<([\w.]+)> (_repeated_\w+_codec) = FieldCodec\.(\w+)', text):
        codecs[m.group(2)] = (m.group(3), m.group(1))
    fields = {}
    # split into case groups: labels followed by a body up to the next label run
    single = re.search(r'if \(num != (\d+)\)', body)
    if single and 'case ' not in body:  # one-field messages compile to if/else, not switch
        body = f'case {single.group(1)}u:' + body[body.index('else'):]
    parts = re.split(r'((?:\s*case \d+u:)+)', body)
    for k in range(1, len(parts), 2):
        tags = [int(t) for t in re.findall(r'case (\d+)u:', parts[k])]
        code = parts[k + 1]
        num = tags[0] >> 3
        m = re.search(r'(\w+)_\.AddEntriesFrom\(ref input, (_repeated_\w+_codec)\)', code)
        if m:
            kind, typ = codecs[m.group(2)]
            f = {'name': m.group(1), 'type': CODEC[kind], 'repeated': True}
            if kind == 'ForMessage':
                f['msg'] = typ.split('.')[-1]
            if kind == 'ForEnum':
                f['enum'] = typ.split('.')[-1]
            fields[num] = f
            continue
        m = re.search(r'(\w+) = (?:\((\w+)\))?\(\(ParseContext\)\(ref input\)\)\.(Read\w+)\(\)', code)
        if m:
            f = {'name': m.group(1), 'type': SCALAR[m.group(3)], 'repeated': False}
            if m.group(2):
                f['enum'] = m.group(2)
            fields[num] = f
            continue
        m = re.search(r'new (\w+)\(\)', code)
        if m and 'ReadMessage' in code:
            name = re.search(r'\n\s*(\w+) = \w+;', code) or re.search(r'(\w+) = new \w+\(\)', code)
            fields[num] = {'name': name.group(1), 'type': 'message', 'msg': m.group(1), 'repeated': False}
            continue
        if code.strip().startswith('_unknownFields') or not code.strip():
            continue
        raise ValueError(f'unparsed case {tags}: {code[:200]}')
    return fields


def parse_enums(text):
    out = {}
    for m in re.finditer(r'public enum (\w+)\s*\{(.*?)\n\}', text, re.S):
        vals = {}
        for v in re.finditer(r'(\w+) = (-?\d+)', m.group(2)):
            vals[int(v.group(2))] = v.group(1)
        out[m.group(1)] = vals
    return out


schemas, enums = {}, {}
for fn in sorted(os.listdir(PB)):
    if not fn.endswith('.cs'):
        continue
    t = read(os.path.join(PB, fn))
    enums.update(parse_enums(t))
    m = re.search(r'public sealed class (\w+)', t)
    if m:
        s = parse_message(t)
        if s is not None:
            schemas[m.group(1)] = s

table_class = {}
for fn in os.listdir(CFG):
    if fn.endswith('_Table.cs'):
        m = re.search(r'TableName = "([^"]+)"', read(os.path.join(CFG, fn)))
        if m:
            table_class[m.group(1)] = fn[:-len('_Table.cs')].replace('_', '') + 'Table'


def varint(b, i):
    r = s = 0
    while True:
        c = b[i]
        i += 1
        r |= (c & 0x7f) << s
        s += 7
        if c < 0x80:
            return r, i


def signed(v, bits):
    return v - (1 << 64) if v >= 1 << 63 else v


def decode(msg_name, b):
    sch = schemas[msg_name]
    out = {}
    i = 0
    while i < len(b):
        key, i = varint(b, i)
        num, wt = key >> 3, key & 7
        if wt == 0:
            raw, i = varint(b, i)
        elif wt == 1:
            raw = b[i:i + 8]
            i += 8
        elif wt == 5:
            raw = b[i:i + 4]
            i += 4
        elif wt == 2:
            n, i = varint(b, i)
            raw = b[i:i + n]
            i += n
        else:
            raise ValueError(f'wire type {wt} in {msg_name}')
        f = sch.get(num)
        if f is None:
            out.setdefault(f'_{num}', []).append(raw.hex() if isinstance(raw, bytes) else raw)
            continue
        vals = scalar_values(f, wt, raw)
        if f['repeated']:
            out.setdefault(f['name'], []).extend(vals)
        else:
            out[f['name']] = vals[0]
    return out


def scalar_values(f, wt, raw):
    t = f['type']
    if t == 'message':
        return [decode(f['msg'], raw)]
    if t == 'string':
        return [raw.decode('utf-8', 'replace')]
    if wt == 2:  # packed
        if t == 'float':
            return list(struct.unpack(f'<{len(raw) // 4}f', raw))
        if t == 'double':
            return list(struct.unpack(f'<{len(raw) // 8}d', raw))
        res, j = [], 0
        while j < len(raw):
            v, j = varint(raw, j)
            res.append(signed(v, 64))
        return res
    if t == 'float':
        return [struct.unpack('<f', raw)[0]]
    if t == 'double':
        return [struct.unpack('<d', raw)[0]]
    if t == 'bool':
        return [bool(raw)]
    return [signed(raw, 64)]


def clean(v):
    if isinstance(v, float):
        r = round(v, 6)
        return int(r) if r == int(r) and abs(r) < 1e15 else r
    if isinstance(v, list):
        return [clean(x) for x in v]
    if isinstance(v, dict):
        return {k: clean(x) for k, x in v.items()}
    return v


os.makedirs(os.path.join(OUT, 'tables'), exist_ok=True)
done, missing = [], []
for root, _, files in os.walk(TABLES):
    for fn in files:
        if not fn.endswith('.bytes'):
            continue
        name = fn[:-6]
        cls = table_class.get(name)
        if cls not in schemas:
            missing.append(name)
            continue
        table = decode(cls, open(os.path.join(root, fn), 'rb').read())
        rows = next(iter(table.values()), []) if table else []
        json.dump(clean(rows), open(os.path.join(OUT, 'tables', name + '.json'), 'w'), ensure_ascii=False,
                  separators=(',', ':'))
        done.append((name, len(rows)))
json.dump({k: {str(n): v for n, v in s.items()} for k, s in schemas.items()},
          open(os.path.join(OUT, 'schemas.json'), 'w'), indent=1)
json.dump(enums, open(os.path.join(OUT, 'enums.json'), 'w'), ensure_ascii=False)
print(f'{len(done)} tables, {sum(n for _, n in done)} rows; no schema for: {missing}')
