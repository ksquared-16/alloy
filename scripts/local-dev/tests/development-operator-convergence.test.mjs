#!/usr/bin/env node
/**
 * THE PROJECTION WAS WRITTEN WHERE A RUN HAPPENED TO BE WAITING, NOT WHERE THE
 * TRUTH WAS.
 *
 * `run.governed_action` was patched in exactly two places — `attachRunWait` and
 * the resume — so a completion that did not resume a waiting run never reached
 * the run at all.
 *
 * MEASURED across 200 real governed actions on the promoted runtime: 18 runs
 * projected a governed action that was not their most recent one, 89 of the 157
 * completed actions attached to a run carried no `projection_visible_at`, and
 * every one of the 20 failed actions carried none. So the convergence of a
 * failure — the thing an operator most needs to see quickly — was the one thing
 * the metric could never report.
 *
 * The measured projection stage itself is fast: P50 0.10s, P95 0.12s. The
 * problem was never the interval. It was that for most work nothing wrote the
 * projection at all, and the gap was invisible because the same gap hid the
 * measurement.
 *
 * The second half is the health signal. `assertLaneDispatchable` repairs branch
 * drift at dispatch and treats a slotless managed lane as dispatchable, and the
 * doc comment on checkLaneBootstrap already says a slotless lane is healthy. The
 * scoring did not agree: three of thirteen lanes sat at `problem` indefinitely
 * for conditions the runtime handles itself, while real work was running.
 */
import assert from "node:assert/strict";

import { checkLaneBootstrap } from "../lib/vacilando/health.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const inv = (rows) => ({ contract_version: "vacilando.lane_bootstrap.v1", rows });
const lane = (name, unresolved = [], extra = {}) => ({ lane_id: `lane_${name}`, name, unresolved, ...extra });

/* ── HEALTH SIGNAL QUALITY ───────────────────────────────────────────────── */

test("C1. THE DEFECT: branch drift is not an operator problem", () => {
  // Doctrine: repaired at the next dispatch, and delivery is never refused.
  const out = checkLaneBootstrap({ inventory: inv([lane("Surfaces", ["branch:drift"])]) });
  assert.notEqual(out.severity, "problem", "a condition dispatch repairs itself must not block an operator");
  assert.equal(out.severity, "watch", "it stays visible");
  assert.equal(out.measurements.blocking, 0);
  assert.equal(out.measurements.self_resolving, 1);
  assert.match(out.evidence.join(" "), /SELF_HEALING/, "and it says which kind of not-a-problem it is");
});

test("C2. a slotless managed lane is dispatchable by design", () => {
  const out = checkLaneBootstrap({ inventory: inv([lane("Troubleshooting", ["worktree:lane_slot_unregistered"])]) });
  assert.notEqual(out.severity, "problem");
  assert.match(out.evidence.join(" "), /IDLE_BY_DESIGN/);
  // The function's own doc comment has always said so: "A SLOTLESS LANE IS
  // HEALTHY and appears in neither list."
});

test("C3. a real baseline gap is still a problem", () => {
  // The check must not have been softened into uselessness.
  const out = checkLaneBootstrap({ inventory: inv([lane("Backend", ["instruction_pack:missing"])]) });
  assert.equal(out.severity, "problem");
  assert.equal(out.measurements.blocking, 1);
  assert.match(out.evidence.join(" "), /instruction_pack/);
});

test("C4. one real gap among self-healing ones still wins", () => {
  const out = checkLaneBootstrap({
    inventory: inv([
      lane("Surfaces", ["branch:drift"]),
      lane("Troubleshooting", ["worktree:lane_slot_unregistered"]),
      lane("Backend", ["toolkit:generation_unknown"]),
    ]),
  });
  assert.equal(out.severity, "problem", "a genuine gap is not masked by the others");
  assert.equal(out.measurements.blocking, 1);
  assert.equal(out.measurements.self_resolving, 2);
});

test("C5. nothing unresolved is still healthy, and the count is still honest", () => {
  const out = checkLaneBootstrap({ inventory: inv([lane("Financials"), lane("Payments")]) });
  assert.equal(out.severity, "healthy");
  assert.equal(out.measurements.unresolved, 0);
  assert.equal(out.measurements.blocking, 0);
});

test("C6. `unresolved` still counts every gap, blocking or not", () => {
  // The measurement must not start under-reporting to make the severity look
  // better. Severity narrowed; the census did not.
  const out = checkLaneBootstrap({
    inventory: inv([lane("Surfaces", ["branch:drift"]), lane("Backend", ["instruction_pack:missing"])]),
  });
  assert.equal(out.measurements.unresolved, 2);
  assert.equal(out.measurements.blocking, 1);
  assert.equal(out.measurements.self_resolving, 1);
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
