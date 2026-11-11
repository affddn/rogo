"""Build the local SEA campaign replay host from the operator's pinned game artifacts. Requires UnityPy and .NET 8."""
import argparse
import hashlib
from pathlib import Path
import subprocess
from zipfile import ZipFile
import UnityPy

HERE = Path(__file__).resolve().parent
BIN = HERE.parent / "bin"
DEST = BIN / "replay"
DLLS = {
    "DefaultEcs": "da479cd44542c440ee86e28787891af1ded18b7ab71eca1165b69eeaf75e2238",
    "Google.Protobuf": "faee53c8b1838d34a6889af683c779e533efc8d19cd3185372a553a6f204c9a5",
    "Newtonsoft.Json": "4d7e7629fdfe0607d37b5656e1f10e791b15e7ab88c765943b8ec593458031b3",
}
BUNDLES = {
    "fight": ("excelconfigsbytes_fight_9ea24a6ded9d1068f2349a10f610412c", "fd9cd08316db5a0f88d8c9bf84d1177a7514aa0028d061c0e517722f120a58fa"),
    "game": ("excelconfigsbytes_game_9c028c39b4102393fcb77239caabe43c", "07b7a8eab8c87fc7647d317e8a98c6f79da1f37e7baf047fae026d2d42471741"),
    "maps": ("mapconfig_0cc1a066f8e8cfe47cb8d0b8c39304cd", "826d2cd16c9b4a75545e87e2e0ee984170a59652f2136f924d29279aaa48f582"),
}

def checked(blob, sha):
    if hashlib.sha256(blob).hexdigest() != sha:
        raise ValueError("Artifact does not match the pinned SEA build")
    return blob

def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ("base-apk", "split-apk", "raw-package"):
        p.add_argument("--" + name, required=True, type=Path)
    p.add_argument("--dotnet", default="dotnet")
    a = p.parse_args()
    checked((BIN / "Cross.dll").read_bytes(), "cf05dab8321886d951667ef3facb4a83022d93efff4238b449d9e9e788bb8320")
    checked((BIN / "GameProto.dll").read_bytes(), "8005d3a3f193469a56d180ff94120e5aed2214d052a0e3c3d4e183db531b607b")
    DEST.mkdir(exist_ok=True)
    with ZipFile(a.base_apk) as apk:
        for name, digest in DLLS.items():
            (DEST / (name + ".dll")).write_bytes(checked(apk.read("assets/AotDll/" + name + ".dll.bytes"), digest))
    for folder, (stem, digest) in BUNDLES.items():
        file = "rawpackage_configs_" + stem + ".bundle"
        if folder == "maps":
            with ZipFile(a.split_apk) as apk:
                blob = apk.read("assets/package/RawPackage/" + file)
        else:
            blob = (a.raw_package / file).read_bytes()
        env = UnityPy.load(checked(blob, digest))
        dest = DEST / folder
        dest.mkdir(exist_ok=True)
        for key, obj in env.container.items():
            if obj.type.name == "TextAsset":
                data = obj.read().m_Script
                (dest / Path(key).name).write_bytes(data.encode("utf8", "surrogateescape") if isinstance(data, str) else data)
    subprocess.run([a.dotnet, "publish", str(HERE / "CampaignReplay.csproj"), "-c", "Release",
                    "-o", str(DEST / "host"), "-p:UseSharedCompilation=false", "-p:NuGetAudit=false"], check=True)
if __name__ == "__main__":
    main()
