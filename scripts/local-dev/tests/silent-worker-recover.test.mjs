/**
 * Silent-worker auto-resume bookkeeping (unit).
 */
import assert from "node:assert/strict";
import {
  silentRecoveryState,
  clearSilentRecovery,
} from "../lib/vacilando/silent-worker-recover.mjs";

clearSilentRecovery("msn_test_silent");
let s = silentRecoveryState("msn_test_silent");
assert.equal(s.exhausted, false);
assert.equal(s.tries, 0);
assert.equal(s.recovering, false);

console.log(JSON.stringify({ ok: true, state: s }, null, 2));
