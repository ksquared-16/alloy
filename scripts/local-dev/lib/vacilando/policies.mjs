/**
 * Vacilando Runtime — Policies (read-only).
 *
 * Surfaces how the toolkit is configured TODAY, from authoritative sources
 * (alloy config, read-core constants, the command registry). No second config
 * store; this only reads and groups. Every row cites its source + enforcement.
 */
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

import { listCommands } from "./commands/registry.mjs";

const CONFIG = join(os.homedir(), ".config", "alloy-dev", "config");

function cfg(key, fallback) {
  try {
    if (!existsSync(CONFIG)) return fallback;
    const m = readFileSync(CONFIG, "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
    if (!m) return fallback;
    return m[1].replace(/^["']|["']$/g, "");
  } catch { return fallback; }
}

const P = (name, value, source, enforcement, configurable, related) => ({ name, value, source, enforcement, configurable, related });

export async function collectPolicies() {
  const cmds = listCommands();
  const supported = cmds.filter((c) => c.supported).map((c) => `${c.key} (${c.risk})`);
  const unsupported = cmds.filter((c) => !c.supported).map((c) => `${c.key}: ${c.reason}`);

  return {
    generated_at_source: "read at request time",
    groups: [
      { title: "Projects & missions", rows: [
        P("Projects", "single project (canonical repo) in V1", "Vacilando durable records", "Vacilando", "V1.1 multi-project", "Start Work"),
        P("Mission lifecycle", "draft → assigned → active → review → done | closed", "Vacilando mission record", "Vacilando + toolkit gates", "no", "Start/End Work"),
        P("State ownership", "Vacilando owns project/mission/Director/decision/audit; Git/PR/process/resources are PROJECTED, never copied into a mutable store", "data-model boundary", "runtime", "no", "compose/projections"),
      ]},
      { title: "Execution hosts", rows: [
        P("Hosts", "local (this Mac) only in V1", "Execution Host contract", "Vacilando", "V1.x remote host", "resources"),
        P("Remote execution", "not enabled — console + host on one machine; future: MacBook console → Mac mini host", "roadmap", "n/a", "no", "—"),
        P("Network exposure", "127.0.0.1 loopback only", "vacilando-server.mjs", "hard rule", "no", "—"),
      ]},
      { title: "Scheduler", rows: [
        P("Mode", "deterministic recommendations; auto-scheduling OFF by default", "scheduler.mjs", "operator applies", "policy flag (disabled)", "dashboard"),
        P("Start gate", "blocked when kernel pressure=critical; ≤1 lightweight when warn", "kern.memorystatus_vm_pressure_level", "advisory + eligibility", "thresholds", "sprint.start"),
        P("Never", "auto-pause active real work", "safety policy", "hard rule", "no", "—"),
      ]},
      { title: "Cost budget", rows: [
        P("Cost source", "authoritative only when a provider reports it (Claude when authed); Cursor tokens only", "usage.mjs", "read-only", "add pricing table", "dashboard"),
        P("Budget policy", "none enforced in V1 (usage surfaced, not capped)", "V1 scope", "advisory", "V1.1", "—"),
      ]},
      { title: "Slots & roles", rows: [
        P("Permanent slots", "6 (1–6)", "read-core ALLOY_MAX_AGENTS", "alloy-sprint-start (fail-closed)", "config", "alloy-sprint-start"),
        P("Slot roles", "1 Product · 2 Architecture · 3 Performance · 4 UI/UX · 5 Refactor · 6 Experimental", "README permanent slot identities", "labels only", "config (ALLOY_SLOT_N_ROLE)", "alloy-worker-status"),
      ]},
      { title: "Providers", rows: [
        P("Providers", "Claude (claude), Cursor (cursor-agent)", "installed CLIs", "provider adapter", "no", "director.ask"),
        P("Claude session", "claude 2.1.210 · -p/--resume/json — OAuth may be expired", "claude --version", "provider adapter", "re-auth in terminal", "director.ask"),
        P("Cursor session", "cursor-agent · -p/--trust/--resume/json — authenticated", "cursor-agent --help", "provider adapter", "no", "director.ask"),
      ]},
      { title: "Worktree rules", rows: [
        P("Worktree root", cfg("ALLOY_WORKTREE_ROOT", `${os.homedir()}/Code/alloy-worktrees`), "ALLOY_WORKTREE_ROOT", "alloy-worktree-create", "config", "sprint.start"),
        P("Dependencies", "installed per-worktree; never symlinked", "README §5", "alloy-sprint-start", "no", "sprint.start"),
        P("Base ref", cfg("ALLOY_BASE_BRANCH", "origin/staging"), "alloy config / read-core", "alloy-worktree-create", "config", "sprint.start"),
      ]},
      { title: "Branch rules", rows: [
        P("Branch convention", "agent/<provider>/<slot>-<name>", "lib/common.sh alloy_branch_name", "alloy-worktree-create", "no", "sprint.start"),
        P("Ports", "3011–3016 (slot 1–6); canonical 3000", "read-core ALLOY_FIRST_AGENT_PORT", "alloy-dev-start (fail-closed)", "config", "worker board"),
      ]},
      { title: "Commit / push / promotion", rows: [
        P("Commit", "coherent local commits; agents commit, never push implicitly", "CLAUDE.md / governance", "human", "no", "repository.push"),
        P("Push", "governed command repository.push (git push -u origin) — preview + confirm", "vacilando registry", "operator confirm", "no", "repository.push"),
        P("Open PR", "governed promotion.open_pr (gh pr create --draft --base staging)", "vacilando registry + gh", "operator confirm", "no", "promotion.open_pr"),
        P("PR state", "authoritative via gh pr view (none/draft/open/checks/mergeable/url)", "gh CLI", "read-only", "no", "/api/pr"),
      ]},
      { title: "Merge / release", rows: [
        P("Merge", "governed merge.execute (gh pr merge) — preview + confirm; respects branch protection", "vacilando registry + gh", "operator confirm", "no", "merge.execute"),
        P("Release / auto-merge", "NEVER auto-approved", "safety policy", "hard rule", "no", "—"),
      ]},
      { title: "Approvals", rows: [
        P("Questions", "answered via question.answer → alloy-product-decide", "registry", "operator confirm", "no", "question.answer"),
        P("Reviews", "resolved via review.resolve (approve / request-changes) — audited", "registry + review log", "operator confirm", "no", "review.resolve"),
      ]},
      { title: "Destructive operations", rows: [
        P("Delete worktree", "governed worktree.delete (git worktree remove, never --force) — TYPED confirmation, blocked when dirty", "vacilando registry", "typed confirm", "no", "worktree.delete"),
        P("Force / hard-reset", "never", "safety policy", "hard rule", "no", "—"),
      ]},
      { title: "Runtime & resources", rows: [
        P("Max active providers", cfg("ALLOY_MAX_ACTIVE_PROVIDERS", "3"), "alloy config", "sprint ops", "config", "worker board"),
        P("Max running servers", cfg("ALLOY_MAX_RUNNING_SERVERS", "3"), "alloy config", "sprint ops", "config", "resources"),
        P("Memory pressure", "high ≥88% or load>1.5×cores → recommend 0 new workers", "vacilando resources.mjs", "advisory", "code", "resources"),
        P("Bind", "127.0.0.1 only (loopback)", "vacilando-server.mjs", "hard rule", "no", "—"),
      ]},
      { title: "Director routing", rows: [
        P("Ask (round-trip)", "director.ask → provider -p headless, worktree context; records response + usage", "registry + providers", "operator confirm", "no", "director.ask"),
        P("Route (stage)", "director.route → record + clipboard (manual paste)", "registry", "operator confirm", "no", "director.route"),
        P("Live-buffer injection", "unavailable — no governed API into the running editor", "recon", "n/a", "no", "—"),
      ]},
      { title: "Allowed commands", rows: [
        P("Governed commands", supported.join(" · "), "vacilando registry", "executor (fail-closed)", "no", "Settings"),
      ]},
      { title: "Unsupported", rows: unsupported.map((u) => P(u.split(":")[0], u.split(":").slice(1).join(":").trim(), "recon", "surfaced honestly", "no", "—")) },
    ],
  };
}
