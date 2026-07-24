/**
 * Vacilando — Gap Analysis Runtime V1.
 *
 * The FIRST genuine intelligence stage. It compares a Mission Intent against the
 * capability's Product Definition, the Capability object, the Knowledge Snapshot,
 * and Acceptance history, and returns a structured GAP REPORT: what is missing,
 * what conflicts, what is unknown, which references to add, which acceptance
 * criteria to adopt, and a confidence score.
 *
 * V1 reasons DETERMINISTICALLY — rules over structured artifacts, no provider
 * call. This keeps the sprint's promise (prepare, don't execute) and keeps the
 * stage governed and reproducible. The reasoner is injected behind a
 * `ReasoningProvider` seam, so a future provider-backed reasoner can DEEPEN the
 * findings without changing the pipeline or the Gap Report schema.
 *
 * Every finding carries `feeds_verdict` — the Director Review state it drives
 * (Needs Decisions / Needs References / Needs Acceptance / Needs Architecture /
 * Needs Review) — so the six-state readiness verdict is a pure roll-up of gaps.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const GAP_DIR = join(RUNTIME_ROOT, "vacilando", "gap-reports");

function ensureDir() { if (!existsSync(GAP_DIR)) mkdirSync(GAP_DIR, { recursive: true }); }

/** Parse the light structure a deterministic reasoner can use from raw intent. */
function parseIntent(intent) {
  const raw = String(intent || "").trim();
  const versionHint = (raw.match(/\bv(\d+)\b/i) || [])[1] || null;
  const verb = (raw.match(/^\s*(build|extend|fix|refactor|design|add|replace|harden)\b/i) || [])[1]?.toLowerCase() || "build";
  return { raw, verb, version_hint: versionHint ? `v${versionHint}` : null };
}

/**
 * The V1 deterministic reasoner. Pure: (intent, capability, snapshot) → findings.
 * No I/O, no provider, no randomness — the same inputs always produce the same
 * findings, which is what makes the Gap Report reproducible.
 */
export const DeterministicReasoner = {
  id: "gap/v1-deterministic",
  reason({ parsed, capability, snapshot }) {
    const missing_information = [];
    const conflicts = [];
    const unknowns = [];
    const recommended_references = [];
    const suggested_acceptance_criteria = [];
    const missing_files = [];

    const pd = capability.product_definition || null;
    const sec = snapshot?.sections || {};

    // R1 — no product definition → cannot prepare product truth. (Needs Decisions)
    if (!pd) {
      missing_information.push({ id: "m_pd", what: "The capability has no Product Definition — decisions/constraints are unknown.", severity: "block", feeds_verdict: "Needs Decisions" });
    } else {
      // R2 — an active goal not reflected in the roadmap → how will it be delivered? (Needs Decisions)
      const roadmapText = (capability.roadmap || []).map((r) => String(r.item || "").toLowerCase()).join(" | ");
      for (const g of (pd.goals || []).filter((x) => x.status === "active")) {
        const words = String(g.statement || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
        const reflected = words.length && words.some((w) => roadmapText.includes(w));
        if (!reflected) unknowns.push({ id: `u_goal_${g.id}`, question: `How does "${capability.name}" deliver goal ${g.id}: ${g.statement}?`, blocking: false, feeds_verdict: "Needs Review" });
      }
    }

    // R3 — referenced file absent from the worktree → recommend/repair a reference. (Needs References)
    for (const it of (sec.referenced_files || snapshot?.items || [])) {
      if (it.exists === false) {
        missing_files.push({ uri: it.uri, note: "referenced by the capability but absent in the worktree" });
        recommended_references.push({ uri: it.uri, why: "declared reference does not resolve on disk — repoint or remove it", feeds_verdict: "Needs References" });
      }
    }

    // R4 — no resolvable architecture reference → architecture is undefined. (Needs Architecture)
    const arch = (sec.architecture || []).filter((a) => a.exists !== false);
    if (arch.length === 0) {
      missing_information.push({ id: "m_arch", what: "No architecture reference resolves on disk for this capability.", severity: "warn", feeds_verdict: "Needs Architecture" });
    }

    // R5 — each planned roadmap item needs a covering acceptance criterion. (Needs Acceptance)
    for (const r of (capability.roadmap || []).filter((x) => x.status === "planned" || /v2/i.test(x.item))) {
      suggested_acceptance_criteria.push({ statement: `The V2 proposal covers roadmap item: ${r.item}.`, from: `roadmap:${r.id}`, feeds_verdict: "Needs Acceptance" });
    }
    // R6 — each OPEN known issue should be acknowledged by the mission. (Needs Acceptance)
    for (const k of (capability.known_issues || []).filter((x) => x.status === "open")) {
      suggested_acceptance_criteria.push({ statement: `The proposal addresses known issue ${k.id}: ${k.issue}`, from: `known_issue:${k.id}`, feeds_verdict: "Needs Acceptance" });
      unknowns.push({ id: `u_ki_${k.id}`, question: `Does the intent's scope include known issue ${k.id}?`, blocking: false, feeds_verdict: "Needs Review" });
    }

    // R7 — intent appears to reintroduce a rejected pattern → conflict for human judgment. (Needs Review)
    const intentText = parsed.raw.toLowerCase();
    for (const rp of (capability.rejected_patterns || [])) {
      const probe = String(rp.statement || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4).slice(0, 3);
      if (probe.length >= 2 && probe.every((w) => intentText.includes(w))) {
        conflicts.push({ id: `x_${rp.id}`, between: ["intent", rp.id], detail: `Intent text overlaps rejected pattern ${rp.id}: ${rp.statement}`, severity: "warn", feeds_verdict: "Needs Review" });
      }
    }

    // R8 — version delta on a "new" capability is a mismatch worth surfacing. (Needs Review)
    if (parsed.version_hint && capability.maturity === "new") {
      unknowns.push({ id: "u_maturity", question: `Intent asks for ${parsed.version_hint} but the capability maturity is "new" — is there a V1 to extend?`, blocking: false, feeds_verdict: "Needs Review" });
    }

    return { missing_information, conflicts, unknowns, recommended_references, suggested_acceptance_criteria, missing_files };
  },
};

/** Deterministic coverage score in [0,1] — a real ratio, NOT a self-estimate. */
function computeConfidence(capability, snapshot) {
  const sec = snapshot?.sections || {};
  const files = sec.referenced_files || snapshot?.items || [];
  const present = files.filter((f) => f.exists !== false).length;
  const signals = [
    capability.product_definition ? 1 : 0,                                   // decisions available
    (capability.accepted_decisions || []).length ? 1 : 0,                    // decisions non-empty
    files.length ? present / files.length : 0,                               // references resolve
    (sec.architecture || []).some((a) => a.exists !== false) ? 1 : 0,        // architecture resolves
    (capability.roadmap || []).length ? 1 : 0,                               // there is a plan to compile against
  ];
  return Math.round((signals.reduce((a, b) => a + b, 0) / signals.length) * 100) / 100;
}

/**
 * Analyze the gap between intent and prepared context. Returns a durable,
 * reproducible Gap Report and persists it. `reasoner` is the injected
 * ReasoningProvider (DeterministicReasoner in V1).
 */
export function analyzeGap({ intent, capability, snapshot }, { reasoner = DeterministicReasoner, nowMs } = {}) {
  const parsed = parseIntent(intent);
  const findings = reasoner.reason({ parsed, capability, snapshot });
  const confidence = computeConfidence(capability, snapshot);

  // Reproducible id: a function of intent + snapshot + the reasoner identity.
  const gap_report_id = "gap_" + createHash("sha256")
    .update(`${parsed.raw}|${snapshot?.snapshot_id || "-"}|${capability.capability_id}|${reasoner.id}`)
    .digest("hex").slice(0, 18);

  const report = {
    schema_version: "vacilando.gap-report.v1",
    gap_report_id, analyzer_version: reasoner.id,
    mission_intent: parsed.raw, intent_parsed: parsed,
    capability_id: capability.capability_id, snapshot_id: snapshot?.snapshot_id || null,
    findings, confidence,
    generated_at: new Date(nowMs ?? Date.now()).toISOString(),
  };
  try { ensureDir(); writeFileSync(join(GAP_DIR, `${gap_report_id}.json`), JSON.stringify(report, null, 2), "utf8"); } catch { /* best-effort persisted */ }
  return report;
}

export function readGapReport(gap_report_id) {
  try { return JSON.parse(readFileSync(join(GAP_DIR, `${gap_report_id}.json`), "utf8")); } catch { return null; }
}

export { parseIntent };
