/**
 * Advance discovery → implementation on the same mission.
 */
import assert from "node:assert/strict";
import {
  canAdvanceToImplementation,
  resolveImplementationPlan,
} from "../lib/vacilando/mission-advance.mjs";
import { deriveMissionPosture } from "../lib/vacilando/mission-posture.mjs";
import { missionOutcomeVm } from "../lib/vacilando/presentation/operator-views.mjs";

const mid = "msn_2d054741a54698fa4c";

const plan = resolveImplementationPlan(mid);
assert.ok(plan?.relative, "implementation plan resolves for Access & Identity");
assert.match(plan.relative, /access-identity.*03-implementation-qa-sequence/);

const can = canAdvanceToImplementation(mid);
assert.equal(can.ok, true, `can advance: ${can.reason || "ok"}`);
assert.ok(can.plan, "plan path returned");

const posture = deriveMissionPosture(mid);
if (posture.id === "operator_review") {
  assert.ok(
    (posture.choices || []).some((c) => c.kind === "advance_implementation"),
    "operator_review offers Advance to implementation",
  );
  assert.equal(
    posture.secondaryAction?.kind,
    "advance_implementation",
    "secondary action is advance",
  );
}

const outcome = missionOutcomeVm(mid);
if (outcome?.choices) {
  assert.ok(
    outcome.choices.some((c) => c.kind === "advance_implementation"),
    "outcome panel includes advance choice",
  );
}

console.log(JSON.stringify({
  ok: true,
  plan: plan.relative,
  canAdvance: can.ok,
  postureId: posture.id,
  choiceLabels: (posture.choices || []).map((c) => c.label),
}, null, 2));
