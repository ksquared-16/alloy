#!/usr/bin/env node
/**
 * A TEST MAY NOT DISPATCH REAL WORK BY ACCIDENT.
 *
 * `approveMissionExecution` calls `scheduleDispatchAfterKickoff`, which fires a
 * real `dispatchReadyAssignments` on a ~10ms timer unless
 * `VACILANDO_AUTO_DISPATCH` is "0". On this host that can discover actual
 * lanes and providers and start actual work - as a side effect of running a
 * test.
 *
 * It also produces the worst possible symptom. `director-collaboration-dx6`
 * printed its ok line, passed every assertion, and then sat alive for 12m52s,
 * because the assertions finish first and the leaked dispatch keeps the event
 * loop open afterwards. A passing transcript attached to a hung process.
 *
 * Twenty-two of the twenty-seven dispatch-capable tests were relying on the
 * default. Nobody noticed because 288 of 301 test files are ungated.
 *
 * THIS GUARD REQUIRES A DECISION, NOT A PARTICULAR ANSWER. Disabling dispatch
 * everywhere would be wrong: some of these tests exist to exercise dispatch,
 * and the env check short-circuits before `opts.await`, so a blanket guard
 * would silently stop them testing the thing they are named after. So each file
 * must say which it is, and a new one cannot stay silent.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const HERE = new URL("./", import.meta.url);
const files = readdirSync(HERE).filter((f) => f.endsWith(".test.mjs")).sort();
const read = (f) => readFileSync(new URL(f, HERE), "utf8");

/** Reaches the fire-and-forget scheduler, directly or through kickoff. */
const REACHES_DISPATCH = /approveMissionExecution|scheduleDispatchAfterKickoff/;

/**
 * The four declarations. The first is the existing canonical mechanism and
 * needs no annotation - setting the variable IS the declaration.
 */
const DECLARATIONS = [
  { name: "AUTO_DISPATCH_DISABLED", re: /process\.env\.VACILANDO_AUTO_DISPATCH\s*=\s*"0"/ },
  { name: "DISPATCH_AWAITED", re: /@dispatch-class:\s*DISPATCH_AWAITED/ },
  { name: "HOST_INTEGRATION", re: /@dispatch-class:\s*HOST_INTEGRATION/ },
  { name: "CERTIFICATION", re: /@dispatch-class:\s*CERTIFICATION/ },
];

/*
 * Excluding this file, which names every one of these symbols in order to look
 * for them and would otherwise flag itself forever.
 */
const SELF = import.meta.url.split("/").pop();
const capable = files.filter((f) => f !== SELF && REACHES_DISPATCH.test(read(f)));

test("there is still something to guard", () => {
  assert.ok(capable.length > 0, "no dispatch-capable tests found - the guard has lost its subject");
});

test("every dispatch-capable test declares how it handles dispatch", () => {
  const undeclared = capable.filter((f) => {
    const src = read(f);
    return !DECLARATIONS.some((d) => d.re.test(src));
  });
  assert.deepEqual(undeclared, [],
    `these rely on default auto-dispatch and can start real work on the host: ${undeclared.join(", ")}. ` +
    `Set process.env.VACILANDO_AUTO_DISPATCH = "0", or annotate @dispatch-class: DISPATCH_AWAITED | HOST_INTEGRATION | CERTIFICATION.`);
});

test("a DISPATCH_AWAITED test actually awaits dispatch rather than scheduling it", () => {
  /*
   * The point of the class. Declaring DISPATCH_AWAITED and then leaving the
   * 10ms timer in place would be the same defect with a label on it, so the
   * declaration has to be backed by an explicit call it can wait for.
   */
  for (const f of capable) {
    const src = read(f);
    if (!/@dispatch-class:\s*DISPATCH_AWAITED/.test(src)) continue;
    assert.match(src, /await\s+dispatchReadyAssignments\(|await:\s*true/,
      `${f} claims DISPATCH_AWAITED but never awaits a dispatch`);
  }
});

test("a disabled-dispatch test does not also claim to await one", () => {
  for (const f of capable) {
    const src = read(f);
    const disabled = /process\.env\.VACILANDO_AUTO_DISPATCH\s*=\s*"0"/.test(src);
    const claimsAwaited = /@dispatch-class:\s*DISPATCH_AWAITED/.test(src);
    if (!disabled || !claimsAwaited) continue;
    /*
     * This combination IS legal and is the pattern assignment-dispatch uses:
     * turn off the ambient timer, then call dispatch explicitly and wait for
     * it. It is only wrong if the explicit call is missing, which the previous
     * case already covers. Asserted here so the combination stays deliberate.
     */
    assert.match(src, /await\s+dispatchReadyAssignments\(/,
      `${f} disables auto-dispatch and claims DISPATCH_AWAITED, so it must call dispatch itself`);
  }
});

test("the scheduler still has the env escape this guard depends on", () => {
  // If the runtime stops honouring the variable, every declaration above
  // becomes decorative and this suite would keep passing while the host
  // dispatched real work again.
  const src = readFileSync(new URL("../lib/vacilando/assignment-dispatch.mjs", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export function scheduleDispatchAfterKickoff"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert.match(body, /VACILANDO_AUTO_DISPATCH.*===\s*"0"/,
    "the scheduler must still refuse when auto-dispatch is disabled");
  assert.match(body, /opts\.await\s*===\s*true/,
    "and must still offer an explicitly awaited path");
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
