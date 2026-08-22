#!/usr/bin/env node
/**
 * Capacity must count what is RUNNING.
 *
 * The operator could not start a lane: "no capacity", while two lanes were
 * active. The gate for an unbound lane is assessProvisionCapacity, and it
 * counted METADATA — every worktree whose `lifecycle` was not "finished" was
 * treated as running an agent, and a worktree whose `agent_status` was EMPTY
 * counted as active too.
 *
 * Measured on the host: 5 worktrees claimed slots, 4 were counted as active
 * providers against a cap of 3 — and exactly ONE of them had a live agent in
 * it. Three sprints had ended without their metadata being marked finished and
 * a fourth had never recorded a status. Meanwhile the two busiest worktrees on
 * the machine had no metadata file at all, so they were not counted.
 *
 * A slot is a place to work. A provider is a running process. Only the second
 * is scarce.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-capacity-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
delete process.env.ALLOY_MAX_ACTIVE_PROVIDERS;

const { agentBearingWorktreePaths, assessProvisionCapacity } =
  await import("../lib/vacilando/alloy-dev-adapter.mjs");
const { renderCapacityHolders, renderLaneRuntimeControls, deriveLaneExecutionPosture } =
  await import("../apps/vacilando/public/gateway-view.mjs");

/** Worktrees that exist on disk, so the existsSync filter is satisfied. */
const WT = mkdtempSync(join(tmpdir(), "vac-capacity-wt-"));
function wt(name) {
  const p = join(WT, name);
  mkdirSync(p, { recursive: true });
  writeFileSync(join(p, ".keep"), "", "utf8");
  return p;
}

// The host's real shape when the refusal happened: five slots claimed, one agent.
const META = [
  { slot: 1, name: "wt1-vacilando-mac-mini-readiness", lifecycle: "active", agent_status: "active", path: wt("wt1") },
  { slot: 2, name: "wt2-trust-phase28-live-qa", lifecycle: "active", agent_status: "active", path: wt("wt2") },
  { slot: 3, name: "wt3-communications-inbound-sms", lifecycle: "active", agent_status: "active", path: wt("wt3") },
  { slot: 4, name: "wt4-enrollment-phase2", lifecycle: "active", agent_status: "active", path: wt("wt4") },
  { slot: 6, name: "wt6-director-experience", lifecycle: "active", agent_status: "", path: wt("wt6") },
];
const pane = (cwd, command, extra = {}) => ({ cwd, command, title: "", dead: false, ...extra });

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

test("an agent is a live pane running an agent — not a shell, not a node script", () => {
  const paths = agentBearingWorktreePaths([
    pane("/w/a", "claude"),
    pane("/w/b", "2.1.239"),          // the TUI reports its own semver
    pane("/w/c", "cursor-agent"),
    pane("/w/d", "node"),             // a script, not an agent
    pane("/w/e", "zsh"),              // a shell
    pane("/w/f", "claude", { dead: true }),
    pane("", "claude"),               // no cwd to attribute
  ]);
  assert.deepEqual([...paths].sort(), ["/w/a", "/w/b", "/w/c"]);
  // A trailing slash must not create a second holder for the same worktree.
  assert.equal(agentBearingWorktreePaths([pane("/w/a/", "claude"), pane("/w/a", "claude")]).size, 1);
});

test("the live count replaces the metadata count, and names the holders", () => {
  const live = assessProvisionCapacity({
    metadata: META,
    providerPanes: [
      pane(META[3].path, "2.1.239"),                 // the ONE worktree really running an agent
      pane(join(WT, "wt5-elsewhere"), "2.1.239"),    // busy, and has no metadata file at all
      pane(META[0].path, "node"),                    // a node script does not hold an agent
    ],
  });
  assert.equal(live.counted_from, "live_panes");
  assert.equal(live.active_providers, 2, "two live agents, whatever the metadata says");
  assert.deepEqual(
    live.provider_holders.map((h) => h.name).sort(),
    ["wt4-enrollment-phase2", "wt5-elsewhere"],
    "including a worktree with no slot record",
  );
  assert.equal(live.provider_holders.find((h) => h.name === "wt4-enrollment-phase2").slot, 4);
  assert.equal(live.blockers.includes("provider_capacity"), false, "2 of 3 leaves room");
  assert.equal(live.available, true);
});

test("an unknown agent status is not an active agent", () => {
  // Slot 6 carried agent_status:"" and was counted as active, so a dormant
  // worktree held a provider slot indefinitely.
  const metaOnly = assessProvisionCapacity({ metadata: META });
  assert.equal(metaOnly.counted_from, "metadata");
  assert.equal(metaOnly.active_providers, 4, "the four explicit actives, not the unknown one");
  assert.equal(metaOnly.provider_holders.some((h) => h.name === "wt6-director-experience"), false);
});

test("a finished sprint stops holding capacity", () => {
  const finished = META.map((m) => (m.slot === 4 ? m : { ...m, lifecycle: "finished" }));
  const out = assessProvisionCapacity({ metadata: finished });
  assert.equal(out.active_providers, 1);
  assert.equal(out.occupied_slots, 1);
  assert.equal(out.blockers.length, 0);
});

test("a real ceiling still refuses, and says so", () => {
  const full = assessProvisionCapacity({
    metadata: META,
    providerPanes: [pane(META[0].path, "claude"), pane(META[1].path, "claude"), pane(META[3].path, "claude")],
  });
  assert.equal(full.active_providers, 3);
  assert.equal(full.max_providers, 3);
  assert.deepEqual(full.blockers, ["provider_capacity"]);
  assert.equal(full.available, false);
  assert.equal(full.provider_holders.length, 3, "and it can name every holder");
});

test("the refusal tells the operator who holds it and how to free one", () => {
  const capacity = {
    max_active: 3,
    active_providers: 3,
    provider_holders: [{ name: "Runtime Performance" }, { name: "Trust Runtime" }, { name: "Vacilando" }],
  };
  const html = renderCapacityHolders(capacity);
  assert.match(html, /All 3 agents are in use/);
  assert.match(html, /Runtime Performance/);
  assert.match(html, /Trust Runtime/);
  assert.match(html, /Release execution capacity/);
  assert.match(html, /worktree and branch all stay/);
  assert.match(html, /ALLOY_MAX_ACTIVE_PROVIDERS/);

  // With room to spare there is nothing to explain.
  assert.equal(renderCapacityHolders({ max_active: 3, active_providers: 1 }), "");
  assert.equal(renderCapacityHolders(null), "");

  // And it reaches the queued lane's Runtime panel.
  const queued = {
    lane_id: "lane_abc123abc123", label: "Surfaces",
    claude: { presence: "absent" }, binding: null,
    admission: { state: "QUEUED", queue_position: 1, requested_at: new Date().toISOString() },
    execution_run: { state: "QUEUED", state_reason: "waiting_for_execution_capacity" },
  };
  const panel = renderLaneRuntimeControls(queued, deriveLaneExecutionPosture(queued), { capacity });
  assert.match(panel, /data-posture="QUEUED_FOR_CAPACITY"/);
  assert.match(panel, /All 3 agents are in use/);
  assert.match(panel, /Trust Runtime/);
});

process.stdout.write(`\n1..${pass + fail}\npass ${pass}\nfail ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
