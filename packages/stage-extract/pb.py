import sys
def varint(b, i):
    r = s = 0
    while True:
        c = b[i]; i += 1
        r |= (c & 0x7f) << s; s += 7
        if c < 0x80: return r, i
def msg(b):
    i, out = 0, {}
    while i < len(b):
        k, i = varint(b, i); f, w = k >> 3, k & 7
        if w == 0: v, i = varint(b, i)
        elif w == 2:
            n, i = varint(b, i); v = bytes(b[i:i+n]); i += n
        elif w == 1: v = b[i:i+8]; i += 8
        elif w == 5: v = b[i:i+4]; i += 4
        else: raise ValueError(w)
        out.setdefault(f, []).append(v)
    return out
def packed(v):
    i, r = 0, []
    while i < len(v):
        x, i = varint(v, i); r.append(x)
    return r
def rows(path):
    top = msg(open(path, 'rb').read())
    return [msg(r) for r in top.get(1, [])]
