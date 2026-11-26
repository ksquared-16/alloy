#!/usr/bin/env node
/**
 * THE PANEL SAID FULL. THE GATE SAID GO.
 *
 * THE DEFECT, measured on the live host. Eight resident agents, ceiling eight:
 *
 *   operator surface   active 8 / 8, available 0, blockers ["provider_capacity"]
 *                      "All 8 agents are in use — release one"
 *   admission gate     active_providers 1 of 8, ok true, blockers []
 *
 * Same instant, same processes. Seven of the eight agents were resident and
 * idle; exactly one held a seat. Nothing was actually refused — admission never
 * reads the panel's number — but the operator was told the host was full while
 * the gate would have started another lane immediately.
 *
 * The cause was one label over two facts. `summarizeHostExecutionCapacity`
 * counted RESIDENCY and then manufactured a `provider_capacity` blocker from
 * it, so the panel could contradict the gate without either being "wrong".
 *
 * Both facts are worth showing and only one governs:
 *
 *   execution capacity  what CONSUMES a seat — the admission answer, and the
 *                       only input to "can another lane start?"
 *   resident agents     provider processes alive — context, never a gate
 *
 * These controls pin the split, the blocker's ownership, and — the part that
 * makes the rest safe — that admission itself did not move.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const L = await import("../lib/vacilando/lane-execution-capacity.mjs");
const A = await import("../lib/vacilando/alloy-dev-adapter.mjs");
const V = await import("../apps/vacilando/public/gateway-view.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/**
 * Drive the summary with a stated world: `resident` live agents of which
 * `consuming` hold a seat. Both adapter entry points are stubbed so the test
 * states the facts instead of depending on the machine it runs on.
 */
async function summarize({ resident, consuming, ceiling = 8, admissionThrows = false }) {
  const holders = Array.from({ length: resident }, (_, i) => ({
    path: `/w/agent${i}`, name: `agent${i}`, slot: i + 1,
  }));
  return L.summarizeHostExecutionCapacity([], {
    root: "/nonexistent-root",
    assessProvision: () => ({
      ok: true, free_slots: 0, occupied_slots: resident, max_providers: ceiling,
      active_providers: resident, provider_holders: holders,
      counted_from: "live_panes", blockers: [],
    }),
    assessAdmission: async () => {
      if (admissionThrows) throw new Error("gate unavailable");
      return {
        ok: consuming < ceiling,
        active_providers: consuming, max_providers: ceiling,
        blockers: consuming < ceiling ? [] : ["provider_capacity"],
        degraded: false, kind: "session_start",
        occupying: Array.from({ length: consuming }, (_, i) => ({
          session: null, cwd: `/w/agent${i}`, lane_id: `lane_${i}`,
        })),
      };
    },
  });
}

// ── 1. the measured defect ───────────────────────────────────────────────────
await test("R1. 8 resident / 1 consuming — capacity available, no blocker", async () => {
  const o = await summarize({ resident: 8, consuming: 1 });
  assert.equal(o.active, 1, "execution capacity is the admission number");
  assert.equal(o.max_active, 8);
  assert.equal(o.resident_providers, 8, "residency is still reported");
  assert.equal(o.available, 7);
  assert.ok(!o.blockers.includes("provider_capacity"), "the gate is open, so the panel must not say full");
});

await test("R2. 8 resident / 8 consuming — genuinely full, blocker present", async () => {
  const o = await summarize({ resident: 8, consuming: 8 });
  assert.equal(o.active, 8);
  assert.equal(o.resident_providers, 8);
  assert.equal(o.available, 0);
  assert.ok(o.blockers.includes("provider_capacity"), "full must still read full");
});

await test("R3. 3 resident / 3 consuming — equal, but still two distinct fields", async () => {
  const o = await summarize({ resident: 3, consuming: 3, ceiling: 8 });
  assert.equal(o.active, 3);
  assert.equal(o.resident_providers, 3);
  assert.notEqual(o.active, undefined);
  assert.notEqual(o.resident_providers, undefined);
  assert.equal(o.available, 5, "equal numbers must not collapse into one field");
});

// ── 2. what counts, and what cannot ──────────────────────────────────────────
await test("R4. a slotless consuming provider is counted in execution capacity", async () => {
  // Slot is placement; execution capacity is about processes. A consuming
  // provider on a lane with no slot must still occupy a seat.
  const o = await L.summarizeHostExecutionCapacity([], {
    root: "/nonexistent-root",
    assessProvision: () => ({
      ok: true, free_slots: 5, occupied_slots: 0, max_providers: 8,
      active_providers: 1, provider_holders: [{ path: "/w/noslot", name: "noslot", slot: null }],
      counted_from: "live_panes", blockers: [],
    }),
    assessAdmission: async () => ({
      ok: true, active_providers: 1, max_providers: 8, blockers: [], degraded: false,
      occupying: [{ session: null, cwd: "/w/noslot", lane_id: "lane_noslot" }],
    }),
  });
  assert.equal(o.active, 1, "counted despite having no slot");
  assert.equal(o.free_slots, 5, "and slots are unaffected by it");
  assert.equal(o.provider_holders[0].lane_id, "lane_noslot");
});

await test("R5. stale registration metadata affects neither number", async () => {
  // Residency comes from live panes and execution from the gate. Neither reads
  // ALLOY_AGENT_STATUS, and the source fields say so.
  const o = await summarize({ resident: 8, consuming: 1 });
  assert.equal(o.counted_from, "admission", "execution capacity is the gate's answer");
  assert.equal(o.resident_counted_from, "live_panes", "residency is live processes");
  assert.notEqual(o.counted_from, "metadata");
  assert.notEqual(o.resident_counted_from, "metadata");
});

await test("R6. residency cannot block: raising it alone never creates a blocker", async () => {
  for (const resident of [1, 8, 40]) {
    const o = await summarize({ resident, consuming: 1 });
    assert.equal(o.active, 1, `resident=${resident} must not move execution capacity`);
    assert.ok(!o.blockers.includes("provider_capacity"), `resident=${resident} must not block`);
    assert.equal(o.resident_providers, resident, "it is still reported faithfully");
  }
});

// ── 3. the panel and the gate answer the same question ───────────────────────
await test("R7. reporting and admission agree on 'can another execution start?'", async () => {
  for (const [resident, consuming] of [[8, 1], [8, 7], [8, 8], [3, 3], [0, 0]]) {
    const o = await summarize({ resident, consuming });
    const panelSaysCanStart = o.available > 0 && !o.blockers.includes("provider_capacity");
    const gateSaysCanStart = consuming < 8;
    assert.equal(panelSaysCanStart, gateSaysCanStart,
      `resident=${resident} consuming=${consuming}: panel ${panelSaysCanStart} vs gate ${gateSaysCanStart}`);
  }
});

await test("R8. an unreachable gate falls back conservatively, never permissively", async () => {
  // If the gate cannot be asked, over-reporting consumption is the safe
  // direction: it shows a blocker admission would not clear in that state
  // anyway. Under-reporting would invite a start the gate might refuse.
  const o = await summarize({ resident: 8, consuming: 1, admissionThrows: true });
  assert.equal(o.active, 8, "falls back to residency");
  assert.equal(o.available, 0);
  assert.ok(o.blockers.includes("provider_capacity"));
});

// ── 4. the operator sees two labelled facts, not one ─────────────────────────
await test("R9. the panel labels both facts and does not call both 'providers'", () => {
  const html = V.renderExecutionCapacity({
    active_providers: 1, max_active: 8, resident_providers: 8, available: 7,
    running: [], queued: [], provider_holders: [],
  });
  assert.match(html, /In use/, "the governing number is labelled In use");
  assert.match(html, /1 of 8/, "and reads as 'n of max'");
  assert.match(html, /Resident agents/, "residency is labelled distinctly");
  assert.ok(!/<dt>Active<\/dt>/.test(html), "the ambiguous 'Active' label is gone");
});

await test("R10. 'All N agents are in use' fires on execution capacity, not residency", () => {
  // It offered "release one to free capacity" while capacity was free.
  const open = V.renderCapacityHolders({
    active_providers: 1, max_active: 8, resident_providers: 8, provider_holders: [],
  });
  assert.equal(open, "", "seven seats free — say nothing");
  const full = V.renderCapacityHolders({
    active_providers: 8, max_active: 8, resident_providers: 8,
    provider_holders: [{ name: "Backend" }],
  });
  assert.match(full, /All 8 agents are in use/, "and only speak when genuinely full");
});

// ── 5. the thing that makes all of the above safe ────────────────────────────
await test("R11. admission behaviour is untouched — no seatStates wiring", () => {
  const src = readFileSync(new URL("../lib/vacilando/alloy-dev-adapter.mjs", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const fn = src.slice(src.indexOf("export async function assessSessionStartCapacity"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert.ok(!/seatStates/.test(body), "this slice must not wire seatStates into the gate");
  assert.match(body, /assessProviderCapacity\(/, "and the gate still owns its own verdict");
});

await test("R12. the blocker is no longer manufactured from residency", () => {
  const src = readFileSync(new URL("../lib/vacilando/lane-execution-capacity.mjs", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const fn = src.slice(src.indexOf("export async function summarizeHostExecutionCapacity"));
  assert.match(fn, /assessSessionStartCapacity/, "the gate is consulted");
  assert.match(fn, /resident_providers/, "and residency is reported separately");
  assert.ok(!/const active = Math\.max\(liveActive, holders\.length\)/.test(fn),
    "the residency-derived active count is gone");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
