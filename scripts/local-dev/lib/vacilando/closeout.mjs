/**
 * Vacilando — Closeout Readiness projection.
 *
 * Answers the operator's real question — "Can I safely close this worker?" —
 * instead of just "dirty". Pure read-only projection over git + filesystem +
 * the durable evidence store. Classifies every uncommitted change, distinguishes
 * unique planning/evidence that lives ONLY in the worktree from work already
 * preserved, and returns one authoritative result + the next required action.
 *
 * Never infers "safe" merely because a PR merged (Slot 4 taught us: merged +
 * 0-ahead can still hold an unmerged do-not-commit spec and un-mirrored evidence).
 */
import { execFile } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";

import { resolveRuntimeConfig, worktreePathForName } from "./workspace-facts.mjs";

const EVID_STORE_ROOT = join(
  process.env.ALLOY_RUNTIME_ROOT?.trim() || resolveRuntimeConfig().runtime_root,
  "evidence",
);
const BASE = "origin/staging";

function git(wt, args, { timeout = 15000 } = {}) {
  return new Promise((res) => {
    execFile("git", ["-C", wt, ...args], { timeout, maxBuffer: 8 << 20 }, (e, so) => {
      res({ ok: !e, code: e ? (e.code ?? 1) : 0, out: (so || "").trim() });
    });
  });
}

/** Best-effort classification of a changed path. */
export function classifyPath(p) {
  const s = p.toLowerCase();
  if (s.includes(".alloy-agent-evidence/")) {
    if (/\.(png|jpe?g|gif|webp)$/.test(s) || s.includes("screenshot")) return "screenshot";
    if (/\.json$/.test(s) && /(verify|cert|qa)/.test(s)) return "verification";
    if (/\.md$/.test(s)) return "report";
    return "qa-evidence";
  }
  if (/\.(png|jpe?g|gif|webp)$/.test(s)) return "screenshot";
  if (/(^|\/)(dist|build|out|coverage|\.next|node_modules)\//.test(s)) return "generated";
  if (/(\.test\.|\.spec\.)|(^|\/)__tests__\/|(^|\/)tests?\//.test(s)) return "test";
  if (/(^|\/)docs\/.*\.md$|(^|\/)(readme|spec|plan|scope|audit|closeout)[^/]*\.md$/.test(s)) return "planning-doc";
  if (/\.(md|mdx|txt|rst)$/.test(s)) return "documentation";
  if (/\.(json|ya?ml|toml|ini|env|config\.[jt]s)$|(^|\/)\.[a-z]+rc/.test(s)) return "config";
  if (/\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|py|go|rs|rb|java|kt|swift|css|scss|sass|less|html)$/.test(s)) return "source";
  return "unknown";
}

const CLASS_LABEL = {
  source: "source", test: "test", config: "configuration", "planning-doc": "planning document",
  documentation: "documentation", "qa-evidence": "QA evidence", screenshot: "screenshot",
  report: "report", verification: "verification", generated: "generated artifact", unknown: "unknown",
};

const dirSizeMb = (dir) => {
  let bytes = 0;
  const walk = (d) => { let ents = []; try { ents = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) { const f = join(d, e.name); try { if (e.isDirectory()) walk(f); else bytes += statSync(f).size; } catch { /* skip */ } } };
  if (existsSync(dir)) walk(dir);
  return Math.round(bytes / 1048576 * 10) / 10;
};

// Classes that are safe to discard (generated/evidence) — NEVER source/planning.
const DISCARDABLE = new Set(["qa-evidence", "screenshot", "report", "verification", "generated"]);

/**
 * Preserve everything unique in the worktree to the durable store BEFORE any
 * cleanup — evidence AND unique planning documents. Non-destructive; copies only.
 */
export async function preserveOutputs(sprint) {
  if (!sprint?.worktree) return { ok: false, error: "worker could not be resolved (thin snapshot) — try again" };
  const wt = worktreePathForName(sprint.worktree);
  const dest = join(EVID_STORE_ROOT, sprint.worktree, "preserved");
  if (!wt || !existsSync(wt)) return { ok: false, error: "worktree not found" };
  mkdirSync(dest, { recursive: true });
  const copied = [];
  // 1) the full evidence dir
  const evDir = join(wt, ".alloy-agent-evidence");
  if (existsSync(evDir)) { try { cpSync(evDir, join(dest, "alloy-agent-evidence"), { recursive: true, force: true }); copied.push(".alloy-agent-evidence/"); } catch (e) { return { ok: false, error: `evidence copy failed: ${e.message}` }; } }
  // 2) unique untracked planning docs
  const porcelain = (await git(wt, ["status", "--porcelain=v1", "-uall"])).out;
  for (const line of porcelain ? porcelain.split("\n") : []) {
    if (!line || line.slice(0, 2) !== "??") continue;
    const p = line.slice(3).replace(/^"|"$/g, "");
    const cls = classifyPath(p);
    if (["planning-doc", "documentation"].includes(cls)) {
      const src = join(wt, p), dst = join(dest, "planning", p);
      try { mkdirSync(dirname(dst), { recursive: true }); cpSync(src, dst, { force: true }); copied.push(p); } catch { /* skip */ }
    }
  }
  return { ok: true, dest, copied, count: copied.length };
}

/**
 * Discard ONLY untracked generated/evidence artifacts (never source, never
 * unpreserved planning). Refuses unless outputs were preserved first.
 */
export async function discardGenerated(sprint, { requirePreserved = true } = {}) {
  if (!sprint?.worktree) return { ok: false, error: "worker could not be resolved (thin snapshot) — try again" };
  const wt = worktreePathForName(sprint.worktree);
  if (!wt || !existsSync(wt)) return { ok: false, error: "worktree not found" };
  const preservedDir = join(EVID_STORE_ROOT, sprint.worktree, "preserved");
  if (requirePreserved && !existsSync(preservedDir)) return { ok: false, error: "preserve outputs first (nothing has been copied to the durable store)" };
  const porcelain = (await git(wt, ["status", "--porcelain=v1", "-uall"])).out;
  const removed = [], skipped = [];
  for (const line of porcelain ? porcelain.split("\n") : []) {
    if (!line || line.slice(0, 2) !== "??") continue; // untracked only — never touch tracked/source
    const p = line.slice(3).replace(/^"|"$/g, "");
    const cls = classifyPath(p);
    if (!DISCARDABLE.has(cls)) { skipped.push({ path: p, class: cls, reason: "not a generated/evidence artifact" }); continue; }
    try { rmSync(join(wt, p), { recursive: true, force: true }); removed.push(p); } catch { skipped.push({ path: p, reason: "rm failed" }); }
  }
  return { ok: true, removed, skipped, removed_count: removed.length };
}

/**
 * NOTE on `-uall`: plain `--porcelain=v1` COLLAPSES untracked files into their
 * directory (`?? docs/platform/planning/certification/`). classifyPath keys off
 * the file extension, so a unique planning document inside a NEW directory was
 * classified as "other" — it never reached planning.unique_docs and never
 * appeared in would_lose. Closeout therefore under-reported what deleting the
 * worktree would destroy. `-uall` lists every untracked FILE individually.
 *
 * Compute the closeout readiness for one worker.
 *   sprint: { slot, worktree, branch, provider, ... } from the snapshot
 *   opts.devServerRunning / opts.providerRunning: live runtime facts (from resources / dev-status)
 *   opts.pendingRequests: count of not-yet-terminal Director requests (from the request store)
 */
export async function computeCloseout(sprint, opts = {}) {
  const wt = worktreePathForName(sprint.worktree);
  if (!wt || !existsSync(wt)) return { ok: false, error: "worktree not found", worktree: sprint.worktree };

  // ---- repository ----
  const ahead = Number((await git(wt, ["rev-list", "--count", `${BASE}..HEAD`])).out || 0);
  const behind = Number((await git(wt, ["rev-list", "--count", `HEAD..${BASE}`])).out || 0);
  const fullyMerged = (await git(wt, ["merge-base", "--is-ancestor", "HEAD", BASE])).ok; // exit 0 => HEAD in base
  const baseSha = (await git(wt, ["rev-parse", "--short", BASE])).out || null;

  // ---- dirty changes (tracked vs untracked) + classification ----
  const porcelain = (await git(wt, ["status", "--porcelain=v1", "-uall"])).out;
  const files = [];
  for (const line of porcelain ? porcelain.split("\n") : []) {
    if (!line) continue;
    const code = line.slice(0, 2);
    const path = line.slice(3).replace(/^"|"$/g, "");
    const untracked = code === "??";
    const cls = classifyPath(path);
    files.push({ path, code: code.trim() || "??", untracked, tracked: !untracked, class: cls, class_label: CLASS_LABEL[cls] || cls });
  }
  const tracked = files.filter((f) => f.tracked);
  const untracked = files.filter((f) => f.untracked);
  const bucket = (cls) => files.filter((f) => f.class === cls);
  const hasSource = files.some((f) => ["source", "test", "config"].includes(f.class) && f.tracked);
  const uniquePlanning = files.filter((f) => ["planning-doc", "documentation"].includes(f.class));
  const evidenceFiles = files.filter((f) => ["qa-evidence", "screenshot", "report", "verification"].includes(f.class));

  // ---- evidence preservation (worktree vs durable store) ----
  const wtEvidenceDir = join(wt, ".alloy-agent-evidence");
  const storeDir = join(EVID_STORE_ROOT, sprint.worktree);
  const wtEvidenceMb = dirSizeMb(wtEvidenceDir);
  const storeMb = dirSizeMb(storeDir);
  // Untracked evidence is unique-and-unpreserved unless the durable store already
  // holds an equivalent copy (Preserve Outputs mirrors the worktree evidence).
  const storeHasEvidence = existsSync(join(storeDir, "preserved", "alloy-agent-evidence")) && storeMb >= wtEvidenceMb * 0.9;
  const evidenceUniqueUnpreserved = storeHasEvidence ? [] : evidenceFiles.filter((f) => f.untracked);

  // ---- runtime ----
  const devServerRunning = !!opts.devServerRunning;
  const providerRunning = !!opts.providerRunning;

  // ---- what deletion would lose (unique + unpreserved) ----
  const wouldLose = [];
  for (const f of uniquePlanning) if (f.untracked) wouldLose.push({ kind: "planning", path: f.path });
  if (evidenceUniqueUnpreserved.length) wouldLose.push({ kind: "evidence", count: evidenceUniqueUnpreserved.length, mb: wtEvidenceMb, note: `${wtEvidenceMb}MB of evidence not in the durable store (${storeMb}MB)` });
  for (const f of tracked) wouldLose.push({ kind: "uncommitted-source", path: f.path }); // tracked = uncommitted real edits

  // ---- decision ----
  const reasons = [];
  let result = "safe", label = "Safe to close", next = "Delete Worktree";
  if (hasSource) { result = "commit-remaining"; label = "Commit remaining work"; next = "Review changes, then Commit"; reasons.push(`${tracked.length} uncommitted tracked change(s) — real source edits, never auto-discarded`); }
  else if (uniquePlanning.some((f) => f.untracked)) { result = "review-planning"; label = "Review planning documents"; next = "Review, then Preserve or Commit"; reasons.push(`${uniquePlanning.filter((f) => f.untracked).length} unique planning document(s) not in staging — decide before closing`); }
  else if (evidenceUniqueUnpreserved.length) { result = "preserve-evidence"; label = "Preserve evidence, then close"; next = "Preserve Outputs, then Delete Worktree"; reasons.push(`${evidenceUniqueUnpreserved.length} QA/evidence item(s) live only in the worktree (${wtEvidenceMb}MB; store has ${storeMb}MB)`); }
  if (devServerRunning || providerRunning) { reasons.push(`runtime still active${devServerRunning ? " (dev server)" : ""}${providerRunning ? " (provider)" : ""} — stop before deleting`); if (result === "safe") { result = "stop-runtime"; label = "Stop runtime, then close"; next = "Stop Runtime, then Delete Worktree"; } }
  if (opts.pendingRequests > 0) { reasons.push(`${opts.pendingRequests} Director request(s) not yet finished`); if (result === "safe") { result = "requests-pending"; label = "Wait for Director requests"; next = "Let requests finish"; } }

  const isDirty = files.length > 0;
  const canDelete = !isDirty && !devServerRunning && !providerRunning && !hasSource && !uniquePlanning.some((f) => f.untracked) && evidenceUniqueUnpreserved.length === 0 && !(opts.pendingRequests > 0);

  return {
    ok: true, slot: sprint.slot, worktree: sprint.worktree, branch: sprint.branch,
    repository: { pr_merged: fullyMerged, ahead, behind, fully_merged: fullyMerged, base: BASE, base_sha: baseSha,
      note: fullyMerged ? (behind ? `all commits merged; ${behind} behind is this worker's own merge commit (benign)` : "fully merged") : `${ahead} commit(s) not yet in ${BASE}` },
    runtime: { dev_server_running: devServerRunning, provider_running: providerRunning, port: sprint.port || null },
    changes: {
      total: files.length, tracked: tracked.length, untracked: untracked.length, has_source: hasSource,
      by_class: Object.fromEntries(["source", "test", "config", "planning-doc", "documentation", "qa-evidence", "screenshot", "report", "verification", "generated", "unknown"].map((c) => [c, bucket(c).length]).filter(([, n]) => n > 0)),
      files,
    },
    evidence: { worktree_mb: wtEvidenceMb, store_mb: storeMb, unique_unpreserved: evidenceUniqueUnpreserved.length, preserved: evidenceUniqueUnpreserved.length === 0 },
    planning: { unique_docs: uniquePlanning.filter((f) => f.untracked).map((f) => f.path) },
    outputs_preserved: evidenceUniqueUnpreserved.length === 0,
    unsaved_requests: opts.pendingRequests || 0,
    can_end_work: true, // End Work never destroys — always allowed
    can_delete_worktree: canDelete,
    would_lose: wouldLose,
    result, result_label: label, next_action: next, reasons,
  };
}
