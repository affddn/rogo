import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

// One request in flight, no replay. A timeout after send has an unknown outcome.
export class RogoWorker {
  private child;
  private pending?: {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  };
  private buffer = "";
  private tail = "";
  ended = false;

  constructor(dir: string, script: string, args: string[]) {
    this.child = spawn("uv", ["run", "--script", script, ...args], {
      cwd: dir,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    });
    this.child.stdin.on("error", () => this.stop());
    this.child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      this.buffer += chunk;
      if (this.buffer.length > 8 * 1024 * 1024) return this.stop("response_too_large");
      const end = this.buffer.indexOf("\n");
      if (end < 0) return;
      const wait = this.pending;
      if (!wait || this.buffer.slice(end + 1).trim()) return this.stop("worker_protocol");
      try {
        const result: unknown = JSON.parse(this.buffer.slice(0, end));
        this.buffer = "";
        clearTimeout(wait.timer);
        this.pending = undefined;
        wait.resolve(result);
      } catch {
        this.stop("worker_protocol");
      }
    });
    this.child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      this.tail = (this.tail + chunk).slice(-128); // never relay subprocess stderr
    });
    this.child.once("error", () => this.stop("helper_unavailable"));
    this.child.once("close", () => {
      const code = this.tail.trim().split(/\s+/).pop() ?? "";
      this.stop(
        /^(schema_unavailable|device_unavailable|sign_in_timeout|realm_unavailable|gateway_rejected|snapshot_unavailable|snapshot_invalid)$/.test(
          code,
        )
          ? code
          : "session_closed",
      );
    });
  }

  receive(ms: number): Promise<unknown> {
    if (this.ended || this.pending) return Promise.reject(new Error("session_closed"));
    return new Promise((resolve, reject) => {
      this.pending = {
        resolve,
        reject,
        timer: setTimeout(() => this.stop("operation_timeout"), ms),
      };
    });
  }

  async operation(
    mode: "prepare" | "execute",
    command: number,
    payload: unknown,
    confirm?: string,
    once = false,
  ) {
    const id = randomUUID();
    const pending = this.receive(
      command === -9100 || command === -9101
        ? 225000
        : command === -5001
          ? 65000
          : once
            ? 45000
            : 18000,
    );
    this.child.stdin.write(JSON.stringify({ id, mode, command, payload, confirm }) + "\n");
    if (once) this.child.stdin.end();
    const reply = await pending;
    if (!isRecord(reply) || reply.id !== id || typeof reply.ok !== "boolean") {
      this.stop();
      throw new Error("worker_protocol");
    }
    if (!reply.ok)
      throw new Error(typeof reply.error === "string" ? reply.error : "operation_rejected");
    return reply.result;
  }

  stop(code = "session_closed") {
    if (this.ended) return;
    this.ended = true;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error(code));
      this.pending = undefined;
    }
    this.child.stdin.end();
    const pid = this.child.pid;
    if (pid && this.child.exitCode === null && this.child.signalCode === null) {
      try {
        if (process.platform === "win32") this.child.kill();
        else process.kill(-pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
    this.buffer = this.tail = "";
  }
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
