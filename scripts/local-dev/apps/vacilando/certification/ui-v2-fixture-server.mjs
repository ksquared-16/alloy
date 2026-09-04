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
    lane_id: "lane_trustruntime01", label: "Trust Runtime", slot: 6, folder_id: "fold_cert",
    // RESOURCE ATTRIBUTION, as the lanes projection attaches it: the seat and
    // its descendants, measured. Peak memory and CPU are deliberately absent
    // from the record — nothing samples them — so the UI must say so rather
    // than render a number.
    resource_use: {
      schema_version: "vacilando.lane_resource_use.v1",
      lane_id: "lane_trustruntime01",
      attribution: "ancestry",
      seat_pids: [61631],
      process_count: 6,
      measured_process_count: 6,
      complete: true,
      memory_kb: 1_784_320,
      memory_mb: 1743,
      cpu_pct: null,
      cpu_reason: "per-process CPU is not sampled; ps reports a lifetime average, not current use",
      sampled_at: new Date(Date.now() - 4000).toISOString(),
    },
    tmux: { alive: true }, runtime: "online", preferred_provider: "claude",
    binding: { provider: "claude", branch: "agent/trust-runtime", slot: 6 },
    claude: { presence: "present" },
    last_activity_ms: Date.now() - 18 * 60_000,
    git: { state: "clean", ahead: 3, behind: 0, branch: "agent/trust-runtime", head_short: "5ee92b4" },
    source_control: { posture: "CURRENT" },
    execution_run: {
      run_id: "erun_trust0001", lane_id: "lane_trustruntime01", state: "EXECUTING",
      // A REAL INSTRUCTION, not a tidy one. This is the length and shape an
      // operator actually pastes, and printing it into the Current Work card is
      // precisely what pushed the conversation off the first screen.
      instruction: "Continue the existing REAL ENROLLMENT certification and take it to completion\n\nBuild the end-to-end driver, run automated certification against the staged environment, and do not stop at the first green suite. Cover every surface named in the brief: enrollment intake, roster reconciliation, tuition assignment, and the waitlist adjustment overlay. Where a surface cannot be certified, say which one and why rather than reporting partial success. Capture evidence for each pass and file it under the certification directory with the run id in the filename. If a governed capability is required, request it rather than working around it.",
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
    // A DELIVERED PRIOR INSTRUCTION. Without one there is no conversation to
    // get wrong, which is how the authorship regression survived certification.
    last_instruction: {
      instruction: "Continue the existing REAL ENROLLMENT certification and take it to completion\n\nBuild the end-to-end driver, run automated certification against the staged environment, and do not stop at the first green suite.",
      status: "delivered",
      delivered_at: T(19),
    },
    // A COMPLETED governed action — history, not a standing banner.
    last_governed_outcome: {
      ok: true, title: "Open a staging pull request",
      detail: "PR #671 opened into staging", at: T(64), approved_by: "operator",
    },
    recent_system_activity: [
      { summary: "Claude context refreshed automatically", at: T(35) },
      { summary: "Development server restarted on slot 6", at: T(41) },
    ],
    agent_report: null,
  },
  {
    lane_id: "lane_surfaces000001", label: "Surfaces", slot: 4, folder_id: "fold_cert",
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
      // A FULLY FURNISHED pending governed action.
      //
      // The live decision bar rendered 591px of proposal detail; the fixture's
      // was a title and one sentence. Three individually-bounded components then
      // summed to 888px inside an 844px viewport on the real runtime and put
      // Send 239px below the fold, while the fixture passed. A fixture that is
      // tidier than reality certifies nothing about reality.
      governed_action: {
        request_id: "ga_census01", status: "awaiting_operator",
        action_key: "database.readonly_census", title: "Read-only database census",
        reason_worker_cannot_execute: "The lane cannot reach production credentials; the Director must run it.",
        detail: "Read-only database census · Target: alloy_deployed_primary · Data mode: Read-only",
        purpose: "Establish the true row counts behind the enrollment surfaces before the migration is planned, so the plan is built on measured cardinality rather than on an estimate.",
        escalation_reason: "The worker cannot reach production credentials, and the census reads a deployed database. A read is still a production interaction, so it is authorised rather than assumed.",
        approve_label: "Authorize census",
        proposal: {
          summary: "Run the committed read-only census query against the deployed primary.",
          paths: [
            "supabase/censuses/enrollment-cardinality.sql",
            "docs/platform/planning/vacilando-os/qa/census/expected-shape.json",
          ],
          facts: [
            { label: "Target", value: "alloy_deployed_primary" },
            { label: "Data mode", value: "Read-only" },
            { label: "Query artifact", value: "supabase/censuses/enrollment-cardinality.sql" },
            { label: "Expected hash", value: "sha256:2f1c9e40b6a1d7c3e5f80a49bb2d6714cf03a8e1" },
            { label: "Rows scanned", value: "unknown until executed" },
            { label: "Writes", value: "none — the capability refuses any statement that is not a SELECT" },
          ],
        },
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
    // A REAL FINAL REPORT, NOT A SENTENCE.
    // This fixture used to read "Validation completed; 312 tests passed." — one
    // tidy line. A provider's actual closing report runs to many paragraphs, and
    // a fixture tidier than production certifies a product that does not exist:
    // the four-line preview passed against a message that never needed one.
    previous_run: {
      run_id: "erun_pay0001", state: "COMPLETE", completed_at: T(47),
      completion_report: {
        summary: [
          "Validation completed. 312 tests passed, 1 pre-existing failure left untouched.",
          "",
          "Ledger reconciliation is certified. All 1,248 postings balance against the",
          "settlement file, including the 14 partial refunds that the previous run",
          "reported as orphaned — those were fixture rows, not live data, and the",
          "reconciler now says so explicitly rather than counting them as anomalies.",
          "",
          "Currency rounding is certified at the boundary and NOT in the interior. Every",
          "amount crossing the provider edge is rounded once, at that edge, to the",
          "currency's own minor unit. Interior arithmetic stays in integer minor units,",
          "so the half-cent drift that produced the 0.02 discrepancy on multi-line",
          "invoices cannot recur — there is no longer a place for it to accumulate.",
          "",
          "Refund idempotency is NOT certified. Two refunds issued inside the same",
          "second against the same charge still produce two provider calls. The second",
          "is rejected by the provider, so no double refund reaches a customer, but the",
          "lane is relying on the provider to be the safety net rather than holding the",
          "invariant itself. Fixing that needs a uniqueness constraint the migration",
          "would have to add, which is outside what this run was authorized to do.",
          "",
          "Dispute webhooks remain unverified. The signing secret is held by the",
          "operator and the lane cannot read it, so the handler was exercised against a",
          "locally-signed payload only. That proves the parser, not the trust boundary.",
        ].join("\n"),
      },
    },
  },
  {
    lane_id: "lane_suspended0001", label: "Communications", slot: 5,
    tmux: { alive: true }, runtime: "online", preferred_provider: "claude",
    binding: { provider: "claude", branch: "agent/communications", slot: 5 },
    last_activity_ms: Date.now() - 130 * 60_000,
    git: { state: "dirty", ahead: 4, behind: 2, branch: "agent/communications" },
    // STALE PROGRESS: reported over 30 minutes ago, so it must render as
    // unavailable rather than as a frozen bar.
    execution_run: {
      run_id: "erun_comm0001", lane_id: "lane_suspended0001", state: "WAITING_RESOURCE",
      instruction: "Bring inbound SMS provisioning to parity with email receiving",
      started_at: T(180), updated_at: T(130), created_at: T(181),
      progress_estimate: {
        percent: 45, confidence: "low", summary: "Provisioning flow drafted",
        remaining_work: null, source: "provider_estimate", updated_at: T(95),
      },
      provider_suspension: { question: "Which carrier sandbox should provisioning target?" },
      attachments: [],
    },
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

// MORE THAN ONE INTERRUPTION AT A TIME IS THE NORMAL CASE, and a one-request
// fixture certified a list that never had to group, sort or fit. Two lanes, two
// different capabilities, two ages.
const APPROVALS = [{
  request_id: "ga_census01", lane_id: "lane_surfaces000001",
  action_key: "database.readonly_census", title: "Read-only database census",
  status: "awaiting_operator", requested_at: T(6),
  reason_worker_cannot_execute: "The lane cannot reach production credentials; the Director must run it.",
}, {
  request_id: "ga_merge01", lane_id: "lane_runtimeperf001",
  action_key: "repository.merge_pull_request", title: "Promotion into staging",
  status: "awaiting_operator", requested_at: T(52),
  reason_worker_cannot_execute: "Merging is Director-owned; this lane holds no credentials.",
}];

const OUTPUT = {
  ok: true, available: true, lane_id: "lane_trustruntime01", mode: "recent",
  // Long, multi-paragraph provider output — what a real turn returns.
  text: [
    "Database scan completed successfully.",
    "Found 1,248 records across 12 tables. No anomalies detected.",
    "",
    "Enrollment intake certified: 412 records, 0 orphaned participants, 0 duplicate",
    "external ids. Roster reconciliation certified: term boundaries hold across all",
    "four programs, and the two records flagged last run were stale fixtures rather",
    "than live rows.",
    "",
    "Tuition assignment is NOT certified. Three assignments reference a rate card",
    "that was superseded on 2026-08-30; the driver cannot tell whether that is a",
    "data defect or an intentional grandfather clause, so it refuses to pass them.",
    "",
    "Waitlist adjustment overlay is blocked on browser access — see the governed",
    "request on this lane.",
  ].join("\n"),
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
      // ONE real folder holding two lanes, and the rest unfiled — so both the
      // "folders are meaningful" and "do not advertise their absence" paths are
      // exercised by the same fixture.
      ok: true, lanes: LANES, folders: [{ folder_id: "fold_cert", name: "Certification" }], repositories: [],
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
