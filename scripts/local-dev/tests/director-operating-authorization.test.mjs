/**
 * The durable authorization must not be able to disagree with the evaluator.
 *
 * A governance document that drifts from the code it describes is worse than
 * none, because people act on it. Most of what follows is therefore
 * reconciliation: the inventory and DELEGATED_POLICIES_V1 are asserted to be
 * two views of one fact, so adding a policy without filing its tier fails here
 * rather than silently producing an authorization that under-reports what runs
 * unattended.
 */
import test from "node:test";
import assert from "node:assert/strict";

const OA = await import("../lib/vacilando/director-operating-authorization.mjs");
const DA = await import("../lib/vacilando/director-authority.mjs");

test("every enabled delegated policy is inventoried as tier A or B", () => {
  for (const p of DA.DELEGATED_POLICIES_V1.filter((x) => x.enabled === true)) {
    const tier = OA.tierOf(p.action_key);
    assert.ok(tier, `${p.action_key} is delegated but has no inventory row`);
    assert.ok([OA.TIERS.A, OA.TIERS.B].includes(tier),
      `${p.action_key} runs unattended but is filed ${tier}`);
  }
});

test("every operator-owned action key is tier C or D", () => {
  for (const key of DA.OPERATOR_OWNED_ACTION_KEYS) {
    const tier = OA.tierOf(key);
    assert.ok(tier, `${key} is operator-owned but has no inventory row`);
    assert.ok([OA.TIERS.C, OA.TIERS.D].includes(tier),
      `${key} is operator-owned but filed ${tier}`);
  }
});

test("self-expansion is tier D without exception", () => {
  for (const key of DA.SELF_EXPANSION_ACTION_KEYS) {
    assert.equal(OA.tierOf(key), OA.TIERS.D, `${key} must never be automatic`);
  }
});

test("no action key is both delegated and operator-owned", () => {
  const delegated = new Set(DA.DELEGATED_POLICIES_V1.filter((p) => p.enabled).map((p) => p.action_key));
  for (const key of DA.OPERATOR_OWNED_ACTION_KEYS) {
    assert.equal(delegated.has(key), false, `${key} cannot be both delegated and reserved`);
  }
});

test("a tier B row states its bounds — bounds are what make it tier B", () => {
  for (const row of OA.ACTION_CLASS_INVENTORY.filter((r) => r.tier === OA.TIERS.B)) {
    assert.ok(row.bounds && row.bounds.length > 10,
      `${row.class_id} is tier B with no stated bounds, so it is really tier A or C`);
  }
});

test("the document is derived from the live policies, not a copy of them", () => {
  const doc = OA.buildOperatingAuthorization();
  const live = DA.DELEGATED_POLICIES_V1.filter((p) => p.enabled === true).map((p) => p.action_key).sort();
  assert.deepEqual(doc.authorized_action_classes.map((r) => r.action_key).sort(), live);

  // Turning a policy off must remove it from the document without editing it.
  const narrowed = DA.DELEGATED_POLICIES_V1.map((p) =>
    p.action_key === "repository.merge_pull_request" ? { ...p, enabled: false } : p);
  const after = OA.buildOperatingAuthorization({ policies: narrowed });
  assert.equal(after.authorized_action_classes.some((r) => r.action_key === "repository.merge_pull_request"), false);
  assert.equal(after.written_but_not_enabled.some((r) => r.action_key === "repository.merge_pull_request"), true);
});

test("the document carries version, effective date and history", () => {
  const doc = OA.buildOperatingAuthorization();
  assert.equal(doc.version, OA.OPERATING_AUTHORIZATION_VERSION);
  assert.match(doc.effective_from, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(doc.history.length >= 1);
  assert.ok(doc.history.every((h) => h.authorized_by && h.change && h.summary));
});

test("a disabled policy is reported as a decision not taken, not omitted", () => {
  const withDisabled = [...DA.DELEGATED_POLICIES_V1, Object.freeze({
    policy_id: "hypothetical_v1", action_key: "repository.force_push", label: "Hypothetical",
    environments: ["staging"], consequence_class: "consequential", enabled: false, gates: [],
  })];
  const doc = OA.buildOperatingAuthorization({ policies: withDisabled });
  assert.equal(doc.written_but_not_enabled.some((r) => r.policy_id === "hypothetical_v1"), true);
  assert.equal(doc.authorized_action_classes.some((r) => r.policy_id === "hypothetical_v1"), false);
});

test("enabling a new action class is classified as widening", () => {
  const before = OA.buildOperatingAuthorization({
    policies: DA.DELEGATED_POLICIES_V1.map((p) =>
      p.action_key === "repository.merge_pull_request" ? { ...p, enabled: false } : p),
  });
  const after = OA.buildOperatingAuthorization();
  const change = OA.classifyAuthorizationChange(before, after);
  assert.equal(change.widening, true);
  assert.equal(change.requires_explicit_operator_decision, true);
  assert.deepEqual(change.added_action_keys, ["repository.merge_pull_request"]);
});

test("dropping a gate is widening even when no action class is added", () => {
  const before = OA.buildOperatingAuthorization();
  const after = OA.buildOperatingAuthorization({
    policies: DA.DELEGATED_POLICIES_V1.map((p) =>
      p.policy_id === "certified_staging_merge_v1"
        ? { ...p, gates: p.gates.filter((g) => g !== "certification_suite_passed") }
        : p),
  });
  const change = OA.classifyAuthorizationChange(before, after);
  assert.equal(change.widening, true);
  assert.deepEqual(change.dropped_gates, ["certified_staging_merge_v1:certification_suite_passed"]);
});

test("removing an authorization is not widening", () => {
  const before = OA.buildOperatingAuthorization();
  const after = OA.buildOperatingAuthorization({
    policies: DA.DELEGATED_POLICIES_V1.map((p) =>
      p.action_key === "repository.merge_pull_request" ? { ...p, enabled: false } : p),
  });
  const change = OA.classifyAuthorizationChange(before, after);
  assert.equal(change.widening, false);
  assert.equal(change.requires_explicit_operator_decision, false);
});

test("a lane override may narrow", () => {
  const base = OA.buildOperatingAuthorization();
  const out = OA.validateLaneOverride(base, {
    lane_id: "lane_test", authorized_action_keys: ["repository.push"],
  });
  assert.equal(out.ok, true);
  assert.deepEqual(out.authorized_action_keys, ["repository.push"]);
});

test("a lane override may not widen", () => {
  const base = OA.buildOperatingAuthorization();
  const out = OA.validateLaneOverride(base, {
    lane_id: "lane_test",
    authorized_action_keys: ["repository.push", "database.apply_migration"],
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "lane_override_widens_authorization");
  assert.deepEqual(out.widened_action_keys, ["database.apply_migration"]);
});

test("the authorization is inherited, not copied per lane", () => {
  // Two lanes reading the document must get the same envelope. The failure this
  // guards is a per-lane copy that drifts and quietly grants more than the fleet.
  const a = OA.buildOperatingAuthorization({ nowMs: 1 });
  const b = OA.buildOperatingAuthorization({ nowMs: 2 });
  assert.deepEqual(a.authorized_action_classes, b.authorized_action_classes);
  assert.match(a.inherited_by, /every lane/);
});

test("production never appears in the authorized envelope", () => {
  const doc = OA.buildOperatingAuthorization();
  for (const cls of doc.authorized_action_classes) {
    for (const env of cls.environments) {
      assert.equal(doc.environments.operator_only.includes(env), false,
        `${cls.action_key} claims an operator-only environment`);
    }
  }
});
