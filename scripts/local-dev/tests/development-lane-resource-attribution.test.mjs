/**
 * LANE RESOURCE ATTRIBUTION.
 *
 * The negative cases matter more than the positive one. An attribution that is
 * merely absent is honest; an attribution that is confidently wrong is the
 * thing this module was written to prevent, and it shipped that bug once — a
 * seat with no live pane walked the descendants of pid 0 and reported one lane
 * holding every process on the host.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { laneResourceUse, descendantPids, buildProcessIndex } from "../lib/vacilando/process-attribution.mjs";
import { attachLaneResourceUse, resetLaneResourceCache } from "../lib/vacilando/lane-resource-use.mjs";

// seat 100 -> 200 -> 300, and an unrelated tree under 900.
const PROCESSES = [
  { pid: 1, ppid: 0, command: "/sbin/launchd" },
  { pid: 100, ppid: 1, command: "claude.exe --lane a" },
  { pid: 200, ppid: 100, command: "node runner" },
  { pid: 300, ppid: 200, command: "vitest worker" },
  { pid: 400, ppid: 1, command: "claude.exe --lane b" },
  { pid: 900, ppid: 1, command: "Google Chrome" },
  { pid: 901, ppid: 900, command: "Chrome Helper" },
];
const MEM = new Map([[1, 9000], [100, 102400], [200, 51200], [300, 25600], [400, 40960], [900, 800000], [901, 400000]]);

await test("a lane owns its seat and everything descended from it", () => {
  const [a] = laneResourceUse({
    seats: [{ pid: 100, lane_id: "lane_a" }], processes: PROCESSES, memoryByPid: MEM,
  });
  assert.equal(a.lane_id, "lane_a");
  assert.equal(a.process_count, 3, "seat plus two descendants");
  assert.equal(a.memory_kb, 102400 + 51200 + 25600);
  assert.equal(a.memory_mb, 175);
  assert.equal(a.complete, true);
  assert.equal(a.attribution, "ancestry");
});

await test("an unrelated tree is never attributed", () => {
  const [a] = laneResourceUse({
    seats: [{ pid: 100, lane_id: "lane_a" }], processes: PROCESSES, memoryByPid: MEM,
  });
  assert.ok(a.memory_kb < 800000, "Chrome is not this lane's memory");
  assert.equal(a.seat_pids.includes(900), false);
});

await test("a seat with no pid owns NOTHING — it must not walk from pid 0", () => {
  // THE REGRESSION. Number(null) is 0 and 0 is an integer, so a pidless seat
  // walked every process on the host and reported 19.4 GB against one lane.
  const rows = laneResourceUse({
    seats: [{ pid: null, lane_id: "lane_ghost" }, { pid: 100, lane_id: "lane_a" }],
    processes: PROCESSES, memoryByPid: MEM,
  });
  assert.equal(rows.some((r) => r.lane_id === "lane_ghost"), false,
    "a lane with no live seat is UNKNOWN, never a claim on the machine");
  assert.equal(rows.length, 1);
});

await test("pid 0 and pid 1 are walk terminators, never owners", () => {
  for (const pid of [0, 1]) {
    const rows = laneResourceUse({ seats: [{ pid, lane_id: "lane_root" }], processes: PROCESSES, memoryByPid: MEM });
    assert.equal(rows.length, 0, `pid ${pid} must never own a lane`);
  }
});

await test("tmux reports pane pids as strings, and that must still attribute", () => {
  const [a] = laneResourceUse({
    seats: [{ pid: "100", lane_id: "lane_a" }], processes: PROCESSES, memoryByPid: MEM,
  });
  assert.equal(a.process_count, 3);
});

await test("no memory sample is UNKNOWN, not zero", () => {
  const [a] = laneResourceUse({
    seats: [{ pid: 100, lane_id: "lane_a" }], processes: PROCESSES, memoryByPid: new Map(),
  });
  assert.equal(a.memory_kb, null, "a lane we could not measure must not read as empty");
  assert.equal(a.memory_mb, null);
  assert.equal(a.process_count, 3, "the tree is still known even when unmeasured");
});

await test("a process that exited between the two reads is counted, not invented", () => {
  const partial = new Map([[100, 102400], [200, 51200]]);
  const [a] = laneResourceUse({
    seats: [{ pid: 100, lane_id: "lane_a" }], processes: PROCESSES, memoryByPid: partial,
  });
  assert.equal(a.process_count, 3);
  assert.equal(a.measured_process_count, 2);
  assert.equal(a.complete, false, "the record says the total is partial rather than pretending");
  assert.equal(a.memory_kb, 153600);
});

await test("two seats on one lane merge without double counting", () => {
  const [a] = laneResourceUse({
    seats: [{ pid: 100, lane_id: "lane_a" }, { pid: 200, lane_id: "lane_a" }],
    processes: PROCESSES, memoryByPid: MEM,
  });
  assert.equal(a.process_count, 3, "200 is both a seat and a descendant of 100 — counted once");
  assert.equal(a.memory_kb, 179200);
});

await test("CPU is declared absent, never estimated", () => {
  const [a] = laneResourceUse({ seats: [{ pid: 100, lane_id: "lane_a" }], processes: PROCESSES, memoryByPid: MEM });
  assert.equal(a.cpu_pct, null);
  assert.match(a.cpu_reason, /lifetime average/);
});

await test("the descendant walk is cycle-safe", () => {
  const cyclic = [{ pid: 10, ppid: 11, command: "a" }, { pid: 11, ppid: 10, command: "b" }];
  const kids = descendantPids(10, buildProcessIndex(cyclic));
  assert.equal(kids.has(10), false, "a cycle must not make a process its own descendant");
  assert.ok(kids.has(11));
});

await test("the attacher joins onto lanes and leaves unattributed lanes alone", async () => {
  resetLaneResourceCache();
  const lanes = [{ lane_id: "lane_a", label: "A" }, { lane_id: "lane_z", label: "Z" }];
  const out = await attachLaneResourceUse(lanes, {
    observeSeats: async () => [{ pid: 100, lane_id: "lane_a" }],
    readProcessTable: async () => PROCESSES.map((r) => `${r.pid} ${r.ppid} ${r.command}`).join("\n"),
    readProcessMemory: async () => MEM,
  });
  assert.equal(out[0].resource_use.memory_mb, 175);
  assert.equal(out[0].resource_use.schema_version, "vacilando.lane_resource_use.v1");
  assert.equal("resource_use" in out[1], false, "a lane with no seat carries no reading at all");
});

await test("a failed probe degrades the field, never the lane list", async () => {
  resetLaneResourceCache();
  const lanes = [{ lane_id: "lane_a", label: "A" }];
  const out = await attachLaneResourceUse(lanes, {
    observeSeats: async () => { throw new Error("tmux is not answering"); },
    readProcessTable: async () => "100 1 claude.exe",
    readProcessMemory: async () => MEM,
  });
  assert.deepEqual(out, lanes, "discovery must survive a resource probe that cannot answer");
});
