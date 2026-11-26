#!/usr/bin/env node
/**
 * AN EXISTING DURABLE STORE MUST NEVER READ AS AN ABSENT ONE.
 *
 * THE INCIDENT THIS SPECIMEN EXISTS FOR. S3 changed what the runtime root
 * means, and the live Gateway answered `/api/lanes` with ZERO LANES. Nothing was
 * lost — 13 lanes sat intact at
 * `~/.local/state/alloy-dev/gateway/vacilando/lanes/lanes.json` the whole time —
 * but `development-lane.mjs` had been routed to `stateRoot()` while its store
 * path appends `vacilando/lanes/lanes.json`, so it looked one level too high,
 * found nothing, and reported an empty universe.
 *
 * An empty universe is the most dangerous possible wrong answer here. It does
 * not look like a failure. It looks like a host with no work on it, and the
 * obvious repair — recreate the lanes — would have destroyed thirteen durable
 * identities that were never gone.
 *
 * THE INVARIANT, stated so it can be tested rather than remembered:
 *
 *   Any owner reading or writing `<root>/vacilando/...` must resolve the root
 *   that DIRECTLY CONTAINS `vacilando/`. Changing runtime-root semantics must
 *   never reinterpret an existing durable store as an absent store.
 *
 * WHY THE TWO ROOTS ARE DELIBERATELY DIFFERENT BELOW. The bug is invisible when
 * the parent and the Gateway root are the same directory, and it is invisible
 * when neither exists. It only shows when a store exists at one depth and the
 * code looks at the other — so this builds exactly that, with a populated store
 * under the Gateway root and NOTHING under its parent.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/* ── a host whose two roots are genuinely different directories ───────────── */

const PARENT = mkdtempSync(join(tmpdir(), "vac-lanestore-"));
const GATEWAY = join(PARENT, "gateway");

/** Three durable identities, standing in for the thirteen that vanished. */
const LANES = {
  lane_aaaa00000001: { lane_id: "lane_aaaa00000001", name: "Backend", repository_id: "repo_alloy", binding: { worktree_path: "/tmp/wt-backend" } },
  lane_bbbb00000002: { lane_id: "lane_bbbb00000002", name: "Financials", repository_id: "repo_alloy", binding: { worktree_path: "/tmp/wt-financials" } },
  lane_cccc00000003: { lane_id: "lane_cccc00000003", name: "Surfaces", repository_id: "repo_alloy", binding: { worktree_path: "/tmp/wt-surfaces" } },
};
const STORE = join(GATEWAY, "vacilando", "lanes", "lanes.json");
mkdirSync(dirname(STORE), { recursive: true });
writeFileSync(STORE, JSON.stringify({ schema_version: "vacilando.development_lanes.v1", lanes: LANES }, null, 1), "utf8");
const STORE_SHA = createHash("sha256").update(readFileSync(STORE)).digest("hex");

// The variable names the Gateway root, exactly as the shipped config does on the
// host where this went wrong.
process.env.ALLOY_RUNTIME_ROOT = GATEWAY;

const LIB = new URL("../lib/vacilando/", import.meta.url).pathname;
const RR = await import("../lib/vacilando/runtime-roots.mjs");
const DL = await import("../lib/vacilando/development-lane.mjs");

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}
const code = (f) => readFileSync(`${LIB}${f}`, "utf8").split("\n")
  .map((l) => l.replace(/\/\/.*$/, "")).filter((l) => !/^\s*[*/]/.test(l)).join("\n");

/* ── 1: where the store actually lives ────────────────────────────────────── */

test("1 — the durable lane store is beneath the GATEWAY state root", () => {
  assert.equal(RR.gatewayStateRoot(), GATEWAY, "the probe must find the level holding the store");
  assert.equal(RR.stateRoot(), PARENT, "and its parent must be a different directory");
  assert.notEqual(RR.stateRoot(), RR.gatewayStateRoot(), "a test where both are equal cannot see this bug");
  assert.equal(DL.developmentLaneStorePath(), STORE,
    "the resolved store path must be the file that exists, not its parent's shadow");
});

/* ── 2/3: an existing store stays visible ─────────────────────────────────── */

test("2 — an existing non-empty store remains visible", () => {
  assert.ok(existsSync(DL.developmentLaneStorePath()), "the resolved path must exist on disk");
  const raw = JSON.parse(readFileSync(DL.developmentLaneStorePath(), "utf8"));
  assert.equal(Object.keys(raw.lanes).length, 3);
});

test("3 — listDurableLanes returns the EXISTING identities", () => {
  const lanes = DL.listDurableLanes();
  assert.equal(lanes.length, 3, `expected the three durable lanes, got ${lanes.length}`);
  assert.deepEqual(lanes.map((l) => l.lane_id).sort(), Object.keys(LANES).sort(),
    "the identities must be the ones already on disk, not new ones");
  // Names and bindings survive, because these are records rather than rebuilds.
  const backend = lanes.find((l) => l.lane_id === "lane_aaaa00000001");
  assert.equal(backend.name, "Backend");
  assert.equal(backend.binding.worktree_path, "/tmp/wt-backend");
});

test("4 — the projection carries those durable identities through", () => {
  /*
   * `listDevelopmentLanes` composes live host state over the durable records, so
   * its shape may differ from the store — a lane whose tmux pane died looks
   * different. What may never differ is WHICH identities exist.
   */
  const projected = typeof DL.listDevelopmentLanes === "function" ? DL.listDevelopmentLanes() : DL.listDurableLanes();
  const ids = (projected || []).map((l) => l.lane_id).filter(Boolean);
  for (const id of Object.keys(LANES)) {
    assert.ok(ids.includes(id), `the projection dropped durable identity ${id}`);
  }
});

/* ── 5: THE INCIDENT ──────────────────────────────────────────────────────── */

test("5 — the parent location being ABSENT must not empty the lane universe", () => {
  /*
   * This is the failure exactly as it happened. Nothing exists under the parent
   * root — no `vacilando/` at all — and that must be irrelevant, because the
   * store was never there. Reading the parent and finding nothing is what
   * reported thirteen live lanes as zero.
   */
  assert.ok(!existsSync(join(PARENT, "vacilando")),
    "fixture guard: the parent must hold no vacilando/ for this case to mean anything");
  assert.equal(DL.listDurableLanes().length, 3,
    "an absent parent location emptied the lane universe — this is the zero-lane incident");
});

/* ── 6: reading never writes ──────────────────────────────────────────────── */

test("6 — no read path creates or rewrites the lane store", () => {
  const before = createHash("sha256").update(readFileSync(STORE)).digest("hex");
  assert.equal(before, STORE_SHA, "fixture guard: the store was already modified before this case");
  for (let i = 0; i < 3; i += 1) {
    DL.listDurableLanes();
    DL.developmentLaneStorePath();
    if (typeof DL.listDevelopmentLanes === "function") DL.listDevelopmentLanes();
  }
  assert.equal(createHash("sha256").update(readFileSync(STORE)).digest("hex"), STORE_SHA,
    "a read path rewrote the durable store");
  // And nothing appeared at the wrong depth, which is how a recreated universe
  // would announce itself.
  assert.ok(!existsSync(join(PARENT, "vacilando")),
    "a read created a second lane store under the parent root");
  assert.deepEqual(readdirSync(PARENT).sort(), ["gateway"],
    "reading lanes created something beside the Gateway root");
});

/* ── 7: the ratchet ───────────────────────────────────────────────────────── */

test("7 — reverting development-lane to stateRoot() fails this suite", () => {
  /*
   * The structural half. Case 5 catches the behaviour, but only on a host whose
   * two roots differ; this catches the change itself, wherever it is run.
   */
  const src = code("development-lane.mjs");
  const start = src.indexOf("function runtimeRoot()");
  const fn = src.slice(start, src.indexOf("}", start) + 1);
  assert.ok(fn.includes("gatewayStateRoot"),
    "development-lane resolves the parent of the store it reads; the Gateway will report zero lanes");
  assert.ok(!/\breturn stateRoot\(\)/.test(fn),
    "this is the exact revert that caused the incident");
  // The same question, asked of every owner that appends `vacilando/`.
  for (const f of ["development-lane.mjs", "lane-knowledge.mjs"]) {
    const body = code(f);
    const at = body.indexOf("function runtimeRoot()");
    if (at < 0) continue;
    assert.ok(body.slice(at, body.indexOf("}", at) + 1).includes("gatewayStateRoot"),
      `${f} appends vacilando/ but resolves the parent root`);
  }
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
