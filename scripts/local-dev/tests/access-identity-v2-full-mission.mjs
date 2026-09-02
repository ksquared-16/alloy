/**
 * Access & Identity V2 — full three-deliverable mission via Director + Claude.
 *
 * Expects a desktop-owned control plane on :3021 (Vacilando.app).
 * Does not start the server itself — validates everyday app path.
 *
 * Run after Vacilando.app is up:
 *   node scripts/local-dev/tests/access-identity-v2-full-mission.mjs
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../..");
const BASE = process.env.VACILANDO_URL || "http://127.0.0.1:3021";
/**
 * EVIDENCE GOES TO THE RUNTIME, NOT INTO THE CHECKOUT.
 *
 * This wrote its report into `docs/platform/planning/...` of the LIVE worktree
 * it happens to sit inside. A validation script that mutates an unrelated
 * working tree is indistinguishable, to whoever opens that worktree next, from
 * someone's uncommitted work — and one Vacilando worktree was found holding
 * exactly that: an unexplained modified planning document and an untracked
 * a.md, on no branch, that nobody could account for.
 *
 * The repository is still READ for deliverable existence. Only the write moved.
 */
const OUT = process.env.VACILANDO_EVIDENCE_DIR
  || join(process.env.ALLOY_RUNTIME_ROOT || join(process.env.HOME || "", ".local", "state", "alloy-dev"),
    "evidence", "access-identity-v2");
mkdirSync(OUT, { recursive: true });

async function api(path, { method = "GET", body = null } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const brief = {
  title: "Access & Identity V2 — Operational Closeout",
  objective:
    "Produce the full Access & Identity V2 specification package through Director-managed Claude execution: "
    + "grounded inventory refresh, canonical access/identity model, and sequenced implementation + QA plan. "
    + "Specification-only — do not ship UI or mark product implementation complete.",
  plan: [
    {
      phaseId: "p0_inventory",
      order: 1,
      title: "Existing-state & authority inventory",
      objective:
        "Refresh/confirm the person→user→role→scope authority inventory against this worktree. "
        + "Write the operational inventory deliverable (may refine the accepted inventory).",
      requiredOutputs: [
        "docs/platform/planning/vacilando-os/qa/access-identity-v2/01-existing-state-inventory.md",
      ],
      acceptanceCriteriaIds: ["AC1", "AC2"],
    },
    {
      phaseId: "p1_model",
      order: 2,
      title: "Canonical access & identity model",
      objective:
        "Document the canonical security/authority model: principals, subjects, roles, permissions, "
        + "portal eligibility, and scope. Specification only.",
      requiredOutputs: [
        "docs/platform/planning/vacilando-os/qa/access-identity-v2/02-canonical-access-identity-model.md",
      ],
      dependencies: ["p0_inventory"],
      acceptanceCriteriaIds: ["AC3"],
    },
    {
      phaseId: "p2_sequence",
      order: 3,
      title: "Sequenced implementation & QA plan",
      objective:
        "Produce a sequenced delivery and QA plan for Access & Identity V2 implementation workstreams.",
      requiredOutputs: [
        "docs/platform/planning/vacilando-os/qa/access-identity-v2/03-implementation-qa-sequence.md",
      ],
      dependencies: ["p1_model"],
      acceptanceCriteriaIds: ["AC4"],
    },
  ],
  acceptanceCriteria: [
    { id: "AC1", statement: "Inventory is file-grounded against the live codebase" },
    { id: "AC2", statement: "Contradictions and gaps are enumerated" },
    { id: "AC3", statement: "Canonical access & identity model is documented" },
    { id: "AC4", statement: "Sequenced implementation and QA plan is present" },
  ],
  constraints: [
    { id: "C1", text: "Do not push, merge, or open PRs" },
    { id: "C2", text: "Do not apply shared migrations" },
    { id: "C3", text: "Specification-only — do not claim product UI complete" },
  ],
  outOfScope: ["Shipping Access & Identity UI", "Rebuilding Users/Roles settings"],
  knownDecisions: [
    { id: "KD1", statement: "Prefer persons + customer_persons for human identity; contacts are compatibility" },
  ],
  sourceMaterials: [
    { id: "S1", ref: "docs/platform/planning/vacilando-os/qa/access-identity-v2/authority-path-inventory.md", kind: "inventory" },
    { id: "S2", ref: "docs/platform/core/entity-model.md", kind: "doctrine" },
  ],
  executionPreferences: {
    mergeTarget: "staging",
    maxConcurrentWorkers: 1,
    preferredProvider: "claude",
  },
};

console.log("Checking desktop-owned runtime at", BASE);
const diag = await api("/api/v2/runtime/diagnostics");
assert(diag.status === 200 && diag.json.ok, "diagnostics unavailable — is Vacilando.app running?");
assert(diag.json.claude?.ok || diag.json.claude?.state === "available", `Claude not available: ${diag.json.claude?.label}`);
assert(diag.json.execution?.configuredProvider === "auto" || diag.json.execution?.resolvedProvider === "claude",
  `provider misconfigured: ${JSON.stringify(diag.json.execution)}`);
if (!diag.json.execution?.desktopOwned) {
  console.warn("WARN: control plane is not desktop-owned — everyday path prefers Vacilando.app ownership");
}

console.log("Ingesting Mission Brief…");
const ingested = await api("/api/v2/missions/brief/ingest", {
  method: "POST",
  body: { ...brief, slot: 6, provider: "claude", actor: "operator" },
});
assert(ingested.status === 201 || ingested.json?.ok || ingested.json?.brief, `ingest failed: ${JSON.stringify(ingested.json)}`);
const missionId = ingested.json.brief?.missionId || ingested.json.missionId;
const version = ingested.json.brief?.version || 1;
assert(missionId, "mission id");

console.log("Approving kickoff (Director auto-dispatch)…", missionId);
const approved = await api("/api/v2/missions/brief/approve", {
  method: "POST",
  body: { mission_id: missionId, version, slot: 6, actor: "operator" },
});
assert(approved.json?.ok, `approve failed: ${JSON.stringify(approved.json)}`);

const started = Date.now();
const deadline = started + (Number(process.env.VACILANDO_FULL_MISSION_MAX_MS) || 90 * 60 * 1000);
let lastStatus = null;

while (Date.now() < deadline) {
  const dash = await api(`/api/v2/views/mission/dashboard?id=${encodeURIComponent(missionId)}`);
  const d = dash.json?.dashboard;
  const work = d?.currentWork || [];
  const complete = work.filter((w) => w.status === "complete" || w.lifecycleState === "complete").length;
  const total = work.length || 3;
  lastStatus = {
    at: new Date().toISOString(),
    complete,
    total,
    work: work.map((w) => ({
      title: w.title,
      status: w.status,
      lifecycle: w.lifecycleLabel,
      live: w.liveActivity || null,
    })),
    needsMe: (d?.needsMe || []).map((n) => n.title),
  };
  console.log(`[${lastStatus.at}] ${complete}/${total}`, JSON.stringify(lastStatus.work.map((w) => w.lifecycle || w.status)));

  // Auto-answer only non-blocking? Mission says operator decisions when required —
  // if Needs Me has a decision, stop and report for operator (or answer proceed for closeout if env set).
  if ((d?.needsMe || []).some((n) => /decision/i.test(n.title || n.kind || ""))) {
    if (process.env.VACILANDO_AUTO_ANSWER_DECISIONS === "1") {
      const decisions = await api(`/api/v2/decisions?mission_id=${encodeURIComponent(missionId)}`);
      const open = (decisions.json?.decisions || decisions.json || []).filter?.((x) => x.status === "open") || [];
      // list endpoint shape may differ
    } else {
      console.log("Decision required — pausing poll for operator (set VACILANDO_AUTO_ANSWER_DECISIONS=1 to auto-proceed in CI)");
      break;
    }
  }

  if (complete >= 3 && work.every((w) => w.status === "complete" || w.lifecycleState === "complete")) {
    console.log("All deliverables complete");
    break;
  }
  await new Promise((r) => setTimeout(r, 15000));
}

const deliverables = [
  "docs/platform/planning/vacilando-os/qa/access-identity-v2/01-existing-state-inventory.md",
  "docs/platform/planning/vacilando-os/qa/access-identity-v2/02-canonical-access-identity-model.md",
  "docs/platform/planning/vacilando-os/qa/access-identity-v2/03-implementation-qa-sequence.md",
];

const report = {
  missionId,
  diag: {
    desktopOwned: diag.json.execution?.desktopOwned,
    provider: diag.json.execution,
    claude: diag.json.claude?.label,
  },
  lastStatus,
  deliverables: deliverables.map((p) => ({ path: p, exists: existsSync(join(REPO, p)) })),
  elapsedSec: Math.round((Date.now() - started) / 1000),
};

writeFileSync(join(OUT, "operational-closeout-full-mission.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log("Report written. Mission id:", missionId);
