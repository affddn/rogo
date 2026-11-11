// Own only the tunnel and ADB attachment created for this sync. Never run the gameplay bot.
import { execFile, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

const exec = promisify(execFile);
const serial = "localhost:15555";
async function adb(args: string[], timeout = 4000): Promise<string> {
  const { stdout } = await exec("adb", args, { timeout, maxBuffer: 4096 });
  return stdout.trim();
}
async function attached() {
  return (await adb(["-s", serial, "get-state"]).catch(() => "")) === "device";
}
async function attach() {
  await adb(["connect", serial]).catch(() => "");
  return attached();
}

export async function acquireDevice(root: string, configuredRealm: string) {
  let tunnel: ChildProcess | undefined;
  let ourAttachment = false;
  const release = async () => {
    if (ourAttachment) {
      ourAttachment = false;
      await adb(["disconnect", serial]).catch(() => {});
    }
    tunnel?.kill("SIGTERM");
    tunnel = undefined;
  };
  try {
    if (!(await attached())) {
      if (!(await attach())) {
        tunnel = spawn(path.join(root, "bin/rgo"), ["tunnel"], { cwd: root, stdio: "ignore" });
        let failed = false;
        tunnel.once("error", () => {
          failed = true;
        });
        let ready = false;
        const deadline = Date.now() + 16000;
        while (!failed && tunnel.exitCode === null && Date.now() < deadline) {
          await delay(550);
          if (await attach()) {
            ready = true;
            break;
          }
        }
        if (!ready) throw new Error("device_unavailable");
      }
      ourAttachment = true;
    }
    const pref =
      "/data/data/com.ggv.rogosea.aos/shared_prefs/com.ggv.rogosea.aos.v2.playerprefs.xml";
    const realm = await adb([
      "-s",
      serial,
      "shell",
      'sed -n \'s/.*<int name="ServerId" value="\\([0-9][0-9]*\\)".*/\\1/p\' ' + pref,
    ]).catch(() => "");
    if (realm && configuredRealm && realm !== configuredRealm) throw new Error("wrong_realm");
    const serverId = realm || configuredRealm;
    if (!/^[1-9]\d{0,17}$/.test(serverId)) throw new Error("realm_unknown");
    return { serial, serverId, release };
  } catch (error) {
    await release();
    throw error;
  }
}
