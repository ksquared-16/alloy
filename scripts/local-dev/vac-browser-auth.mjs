#!/usr/bin/env node
/**
 * Browser-authentication recovery for a lane.
 *
 *   vac browser-auth status  --lane <id> [--slot N]
 *   vac browser-auth sign-in --lane <id> [--slot N] [--timeout <seconds>]
 *   vac browser-auth verify  --lane <id> [--slot N]
 *
 * `sign-in` opens the slot's own isolated browser on its loopback base and waits
 * for a PERSON to authenticate. The agent starts it and can abandon it; the
 * agent cannot complete it. Credentials go from the Director into the browser
 * and nowhere else — never into an argument, a prompt, a log or a result.
 */
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const TOOLKIT = join(homedir(), ".local", "share", "alloy", "toolkit", "current");
import "./lib/vacilando/bind-worker-cli-gateway-root.mjs";
import {
  BROWSER_AUTH_STATES,
  beginBrowserAuthCapture,
  blocksExecution,
  browserAuthHeadline,
  publicAuthOutcome,
  readSlotAuthStatus,
  recordSlotVerification,
  validateBrowserAuthRequest,
  verifyBrowserAuth,
} from "./lib/vacilando/browser-auth.mjs";
import { getDurableLane } from "./lib/vacilando/development-lane.mjs";
import { publicBootstrapOutcome } from "./lib/vacilando/qa-session-bootstrap.mjs";
import { ACTION_TYPES } from "./lib/vacilando/trusted-host-action-registry.mjs";

function usage(code = 2) {
  process.stderr.write(`Usage: vac browser-auth <status|sign-in|verify|restore> --lane <lane_id> [--slot N] [--timeout <s>] [--json]

sign-in opens an isolated browser for that slot and waits for you to sign in.
restore bootstraps the slot's REGISTERED QA identity with a single-use link, for
machine identities no human should hold a password for.
Credentials never reach the agent, the prompt, the logs or the result.
`);
  process.exit(code);
}

const args = process.argv.slice(2);
if (!args.length || args[0] === "-h" || args[0] === "--help") usage(args.length ? 0 : 2);
const op = args.shift();
if (!["status", "sign-in", "verify", "restore"].includes(op)) usage();

let laneId = null;
let slot = null;
let timeoutS = null;
let asJson = false;
while (args.length) {
  const a = args.shift();
  if (a === "--lane") laneId = args.shift() || "";
  else if (a.startsWith("--lane=")) laneId = a.slice(7);
  else if (a === "--slot") slot = args.shift() || "";
  else if (a.startsWith("--slot=")) slot = a.slice(7);
  else if (a === "--timeout") timeoutS = Number(args.shift());
  else if (a === "--json") asJson = true;
  else usage();
}
if (!laneId) usage();

const lane = getDurableLane(laneId);
if (!lane) {
  process.stderr.write("vac browser-auth: lane_not_registered\n");
  process.exit(4);
}
const resolvedSlot = slot ?? lane.binding?.slot ?? slotFromWorktree(lane.binding?.worktree_path);
function slotFromWorktree(p) {
  const m = String(p || "").match(/\/wt(\d)-/);
  return m ? Number(m[1]) : null;
}

const validated = validateBrowserAuthRequest({
  lane,
  slot: resolvedSlot,
  expectedIdentity: process.env[`ALLOY_SLOT_${resolvedSlot}_QA_IDENTITY`] || qaIdentityFallback(resolvedSlot),
});
function qaIdentityFallback(n) {
  // Ask the TOOLKIT, which owns this. It resolves the operator config and the
  // shipped defaults in the right order; parsing those files here would be a
  // second definition of the QA identity that could disagree with the first.
  // Never invented, and never silently substituted with another account.
  try {
    const out = execFileSync("bash", ["-lc",
      `source "${TOOLKIT}/lib/common.sh"; source "${TOOLKIT}/lib/verify.sh"; ` +
      `alloy_load_config >/dev/null 2>&1; alloy_slot_qa_identity ${Number(n)}`,
    ], { encoding: "utf8", timeout: 15000 });
    const v = String(out || "").trim();
    return v || null;
  } catch { return null; }
}

if (!validated.ok) {
  process.stderr.write(`vac browser-auth: ${validated.error}\n`);
  if (validated.detail) process.stderr.write(`  ${validated.detail}\n`);
  process.exit(4);
}

const status = readSlotAuthStatus(validated.slot);

if (op === "status") {
  // status carries its own explanation (e.g. a session stranded under the base
  // runtime root); dropping it left the operator with a bare "missing".
  const out = publicAuthOutcome({ validated, state: status.state, status, detail: status.detail });
  emit(out, () => {
    process.stdout.write(`${out.headline}\n`);
    process.stdout.write(`  slot ${out.slot} · ${out.base_url} · expected ${out.expected_identity}\n`);
    process.stdout.write(`  storage: ${status.exists ? `captured ${out.storage_captured_at} mode ${out.storage_mode}` : "absent"}\n`);
    process.stdout.write(`  blocks execution: ${blocksExecution(status.state)}\n`);
    if (out.detail) process.stdout.write(`  ${out.detail}\n`);
  });
  process.exit(blocksExecution(status.state) ? 6 : 0);
}

if (op === "verify") {
  const v = await verifyBrowserAuth(validated);
  // Record what the LIVE check found, so the lane keeps offering recovery until
  // a real sign-in clears it. Metadata alone would go on saying "present".
  recordSlotVerification(validated.slot, {
    state: v.state, expectedIdentity: validated.expected_identity,
    actualIdentity: v.actual_identity, detail: v.detail,
  });
  const out = publicAuthOutcome({ validated, state: v.state, status, detail: v.detail });
  emit(out, () => {
    process.stdout.write(`${out.headline}\n`);
    if (v.actual_identity) process.stdout.write(`  signed in as ${v.actual_identity}\n`);
    if (out.detail) process.stdout.write(`  ${out.detail}\n`);
  });
  process.exit(v.ok ? 0 : 6);
}

if (op === "restore") {
  /*
   * Restore QA session — the branch for identities no human should hold a password for.
   *
   * The agent starts it and can cancel it. It never sees the link, the token, the session or the
   * cookie: the minting child does that work inside the trusted boundary and writes the storage
   * file itself. `restored` is still reachable ONLY through the fresh-context live check below,
   * exactly as for an interactive sign-in — a mint that "looked fine" proves nothing on its own.
   */
  /*
   * This CLI REQUESTS a restore. It does not perform one.
   *
   * It used to call `authorizeQaBootstrap({ operatorApproved: true })` itself, which is an agent
   * approving its own privileged service-role action — governance in name only. The approval now
   * comes from an operator grant on `environment.restore_qa_session`, and the trusted executor is
   * the only caller that may set that flag. Nothing privileged runs here: no link is minted, no
   * Supabase client is constructed, and the mint child is never spawned on this path.
   */
  /*
   * Goes through `requestGovernedAction`, the same entry point `vac governed-action` uses — not
   * `requestTrustedHostAction`, which is the layer beneath it. That layer demands a missionId and
   * returns `missing_fields` without one, and a lane with no mission is not automatically
   * ungoverned: `resolveGovernedAuthority` lets its repository profile vouch for the proposal so
   * the Director gets something to approve. Calling the lower layer directly produced a request
   * that could not be created at all, which is how this was caught on the live installation.
   */
  const { resolveGovernedAuthority } = await import("./lib/vacilando/governed-repository-authority.mjs");
  const { requestGovernedAction } = await import("./lib/vacilando/governed-action-request.mjs");
  const authority = await resolveGovernedAuthority(validated.lane_id);
  const asked = requestGovernedAction({
    action_key: ACTION_TYPES.ENVIRONMENT_RESTORE_QA_SESSION,
    run_id: process.env.VACILANDO_RUN_ID || null,
    lane_id: validated.lane_id,
    reason_worker_cannot_execute:
      "Restoring a QA session mints a Supabase session from the service-role boundary. A worker may request it; only the operator may approve it.",
    inputs: { laneId: validated.lane_id },
    __authority: authority,
  }, { processNow: false });
  const requested = asked?.ok ? { ok: true, requestId: asked.request?.request_id || null } : { ok: false, error: asked?.error || "request_refused" };
  const out = publicBootstrapOutcome({
    validated,
    state: requested?.ok === false ? "refused" : "awaiting_operator_approval",
    detail: requested?.ok === false ? (requested.error || "request_refused") : null,
  });
  emit(out, () => {
    if (requested?.ok === false) {
      process.stdout.write(`Restore could not be requested: ${requested.error}\n`);
      return;
    }
    process.stdout.write(`Restore requested for slot ${validated.slot} (${validated.expected_identity}).\n`);
    process.stdout.write(`Awaiting operator approval — nothing privileged runs until it is granted.\n`);
    process.stdout.write(`  Director surface: Restore QA session for ${validated.expected_identity} on slot ${validated.slot}\n`);
  });
  process.exit(requested?.ok === false ? 4 : 0);
}

// sign-in
process.stdout.write(`Opening an isolated browser for slot ${validated.slot} at ${validated.base_url}\n`);
process.stdout.write(`Sign in as ${validated.expected_identity}. Nothing you type reaches the agent.\n`);
const began = await beginBrowserAuthCapture(validated, {
  timeoutMs: Number.isFinite(timeoutS) ? timeoutS * 1000 : undefined,
});
if (!began.ok) {
  const out = publicAuthOutcome({ validated, state: began.state, status, detail: began.detail });
  emit(out, () => process.stderr.write(`${out.headline}${out.detail ? ` — ${out.detail}` : ""}\n`));
  process.exit(began.state === BROWSER_AUTH_STATES.CANCELLED ? 7 : 6);
}
const after = readSlotAuthStatus(validated.slot);
const v = await verifyBrowserAuth(validated);
recordSlotVerification(validated.slot, {
  state: v.state, expectedIdentity: validated.expected_identity,
  actualIdentity: v.actual_identity, detail: v.detail,
});
const out = publicAuthOutcome({ validated, state: v.state, status: after, detail: v.detail });
emit(out, () => {
  process.stdout.write(`${out.headline}\n`);
  if (v.actual_identity) process.stdout.write(`  signed in as ${v.actual_identity}\n`);
  if (out.verified_at) process.stdout.write(`  verified ${out.verified_at}\n`);
  if (out.detail) process.stdout.write(`  ${out.detail}\n`);
  process.stdout.write("  no credential material was recorded\n");
});
process.exit(v.ok ? 0 : 6);

function emit(obj, human) {
  if (asJson) process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
  else human();
}
