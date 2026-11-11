import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import path from "node:path";
import type { Plugin } from "vite-plus";
import { readCharacter } from "@rogo/game/connected-character";
import { OperationReview } from "./operation-review.ts";
import { acquireDevice } from "./vmos-device.ts";
import { isRecord, RogoWorker } from "./rogo-worker.ts";

const messages: Record<string, string> = {
  schema_unavailable:
    "The local schema is unavailable. Check GameProto.dll, .NET 8 and ROGO_ILSPYCMD.",
  helper_unavailable: "Install uv and the Connect Rogo prerequisites on the guide host.",
  device_unavailable:
    "VMOS is unavailable. Check adb, the local debug tunnel, and the bot build/configuration.",
  sign_in_timeout:
    "No fresh Rogo sign-in was seen. Check the official app on VMOS and select the intended account if prompted.",
  realm_unknown:
    "Couldn't determine the selected realm. Set ROGO_CONNECT_SERVER_ID on the guide host.",
  wrong_realm: "The selected VMOS realm differs from the configured realm.",
  realm_unavailable: "The selected realm did not return an available gateway.",
  gateway_rejected: "The game login didn't succeed. No automatic retry was made.",
  snapshot_unavailable: "Rogo did not return a matching character snapshot.",
  snapshot_invalid: "Rogo returned an unrecognized character identity or snapshot.",
  session_closed: "The gateway session has ended. Reconnect from Character to continue.",
  operation_timeout:
    "Timed out. An operation already sent may have taken effect; it wasn't retried.",
  response_too_large: "The gateway response exceeded the local size limit.",
  session_lost:
    "The game connection was lost. An operation already sent may have taken effect; do not replay it.",
  reply_too_large:
    "The operation returned more data than the helper can display. Do not send it again.",
  invalid_payload:
    "The payload does not match the request schema. Check field names, types and enum values.",
  confirmation_required: "Review this operation and explicitly confirm it before sending.",
  variant_blocked: "This payload requests a variant the local helper does not support.",
  routine_scan_expired:
    "The scan expired or the session changed. Scan again for current rewards and modes.",
  routine_one_mode_only: "Review each limited attempt or fight separately from reward claims.",
  campaign_stage_changed:
    "This is not the connected character’s current campaign stage. Review the current boss instead.",
  campaign_sync_required: "Reconnect to read the current campaign stage before another attempt.",
  replay_unavailable:
    "The SEA campaign engine is not ready on this computer. No fight was started.",
  campaign_unsettled:
    "The fight started but local simulation failed. No result was submitted; reconnect to check the stage.",
  campaign_inputs_changed:
    "The server started a fight with unexpected inputs or a different build. No result was submitted.",
  worker_protocol: "The local gateway helper returned an unexpected response.",
};

const localAddresses = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
function localOrigin(server: Server | null, req: IncomingMessage) {
  const addr = server?.address();
  const host = req.headers.host ?? "";
  if (
    !addr ||
    typeof addr === "string" ||
    !localAddresses.includes(addr.address) ||
    !localAddresses.includes(req.socket.remoteAddress ?? "") ||
    !/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host) ||
    Number(host.slice(host.lastIndexOf(":") + 1)) !== addr.port ||
    req.headers.forwarded ||
    req.headers["x-forwarded-for"] ||
    req.headers["x-forwarded-host"]
  )
    return false;
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== "http://" + host) return false;
  const site = req.headers["sec-fetch-site"];
  return (
    (!site || site === "same-origin" || (req.method === "GET" && site === "none")) &&
    (req.method !== "POST" || origin === "http://" + host)
  );
}
function send(res: ServerResponse, status: number, value: unknown) {
  if (!res.destroyed) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(value));
  }
}
async function body(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > 64 * 1024) throw new Error("bad_request");
    chunks.push(Buffer.from(chunk));
  }
  const v: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"), (_key, val) => {
    if (
      typeof val === "number" &&
      (!Number.isFinite(val) || (Number.isInteger(val) && !Number.isSafeInteger(val)))
    ) {
      throw new Error("unsafe_number");
    }
    return val;
  });
  if (!isRecord(v)) throw new Error("bad_request");
  return v;
}

function loadCatalog(dir: string) {
  const catalog = JSON.parse(readFileSync(path.join(dir, "catalog/actions.json"), "utf8"));
  const policy = JSON.parse(readFileSync(path.join(dir, "catalog/operation-policy.json"), "utf8"));
  return {
    build: catalog.build,
    notifications: catalog.notifications,
    actions: catalog.actions.map(
      (a: { request: { id: number }; evidence: string; effect: string }) => {
        const blocked = policy.blocked[a.request.id];
        const note =
          policy.conditional[a.request.id] ??
          (a.evidence === "schema-only" ? "No direct official sender found in this build." : null);
        return {
          ...a,
          availability: blocked ? "blocked" : note ? "conditional" : "available",
          reason: blocked ?? note,
        };
      },
    ),
  };
}

export function rogoBridge(): Plugin {
  const enabled = process.env.ROGO_CONNECT === "1";
  const configuredRealm = process.env.ROGO_CONNECT_SERVER_ID ?? "";
  const ilspy = process.env.ROGO_ILSPYCMD || "ilspycmd";
  return {
    name: "local-rogo-operations",
    apply: "serve",
    config: () =>
      enabled
        ? {
            server: {
              headers: {
                "X-Frame-Options": "DENY",
                "Content-Security-Policy": "frame-ancestors 'none'",
              },
            },
          }
        : {},
    configureServer(server) {
      const root = path.resolve(server.config.root, "../..");
      const dir = path.join(root, "apps/lookup-client");
      const review = new OperationReview();
      let session: RogoWorker | undefined;
      let owner = "",
        activeRealm = "",
        activeName = "";
      let busy = false,
        closed = false,
        lastSend = 0,
        lastLogin = 0;
      let idle: NodeJS.Timeout | undefined;
      function stop() {
        clearTimeout(idle);
        review.clear();
        session?.stop();
        session = undefined;
        owner = activeRealm = activeName = "";
      }
      function keepAlive() {
        clearTimeout(idle);
        idle = setTimeout(stop, 5 * 60 * 1000);
        idle.unref();
      }
      server.httpServer?.once("close", () => {
        closed = true;
        stop();
      });
      server.middlewares.use(async (req, res, next) => {
        const route = req.url?.split("?")[0];
        if (!route?.startsWith("/api/rogo/")) return next();
        if (!localOrigin(server.httpServer as Server, req))
          return send(res, 403, { error: "Local guide origin required." });
        const isOwner = () =>
          !!owner && (req.headers.cookie ?? "").split(/;\s*/).includes("rogo_local=" + owner);
        const isConnected = () => !!session && !session.ended;
        if (req.method === "GET" && route === "/api/rogo/status")
          return send(res, 200, {
            available: enabled,
            connected: isConnected() && isOwner(),
            characterName: isOwner() && isConnected() ? activeName : undefined,
            serverId: isOwner() ? activeRealm : configuredRealm,
          });
        if (req.method === "GET" && route === "/api/rogo/catalog") {
          try {
            return send(res, 200, loadCatalog(dir));
          } catch {
            return send(res, 503, { error: "Operation catalog unavailable." });
          }
        }
        if (!enabled)
          return send(res, 503, {
            error: "Start the guide with ROGO_CONNECT=1 on a loopback address.",
          });
        if (route !== "/api/rogo/operations" || req.method !== "POST")
          return send(res, 404, { error: "Unknown operation endpoint." });
        if (
          req.headers["x-rogo-connect"] !== "1" ||
          req.headers["content-type"]?.split(";")[0] !== "application/json"
        )
          return send(res, 403, { error: "A same-origin JSON operation is required." });
        let input: Record<string, unknown>;
        try {
          input = await body(req);
        } catch {
          return send(res, 400, { error: "Invalid or oversized JSON. Quote large integer IDs." });
        }
        if (busy) return send(res, 409, { error: "Another operation is in progress." });
        busy = true;
        const connected = isConnected(),
          owns = isOwner();
        try {
          if (input.operation === "character.sync") {
            if (connected && !owns)
              return send(res, 409, { error: "A different browser owns the active game session." });
            if (Date.now() - lastLogin < 10000)
              return send(res, 429, { error: "Wait a few seconds before reconnecting." });
            lastLogin = Date.now();
            stop();
            const device = await acquireDevice(root, configuredRealm);
            try {
              if (closed || res.destroyed) return;
              session = new RogoWorker(dir, "connect_character.py", [
                "--serve-ops",
                "--relaunch",
                "--adb",
                device.serial,
                "--server-id",
                device.serverId,
                "--ilspycmd",
                ilspy,
              ]);
              const dropped = () => {
                if (!res.writableEnded) stop();
              };
              res.once("close", dropped);
              const raw = await session.receive(150000);
              const character = readCharacter(raw);
              if (character.serverId !== device.serverId) throw new Error("snapshot_invalid");
              if (closed || res.destroyed) {
                stop();
                return;
              }
              owner = randomBytes(32).toString("hex");
              activeRealm = character.serverId;
              activeName = character.name;
              res.setHeader(
                "Set-Cookie",
                "rogo_local=" + owner + "; HttpOnly; SameSite=Strict; Path=/api/rogo",
              );
              keepAlive();
              send(res, 200, { character });
            } catch (e) {
              stop();
              throw e;
            } finally {
              await device.release();
            }
          } else if (input.operation === "session.disconnect") {
            if (!owns) return send(res, 403, { error: "No session owned by this browser." });
            stop();
            res.setHeader(
              "Set-Cookie",
              "rogo_local=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/api/rogo",
            );
            return send(res, 200, { disconnected: true });
          } else if (
            input.operation === "routine.scan" ||
            input.operation === "routine.prepare" ||
            input.operation === "routine.run"
          ) {
            if (!connected || !owns)
              return send(res, 403, { error: "Connect this browser to your character first." });
            const scan = input.operation === "routine.scan",
              execute = input.operation === "routine.run";
            const payload = input.payload;
            if (!isRecord(payload))
              return send(res, 400, { error: "Expected a routine selection." });
            if (
              execute &&
              (input.confirm !== "routine.run" || !review.consume(input.ticket, -9101, payload))
            )
              return send(res, 409, { error: "Review these actions again before running them." });
            if (scan) review.clear();
            keepAlive();
            const result = await session!.operation(
              execute ? "execute" : "prepare",
              scan ? -9100 : -9101,
              payload,
              execute ? "routine.run" : undefined,
            );
            const ticket =
              !scan && !execute && isRecord(result) && isRecord(result.normalized)
                ? review.issue(-9101, result.normalized)
                : undefined;
            return send(res, 200, { result, ticket });
          } else if (
            input.operation === "campaign.prepare" ||
            input.operation === "campaign.retry"
          ) {
            if (!connected || !owns)
              return send(res, 403, { error: "Connect this browser to your character first." });
            if (!isRecord(input.payload))
              return send(res, 400, { error: "Expected a campaign payload." });
            const execute = input.operation === "campaign.retry";
            if (
              execute &&
              (input.confirm !== "campaign.retry" ||
                !review.consume(input.ticket, -5001, input.payload))
            )
              return send(res, 409, {
                error: "Review this character’s current stage again before retrying.",
              });
            keepAlive();
            const result = await session!.operation(
              execute ? "execute" : "prepare",
              -5001,
              input.payload,
              execute ? "campaign.retry" : undefined,
            );
            const ticket =
              !execute && isRecord(result) && isRecord(result.normalized)
                ? review.issue(-5001, result.normalized)
                : undefined;
            return send(res, 200, { result, ticket });
          } else if (
            input.operation === "gateway.prepare" ||
            input.operation === "gateway.execute"
          ) {
            const execute = input.operation === "gateway.execute";
            if (
              typeof input.command !== "number" ||
              !Number.isSafeInteger(input.command) ||
              input.command <= 0 ||
              !isRecord(input.payload) ||
              (input.confirm !== undefined && typeof input.confirm !== "string")
            )
              return send(res, 400, { error: "Expected a request ID and a protobuf JSON object." });
            const confirm = typeof input.confirm === "string" ? input.confirm : undefined;
            if (execute && (!connected || !owns))
              return send(res, 403, { error: "Connect this browser to your character first." });
            if (execute && Date.now() - lastSend < 1000)
              return send(res, 429, { error: "Please wait before another gateway operation." });
            // A read is confirmed by the UI too, but only known reads may be scripted without a review ticket.
            if (execute) {
              const policy = loadCatalog(dir).actions.find(
                (a: { request: { id: number } }) => a.request.id === input.command,
              );
              if (!policy || policy.availability === "blocked")
                return send(res, 403, { error: "This operation cannot be sent." });
              if (
                (policy.effect !== "read" || policy.evidence === "schema-only") &&
                !review.consume(input.ticket, input.command, input.payload)
              ) {
                return send(res, 409, {
                  error: "Validate the current payload on this session again before sending it.",
                });
              }
              lastSend = Date.now();
            }
            const cold = !(connected && owns);
            const worker = cold
              ? new RogoWorker(dir, "gateway_ops.py", ["--prepare", "--ilspycmd", ilspy])
              : session!;
            try {
              if (!cold) keepAlive();
              const result = await worker.operation(
                execute ? "execute" : "prepare",
                input.command,
                input.payload,
                confirm,
                cold,
              );
              const ticket =
                !cold && !execute && isRecord(result) && result.requiresConfirmation === true
                  ? review.issue(input.command, input.payload)
                  : undefined;
              return send(res, 200, { result, ticket });
            } finally {
              if (cold) worker.stop();
            }
          } else return send(res, 400, { error: "Unrecognized operation." });
        } catch (e) {
          const code = e instanceof Error ? e.message : "";
          const safe =
            messages[code] ||
            (/^[a-z][a-z_0-9]{1,65}$/.test(code) ? code.replaceAll("_", " ") : "Operation failed");
          return send(res, 422, { error: safe });
        } finally {
          busy = false;
        }
      });
    },
  };
}
