/**
 * Vacilando Runtime — compose.
 *
 * Orchestrates the read: collect authoritative sources ONCE, enrich each
 * occupied slot into a per-sprint context, then run the six pure projection
 * modules and assemble the single Command Center snapshot the UI binds to.
 *
 * The snapshot is the whole contract between runtime and presentation. If a
 * field is here, a UI component may bind to it and contain no business logic.
 * If a field is a gap, it is listed in `snapshot.gaps` — never faked.
 *
 * Time is INJECTED (nowMs) so a snapshot is a deterministic function of state
 * plus a single clock reading — replayable, testable, cacheable.
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

/** Enrich one occupied slot with every authoritative read a projection needs. */
async function enrichSlot(slot, ctx) {
  const { paths, agentsByWorktree, serversByWorktree } = ctx;
  const worktree = slot.worktree;
  const agent = agentsByWorktree.get(worktree) || {};
  const server = serversByWorktree.get(worktree) || {};
  const ab = parseAheadBehind(slot.ahead_behind);

  const path = agent.path || (worktree ? join(ctx.worktreeRoot, worktree) : null);
  const meta = S.readMetadataEnv(join(paths.metadata_dir, `${worktree}.env`));
  const manifest = paths.manifests_dir ? S.readManifest(paths.manifests_dir, worktree) : S.readJson(join(paths.runtime_root, "manifests", `${worktree}.json`)).data;
  const initiativeKey = manifest?.initiative_key && manifest.initiative_key !== "undeclared" ? manifest.initiative_key : null;
  let initiative = initiativeKey ? S.readInitiative(paths.initiatives_dir, initiativeKey) : null;
  if (initiative && !initiative.key) initiative.key = initiativeKey;
  const evidence = S.evidenceFor(paths.evidence_dir, worktree);
  const git_recent = await S.gitRecent(path);

  return {
    slot: slot.slot,
    worktree,
    sprint: slot.sprint,
    provider: slot.provider,
    git: slot.git,
    ahead: ab.ahead,
    behind: ab.behind,
    server: slot.server ?? server.server ?? "unknown",
    port: slot.port ?? server.port ?? null,
    server_pid: server.server_pid || null,
    path,
    branch: agent.branch || meta.ALLOY_WORKTREE_BRANCH || null,
    branch_expected: agent.branch_expected || null,
    lifecycle: agent.lifecycle || meta.ALLOY_WORKER_LIFECYCLE || null,
    agent_status: agent.agent_status || meta.ALLOY_AGENT_STATUS || null,
    meta,
    manifest,
    initiative,
    evidence,
    git_recent,
  };
}

/**
 * Build the full Command Center snapshot. `opts.nowMs` injects the clock;
 * `opts.maxSlots` overrides the slot ceiling (default derived from sources).
 */
export async function composeSnapshot(opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const raw = await S.collectRaw();

  const paths = {
    runtime_root: raw.paths.runtime_root,
    metadata_dir: raw.paths.metadata_dir,
    initiatives_dir: raw.paths.initiatives_dir,
    evidence_dir: raw.paths.evidence_dir,
    manifests_dir: raw.paths.runtime_root ? join(raw.paths.runtime_root, "manifests") : null,
  };
  const worktreeRoot = deriveWorktreeRoot(raw);

  const agentsByWorktree = new Map((raw.agents.agents || []).map((a) => [a.worktree, a]));
  const serversByWorktree = new Map((raw.servers.servers || []).map((s) => [s.worktree, s]));

  const occupied = (raw.slots.slots || []).filter((s) => s.occupied && s.worktree);
  const enrichCtx = { paths, worktreeRoot, agentsByWorktree, serversByWorktree };
  const sprintsCtx = await Promise.all(occupied.map((s) => enrichSlot(s, enrichCtx)));

  // Approvals are a project-wide queue over ALL initiatives, not just slots.
  const allInitiatives = S.readAllInitiatives(paths.initiatives_dir);
  const slotByInitiative = new Map(
    sprintsCtx.filter((e) => e.initiative?.key).map((e) => [e.initiative.key, { sprint: e.sprint, slot: e.slot }]),
  );

  // Run the six projections (pure over enriched context).
  const sprints = projectSprints(sprintsCtx);
  const workers = projectWorkers(sprintsCtx);
  const repository = projectRepository(sprintsCtx, raw);
  const approvals = projectApprovals(allInitiatives, slotByInitiative);
  const activity = projectActivity(sprintsCtx);
  const project = projectProject(raw, sprints);

  const maxSlots = opts.maxSlots ?? (raw.slots.slots || []).length ?? 6;
  const headline = composeHeadline({ sprints, workers, approvals, repository, maxSlots });

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
    workers_running: wc, // { running, total }
    questions_pending: approvals.counts.questions,
    prs_ready: approvals.counts.merges, // merge-ready gates; PR objects themselves are a gap
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
    worker_status: { ok: raw.slots.ok !== false, error: raw.slots.error || null },
    agent_status: { ok: raw.agents.ok !== false, error: raw.agents.error || null },
    dev_status: { ok: raw.servers.ok !== false, error: raw.servers.error || null },
    runtime_paths: { ok: Boolean(raw.paths.runtime_root), error: null },
  };
}

function deriveWorktreeRoot(raw) {
  const anyPath = (raw.agents.agents || [])[0]?.path;
  if (anyPath) return anyPath.replace(/\/[^/]+$/, "");
  return join(process.env.HOME || "", "Code", "alloy-worktrees");
}
