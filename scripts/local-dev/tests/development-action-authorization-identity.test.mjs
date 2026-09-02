#!/usr/bin/env node
/**
 * ONE AUTHORIZATION IDENTITY, DERIVED IN ONE PLACE.
 *
 * WHY THIS SUITE IS STRUCTURAL AND NOT ONLY BEHAVIORAL. The same defect has now
 * been found four times, always by a live certification failing closed:
 *
 *   1. merge input aliases   grant read `pull_request_number`; executor also
 *                            read `pull_request`. Grant pinned to null.
 *   2. source branch         one side inferred it from the lane binding.
 *   3. authorization scope   minted under lane_id, searched under repo id.
 *   4. environment           minted "staging", looked up as DEFAULT_TARGET
 *                            (`alloy_deployed_primary`) — an OPERATOR-ONLY
 *                            environment, refused unconditionally, so an
 *                            exact-request authorization for repository.push
 *                            could never resolve for anyone.
 *
 * Each fix was correct and each left another site deriving the same fact its own
 * way. Behavioral tests kept passing because they exercised one side at a time.
 * So these assertions are about the SHAPE of the code: a new independent
 * derivation of scope, environment, repository, ref or SHA in any of the mint /
 * preflight / lookup paths fails here, before it can fail a certification.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "..", "lib", "vacilando");
const read = (f) => readFileSync(join(LIB, f), "utf8");

const IDENTITY_SRC = read("action-authorization-identity.mjs");
const REQ_SRC = read("governed-action-request.mjs");
const ACTIONS_SRC = read("trusted-host-actions.mjs");
const AUTHZ_SRC = read("trusted-host-authz.mjs");

const {
  resolveActionAuthorizationIdentity,
  sameAuthorizationIdentity,
  authorizationIdentityMismatch,
  environmentForRef,
  normalizeRef,
  REPOSITORY_ENVIRONMENT,
} = await import("../lib/vacilando/action-authorization-identity.mjs");
const { ACTION_TYPES, DEFAULT_TARGET, getActionDefinition } = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const {
  grantExactRequestAuthorization,
  exactAuthorizationCovers,
  AUTHZ_OPERATOR_ONLY_ENVIRONMENTS,
} = await import("../lib/vacilando/trusted-host-authz.mjs");

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/** The text of one balanced `(...)` argument list, starting at `from`. */
function callArgs(src, from) {
  const open = src.indexOf("(", from);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth += 1;
    else if (c === ")") {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return "";
}

/**
 * Code with comments removed.
 *
 * These assertions are about what the code DOES. The comments deliberately
 * name the defect — `DEFAULT_TARGET`, `targetBranch` — so that the next reader
 * finds the history at the site it happened; asserting over them would mean
 * choosing between an accurate record and an enforceable rule.
 */
function codeOnly(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Every call to `name(` in `src`, as argument text. */
function callsTo(src, name) {
  const out = [];
  const re = new RegExp(`(?<![\\w.])${name}\\s*\\(`, "g");
  let m;
  while ((m = re.exec(src))) {
    // Skip the declaration and the import list.
    const before = src.slice(Math.max(0, m.index - 30), m.index);
    if (/function\s+$/.test(before) || /export function\s+$/.test(before)) continue;
    out.push(callArgs(src, m.index));
  }
  return out;
}

/**
 * The body of a named function.
 *
 * Scanned AFTER the signature's parameter list closes — a destructured
 * parameter object opens a brace of its own, and counting from there returns
 * the PARAMETERS as if they were the body, which quietly makes every
 * body assertion vacuous.
 */
function functionBody(src, signature) {
  const at = src.indexOf(signature);
  assert.notEqual(at, -1, `missing ${signature}`);
  const paramsOpen = src.indexOf("(", at);
  let d = 0;
  let paramsClose = -1;
  for (let i = paramsOpen; i < src.length; i++) {
    if (src[i] === "(") d += 1;
    else if (src[i] === ")") {
      d -= 1;
      if (d === 0) { paramsClose = i; break; }
    }
  }
  assert.notEqual(paramsClose, -1, `unbalanced parameters for ${signature}`);
  const open = src.indexOf("{", paramsClose);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced body for ${signature}`);
}

// ---------------------------------------------------------------------------
// 1 — STRUCTURAL: every mint and every lookup comes from the resolver
// ---------------------------------------------------------------------------

test("every exact-request MINT is fed by the canonical resolver", () => {
  const mints = [
    ...callsTo(REQ_SRC, "grantExactRequestAuthorization"),
    ...callsTo(ACTIONS_SRC, "grantExactRequestAuthorization"),
  ];
  assert.ok(mints.length >= 2, "the delegated and Director mints must both exist");
  for (const args of mints) {
    assert.ok(
      /\.\.\.[^,\n]*\.mint\b/.test(args),
      `a mint builds its own identity instead of spreading resolver.mint:\n${args.slice(0, 400)}`,
    );
    // The fields the resolver owns may not be re-supplied alongside it.
    for (const own of ["environment:", "repository:", "sourceSha:", "targetRef:", "missionId:"]) {
      assert.ok(!args.includes(own), `a mint overrides ${own} after the resolver supplied it`);
    }
  }
});

test("every authorization LOOKUP is fed by the canonical resolver", () => {
  const lookups = [
    ...callsTo(REQ_SRC, "findAuthorization"),
    ...callsTo(ACTIONS_SRC, "findAuthorization"),
  ];
  assert.ok(lookups.length >= 2, "policy-side and boundary lookups must both exist");
  for (const args of lookups) {
    assert.ok(
      /\.\.\.[^,\n]*\.lookup\b/.test(args),
      `a lookup builds its own identity instead of spreading resolver.lookup:\n${args.slice(0, 400)}`,
    );
    for (const own of ["databaseTarget:", "environment:", "queryHash:", "repository:", "missionId:"]) {
      assert.ok(!args.includes(own), `a lookup overrides ${own} after the resolver supplied it`);
    }
  }
});

test("the trusted-host boundary no longer reconstructs a target of its own", () => {
  const body = codeOnly(functionBody(ACTIONS_SRC, "export function authorizeTrustedHostAction(actionId, {"));
  // THE EXACT LINE THAT FAILED S15: `|| DEFAULT_TARGET` as a repository
  // action's authorization environment.
  assert.ok(!body.includes("DEFAULT_TARGET"), "the boundary must not fall back to a database default");
  for (const alias of ["targetBranch", "target_branch", "databaseTarget", "expectedHeadSha", "expected_head_sha"]) {
    assert.ok(!body.includes(alias), `the boundary re-derives identity from ${alias}`);
  }
  assert.ok(body.includes("resolveActionAuthorization"), "the boundary must resolve through the shared path");
  assert.ok(body.includes("trustedHostActionIdentity"), "the pinned-id branch must use the shared identity too");
});

test("the pre-consumption proof calls the boundary's own resolver, not a copy", () => {
  // The previous proof called findAuthorization with a policy-side
  // `environment` the boundary never passed: it verified a different question,
  // passed, and the delegation was consumed for authority that could not be
  // used. There must be exactly ONE lookup on the policy side, and the proof
  // must go through the trusted-host module.
  assert.equal(callsTo(REQ_SRC, "findAuthorization").length, 1,
    "the delegated preflight must not call findAuthorization itself");
  assert.ok(REQ_SRC.includes("previewTrustedHostAuthorization"),
    "the preflight must call the trusted-host preview");
  const preview = functionBody(ACTIONS_SRC, "export function previewTrustedHostAuthorization({");
  assert.ok(preview.includes("resolveActionAuthorization"),
    "the preview must call the same function execution calls");
  assert.ok(preview.includes("validateInputs"),
    "the preview must reason about the normalized shape the action is built from");
});

test("merge identity still comes from readMergeInputIdentity, never a new alias list", () => {
  assert.ok(IDENTITY_SRC.includes('import { readMergeInputIdentity }')
    || /readMergeInputIdentity\s*}\s*from\s*"\.\/trusted-host-merge\.mjs"/.test(IDENTITY_SRC),
    "the resolver must import the canonical merge parser");
  // No sixth merge alias list may appear inside the resolver.
  for (const alias of ["pull_request_number", "pullRequestNumber", "pull_request", "merge_method", "mergeMethod"]) {
    assert.ok(!new RegExp(`["']${alias}["']`).test(IDENTITY_SRC),
      `the resolver re-spells ${alias} instead of delegating to readMergeInputIdentity`);
  }
});

test("the last standalone subject-key derivation is gone", () => {
  assert.ok(!/function actionQueryHash\b/.test(REQ_SRC),
    "actionQueryHash must stay deleted; a retained derivation is a call site waiting to return");
});

test("the identity travels ON the action rather than being rediscovered", () => {
  assert.ok(ACTIONS_SRC.includes("authorizationIdentity:"),
    "requestTrustedHostAction must stamp the resolved identity on the action");
  const body = functionBody(ACTIONS_SRC, "export function requestTrustedHostAction({");
  assert.ok(body.includes("resolveActionAuthorizationIdentity"),
    "the identity must be derived by the resolver at creation");
  // Derived from the action's own normalized inputs; only request id and
  // content fingerprint are accepted from the caller.
  assert.ok(body.includes("inputs: validated.normalized"),
    "identity must be derived from the NORMALIZED inputs, not the raw request");
  const ctx = body.slice(body.indexOf("authorizationContext"));
  for (const spoofable of ["authorizationContext?.environment", "authorizationContext?.scope", "authorizationContext?.repository"]) {
    assert.ok(!ctx.includes(spoofable), `a caller must not be able to supply ${spoofable}`);
  }
});

test("the exact-request grant binds the target ref, both directions", () => {
  const covers = functionBody(AUTHZ_SRC, "export function exactAuthorizationCovers(auth, {");
  assert.ok(covers.includes("normalizeRef(auth.targetRef) !== normalizeRef(targetRef)"),
    "targetRef must be compared strictly, so absence is not a wildcard");
  assert.ok(!/environment\s*\?\?\s*databaseTarget/.test(AUTHZ_SRC),
    "a missing environment must never be substituted with a database target");
});

// ---------------------------------------------------------------------------
// 2 — SEMANTIC: raw inputs and normalized inputs resolve to ONE identity
// ---------------------------------------------------------------------------

const REPO = "ksquared-16/alloy";
const SHA = "83d624abb2621e48c09f7c5eb50a5fbc4faca24e";

/** Both spellings of the same real action, as the two sides actually see them. */
const EQUIVALENCE_CASES = [
  {
    name: "repository.push",
    actionType: ACTION_TYPES.REPOSITORY_PUSH,
    raw: { repository: `git@github.com:${REPO}.git`, branch: "promote/s15-c4", expected_head_sha: SHA },
    normalized: { actionType: "repository.push", repository: REPO, branch: "promote/s15-c4", expectedHeadSha: SHA, remote: "origin", baseRef: "origin/staging" },
  },
  {
    name: "promotion.open_pr",
    actionType: ACTION_TYPES.PROMOTION_OPEN_PR,
    raw: { repository: `https://github.com/${REPO}`, head_branch: "promote/s15-c4", base: "staging", expected_head_sha: SHA },
    normalized: { actionType: "promotion.open_pr", repository: REPO, base: "staging", headBranch: "promote/s15-c4", expectedHeadSha: SHA },
  },
  {
    name: "repository.merge_pull_request",
    actionType: ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
    // Deliberately the alias spellings that caused defect #1.
    raw: { repository: REPO, pull_request: 604, head_sha: SHA, target_branch: "staging", merge_method: "merge" },
    normalized: { actionType: "repository.merge_pull_request", repository: REPO, pullRequestNumber: 604, expectedHeadSha: SHA, targetBranch: "staging", mergeMethod: "merge" },
  },
  {
    name: "database.apply_migration",
    actionType: ACTION_TYPES.DATABASE_APPLY_MIGRATION,
    raw: { environment: "staging", expected_sha: SHA, repository: REPO },
    normalized: { actionType: "database.apply_migration", environment: "staging", expectedSha: SHA, repository: REPO },
  },
];

test("raw request inputs and normalized action inputs resolve to the SAME identity", () => {
  for (const c of EQUIVALENCE_CASES) {
    const a = resolveActionAuthorizationIdentity({ actionType: c.actionType, scope: "repo_alloy", inputs: c.raw, target: "staging" });
    const b = resolveActionAuthorizationIdentity({ actionType: c.actionType, scope: "repo_alloy", inputs: c.normalized, target: "staging" });
    assert.ok(a.ok && b.ok, `${c.name} must resolve from both shapes`);
    assert.ok(
      sameAuthorizationIdentity(a, b),
      `${c.name} derives differently: ${JSON.stringify(authorizationIdentityMismatch(a, b))}`,
    );
  }
});

test("a repository action's environment is never a database target", () => {
  // THE S15 FAILURE, ASSERTED DIRECTLY. `alloy_deployed_primary` is
  // operator-only; any repository action described that way can never be
  // authorized by anyone, which is what made a delegated push unexecutable.
  for (const c of EQUIVALENCE_CASES.filter((x) => x.actionType !== ACTION_TYPES.DATABASE_APPLY_MIGRATION)) {
    for (const shape of [c.raw, c.normalized]) {
      const id = resolveActionAuthorizationIdentity({ actionType: c.actionType, scope: "repo_alloy", inputs: shape, target: "staging" });
      assert.notEqual(id.environment, DEFAULT_TARGET, `${c.name} must not be described as a database target`);
      assert.notEqual(id.lookup.databaseTarget, DEFAULT_TARGET, `${c.name} lookup must not default to a database target`);
      assert.ok(!AUTHZ_OPERATOR_ONLY_ENVIRONMENTS.includes(String(id.environment)),
        `${c.name} must not resolve to an operator-only environment`);
    }
  }
});

test("environment is what the write LANDS IN, not what it is proposed at", () => {
  // A push of promote/* is not a staging write; the merge that follows is.
  const push = (branch) => resolveActionAuthorizationIdentity({
    actionType: ACTION_TYPES.REPOSITORY_PUSH, scope: "repo_alloy",
    inputs: { repository: REPO, branch, expectedHeadSha: SHA }, target: "staging",
  });
  assert.equal(push("promote/s15-c4").environment, REPOSITORY_ENVIRONMENT);
  assert.equal(push("agent/claude/5-work").environment, REPOSITORY_ENVIRONMENT);
  // A push straight AT a deployment ref is named as one, so it can never be
  // minted as ordinary repository authority.
  assert.equal(push("staging").environment, "staging");
  assert.equal(push("main").environment, "production");
  assert.equal(push("refs/heads/production").environment, "production");

  const merge = (target) => resolveActionAuthorizationIdentity({
    actionType: ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST, scope: "repo_alloy",
    inputs: { repository: REPO, pullRequestNumber: 604, expectedHeadSha: SHA, targetBranch: target },
  });
  assert.equal(merge("staging").environment, "staging", "a merge DOES write its target branch");
  assert.equal(merge("main").environment, "production");

  // Opening a pull request writes a proposal and deploys nothing — but the base
  // is bound, so authority to propose into staging is not authority into main.
  const open = (base) => resolveActionAuthorizationIdentity({
    actionType: ACTION_TYPES.PROMOTION_OPEN_PR, scope: "repo_alloy",
    inputs: { repository: REPO, headBranch: "promote/x", base, expectedHeadSha: SHA },
  });
  assert.equal(open("staging").environment, REPOSITORY_ENVIRONMENT);
  assert.equal(open("staging").targetRef, "staging");
  assert.equal(open("main").targetRef, "main");
  assert.ok(!sameAuthorizationIdentity(open("staging"), open("main")), "different bases are different authority");
});

test("a database census keeps its real database target", () => {
  const id = resolveActionAuthorizationIdentity({
    actionType: ACTION_TYPES.DATABASE_READ_CENSUS, scope: "msn_1",
    inputs: { databaseTarget: DEFAULT_TARGET, queryHash: "abc123" },
  });
  assert.equal(id.environment, DEFAULT_TARGET, "a census IS a deployed-database read");
  assert.equal(id.lookup.databaseTarget, DEFAULT_TARGET);
  assert.equal(id.subjectKey, "abc123");
});

test("refs are one ref however they are spelled", () => {
  assert.equal(normalizeRef("refs/heads/promote/x"), "promote/x");
  assert.equal(normalizeRef("origin/staging"), "staging");
  assert.equal(normalizeRef("  STAGING "), "staging");
  assert.equal(normalizeRef(""), null);
  assert.equal(environmentForRef(null), null);
});

test("an unresolvable identity fails closed rather than defaulting", () => {
  const cases = [
    [ACTION_TYPES.REPOSITORY_PUSH, { repository: REPO, expectedHeadSha: SHA }, "missing_branch"],
    [ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST, { repository: REPO, pullRequestNumber: 1, expectedHeadSha: SHA }, "missing_target_branch"],
    [ACTION_TYPES.PROMOTION_OPEN_PR, { repository: REPO, headBranch: "x", expectedHeadSha: SHA }, "missing_base"],
    [ACTION_TYPES.DATABASE_APPLY_MIGRATION, { repository: REPO, expectedSha: SHA }, "missing_environment"],
    [null, {}, "missing_action_type"],
  ];
  for (const [actionType, inputs, reason] of cases) {
    const id = resolveActionAuthorizationIdentity({ actionType, scope: "repo_alloy", inputs });
    assert.equal(id.ok, false, `${actionType} with ${JSON.stringify(inputs)} must not resolve`);
    assert.equal(id.reason, reason);
  }
});

// ---------------------------------------------------------------------------
// 3 — NEGATIVE: what the converged identity must still refuse
// ---------------------------------------------------------------------------

test("production authority is refused at the mint, whatever the caller says", () => {
  const id = resolveActionAuthorizationIdentity({
    actionType: ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST, scope: "repo_alloy",
    inputs: { repository: REPO, pullRequestNumber: 9, expectedHeadSha: SHA, targetBranch: "main" },
  });
  assert.equal(id.environment, "production");
  const minted = grantExactRequestAuthorization({ ...id.mint, requestId: "gar_x", contentFingerprint: "fp" });
  assert.equal(minted.ok, false);
  assert.equal(minted.error, "production_authority_refused");
});

test("an operator-only environment cannot be smuggled through an input", () => {
  // A caller naming the environment directly changes nothing: for a repository
  // action the environment comes from the ref, not from a field.
  for (const smuggle of [{ environment: "staging" }, { databaseTarget: "staging" }, { target_branch: "staging" }]) {
    const id = resolveActionAuthorizationIdentity({
      actionType: ACTION_TYPES.REPOSITORY_PUSH, scope: "repo_alloy",
      inputs: { repository: REPO, branch: "main", expectedHeadSha: SHA, ...smuggle },
    });
    assert.equal(id.environment, "production", `${JSON.stringify(smuggle)} must not soften a push at main`);
  }
});

test("an authorization covers only the identity it was minted for", () => {
  const base = {
    actionType: ACTION_TYPES.REPOSITORY_PUSH, scope: "repo_alloy",
    inputs: { repository: REPO, branch: "promote/s15-c4", expectedHeadSha: SHA },
  };
  const id = resolveActionAuthorizationIdentity(base);
  const minted = grantExactRequestAuthorization({ ...id.mint, requestId: "gar_1", contentFingerprint: "fp_1" });
  assert.equal(minted.ok, true, minted.error);
  const auth = minted.authorization;

  const ask = (over) => exactAuthorizationCovers(auth, {
    requestId: "gar_1", contentFingerprint: "fp_1", actionType: id.actionType,
    environment: id.environment, repository: id.repository, sourceSha: id.sourceSha,
    targetRef: id.targetRef, ...over,
  });
  assert.equal(ask({}), true, "the identity it was minted for must be covered");
  assert.equal(ask({ targetRef: "promote/other" }), false, "a different branch is different authority");
  assert.equal(ask({ targetRef: null }), false, "an absent ref is not a wildcard");
  assert.equal(ask({ environment: "staging" }), false, "a different environment is different authority");
  assert.equal(ask({ environment: DEFAULT_TARGET }), false, "the old database default must never match");
  assert.equal(ask({ environment: null }), false, "an absent environment is not a wildcard");
  assert.equal(ask({ repository: "someone/else" }), false, "another repository is different authority");
  assert.equal(ask({ sourceSha: "0".repeat(40) }), false, "a moved branch is a different decision");
  assert.equal(ask({ requestId: "gar_2" }), false, "another request is a different decision");
  assert.equal(ask({ contentFingerprint: "fp_2" }), false, "different content is a different decision");
  assert.equal(ask({ actionType: ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST }), false, "another action is different authority");
});

test("an authorization minted before the convergence fails closed", () => {
  // A stored grant with no targetRef predates this change. Escalating to the
  // operator is the safe direction; honouring it would be absence-as-wildcard.
  const legacy = {
    scope: "exact_request", contentFingerprint: "fp", actionType: ACTION_TYPES.REPOSITORY_PUSH,
    environment: "staging", repository: REPO, sourceSha: SHA, requestId: "gar_1",
  };
  assert.equal(exactAuthorizationCovers(legacy, {
    requestId: "gar_1", contentFingerprint: "fp", actionType: ACTION_TYPES.REPOSITORY_PUSH,
    environment: "staging", repository: REPO, sourceSha: SHA, targetRef: "promote/x",
  }), false);
});

test("every registered action resolves an identity or says why not", () => {
  // No action may silently acquire a default identity just by existing.
  for (const key of Object.values(ACTION_TYPES)) {
    if (!getActionDefinition(key)) continue;
    const id = resolveActionAuthorizationIdentity({ actionType: key, scope: "repo_alloy", inputs: {} });
    assert.equal(typeof id.ok, "boolean", key);
    if (!id.ok) assert.ok(id.reason, `${key} must say why it did not resolve`);
    assert.notEqual(id.lookup.databaseTarget === DEFAULT_TARGET && key !== ACTION_TYPES.DATABASE_READ_CENSUS, true,
      `${key} must not inherit the database default`);
  }
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
