import type { Receipt, Review, Run, Scan, Step } from "./daily-types.ts";

export type AutoOptions = {
  mode: "rewards" | "sweeps" | "fights";
  shops: boolean;
  maxActions: number;
  campaignStages?: number;
  stats?: "off" | "unused" | "rebuild";
  advanceClass?: boolean;
  targetSpec?: number;
  assist?: boolean;
};
export type AutoPlan = {
  initial: Scan;
  options: AutoOptions;
  sweepLimits: Record<string, number>;
  fightGroups: string[];
  buildGoal?: { spec: number; line: number; name: string };
  campaignStart?: number;
  assistDay?: string;
  assistLimit: number;
};
export type AutoProgress = {
  status: "running" | "complete" | "stopped";
  message: string;
  receipts: Receipt[];
  current?: Step;
  scan: Scan;
};
export type AutoTransport = {
  scan: () => Promise<Scan>;
  prepare: (scan: Scan, step: Step) => Promise<Review>;
  execute: (review: Review) => Promise<Run>;
};
export const MAX_AUTO_ACTIONS = 40;
export const MAX_CAMPAIGN_STAGES = 10;
export const MAX_AUTO_MS = 10 * 60 * 1000;

export function hasAutoIdentity(scan: Scan) {
  return !!scan.sessionId && !!scan.character.id && scan.steps.every((s) => !!s.revision);
}
export function fightEligible(step: Step) {
  return (
    (step.kind === "fight" || step.kind === "duel") &&
    !!step.autoGroup &&
    step.autoGroup !== "campaign" &&
    (step.powerRatio != null ? step.powerRatio >= 1 : ["guild", "world"].includes(step.autoGroup))
  );
}
export function makeAutoPlan(initial: Scan, options: AutoOptions): AutoPlan {
  if (!hasAutoIdentity(initial))
    throw new Error("Reconnect and scan to use the updated Auto run helper.");
  if (
    !Number.isInteger(options.maxActions) ||
    options.maxActions < 1 ||
    options.maxActions > MAX_AUTO_ACTIONS
  )
    throw new Error(`Choose an action limit between 1 and ${MAX_AUTO_ACTIONS}.`);
  if (options.assist && initial.dungeon === undefined)
    throw new Error("Reconnect and scan to enable the updated dungeon-assist helper.");
  const assistDay =
    options.assist && initial.dungeon?.eligible ? (initial.dungeon.day ?? undefined) : undefined;
  const campaignStages = options.campaignStages ?? 0;
  if (
    !Number.isInteger(campaignStages) ||
    campaignStages < 0 ||
    campaignStages > MAX_CAMPAIGN_STAGES
  )
    throw new Error(`Choose between 0 and ${MAX_CAMPAIGN_STAGES} campaign bosses.`);
  let buildGoal: AutoPlan["buildGoal"];
  if ((options.stats && options.stats !== "off") || options.advanceClass || options.targetSpec) {
    const build = initial.character.build;
    if (!build) throw new Error("Reconnect and scan to read the current class and stat points.");
    const target = options.targetSpec || build.spec;
    const choice = build.choices.find((c) => c.spec === target);
    if (!choice || !choice.available)
      throw new Error("That class branch is not unlocked in this scan.");
    buildGoal = { spec: target, line: choice.line, name: choice.name };
  }
  const campaignStart = campaignStages
    ? (initial.steps.find((s) => s.autoGroup === "campaign")?.stageEntry ?? undefined)
    : undefined;
  const sweepLimits: Record<string, number> = {};
  const fights = new Set<string>();
  for (const step of initial.steps) {
    if (
      options.mode !== "rewards" &&
      step.kind === "sweep" &&
      step.autoGroup &&
      (step.available ?? 0) > 0
    )
      sweepLimits[step.autoGroup] = Math.min(options.maxActions, step.available!);
    if (options.mode === "fights" && fightEligible(step)) fights.add(step.autoGroup!);
  }
  return {
    initial,
    options: { ...options, campaignStages },
    sweepLimits,
    fightGroups: [...fights],
    buildGoal,
    campaignStart,
    assistDay,
    assistLimit: assistDay ? (initial.dungeon?.remaining ?? 0) : 0,
  };
}

type Usage = {
  seen: Set<string>;
  sweeps: Map<string, number>;
  previousAttempts: Map<string, number>;
  fights: Set<string>;
  rebuilds: Set<number>;
  campaignCount: number;
  assistAccepts: number;
  campaignNext?: number | null;
};
export function stamp(step: Step) {
  return `${step.key}:${step.revision}`;
}
function buildCandidates(scan: Scan, plan: AutoPlan, usage: Usage, unseen: Step[]) {
  const goal = plan.buildGoal,
    current = scan.character.build;
  if (!goal || !current) return [];
  const rows = unseen.filter((s) => s.kind === "build" && s.development?.line === goal.line);
  if (current.line !== goal.line)
    return rows.filter(
      (s) =>
        s.development?.type === "class" ||
        (current.line === 100 && s.development?.type === "advance"),
    );
  if (current.spec !== goal.spec)
    return rows.filter((s) => s.development?.type === "spec" && s.development.spec === goal.spec);
  const advance = plan.options.advanceClass
    ? rows.filter((s) => s.development?.type === "advance")
    : [];
  const rebuild =
    plan.options.stats === "rebuild" && !usage.rebuilds.has(current.spec)
      ? rows.filter((s) => s.development?.type === "rebuild")
      : [];
  const stats =
    plan.options.stats && plan.options.stats !== "off"
      ? rows.filter((s) => s.development?.type === "stats")
      : [];
  return [...advance, ...(rebuild.length ? rebuild : stats)];
}
function goalPending(scan: Scan, plan: AutoPlan) {
  return (
    !!plan.buildGoal &&
    (scan.character.build?.spec !== plan.buildGoal.spec ||
      scan.character.build?.line !== plan.buildGoal.line)
  );
}
function candidates(scan: Scan, plan: AutoPlan, usage: Usage) {
  const unseen = scan.steps.filter((s) => !usage.seen.has(stamp(s)));
  const claims = unseen.filter((s) => s.kind === "claim");
  const offers = plan.options.shops ? unseen.filter((s) => s.kind === "offer") : [];
  const fights = unseen
    .filter(
      (s) =>
        fightEligible(s) &&
        plan.fightGroups.includes(s.autoGroup!) &&
        !usage.fights.has(s.autoGroup!),
    )
    .sort((a, b) => (b.powerRatio ?? 0) - (a.powerRatio ?? 0));
  // Sweeps can deliberately repeat a confirmed request, but only against a fresh scan and a fixed budget.
  const sweeps = scan.steps.filter(
    (s) =>
      s.kind === "sweep" &&
      !!s.autoGroup &&
      (usage.sweeps.get(s.autoGroup) ?? 0) < (plan.sweepLimits[s.autoGroup] ?? 0) &&
      (s.available ?? 0) > 0 &&
      (s.available ?? 0) < (usage.previousAttempts.get(s.autoGroup) ?? Infinity),
  );
  const assist =
    usage.assistAccepts < plan.assistLimit &&
    plan.assistDay &&
    scan.dungeon?.eligible &&
    scan.dungeon.day === plan.assistDay &&
    scan.dungeon.remaining > 0
      ? unseen.filter((s) => s.kind === "assist" && s.assist?.day === plan.assistDay)
      : [];
  const watch = assist.filter((s) => s.assist?.type === "watch");
  const joins = assist.filter((s) => s.assist?.type === "join");
  const development = buildCandidates(scan, plan, usage, unseen);
  const campaign = scan.steps.filter(
    (s) =>
      s.autoGroup === "campaign" &&
      !usage.seen.has(stamp(s)) &&
      usage.campaignCount < (plan.options.campaignStages ?? 0) &&
      s.stageEntry === usage.campaignNext,
  );
  // Do not fight on an unintended class while the requested branch cannot be reached.
  return [
    ...watch,
    ...claims,
    ...offers,
    ...development,
    ...(goalPending(scan, plan) ? [] : [...joins, ...campaign, ...fights, ...sweeps]),
  ];
}
export function previewAuto(plan: AutoPlan) {
  const rows = candidates(plan.initial, plan, {
    seen: new Set(),
    sweeps: new Map(),
    previousAttempts: new Map(),
    fights: new Set(),
    rebuilds: new Set(),
    campaignCount: 0,
    assistAccepts: 0,
    campaignNext: plan.campaignStart,
  });
  // Several Arena opponents are alternatives, not several authorized fights.
  const groups = new Set<string>();
  return rows.filter((s) => {
    if (s.kind !== "fight" && s.kind !== "duel") return true;
    if (groups.has(s.autoGroup!)) return false;
    groups.add(s.autoGroup!);
    return true;
  });
}

function waitForInvite(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, 10_000);
    signal.addEventListener("abort", done, { once: true });
  });
}

export async function runAuto(
  plan: AutoPlan,
  transport: AutoTransport,
  signal: AbortSignal,
  update: (progress: AutoProgress) => void,
  now: () => number = Date.now,
  wait: (signal: AbortSignal) => Promise<void> = waitForInvite,
): Promise<AutoProgress> {
  const started = now();
  const usage: Usage = {
    seen: new Set(),
    sweeps: new Map(),
    previousAttempts: new Map(),
    fights: new Set(),
    rebuilds: new Set(),
    campaignCount: 0,
    assistAccepts: 0,
    campaignNext: plan.campaignStart,
  };
  const receipts: Receipt[] = [];
  let scan = plan.initial;
  let expectedBuild = plan.initial.character.build
    ? { career: plan.initial.character.build.career, spec: plan.initial.character.build.spec }
    : undefined;
  let phase: "scan" | "prepare" | "execute" = "scan";
  let current: Step | undefined;
  const publish = (status: AutoProgress["status"], message: string) => {
    const value = { status, message, receipts: [...receipts], scan, current };
    update(value);
    return value;
  };
  const stopReason = () =>
    signal.aborted
      ? "Stopped. No further actions will be sent."
      : now() - started >= MAX_AUTO_MS
        ? "Reached the 10-minute limit. Review a new run to continue."
        : receipts.length >= plan.options.maxActions
          ? "Reached the action limit. Review a new run to continue."
          : null;
  try {
    while (true) {
      const stop = stopReason();
      if (stop) return publish("stopped", stop);
      phase = "scan";
      current = undefined;
      publish("running", "Checking current rewards and attempts…");
      const fresh = await transport.scan();
      if (
        !hasAutoIdentity(fresh) ||
        fresh.sessionId !== plan.initial.sessionId ||
        fresh.character.id !== plan.initial.character.id ||
        fresh.character.realm !== plan.initial.character.realm
      )
        return publish("stopped", "The character or game session changed. Nothing else was sent.");
      if (
        expectedBuild &&
        (!fresh.character.build ||
          fresh.character.build.career !== expectedBuild.career ||
          fresh.character.build.spec !== expectedBuild.spec)
      )
        return publish(
          "stopped",
          "The class or specialization changed outside this run. Review the build again before continuing.",
        );
      if (plan.assistDay && fresh.dungeon?.day !== plan.assistDay)
        return publish(
          "stopped",
          "The server's dungeon day changed. Review a new run before accepting more invitations.",
        );
      if (plan.assistDay && !fresh.dungeon?.eligible)
        return publish(
          "stopped",
          fresh.dungeon?.reason ??
            "Dungeon eligibility changed. No more invitations will be accepted.",
        );
      if (
        usage.campaignCount > 0 &&
        usage.campaignCount < (plan.options.campaignStages ?? 0) &&
        usage.campaignNext &&
        fresh.steps.find((s) => s.autoGroup === "campaign")?.stageEntry !== usage.campaignNext
      )
        return publish(
          "stopped",
          "Campaign stage did not advance as expected. The same boss will not be retried.",
        );
      scan = fresh;
      const afterScan = stopReason();
      if (afterScan) return publish("stopped", afterScan);
      current = candidates(scan, plan, usage)[0];
      if (!current) {
        if (goalPending(scan, plan))
          return publish(
            "stopped",
            "The selected class branch could not be reached. No combat was started on a different build.",
          );
        if (
          usage.assistAccepts < plan.assistLimit &&
          plan.assistDay &&
          scan.dungeon?.eligible &&
          scan.dungeon.watching &&
          scan.dungeon.remaining > 0
        ) {
          publish(
            "running",
            `Waiting for an eligible dungeon invite · ${scan.dungeon.used}/5 assists confirmed today, ${scan.dungeon.reserved} reserved. Keep this page open.`,
          );
          await wait(signal);
          continue;
        }
        const pending = scan.steps.some((s) => s.kind === "claim" && usage.seen.has(stamp(s)));
        return publish(
          "complete",
          pending
            ? "Finished this plan. Previously processed claims still appear in the scan; they were not repeated."
            : "Finished. No further eligible actions remain within this plan.",
        );
      }
      phase = "prepare";
      publish("running", `Checking ${current.title}…`);
      const review = await transport.prepare(scan, current);
      const checked = review.steps[0];
      if (
        !review.ticket ||
        review.steps.length !== 1 ||
        review.normalized.scanId !== scan.scanId ||
        review.normalized.keys.length !== 1 ||
        review.normalized.keys[0] !== current.key ||
        checked.key !== current.key ||
        checked.revision !== current.revision ||
        checked.kind !== current.kind ||
        checked.command !== current.command
      )
        return publish(
          "stopped",
          "The reviewed action changed. Nothing was sent; scan and review again.",
        );
      const beforeSend = stopReason();
      if (beforeSend) return publish("stopped", beforeSend);
      phase = "execute";
      publish("running", `Running ${current.title}…`);
      // Reserve before sending: transport failures never cause a retry or an automatic reconnect.
      usage.seen.add(stamp(current));
      if (current.kind === "sweep") {
        usage.sweeps.set(current.autoGroup!, (usage.sweeps.get(current.autoGroup!) ?? 0) + 1);
        usage.previousAttempts.set(current.autoGroup!, current.available!);
      }
      if (current.autoGroup === "campaign") {
        usage.campaignCount += 1;
        usage.campaignNext = current.nextStage;
      } else if (current.kind === "fight" || current.kind === "duel")
        usage.fights.add(current.autoGroup!);
      const result = await transport.execute(review);
      if (
        result.receipts.length !== 1 ||
        result.notRun !== 0 ||
        result.receipts[0].command !== current.command
      )
        return publish(
          "stopped",
          "The helper returned an incomplete receipt. Check game state before another run; nothing was retried.",
        );
      const receipt = {
        ...result.receipts[0],
        title: current.title,
        note: result.receipts[0].note,
      };
      receipts.push(receipt);
      if (current.assist?.type === "join" && receipt.substeps?.some((s) => s.command === 4303))
        usage.assistAccepts += 1;
      if (receipt.status === "confirmed" && current.development) {
        const change = current.development;
        if (change.type === "rebuild") usage.rebuilds.add(change.spec);
        if (["class", "advance", "spec"].includes(change.type)) {
          if (
            !receipt.buildState ||
            receipt.buildState.career !== change.career ||
            (change.type === "spec" && receipt.buildState.spec !== change.spec)
          )
            return publish(
              "stopped",
              "Class change receipt is incomplete. Inspect your character before another action.",
            );
          expectedBuild = receipt.buildState;
        }
      }
      publish("running", `${current.title}: ${receipt.status}.`);
      if (receipt.status !== "confirmed" && receipt.status !== "skipped")
        return publish(
          "stopped",
          receipt.note ??
            "The server did not confirm this action. The run stopped without retrying.",
        );
      if (receipt.won === false)
        return publish("stopped", "The fight ended in defeat. No further attempts were used.");
      // A skipped sweep must not consume the rest of its budget against unchanged state.
      if (current.kind === "sweep" && receipt.status === "skipped")
        usage.sweeps.set(current.autoGroup!, plan.sweepLimits[current.autoGroup!]);
    }
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "The local helper could not complete the request.";
    return publish(
      "stopped",
      phase === "execute"
        ? `Outcome uncertain for ${current?.title ?? "this action"}. Do not repeat it before checking game state. ${reason}`
        : `${reason} No further actions were sent.`,
    );
  }
}
