/**
 * UI V2 certification fixture server.
 *
 * Serves the REAL browser bundle (apps/vacilando/public) against a DETERMINISTIC
 * fixture API on an ephemeral loopback port.
 *
 * WHY A FIXTURE AND NOT THE LIVE GATEWAY. The live gateway is a shared, single
 * instance that every lane on this machine depends on; certification must not
 * restart it, and a certification whose screenshots change with whatever the
 * fleet happens to be doing certifies nothing. The fixtures below are fixed, so
 * two runs a week apart produce the same evidence.
 *
 * WHAT THIS IS NOT. It is not a second implementation of the API. It returns the
 * shapes the canonical owners return — that is the contract being certified —
 * and any drift shows up as a broken certification, which is the point.
 */
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PUBLIC_DIR = join(HERE, "..", "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

const T = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

/** Four lanes covering the states the operator must be able to tell apart. */
export const LANES = [
  {
    lane_id: "lane_trustruntime01", label: "Trust Runtime", slot: 6,
    tmux: { alive: true }, runtime: "online", preferred_provider: "claude",
    binding: { provider: "claude", branch: "agent/trust-runtime", slot: 6 },
    claude: { presence: "present" },
    last_activity_ms: Date.now() - 18 * 60_000,
    git: { state: "clean", ahead: 3, behind: 0, branch: "agent/trust-runtime", head_short: "5ee92b4" },
    source_control: { posture: "CURRENT" },
    execution_run: {
      run_id: "erun_trust0001", lane_id: "lane_trustruntime01", state: "EXECUTING",
      instruction: "Certify the trust runtime end to end\nBuild the E2E driver and run automated certification against the staged environment.",
      started_at: T(18), updated_at: T(1), created_at: T(19),
      latest_progress: { summary: "E2E driver built; automated certification in progress", at: T(1) },
      // A RESOLVED governed action. The live lane carried one and the fixture
      // did not, so the fixture's interaction zone was 65px shorter than a real
      // one and the keyboard-open check passed on a lane that was simply less
      // furnished than any real lane. Reproduced here so it cannot pass again.
      governed_action: {
        request_id: "ga_resolved01", status: "approved",
        action_key: "repository.merge_pull_request",
        title: "Merge pull request into staging",
        resolved_at: T(3),
      },
      progress_estimate: {
        percent: 62, confidence: "medium",
        summary: "E2E driver built; automated certification in progress",
        remaining_work: null, source: "provider_estimate", updated_at: T(1),
      },
      attachments: [],
    },
    agent_report: null,
  },
  {
    lane_id: "lane_surfaces000001", label: "Surfaces", slot: 4,
    tmux: { alive: true }, runtime: "online", preferred_provider: "claude",
    binding: { provider: "claude", branch: "agent/surfaces", slot: 4 },
    claude: { presence: "present" },
    last_activity_ms: Date.now() - 4 * 60_000,
    git: { state: "dirty", ahead: 1, behind: 0, branch: "agent/surfaces" },
    execution_run: {
      run_id: "erun_surf0001", lane_id: "lane_surfaces000001", state: "NEEDS_INPUT",
      instruction: "Restore the QA browser session for slot 4",
      state_reason: "Read-only database census — authorization required before the worker can proceed",
      started_at: T(52), updated_at: T(6), created_at: T(53),
      governed_action: {
        request_id: "ga_census01", status: "awaiting_operator",
        action_key: "database.readonly_census", title: "Read-only database census",
        reason_worker_cannot_execute: "The lane cannot reach production credentials; the Director must run it.",
      },
      attachments: [],
    },
  },
  {
    lane_id: "lane_payments00001", label: "Payments", slot: 2,
    tmux: { alive: true }, runtime: "online", preferred_provider: "claude",
    binding: { provider: "claude", branch: "agent/payments", slot: 2 },
    last_activity_ms: Date.now() - 47 * 60_000,
    git: { state: "clean", ahead: 0, behind: 0, branch: "agent/payments" },
    execution_run: null,
    previous_run: { run_id: "erun_pay0001", state: "COMPLETE", completed_at: T(47), completion_report: { summary: "Validation completed; 312 tests passed." } },
  },
  {
    lane_id: "lane_runtimeperf001", label: "Runtime Performance", slot: 3,
    tmux: { alive: false }, runtime: "offline", preferred_provider: "claude",
    binding: { provider: "claude", branch: "agent/runtime-perf", slot: 3 },
    last_activity_ms: Date.now() - 3 * 60 * 60_000,
    git: { state: "clean", ahead: 12, behind: 0, branch: "agent/runtime-perf" },
    execution_run: null,
  },
];

const RESOURCES = {
  overall: {
    load_1m: 4.2, load_5m: 3.8, cpu_count: 10, cpu_load_pct: 38,
    mem_total_mb: 32768, mem_available_mb: 9420, mem_used_mb: 23348, mem_used_pct: 71,
    mem_active_mb: 14100, mem_wired_mb: 5200, mem_compressed_mb: 2100,
    swap: { used_mb: 1536, total_mb: 3072 },
    mem_pressure_level: 1,
    running_servers: 3,
    slots: { total: 6, occupied: 4, recommended_available: 2, pressure: "ok" },
    warning: null,
  },
  workers: [
    { slot: 2, worktree: "/worktrees/payments", server: "running", port: 3012 },
    { slot: 4, worktree: "/worktrees/surfaces", server: "running", port: 3014 },
    { slot: 6, worktree: "/worktrees/trust", server: "running", port: 3016 },
  ],
  gateway: { state: "responsive", port: 3030 },
  runtime_root: "~/.local/state/alloy-dev",
};

const ACTIVITY = [
  { at: T(2), lane_id: "lane_trustruntime01", kind: "work", outcome: "ok", summary: "Work started — “Certify the trust runtime end to end”", type: "execution_run.executing" },
  { at: T(6), lane_id: "lane_surfaces000001", kind: "governance", outcome: "attention", summary: "Needs input — Read-only database census", type: "execution_run.needs_input" },
  { at: T(14), lane_id: "lane_surfaces000001", kind: "browser", outcome: "ok", summary: "QA session restored", type: "browser.session_restored" },
  { at: T(29), lane_id: "lane_runtimeperf001", kind: "git", outcome: "ok", summary: "Branch pushed", type: "scm.push" },
  { at: T(47), lane_id: "lane_payments00001", kind: "work", outcome: "ok", summary: "Work completed — Validation completed; 312 tests passed.", type: "execution_run.complete" },
  { at: T(64), lane_id: "lane_payments00001", kind: "promotion", outcome: "ok", summary: "Promotion — merged to staging", type: "scm.promote" },
  { at: T(96), lane_id: "lane_runtimeperf001", kind: "failure", outcome: "failed", summary: "Run failed — typecheck exceeded the heap floor", type: "execution_run.failed" },
  { at: T(140), lane_id: "lane_trustruntime01", kind: "system", outcome: "ok", summary: "Admitted to capacity", type: "admission.admitted" },
];

const USAGE = {
  providers: [
    { provider: "claude", calls: 34, calls_today: 34, input_tokens: 4_120_000, output_tokens: 286_000, cost: { value_usd: null, kind: "unavailable" }, avg_duration_ms: 158_000, failures: 3, auth_state: "authenticated" },
  ],
  total_calls: 34,
  total_calls_today: 34,
  cost_note: "Cost is authoritative only when the provider reports it.",
};

const APPROVALS = [{
  request_id: "ga_census01", lane_id: "lane_surfaces000001",
  action_key: "database.readonly_census", title: "Read-only database census",
  status: "awaiting_operator", requested_at: T(6),
  reason_worker_cannot_execute: "The lane cannot reach production credentials; the Director must run it.",
}];

const OUTPUT = {
  ok: true, available: true, lane_id: "lane_trustruntime01", mode: "recent",
  text: "Database scan completed successfully.\nFound 1,248 records across 12 tables.\nNo anomalies detected.",
  captured_at: T(18),
};

function json(res, body, status = 200) {
  const s = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(s);
}

function laneById(id) {
  return LANES.find((l) => l.lane_id === id) || null;
}

const ROUTES = (url) => {
  const p = url.pathname;
  const id = url.searchParams.get("id") || url.searchParams.get("lane_id");
  if (p === "/api/lanes" || p === "/api/v2/views/lanes") {
    return {
      ok: true, lanes: LANES, folders: [], repositories: [],
      unseen_count: 1, unseen_by_lane: { lane_surfaces000001: 1 },
      execution_capacity: { total: 6, active: 3, available: 3 },
      development_resources: { ok: true, resources: [] },
    };
  }
  if (p === "/api/v2/views/home") {
    return { ok: true, approvals: APPROVALS, resources: RESOURCES, disk: { free_gb: 214, total_gb: 926 },
      capacity: { total: 6, active: 3, reserved: 1, holders: [] }, usage: USAGE, effectiveness: {}, activity: ACTIVITY.slice(0, 6) };
  }
  if (p === "/api/v2/views/activity") return { ok: true, events: ACTIVITY, total: ACTIVITY.length };
  if (p === "/api/v2/views/system") {
    return { ok: true, resources: RESOURCES, disk: { free_gb: 214, total_gb: 926 },
      capacity: { total: 6, active: 3, reserved: 1, holders: [{ lane_id: "lane_trustruntime01", label: "Trust Runtime", state: "ACTIVE" }] },
      usage: USAGE, diagnostics: null, history: [], runtime_root: RESOURCES.runtime_root };
  }
  if (p === "/api/v2/governed-actions/pending") return { ok: true, approvals: APPROVALS };
  if (p === "/api/lane-folders") return { ok: true, folders: [] };
  if (p === "/api/repositories") return { ok: true, repositories: [] };
  if (p === "/api/providers") return { ok: true, providers: [{ provider: "claude", available: true, auth_state: "authenticated" }, { provider: "cursor", available: false }] };
  if (p === "/api/notifications") return { ok: true, notifications: [], counts: { actionable: 1, total: 3 } };
  if (p === "/api/gateway/push/config") return { ok: true, vapid_public_key: null };
  if (p === "/api/gateway/push/health") return { ok: true, subscriptions: 0 };
  if (p.startsWith("/api/lanes/") && p.endsWith("/output")) return { ...OUTPUT, lane_id: p.split("/")[3] };
  if (p.startsWith("/api/lanes/") && p.endsWith("/telemetry")) {
    return { ok: true, available: true, lane_id: p.split("/")[3], agent: { model: "claude-opus-5", session_id: "sess_abc12345", started_at: T(120) }, context: { percent_used: 38, used_tokens: 380000, max_tokens: 1000000 }, usage: {}, cost: { billing_mode: "claude_max_subscription" } };
  }
  if (p.startsWith("/api/lanes/") && p.endsWith("/screen")) return { ok: false, available: false };
  if (p.startsWith("/api/lanes/") && p.endsWith("/attachments")) return { ok: true, attachments: [] };
  if (p.startsWith("/api/lanes/")) {
    const lane = laneById(decodeURIComponent(p.split("/")[3] || ""));
    return lane ? { ok: true, lane } : { ok: false, error: "lane_not_found" };
  }
  if (p === "/api/v2/views/lane" || p === "/api/v2/lane") {
    const lane = laneById(id);
    return lane ? { ok: true, lane } : { ok: false, error: "lane_not_found" };
  }
  if (p.startsWith("/api/")) return { ok: true };
  return null;
};

export function startFixtureServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname.startsWith("/api/")) {
      const body = ROUTES(url);
      return json(res, body ?? { ok: true }, body?.ok === false ? 404 : 200);
    }
    const rel = url.pathname === "/" ? "/index.html" : url.pathname;
    const full = normalize(join(PUBLIC_DIR, rel));
    if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
    try {
      await readFile(full);
      res.writeHead(200, { "Content-Type": MIME[extname(full)] || "application/octet-stream", "Cache-Control": "no-store" });
      createReadStream(full).pipe(res);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
    }
  });
  return new Promise((resolve) => {
    // Port 0: the OS assigns a free ephemeral port. This harness deliberately
    // claims no permanent port and touches no slot.
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}
