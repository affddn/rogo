import sys, os, UnityPy
src, out = sys.argv[1], sys.argv[2]
env = UnityPy.load(src)
os.makedirs(out, exist_ok=True)
n = 0
for path, obj in env.container.items():
    if obj.type.name != "TextAsset":
        continue
    d = obj.read()
    data = d.m_Script.encode("utf-8", "surrogateescape") if isinstance(d.m_Script, str) else bytes(d.m_Script)
    name = os.path.basename(path)
    open(os.path.join(out, name), "wb").write(data)
    n += 1
print(n, "files")
