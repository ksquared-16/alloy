#!/usr/bin/env node
/**
 * Trusted certification fixture execution.
 *
 * WHAT THIS CLOSES. Privileged local-stack credentials deliberately never enter
 * a worktree, and the toolkit-owned process that does receive them exposed no
 * way to run anything — so a lane holding a correct, reversible certification
 * fixture could not execute it, and the only route left was the Director
 * running the seed by hand.
 *
 * WHAT IT MUST NEVER BECOME. Privileged execution with a friendlier name. The
 * hard part of this capability is not making it work; it is making it refuse.
 * Every refusal below therefore carries a positive control showing the check
 * could have gone the other way, and the allowlist is asserted from BOTH sides:
 * the Node entry point and the bash runner, because a caller that reaches the
 * runner directly must get the same answer.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, "..", "alloy-certify-fixture");

const {
  CERTIFICATION_FIXTURES, IDENTITY_DECISIONS, FIXTURE_REFUSALS, ORG_ID_RE,
  listCertificationFixtures, validateFixtureRequest, assertLocalEnvironment,
  authorizeFixtureCaller, parseFixtureResult, runCertificationFixture,
} = await import("../lib/vacilando/certification-fixture.mjs");

let pass = 0;
let fail = 0;

async function test(name, fn) {
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

/** A stand-in worktree carrying the fixture's npm script. */
function makeWorktree({ withScript = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "vac-certfix-"));
  mkdirSync(join(dir, "web"), { recursive: true });
  writeFileSync(join(dir, "web", "package.json"), JSON.stringify({
    scripts: withScript ? { "dev:seed:operational-cards-certification": "tsx scripts/x.ts" } : {},
  }, null, 2));
  return dir;
}

const laneFor = (dir) => ({ lane_id: "lane_test", binding: { worktree_path: dir } });

/** Runs the bash runner directly and returns its refusal line. */
function runnerRefusal(argv) {
  try {
    execFileSync(RUNNER, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return null;
  } catch (e) {
    return String(e.stderr || e.stdout || "").trim();
  }
}

// ------------------------------------------------- 11. allowlist, both sides

await test("an unauthorized fixture name fails closed, at both entry points", () => {
  for (const name of ["anything", "seedProduction", "../../etc/passwd", "", "operational_cards"]) {
    const v = validateFixtureRequest({ fixture: name, operation: "ensure" });
    assert.equal(v.ok, false, `${name} was accepted`);
    assert.equal(v.error, FIXTURE_REFUSALS.UNKNOWN_FIXTURE);
  }
  // The bash runner refuses the same thing on its own.
  assert.match(runnerRefusal(["anything", "ensure", "/tmp"]) || "", /fixture_not_allowlisted/);

  // POSITIVE CONTROL: the one allowlisted fixture is accepted.
  assert.equal(validateFixtureRequest({
    fixture: "operational_cards_certification", operation: "ensure",
  }).ok, true);
});

await test("an unauthorized operation fails closed, at both entry points", () => {
  for (const op of ["drop", "seed", "run", "", "ensure; id", "--remove"]) {
    const v = validateFixtureRequest({ fixture: "operational_cards_certification", operation: op });
    assert.equal(v.ok, false, `${op} was accepted`);
    assert.equal(v.error, FIXTURE_REFUSALS.UNKNOWN_OPERATION);
  }
  assert.match(runnerRefusal(["operational_cards_certification", "drop", "/tmp"]) || "", /operation_not_allowlisted/);

  // POSITIVE CONTROL: exactly the three named operations are accepted.
  for (const op of ["ensure", "verify", "reset"]) {
    assert.equal(validateFixtureRequest({ fixture: "operational_cards_certification", operation: op }).ok, true, op);
  }
});

// ------------------------------------------------- 12. no arbitrary execution

await test("arbitrary command execution is impossible", () => {
  // Nothing a caller supplies reaches a command line. The fixture name selects
  // a FIXED npm script and the operation selects a FIXED argument vector; both
  // are constants in the allowlist, so injection has nothing to attach to.
  const def = CERTIFICATION_FIXTURES.operational_cards_certification;
  assert.equal(def.npm_script, "dev:seed:operational-cards-certification");
  assert.deepEqual(def.operations.ensure.args, []);
  assert.deepEqual(def.operations.verify.args, ["--verify"]);
  assert.deepEqual(def.operations.reset.args, ["--remove"]);
  assert.equal(Object.isFrozen(def), true);
  assert.equal(Object.isFrozen(CERTIFICATION_FIXTURES), true);

  // Shell metacharacters in either selector are refused, not escaped.
  for (const evil of ["ensure && id", "ensure`id`", "ensure$(id)", "ensure|id"]) {
    assert.equal(validateFixtureRequest({ fixture: "operational_cards_certification", operation: evil }).ok, false, evil);
  }
  // And an unrecognised flag is refused by the runner rather than passed along.
  assert.match(runnerRefusal(["operational_cards_certification", "ensure", "/tmp", "--evil"]) || "", /unexpected argument/);
});

await test("the identity decision is a closed set", () => {
  for (const bad of ["rm -rf", "create", "yes", "create_new_person; id"]) {
    const v = validateFixtureRequest({
      fixture: "operational_cards_certification", operation: "ensure", identityDecision: bad,
    });
    assert.equal(v.ok, false, `${bad} was accepted`);
    assert.equal(v.error, FIXTURE_REFUSALS.BAD_IDENTITY_DECISION);
  }
  assert.match(runnerRefusal(["operational_cards_certification", "ensure", "/tmp", "--identity-decision", "rm-rf"]) || "",
    /identity_decision_not_allowlisted/);

  // POSITIVE CONTROL: each real decision is accepted, and absence is allowed.
  for (const d of IDENTITY_DECISIONS) {
    assert.equal(validateFixtureRequest({
      fixture: "operational_cards_certification", operation: "ensure", identityDecision: d,
    }).ok, true, d);
  }
  assert.equal(validateFixtureRequest({
    fixture: "operational_cards_certification", operation: "ensure", identityDecision: null,
  }).ok, true);
});

await test("the org id is a bounded parameter, not forwarded environment", () => {
  for (const bad of ["not-a-uuid", "'; DROP TABLE orgs; --", "*", "93667019"]) {
    const v = validateFixtureRequest({
      fixture: "operational_cards_certification", operation: "verify", orgId: bad,
    });
    assert.equal(v.ok, false, `${bad} was accepted`);
    assert.equal(v.error, FIXTURE_REFUSALS.BAD_ORG_ID);
  }
  assert.match(runnerRefusal(["operational_cards_certification", "verify", "/tmp", "--org", "nope"]) || "",
    /org_id_not_a_uuid/);
  // POSITIVE CONTROL.
  assert.equal(ORG_ID_RE.test("93667019-bd28-49b5-a688-acc9bb1e0a19"), true);
  assert.equal(validateFixtureRequest({
    fixture: "operational_cards_certification", operation: "verify",
    orgId: "93667019-bd28-49b5-a688-acc9bb1e0a19",
  }).ok, true);
});

// ------------------------------------------------- 10. no production

await test("production and non-local invocation fail closed", () => {
  assert.equal(assertLocalEnvironment({ env: { NODE_ENV: "production" } }).error, FIXTURE_REFUSALS.NOT_LOCAL);
  assert.equal(assertLocalEnvironment({ env: { VERCEL: "1" } }).error, FIXTURE_REFUSALS.NOT_LOCAL);
  assert.equal(assertLocalEnvironment({
    env: { SUPABASE_URL: "https://abcdefgh.supabase.co" },
  }).error, FIXTURE_REFUSALS.NOT_LOCAL);
  assert.equal(assertLocalEnvironment({
    env: { NEXT_PUBLIC_SUPABASE_URL: "https://prod.example.com" },
  }).error, FIXTURE_REFUSALS.NOT_LOCAL);

  // POSITIVE CONTROLS: this machine's own stack is permitted, in each of the
  // forms it legitimately takes.
  for (const url of ["http://127.0.0.1:55321", "http://localhost:55321", "https://local.supabase.test"]) {
    assert.equal(assertLocalEnvironment({ env: { SUPABASE_URL: url } }).ok, true, url);
  }
  assert.equal(assertLocalEnvironment({ env: {} }).ok, true);
});

// ------------------------------------------------- authorization

await test("knowing a lane id is not authority", async () => {
  const dir = makeWorktree();
  const elsewhere = mkdtempSync(join(tmpdir(), "vac-elsewhere-"));

  assert.equal(authorizeFixtureCaller({ lane: null, cwd: dir }).error, FIXTURE_REFUSALS.LANE_NOT_FOUND);
  assert.equal(authorizeFixtureCaller({ lane: { lane_id: "l" }, cwd: dir }).error, FIXTURE_REFUSALS.LANE_NOT_OWNED);
  assert.equal(authorizeFixtureCaller({
    lane: { lane_id: "l", binding: { worktree_path: join(dir, "gone") } }, cwd: dir,
  }).error, FIXTURE_REFUSALS.WORKTREE_MISSING);
  // The caller must be INSIDE the lane's worktree.
  assert.equal(authorizeFixtureCaller({ lane: laneFor(dir), cwd: elsewhere }).error, FIXTURE_REFUSALS.LANE_NOT_OWNED);

  // POSITIVE CONTROLS: the worktree itself, and a directory within it.
  assert.equal(authorizeFixtureCaller({ lane: laneFor(dir), cwd: dir }).ok, true);
  assert.equal(authorizeFixtureCaller({ lane: laneFor(dir), cwd: join(dir, "web") }).ok, true);
});

await test("the fixture's own script must be present in that worktree", async () => {
  const without = makeWorktree({ withScript: false });
  const out = await runCertificationFixture({
    fixture: "operational_cards_certification", operation: "verify",
    laneId: "lane_test", cwd: without,
    loadLane: () => laneFor(without),
    runner: async () => { throw new Error("the runner must not be reached"); },
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, FIXTURE_REFUSALS.SCRIPT_MISSING);
});

await test("every refusal happens BEFORE a credential-holding process starts", async () => {
  // This is the one that matters most: an unauthorized request must never reach
  // a process that holds the service-role key.
  const dir = makeWorktree();
  let spawned = 0;
  const runner = async () => { spawned += 1; return { ok: true, code: 0, stdout: "", stderr: "" }; };
  for (const req of [
    { fixture: "nope", operation: "verify" },
    { fixture: "operational_cards_certification", operation: "drop" },
    { fixture: "operational_cards_certification", operation: "verify", identityDecision: "evil" },
    { fixture: "operational_cards_certification", operation: "verify", orgId: "nope" },
  ]) {
    const out = await runCertificationFixture({
      ...req, laneId: "lane_test", cwd: dir, loadLane: () => laneFor(dir), runner,
    });
    assert.equal(out.ok, false, JSON.stringify(req));
  }
  assert.equal(spawned, 0, "a refused request spawned the trusted runner");

  // POSITIVE CONTROL: an authorized request DOES reach it.
  const good = await runCertificationFixture({
    fixture: "operational_cards_certification", operation: "verify",
    laneId: "lane_test", cwd: dir, loadLane: () => laneFor(dir), runner,
  });
  assert.equal(good.ok, true);
  assert.equal(spawned, 1);
});

// ------------------------------------------------- result contract

await test("results come back structured, so no one relays ids by hand", () => {
  const parsed = parseFixtureResult("ensure", [
    "= household  customer=11111111-1111-1111-1111-111111111111",
    "  opportunity=22222222-2222-2222-2222-222222222222",
    "  member=33333333-3333-3333-3333-333333333333",
    "  member=44444444-4444-4444-4444-444444444444",
    "  agreement=55555555-5555-5555-5555-555555555555",
    "  placement=66666666-6666-6666-6666-666666666666",
    "  assignment=77777777-7777-7777-7777-777777777777",
  ].join("\n"));
  assert.equal(parsed.ids.customer_id, "11111111-1111-1111-1111-111111111111");
  assert.equal(parsed.ids.opportunity_id, "22222222-2222-2222-2222-222222222222");
  assert.equal(parsed.ids.customer_member_ids.length, 2);
  assert.equal(parsed.ids.enrollment_agreement_ids.length, 1);
  assert.equal(parsed.ids.placement_ids.length, 1);
  assert.equal(parsed.ids.schedule_assignment_ids.length, 1);

  // The fixture names the household two ways: `customer=<id>` on ensure and
  // `household: <id>` on verify. Found live — a contract that caught only one
  // would send the lane back to reading stdout for the other.
  assert.equal(
    parseFixtureResult("verify", "household: 29944d3e-8267-45b7-8dcb-7405060e2573\n").ids.customer_id,
    "29944d3e-8267-45b7-8dcb-7405060e2573",
  );
  assert.equal(parseFixtureResult("verify", "household: absent\n").ids.customer_id, undefined);

  const checks = parseFixtureResult("verify", "✓ household present\n✗ agreement missing\n").checks;
  assert.deepEqual(checks.map((c) => c.ok), [true, false]);

  // Bounded: a pathological run cannot grow the record without limit.
  const big = parseFixtureResult("ensure", "x".repeat(50_000), { limit: 100 });
  assert.equal(big.truncated, true);
  assert.ok(big.output.length < 200);
});

await test("an identity conflict is an operator decision, not a failure", async () => {
  const dir = makeWorktree();
  const out = await runCertificationFixture({
    fixture: "operational_cards_certification", operation: "ensure",
    laneId: "lane_test", cwd: dir, loadLane: () => laneFor(dir),
    runner: async () => ({
      ok: false, code: 1,
      stdout: "refusing: an ambiguous identity already exists and is not a fixture identity",
      stderr: "",
    }),
  });
  assert.equal(out.ok, false);
  assert.equal(out.needs_operator, true, "an identity conflict must reach the operator");

  // POSITIVE CONTROL: an ordinary failure is NOT escalated to the operator.
  const ordinary = await runCertificationFixture({
    fixture: "operational_cards_certification", operation: "ensure",
    laneId: "lane_test", cwd: dir, loadLane: () => laneFor(dir),
    runner: async () => ({ ok: false, code: 1, stdout: "database connection refused", stderr: "" }),
  });
  assert.equal(ordinary.needs_operator, false);
});

await test("a result never claims credentials reached the lane", async () => {
  const dir = makeWorktree();
  const out = await runCertificationFixture({
    fixture: "operational_cards_certification", operation: "verify",
    laneId: "lane_test", cwd: dir, loadLane: () => laneFor(dir),
    runner: async () => ({ ok: true, code: 0, stdout: "household: absent", stderr: "" }),
  });
  assert.equal(out.credentials_exposed, false);
  assert.equal(out.reserved_namespace, "operational-cards-cert.alloy.invalid");
  assert.equal(out.lane_id, "lane_test");
});

await test("the catalog is discoverable", () => {
  const list = listCertificationFixtures();
  assert.equal(list.length, 1);
  assert.equal(list[0].fixture, "operational_cards_certification");
  assert.deepEqual(list[0].operations, ["ensure", "verify", "reset"]);
  assert.equal(list[0].reserved_namespace, "operational-cards-cert.alloy.invalid");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
