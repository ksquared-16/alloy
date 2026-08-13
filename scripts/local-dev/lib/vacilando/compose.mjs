/**
 * Vacilando Runtime — compose.
 *
 * Collect authoritative sources ONCE via sources.collectRaw (Node workspace
 * snapshot + singleflight TTL), enrich each occupied slot, then run the six
 * pure projection modules. Evidence counts come from the snapshot (readdir);
 * git activity uses a slower TTL cache — never six parallel alloy-ro evidence
 * shells on the hot path.
 *
 * Time is INJECTED (nowMs) so a snapshot is a deterministic function of state
 * plus one clock reading — replayable, testable, cacheable.
 */
import { join } from "node:path";

import * as S from "./sources.mjs";
import { SNAPSHOT_SCHEMA, gap, isoFromMs, parseAheadBehind } from "./model.mjs";
import { projectProject } from "./project.mjs";
import { projectSprints } from "./sprint.mjs";
import { projectWorkers, workerCounts } from "./worker.mjs";
import { projectRepository } from "./repository.mjs";
import { projectApprovals } from "./approval.mjs";
import { projectActivity } from "./activity.mjs";
import { reviewDispositions } from "./commands/review.mjs";

const PERMANENT_SLOTS = 6;

/** Enrich one occupied slot (an agent-status record) with the remaining reads. */
async function enrichSlot(agent, ctx) {
  const worktree = agent.worktree;
  const ab = parseAheadBehind(agent.ahead_behind);
  const detail = ctx.details.get(worktree) || {};
  const manifest = ctx.manifests.get(worktree) || { present: false };
  const initiativeKey = manifest.initiative_key || null;
  const initiative = initiativeKey ? ctx.initiativeByKey.get(initiativeKey) || null : null;
  const path = agent.path || (worktree ? join(ctx.worktreeRoot, worktree) : null);
  const evidenceCount = ctx.evidence?.get?.(worktree) ?? 0;
  const git_recent = await S.gitRecent(path);

  return {
    slot: Number(agent.slot),
    worktree,
    sprint: agent.sprint || worktree,
    provider: agent.provider,
    git: agent.git,
    ahead: ab.ahead,
    behind: ab.behind,
    server: agent.server ?? "unknown",
    port: agent.port ?? null,
    path,
    branch: agent.branch || null,
    branch_expected: agent.branch_expected || null,
    lifecycle: agent.lifecycle || detail.lifecycle || null,
    agent_status: agent.agent_status || detail.agent_status || null,
    detail,
    manifest,
    initiative,
    evidence: { count: evidenceCount },
    git_recent,
  };
}

/** Build the full Command Center snapshot. `opts.nowMs` injects the clock. */
export async function composeSnapshot(opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const raw = await S.collectRaw({ force: opts.forceSources === true });

  const occupied = (raw.agents.agents || []).filter((a) => a.worktree);
  const initiativeByKey = new Map((raw.initiatives || []).map((i) => [i.key, i]));
  const worktreeRoot = deriveWorktreeRoot(raw);
  const firstPath = occupied[0]?.path || null;
  const base = { ref: "origin/staging", sha: await S.baseSha(firstPath) };

  const enrichCtx = { worktreeRoot, initiativeByKey, details: raw.details, manifests: raw.manifests, evidence: raw.evidence };
  const sprintsCtx = await Promise.all(occupied.map((a) => enrichSlot(a, enrichCtx)));

  const slotByInitiative = new Map(
    sprintsCtx.filter((e) => e.initiative?.key).map((e) => [e.initiative.key, { sprint: e.sprint, slot: e.slot }]),
  );

  const sprints = projectSprints(sprintsCtx, nowMs);
  const workers = projectWorkers(sprintsCtx);
  const repository = projectRepository(sprintsCtx, { root: raw.root, base });
  const approvals = projectApprovals(raw.initiatives || [], slotByInitiative, reviewDispositions());
  const activity = projectActivity(sprintsCtx);
  const project = projectProject({ root: raw.root, base }, sprints);

  const headline = composeHeadline({ sprints, workers, approvals, repository, maxSlots: PERMANENT_SLOTS });
  const gaps = collectGaps(project, sprints, sourcesHealthy(raw));

  return {
    schema_version: SNAPSHOT_SCHEMA,
    generated_at: isoFromMs(nowMs),
    sources: sourcesHealthy(raw),
    project,
    headline,
    sprints,
    workers,
    repository,
    approvals,
    activity,
    gaps,
  };
}

function composeHeadline({ sprints, workers, approvals, repository, maxSlots }) {
  const wc = workerCounts(workers, maxSlots);
  const activeSprints = sprints.filter((s) => !["complete", "idle"].includes(s.status)).length;
  return {
    active_sprints: activeSprints,
    workers_running: wc,
    questions_pending: approvals.counts.questions,
    prs_ready: approvals.counts.merges,
    tests_passing: { value: null, gap: true, note: "test pass-rate not tracked by the toolkit" },
    staging_sync: repository.counts.behind === 0 ? "up_to_date" : `${repository.counts.behind} behind`,
    needs_you: approvals.total,
  };
}

function collectGaps(project, sprints, sources) {
  const gaps = [...(project.gaps || [])];
  gaps.push(gap("headline.tests_passing", "No test pass-rate is recorded anywhere in the toolkit state.", "A validation result record written by alloy-validate."));
  gaps.push(gap("sprint.phase.index/total", "Numbered phases ('4 of 7') are not modelled; only lifecycle stages exist.", "A phase plan in the initiative (ordered phases) or sprint manifest."));
  gaps.push(gap("repository.worktrees[].pr", "PRs are printed but never executed or tracked by the toolkit.", "A PR record (e.g. gh api) or a promotion ledger."));
  gaps.push(gap("activity[].source=git log", "Activity commits are projected from read-only git log directly, not through alloy-ro.", "A governed alloy-ro worker-activity verb (optional; git is authoritative VCS truth)."));
  if (sprints.some((s) => s.progress.value === null)) {
    gaps.push(gap("sprint.progress", "Managed sprints without an initiative have no progress signal.", "Initiative-backed sprints, or a declared phase plan."));
  }
  for (const [k, v] of Object.entries(sources)) {
    if (v && v.ok === false) gaps.push(gap(`source.${k}`, `Authoritative source unavailable: ${v.error || "unknown"}.`, "The underlying alloy-ro verb to succeed."));
  }
  return gaps;
}

function sourcesHealthy(raw) {
  return {
    agent_status: { ok: raw.agents.ok !== false, error: raw.agents.error || null },
    runtime_paths: { ok: Boolean(raw.paths.runtime_root), error: null },
    initiatives: { ok: Array.isArray(raw.initiatives), error: null },
  };
}

function deriveWorktreeRoot(raw) {
  const anyPath = (raw.agents.agents || [])[0]?.path;
  if (anyPath) return anyPath.replace(/\/[^/]+$/, "");
  return join(process.env.HOME || "", "Code", "alloy-worktrees");
}
