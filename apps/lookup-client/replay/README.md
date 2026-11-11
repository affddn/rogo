# SEA battle replay host

This is a local .NET 8 adapter for the SEA Android build 163, fight version `b1bbd7ba-20261104142719` and active RawPackage `2026-11-04-907`. It uses the actual `Cross.dll` simulation, not the guide's damage estimator. Don't point it at a different release or relax artifact checks. It does not connect to VMOS or the game server.

**Build:** obtain the matching base and install-time split APKs, the active hot-update RawPackage bundles, and the game assemblies described in [the lookup findings](../FINDINGS.md). Put GameProto.dll and Cross.dll in the lookup client's ignored bin directory. With UnityPy installed and the .NET 8 SDK available:

```sh
python3 prepare.py --base-apk /path/to/base.apk --split-apk /path/to/split_roginstalltime.apk --raw-package /path/to/Release/package/RawPackage --dotnet /path/to/dotnet
```

The installer hashes each required DLL or bundle before unpacking it. The local build, maps and config tables stay in ignored directories. At runtime the worker uses dotnet on PATH or the executable under DOTNET_ROOT. The synthetic fixture is a level-one test character, not an account capture. Run the offline tests from the lookup client directory with `uv run test_campaign.py` (set `ILSPYCMD` if necessary).

**One attempt:** the local worker takes the current stage from private bootstrap. A confirmed review starts that stage once. Only the correlated server reply supplies the fight ID, seed, round, combatants and attributes. The adapter builds the campaign report, initializes soldier data, runs the stock logic to a terminal state with no manual inputs, and returns its stats. The daily optimizer also selects the matching realm, MVP, World Boss, Guild Hunt or three-player Team PvE adapter; a guild settlement includes defeated phases and per-stage damage. The worker submits those stats for the same fight; the UI reports the **server** outcome. A timeout, version mismatch or broken simulation cannot turn into an invented loss/win or an automatic retry. If the fight started but no settlement was confirmed, reconnect to inspect the state.

For invitation-only dungeon assistance, the worker waits for the joined room’s start notification and uses the correlated 6004 fight inputs for every team member. It does not synthesize partners or submit a browser-supplied result. The normal operation endpoint still blocks arbitrary settlement commands.
