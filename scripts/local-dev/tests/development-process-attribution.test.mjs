#!/usr/bin/env node
/**
 * S1 — provider-descendant ancestry attribution.
 *
 * THE FAILURE THIS ENCODES. The host reached load 54.47 running two vitest
 * suites that no resource owner had ever heard of. One of them lived in
 * /private/tmp/fin-base, so every lookup Vacilando had — all of which start
 * from a worktree or a lane — returned nothing. Its owner was never actually in
 * doubt: the process tree ran straight back to the Surfaces provider seat. We
 * simply had no code that walked it.
 *
 * The reference shape below is that exact ancestry, observed live:
 *   89207 (claude seat) -> 50142 (zsh) -> 50699 (npm exec) -> 50820 (vitest)
 *     -> workers
 *
 * WHAT MUST NEVER REGRESS. Ownership is established by ANCESTRY. A directory is
 * evidence about location, never about ownership — and on this host cwd is
 * usually not even readable, because lsof is absent. A process whose ancestry
 * reaches no seat stays unattributed: reported, never adopted by guess, never
 * killed.
 */
import assert from "node:assert/strict";

const {
  PROCESS_ATTRIBUTION_SCHEMA, ATTRIBUTION_STATUS, MAX_ANCESTRY_DEPTH,
  parseProcessTable, buildProcessIndex, ancestryChain, resolveOwningSeat,
  executionLocationFor, repositoryForWorktree, attributeProcesses,
  unattributedRecord, attributionReport,
} = await import("../lib/vacilando/process-attribution.mjs");

let pass = 0;
let fail = 0;
const started = [];
function test(name, fn) {
  const p = (async () => {
    try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
    catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
  })();
  started.push(p);
  return p;
}

const WT6 = "/Users/Kelly/Code/alloy-worktrees/wt6-surfaces-faacca";
const WT5 = "/Users/Kelly/Code/alloy-worktrees/wt5-vacilando-gateway-v2";

const REPOS = [{
  repository_id: "repo_alloy",
  name: "Alloy",
  root: "/Users/Kelly/Alloy",
  worktree_parent: "/Users/Kelly/Code/alloy-worktrees",
}];

const LANES = [
  { lane_id: "lane_surfaces", name: "Surfaces", binding: { worktree_path: WT6 } },
  { lane_id: "lane_vacilando", name: "Vacilando", binding: { worktree_path: WT5 } },
];

/** Seats exactly as provider-capacity's correlateProviderProcesses emits them. */
const SEATS = [
  { pid: 89207, pane_id: "%17", tmux_session: "alloy-surfaces-faacca", provider: "claude",
    worktree_path: WT6, lane_id: "lane_surfaces", lane_name: "Surfaces", session_state: "READY" },
  { pid: 40549, pane_id: "%13", tmux_session: "alloy-vacilando-gateway-v2", provider: "claude",
    worktree_path: WT5, lane_id: "lane_vacilando", lane_name: "Vacilando", session_state: "READY" },
];

const runFor = (laneId) => (laneId === "lane_surfaces"
  ? { run_id: "erun_surfaces", state: "EXECUTING" }
  : null);

/** The live /private/tmp/fin-base tree, reproduced. */
const TABLE = `
  89207     1 claude
  50142 89207 /bin/zsh -c source snapshot.sh && npm exec vitest
  50699 50142 npm exec vitest run tests/commands tests/lifecycle
  50820 50699 node /private/tmp/fin-base/web/node_modules/.bin/vitest run tests/commands
  51850 50820 node vitest-worker-1
  51887 50820 node vitest-worker-2
  40549     1 claude
  16349 40549 node ${WT6}/web/node_modules/vitest/dist/cli.js run
   9001  8999 /usr/bin/some-unrelated-daemon
   8999     1 launchd-child
`;

await test("fixture 1 — provider → shell → direct child command", () => {
  const rows = parseProcessTable(TABLE);
  const idx = buildProcessIndex(rows);
  const seatPids = new Set([89207, 40549]);
  const r = resolveOwningSeat(50142, idx, seatPids);
  assert.equal(r.seat_pid, 89207);
  assert.equal(r.depth, 1, "shell is one hop from the seat");
});

await test("fixture 2 — provider → shell → vitest parent → worker children", () => {
  const rows = parseProcessTable(TABLE);
  const recs = attributeProcesses({
    seats: SEATS, processes: rows, lanes: LANES, repositories: REPOS, runFor,
  });
  const worker = recs.find((x) => x.pid === 51887);
  assert.ok(worker, "a worker must be attributed");
  assert.equal(worker.root_provider_pid, 89207);
  assert.equal(worker.lane_id, "lane_surfaces");
  assert.equal(worker.attribution_status, "ancestry");
  assert.equal(worker.attribution_basis, "process_ancestry");
  // seat -> zsh -> npm -> vitest -> worker
  assert.equal(worker.ancestry_depth, 4);
  assert.deepEqual(worker.ancestry_chain.map((c) => c.pid), [51887, 50820, 50699, 50142, 89207]);
});

await test("fixture 3 — workload inside its registered worktree", () => {
  const rows = parseProcessTable(TABLE);
  const recs = attributeProcesses({
    seats: SEATS, processes: rows, lanes: LANES, repositories: REPOS, runFor,
  });
  const inside = recs.find((x) => x.pid === 16349);
  assert.equal(inside.lane_id, "lane_vacilando");
  // cwd is unreadable without lsof; the command line names the worktree, and
  // that is the only reason this resolves as inside.
  assert.equal(inside.cwd_source, "unavailable");
  assert.equal(executionLocationFor({ cwd: `${WT6}/web`, command: null, worktreePath: WT6 }), "inside_worktree");
});

await test("fixture 4 — provider-owned workload under /private/tmp", () => {
  // THE CASE THAT STARTED THIS. No worktree, full ownership.
  const rows = parseProcessTable(TABLE);
  const recs = attributeProcesses({
    seats: SEATS, processes: rows, lanes: LANES, repositories: REPOS, runFor,
  });
  const tmp = recs.find((x) => x.pid === 50820);
  assert.ok(tmp, "off-worktree work must still be attributed");
  assert.equal(tmp.root_provider_pid, 89207);
  assert.equal(tmp.lane_id, "lane_surfaces");
  assert.equal(tmp.repository_id, "repo_alloy");
  assert.equal(tmp.execution_run_id, "erun_surfaces");
  assert.equal(tmp.attribution_status, "ancestry");
  assert.equal(
    executionLocationFor({ cwd: "/private/tmp/fin-base/web", command: null, worktreePath: WT6 }),
    "outside_worktree",
  );
});

await test("fixture 5 — heavy process with no provider ancestor stays unattributed", () => {
  const rows = parseProcessTable(TABLE);
  const idx = buildProcessIndex(rows);
  const rep = attributionReport({
    seats: SEATS, processes: rows, lanes: LANES, repositories: REPOS, runFor,
    interesting: (r) => r.pid === 9001 || r.pid === 50820,
  });
  const orphan = rep.records.find((x) => x.pid === 9001);
  assert.equal(orphan.attribution_status, "unattributed");
  assert.equal(orphan.root_provider_pid, null);
  assert.equal(orphan.lane_id, null, "ownership must never be invented");
  assert.equal(orphan.attribution_basis, null);
  assert.equal(rep.unattributed_count, 1);
  // It is still REPORTED — omitting it would hide the very case we are chasing.
  assert.ok(rep.records.some((x) => x.pid === 9001));
  const direct = unattributedRecord({ pid: 9001, ppid: 8999, command: "x" }, idx);
  assert.equal(direct.attribution_status, "unattributed");
});

await test("fixture 6 — provider with no active Execution Run", () => {
  const rows = parseProcessTable(TABLE);
  const recs = attributeProcesses({
    seats: SEATS, processes: rows, lanes: LANES, repositories: REPOS, runFor,
  });
  const vac = recs.find((x) => x.pid === 16349);
  assert.equal(vac.lane_id, "lane_vacilando");
  // runFor returns null for this lane: a seat without a run is normal, and the
  // record says so rather than omitting the lane.
  assert.equal(vac.execution_run_id, null);
  assert.equal(vac.execution_run_state, null);
  assert.equal(vac.attribution_status, "ancestry");
});

await test("fixture 7 — two providers with independent descendant trees", () => {
  const rows = parseProcessTable(TABLE);
  const recs = attributeProcesses({
    seats: SEATS, processes: rows, lanes: LANES, repositories: REPOS, runFor,
  });
  const surfaces = recs.filter((x) => x.root_provider_pid === 89207).map((x) => x.pid).sort();
  const vacilando = recs.filter((x) => x.root_provider_pid === 40549).map((x) => x.pid).sort();
  assert.deepEqual(surfaces, [50142, 50699, 50820, 51850, 51887, 89207].sort());
  assert.deepEqual(vacilando, [16349, 40549].sort());
  // No process may belong to two seats.
  const overlap = surfaces.filter((p) => vacilando.includes(p));
  assert.deepEqual(overlap, []);
});

// ── NEGATIVE CONTROLS ────────────────────────────────────────────────────────

await test("NEGATIVE — removing the provider ancestry link loses attribution", () => {
  // Reparent the shell away from the seat: same command, same worktree, same
  // everything except the ancestry link. Attribution MUST fail.
  const severed = TABLE.replace("  50142 89207 ", "  50142  8999 ");
  const rows = parseProcessTable(severed);
  const rep = attributionReport({
    seats: SEATS, processes: rows, lanes: LANES, repositories: REPOS, runFor,
    interesting: (r) => r.pid === 50820,
  });
  const rec = rep.records.find((x) => x.pid === 50820);
  assert.equal(rec.attribution_status, "unattributed",
    "with the seat link cut, the workload must NOT resolve to a lane");
  assert.equal(rec.root_provider_pid, null);
  assert.equal(rec.lane_id, null);

  // POSITIVE CONTROL: the identical table WITH the link attributes cleanly, so
  // the assertion above is about ancestry and nothing else.
  const intact = attributionReport({
    seats: SEATS, processes: parseProcessTable(TABLE), lanes: LANES, repositories: REPOS, runFor,
    interesting: (r) => r.pid === 50820,
  });
  assert.equal(intact.records[0].attribution_status, "ancestry");
  assert.equal(intact.records[0].lane_id, "lane_surfaces");
});

await test("NEGATIVE — replacing the seat pid does not transfer ownership", () => {
  const rows = parseProcessTable(TABLE);
  // A seat that is not in the tree cannot claim the tree.
  const wrongSeat = [{ ...SEATS[0], pid: 77777 }];
  const rep = attributionReport({
    seats: wrongSeat, processes: rows, lanes: LANES, repositories: REPOS, runFor,
    interesting: (r) => r.pid === 50820,
  });
  assert.equal(rep.records[0].attribution_status, "unattributed");
  assert.equal(rep.records[0].lane_id, null);
});

await test("NEGATIVE — cwd alone never establishes ownership", () => {
  const rows = parseProcessTable(TABLE.replace("  50142 89207 ", "  50142  8999 "));
  const rep = attributionReport({
    seats: SEATS, processes: rows, lanes: LANES, repositories: REPOS, runFor,
    interesting: (r) => r.pid === 50820,
    // Hand it a cwd squarely inside the Surfaces worktree. Ancestry is severed,
    // so this must still not produce an owner.
    lsof: () => `${WT6}/web`,
  });
  assert.equal(rep.records[0].attribution_status, "unattributed");
  assert.equal(rep.records[0].lane_id, null);
});

// ── Safety and shape ─────────────────────────────────────────────────────────

await test("the depth bound truncates a deep acyclic chain", () => {
  // A mutation removing the bound still passed the cycle fixture, because the
  // `seen` set is what stops cycles. This is what the bound is actually for.
  const rows = [];
  for (let i = 1; i <= 40; i += 1) rows.push({ pid: i, ppid: i + 1, command: `p${i}` });
  rows.push({ pid: 41, ppid: 1, command: "root" });
  const idx = buildProcessIndex(rows);
  const chain = ancestryChain(1, idx);
  assert.equal(chain.length, MAX_ANCESTRY_DEPTH, "chain must be capped at the bound");
  // And a seat beyond the bound is deliberately NOT reachable.
  assert.equal(resolveOwningSeat(1, idx, new Set([30])).seat_pid, null);
});

await test("the walk is bounded and survives a cycle", () => {
  const idx = buildProcessIndex([
    { pid: 10, ppid: 11, command: "a" },
    { pid: 11, ppid: 10, command: "b" },
  ]);
  const chain = ancestryChain(10, idx);
  assert.ok(chain.length <= MAX_ANCESTRY_DEPTH);
  assert.deepEqual(chain.map((c) => c.pid), [10, 11]);
  assert.equal(resolveOwningSeat(10, idx, new Set([99])).seat_pid, null);
});

await test("ps column padding is parsed, not mistaken for a field", () => {
  const rows = parseProcessTable("     1     0 launchd\n 51887 50820 node worker\n");
  assert.deepEqual(rows, [
    { pid: 1, ppid: 0, command: "launchd" },
    { pid: 51887, ppid: 50820, command: "node worker" },
  ]);
});

await test("the record carries every field the contract requires", () => {
  const rows = parseProcessTable(TABLE);
  const [rec] = attributeProcesses({
    seats: SEATS, processes: rows, lanes: LANES, repositories: REPOS, runFor,
    interesting: (r) => r.pid === 50820,
  });
  for (const field of [
    "pid", "ppid", "root_provider_pid", "lane_id", "provider", "execution_run_id",
    "repository_id", "worktree_path", "cwd", "ancestry_chain", "attribution_status",
    "execution_location", "schema_version",
  ]) {
    assert.ok(field in rec, `contract field missing: ${field}`);
  }
  assert.equal(rec.schema_version, PROCESS_ATTRIBUTION_SCHEMA);
  assert.ok(ATTRIBUTION_STATUS.includes(rec.attribution_status));
});

await test("S1 performs no mutation — the module cannot signal or spawn", async () => {
  // Read the source rather than trusting intent: visibility precedes
  // enforcement, and the guarantee is that this slice CANNOT enforce.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "..", "lib", "vacilando", "process-attribution.mjs"), "utf8");
  for (const forbidden of ["process.kill", "kill -", "send-keys", "execFile", "spawn(", "rm -rf", "unlinkSync", "writeFileSync"]) {
    assert.equal(src.includes(forbidden), false, `S1 must not contain: ${forbidden}`);
  }
});

await test("a seat attributes to itself, so its own footprint is countable", () => {
  const rows = parseProcessTable(TABLE);
  const recs = attributeProcesses({
    seats: SEATS, processes: rows, lanes: LANES, repositories: REPOS, runFor,
    interesting: (r) => r.pid === 89207,
  });
  assert.equal(recs[0].attribution_status, "seat");
  assert.equal(recs[0].root_provider_pid, 89207);
  assert.equal(recs[0].ancestry_depth, 0);
});

await test("repository resolves from the worktree parent, and refuses a stranger", () => {
  assert.equal(repositoryForWorktree(WT6, REPOS).repository_id, "repo_alloy");
  assert.equal(repositoryForWorktree("/Users/Kelly/Alloy", REPOS).repository_id, "repo_alloy");
  assert.equal(repositoryForWorktree("/private/tmp/fin-base", REPOS), null);
  assert.equal(repositoryForWorktree(null, REPOS), null);
});

await test("execution location is honest when it cannot tell", () => {
  // `npm run dev` names no path. Unknown must not become "outside".
  assert.equal(executionLocationFor({ cwd: null, command: "npm run dev", worktreePath: WT6 }), "unknown");
  assert.equal(executionLocationFor({ cwd: null, command: null, worktreePath: null }), "no_registered_worktree");
});

await Promise.all(started);
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
