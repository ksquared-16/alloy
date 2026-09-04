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
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, "..", "alloy-certify-fixture");

const {
  CERTIFICATION_FIXTURES, IDENTITY_DECISIONS, FIXTURE_REFUSALS, ORG_ID_RE,
  listCertificationFixtures, validateFixtureRequest, assertLocalEnvironment,
  authorizeFixtureCaller, parseFixtureResult, runCertificationFixture, fixtureScriptPresent,
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

await test("the runtime check judges only what it can see, and says so", () => {
  // THE CORRECTION. This check used to read process.env.SUPABASE_URL and report
  // a verdict on the target. In the real path that variable is never set here —
  // the CLI runs before the trusted env is loaded — so the URL branch could only
  // ever pass. A check that cannot see the thing it judges is decorative, and
  // calling it proven was wrong.
  const unjudged = assertLocalEnvironment();
  assert.equal(unjudged.ok, true);
  assert.equal(unjudged.target_judged, false, "it must not claim to have judged a target it never saw");
  assert.equal(unjudged.enforced_by, "alloy-certify-fixture");

  // What it CAN see, it still refuses.
  assert.equal(assertLocalEnvironment({ env: { NODE_ENV: "production" } }).error, FIXTURE_REFUSALS.NOT_LOCAL);
  assert.equal(assertLocalEnvironment({ env: { VERCEL: "1" } }).error, FIXTURE_REFUSALS.NOT_LOCAL);

  // Given a target explicitly, it judges it — and an EMPTY one is unknown
  // rather than approved, so it can never pass vacuously again.
  assert.equal(assertLocalEnvironment({ supabaseUrl: "" }).error, FIXTURE_REFUSALS.TARGET_UNKNOWN);
  for (const bad of ["https://abcdefgh.supabase.co", "https://prod.example.com", "https://tenant.supabase.in"]) {
    assert.equal(assertLocalEnvironment({ supabaseUrl: bad }).error, FIXTURE_REFUSALS.NOT_LOCAL, bad);
  }
  // POSITIVE CONTROLS: this machine's own stack is permitted in each real form.
  for (const url of ["http://127.0.0.1:55321", "http://localhost:55321", "https://local.supabase.test"]) {
    const v = assertLocalEnvironment({ supabaseUrl: url });
    assert.equal(v.ok, true, url);
    assert.equal(v.target_judged, true);
  }
});

await test("the runner enforces the target, and refuses one it cannot see", () => {
  // The enforcement that actually runs lives in the bash runner, because that is
  // the first point where a Supabase URL exists at all. Asserted structurally:
  // the refusal must sit AFTER the trusted env is loaded, or it would be judging
  // an empty variable exactly as the Node check used to.
  const src = readFileSync(new URL("../alloy-certify-fixture", import.meta.url), "utf8");
  const loadAt = src.indexOf("alloy_load_trusted_server_env_exports");
  const judgeAt = src.indexOf("alloy_is_production_supabase_url");
  const unknownAt = src.indexOf("certification_target_unknown");
  assert.ok(loadAt > 0 && judgeAt > 0, "the runner must load the env and judge the target");
  assert.ok(judgeAt > loadAt, "the target must be judged AFTER the env that supplies it is loaded");
  assert.ok(unknownAt > loadAt, "an absent target must be refused, not treated as local");
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
  /*
   * ASSERTED AGAINST THE ALLOWLIST, not against a hard-coded count.
   *
   * This used to assert `list.length === 1`, which stopped being true the moment a second
   * fixture was added and left the suite red on staging without anything being wrong. A
   * count is the wrong assertion here: the property that matters is that the catalog
   * reports exactly what the allowlist holds and invents nothing, and that survives a
   * third entry without being rewritten a third time.
   */
  const list = listCertificationFixtures();
  assert.deepEqual(
    list.map((f) => f.fixture).sort(),
    Object.keys(CERTIFICATION_FIXTURES).sort(),
  );
  for (const entry of list) {
    const def = CERTIFICATION_FIXTURES[entry.fixture];
    assert.deepEqual(entry.operations, Object.keys(def.operations), entry.fixture);
    assert.equal(entry.reserved_namespace, def.reserved_namespace, entry.fixture);
    assert.equal(typeof entry.description, "string");
  }

  // The original case, still pinned by name rather than by position.
  const cards = list.find((f) => f.fixture === "operational_cards_certification");
  assert.deepEqual(cards.operations, ["ensure", "verify", "reset"]);
  assert.equal(cards.reserved_namespace, "operational-cards-cert.alloy.invalid");
});

/** The script-presence check, addressed by fixture name. */
function fixtureScriptPresentFor(worktree, fixtureName) {
  return fixtureScriptPresent(worktree, CERTIFICATION_FIXTURES[fixtureName]);
}


// ------------------------------------------------- 15. the E2E driver operation
//
// The third entry is a different KIND of thing to the two seed fixtures: it RUNS the
// REAL ENROLLMENT V1 certification driver rather than seeding data. It is inside this
// registry precisely so it inherits the property that makes the registry safe — a caller
// names a fixture and an operation, and the pair resolves to a fixed npm script and a
// fixed argument vector it cannot influence.

/** A stand-in worktree carrying the E2E driver's npm script. */
function makeE2eWorktree() {
  const dir = mkdtempSync(join(tmpdir(), "vac-certe2e-"));
  mkdirSync(join(dir, "web"), { recursive: true });
  writeFileSync(join(dir, "web", "package.json"), JSON.stringify({
    scripts: { "dev:certify:enrollment-e2e": "tsx scripts/certifyEnrollmentE2E.ts" },
  }, null, 2));
  return dir;
}

await test("the E2E driver is allowlisted, and bound to one fixed script and one operation", () => {
  const def = CERTIFICATION_FIXTURES.enrollment_e2e_certification;
  assert.equal(def.npm_script, "dev:certify:enrollment-e2e");
  assert.deepEqual(Object.keys(def.operations), ["run"]);
  assert.deepEqual(def.operations.run.args, []);
  assert.equal(Object.isFrozen(def), true);
  assert.equal(Object.isFrozen(def.operations), true);
  assert.equal(Object.isFrozen(def.phase_ids), true);

  // POSITIVE CONTROL: the operation is genuinely accepted.
  assert.equal(validateFixtureRequest({
    fixture: "enrollment_e2e_certification", operation: "run",
  }).ok, true);
});

await test("adding an operation to one fixture does not widen another", () => {
  // This is the regression the per-fixture matrix exists for. The runner used to match
  // the fixture and the operation in two INDEPENDENT case blocks, so every operation was
  // legal for every fixture and the pairing was never checked. Harmless while both
  // fixtures took the same three operations; a hole the moment a fixture with a different
  // operation was added.
  for (const seed of ["operational_cards_certification", "enrollment_certification"]) {
    const v = validateFixtureRequest({ fixture: seed, operation: "run" });
    assert.equal(v.ok, false, `${seed} accepted run`);
    assert.equal(v.error, FIXTURE_REFUSALS.UNKNOWN_OPERATION);
    assert.match(runnerRefusal([seed, "run", "/tmp"]) || "", /operation_not_allowlisted/);
  }
  for (const op of ["ensure", "verify", "reset"]) {
    const v = validateFixtureRequest({ fixture: "enrollment_e2e_certification", operation: op });
    assert.equal(v.ok, false, `e2e accepted ${op}`);
    assert.equal(v.error, FIXTURE_REFUSALS.UNKNOWN_OPERATION);
    assert.match(runnerRefusal(["enrollment_e2e_certification", op, "/tmp"]) || "", /operation_not_allowlisted/);
  }

  // POSITIVE CONTROL: each fixture still accepts its own operations.
  for (const op of ["ensure", "verify", "reset"]) {
    assert.equal(validateFixtureRequest({ fixture: "enrollment_certification", operation: op }).ok, true, op);
  }
  assert.equal(validateFixtureRequest({ fixture: "enrollment_e2e_certification", operation: "run" }).ok, true);
});

await test("a phase selector is a closed vocabulary, at both entry points", () => {
  // WHY THIS IS LOAD-BEARING RATHER THAN DECORATIVE. The driver itself cannot refuse an
  // unknown phase: selectPhaseChain looks the key up and RETURNS SILENTLY when it misses,
  // so a typo does not fail — it runs bootstrap alone and reports a green subset that
  // proves nothing. A misspelled phase would be indistinguishable from a pass.
  for (const bad of ["B_entryy", "nope", "N_complete_enrollment; id", "../x", "A_bootstrap,nope"]) {
    const v = validateFixtureRequest({
      fixture: "enrollment_e2e_certification", operation: "run", phases: bad,
    });
    assert.equal(v.ok, false, `${bad} was accepted`);
    assert.equal(v.error, FIXTURE_REFUSALS.BAD_PHASE);
  }
  assert.match(
    runnerRefusal(["enrollment_e2e_certification", "run", "/tmp", "--phases", "nope"]) || "",
    /phase_not_allowlisted/,
  );

  // POSITIVE CONTROL: every declared phase is accepted, singly and together.
  for (const good of CERTIFICATION_FIXTURES.enrollment_e2e_certification.phase_ids) {
    assert.equal(validateFixtureRequest({
      fixture: "enrollment_e2e_certification", operation: "run", phases: [good],
    }).ok, true, good);
  }
  const all = [...CERTIFICATION_FIXTURES.enrollment_e2e_certification.phase_ids];
  assert.equal(validateFixtureRequest({
    fixture: "enrollment_e2e_certification", operation: "run", phases: all.join(","),
  }).ok, true);
});

await test("a fixture that declares no phases refuses the parameter rather than ignoring it", () => {
  // Silently dropping a selector the caller believed in is how a targeted run becomes a
  // full mutating run nobody asked for.
  for (const seed of ["operational_cards_certification", "enrollment_certification"]) {
    const v = validateFixtureRequest({ fixture: seed, operation: "ensure", phases: ["A_bootstrap"] });
    assert.equal(v.ok, false, `${seed} ignored phases`);
    assert.equal(v.error, FIXTURE_REFUSALS.BAD_PHASE);
    assert.equal(CERTIFICATION_FIXTURES[seed].phase_ids, undefined);
  }
  assert.match(
    runnerRefusal(["enrollment_certification", "ensure", "/tmp", "--phases", "A_bootstrap"]) || "",
    /phase_not_allowlisted/,
  );

  // POSITIVE CONTROL: omitting phases entirely is still a valid full run.
  assert.equal(validateFixtureRequest({ fixture: "enrollment_certification", operation: "ensure" }).ok, true);
});

await test("a phase selection reaches the driver as an enum, never as a command line", async () => {
  // The ONLY environment value a caller can influence, and it is drawn from the closed
  // list above. Nothing else the caller supplies is placed on a command line at all.
  const dir = makeE2eWorktree();
  let seen = null;
  const out = await runCertificationFixture({
    fixture: "enrollment_e2e_certification",
    operation: "run",
    laneId: "lane_test",
    cwd: dir,
    phases: ["B_entry", "N_complete_enrollment"],
    loadLane: () => laneFor(dir),
    runner: async (argv) => {
      seen = argv;
      return { ok: true, code: 0, stdout: "", stderr: "", error: null };
    },
  });
  assert.equal(out.ok, true);
  assert.deepEqual(out.phases, ["B_entry", "N_complete_enrollment"]);
  // The vector is the fixture, the operation, the worktree, then the validated enum.
  assert.deepEqual(seen, [
    "enrollment_e2e_certification", "run", out.worktree_path,
    "--phases", "B_entry,N_complete_enrollment",
  ]);
  assert.equal(out.credentials_exposed, false);
  // No secret is echoed back to the caller under any key.
  assert.equal(/service_role|SUPABASE_SERVICE|anon_key|eyJ/i.test(JSON.stringify(out)), false);
});

await test("the E2E driver's script must be present in the calling worktree", async () => {
  // The driver lives in the Enrollment product worktree, not in the toolkit. A lane whose
  // worktree does not carry it is told so, rather than starting a credential-holding
  // process that would fail obscurely.
  const dir = makeWorktree();  // carries the seed script, not the driver
  const out = await runCertificationFixture({
    fixture: "enrollment_e2e_certification",
    operation: "run",
    laneId: "lane_test",
    cwd: dir,
    loadLane: () => laneFor(dir),
    runner: async () => { throw new Error("runner must not start"); },
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, FIXTURE_REFUSALS.SCRIPT_MISSING);
  assert.match(runnerRefusal(["enrollment_e2e_certification", "run", dir]) || "", /fixture_script_not_present/);

  // POSITIVE CONTROL: a worktree that does carry it passes this check.
  const ok = makeE2eWorktree();
  assert.equal(fixtureScriptPresentFor(ok, "enrollment_e2e_certification").ok, true);
});

await test("the E2E operation inherits every existing refusal", async () => {
  const dir = makeE2eWorktree();
  // Arbitrary cwd: knowing a lane id is not authority over a worktree it does not own.
  const foreign = await runCertificationFixture({
    fixture: "enrollment_e2e_certification",
    operation: "run",
    laneId: "lane_test",
    cwd: "/tmp",
    loadLane: () => laneFor(dir),
    runner: async () => { throw new Error("runner must not start"); },
  });
  assert.equal(foreign.ok, false);
  assert.equal(foreign.error, FIXTURE_REFUSALS.LANE_NOT_OWNED);

  // Production runtime.
  assert.equal(assertLocalEnvironment({ env: { NODE_ENV: "production" } }).ok, false);
  assert.equal(assertLocalEnvironment({ env: { VERCEL: "1" } }).ok, false);

  // Arbitrary executable / shell / flag, at the runner.
  assert.match(runnerRefusal(["enrollment_e2e_certification", "run", dir, "--evil"]) || "", /unexpected argument/);
  assert.match(runnerRefusal(["enrollment_e2e_certification", "run; id", dir]) || "", /operation_not_allowlisted/);

  // A prohibited target is refused by the runner, which is the first place it is knowable.
  const src = readFileSync(RUNNER, "utf8");
  assert.match(src, /alloy_is_production_supabase_url/);
  assert.match(src, /certification_target_prohibited/);
});

await test("the E2E entry is discoverable with its phase vocabulary", () => {
  const listed = listCertificationFixtures().find((f) => f.fixture === "enrollment_e2e_certification");
  assert.ok(listed, "not listed");
  assert.deepEqual(listed.operations, ["run"]);
  assert.equal(listed.phases.length, CERTIFICATION_FIXTURES.enrollment_e2e_certification.phase_ids.length);
  assert.ok(listed.phases.includes("N_complete_enrollment"));
  // The seed fixtures declare none, and say so by omission rather than an empty list.
  const seed = listCertificationFixtures().find((f) => f.fixture === "enrollment_certification");
  assert.equal(seed.phases, undefined);
});

await test("the runner restates the allowlist, so reaching it directly changes nothing", () => {
  // Defence in depth is the established idiom of this boundary and the new entry keeps it.
  const src = readFileSync(RUNNER, "utf8");
  assert.match(src, /enrollment_e2e_certification:run\)/);
  assert.match(src, /dev:certify:enrollment-e2e/);
  assert.match(src, /ALLOWED_PHASES=/);
  assert.match(src, /ALLOY_CERT_PHASES/);
  // Every phase the Node layer declares is also refusable by the runner.
  for (const p of CERTIFICATION_FIXTURES.enrollment_e2e_certification.phase_ids) {
    assert.ok(src.includes(p), `runner is missing phase ${p}`);
  }
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
