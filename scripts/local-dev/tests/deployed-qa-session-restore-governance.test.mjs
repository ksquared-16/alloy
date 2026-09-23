/**
 * Governance positive controls for `environment.restore_deployed_qa_session`.
 *
 * The property under test is NOT "a deployed restore works". It is that a deployed restore cannot
 * be satisfied by anything weaker than a deployed restore, and cannot happen at all without an
 * operator grant and a proven project.
 *
 * Every case that could reach privileged work drives the executor with a fake mint that RECORDS
 * whether it was called. A test that only inspected the returned status would pass equally well
 * against an implementation that minted first and reported a failure afterwards — the thing that
 * must never happen is the child being spawned, and that is what these assert.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ACTION_TYPES, getActionDefinition } from "../lib/vacilando/trusted-host-action-registry.mjs";
import { OPERATOR_OWNED_ACTION_KEYS, SELF_EXPANSION_ACTION_KEYS } from "../lib/vacilando/director-authority.mjs";
import { standingGrantEligible } from "../lib/vacilando/trusted-host-authz.mjs";
import { assertStorageMatchesDestination, destinationClassOf } from "../lib/vacilando/browser-auth.mjs";
import { deployedAuthStoragePath, resolveDeployedTarget } from "../lib/vacilando/deployed-target-registry.mjs";
import {
    deployedEnvSource,
    envProjectRef,
    executeRestoreDeployedQaSessionSync,
    measureDeployedRestoreGates,
    proveProjectBacking,
    resolveDeployedRestoreTarget,
    safeDeployedFailure,
    validateRestoreDeployedQaSessionInputs,
    verifyDeployedBrowserAuthSync,
} from "../lib/vacilando/deployed-qa-session-restore-action.mjs";

const TARGET = "alloy_staging_web";
const IDENTITY = "qa-slot1-product@example.com";
// A REALISTIC project ref. `projectRefFromSupabaseUrl` requires 16-32 chars, so a short fixture
// parses to null on BOTH sides and "unmeasured fails closed" then passes without ever exercising a
// measured match. Two of these tests were vacuous until this was corrected.
const REF = "aaaaaaaaaaaaaaaaaaaa";
const OTHER_REF = "bbbbbbbbbbbbbbbbbbbb";

/** A mint that records rather than mints. Its call count is the real assertion in most cases. */
function recordingMint() {
    const calls = [];
    const fn = (validated, opts) => { calls.push({ validated, opts }); return { ok: true }; };
    fn.calls = calls;
    return fn;
}
/*
 * A MINT THAT MODELS ACTUALLY WRITING THE ARTIFACT.
 *
 * `recordingMint` reports `{ok: true}` and touches no filesystem, which is right for the cases that
 * only need to know the mint was reached. It is NOT enough for the cases that assert a restore
 * succeeded: success now requires that the storage-state file the browser reads actually changed,
 * because reporting success against an unchanged artifact is the defect that let three live restores
 * replay a stale session. So those cases pair the mint with a `stat` whose stamp moves once the mint
 * has run — the same observation the real executor makes, without a real file.
 */
function writingMint() {
    const mint = recordingMint();
    const stat = () => (mint.calls.length > 0
        ? { mtimeMs: 2_000, size: 200 }
        : { mtimeMs: 1_000, size: 100 });
    return { mint, stat };
}
const grantAll = () => ({ ok: true });
const envRead = (ref) => () => `NEXT_PUBLIC_SUPABASE_URL=https://${ref}.supabase.co\n`;
const fetchRef = (ref) => () => ({ ok: true, json: { supabaseProjectRef: ref } });
const action = (inputs = { deployed_target: TARGET }) => ({ id: "tha_test", inputs });

/* ── 1. The registry is the only source of a target ─────────────────────── */

test("a caller may not name a URL, a project, a cookie domain or an account", () => {
    for (const field of [
        "baseUrl", "base_url", "url", "host", "cookieDomain", "cookie_domain",
        "supabaseUrl", "projectRef", "identity", "email", "expectedIdentity",
        "storagePath", "serviceRoleKey", "accessToken",
    ]) {
        const r = validateRestoreDeployedQaSessionInputs({ deployed_target: TARGET, [field]: "x" });
        assert.equal(r.ok, false, `${field} must never be accepted from a caller`);
    }
});

test("an unregistered target is refused at FILING time, not at execution time", () => {
    const r = validateRestoreDeployedQaSessionInputs({ deployed_target: "https://whatever.example" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "unknown_deployed_target");
});

test("the validator returns normalized, because the layer above reads it unconditionally", () => {
    const r = validateRestoreDeployedQaSessionInputs({ deployed_target: TARGET });
    assert.equal(r.ok, true);
    assert.equal(typeof r.normalized, "object");
    assert.equal(r.normalized.dedupeKey, `restore_deployed_qa_session:${TARGET}`);
});

test("every privileged dimension is resolved from the registry", () => {
    const r = resolveDeployedRestoreTarget(TARGET);
    assert.equal(r.ok, true);
    assert.equal(r.validated.expected_identity, IDENTITY);
    assert.equal(r.validated.host, "staging.workwithalloy.com");
    assert.match(r.validated.base_url, /^https:\/\//);
    assert.equal(destinationClassOf(r.validated), "deployed_target");
});

/* ── 2. The two destination classes cannot substitute for each other ─────── */

test("local storage can never satisfy a deployed verification", () => {
    const r = assertStorageMatchesDestination({
        destinationClass: "deployed_target",
        storagePath: "/x/auth/slot1/storage-state.json",
    });
    assert.equal(r.ok, false);
    assert.equal(r.error, "local_storage_cannot_prove_deployed");
});

test("deployed storage can never satisfy a local verification", () => {
    const r = assertStorageMatchesDestination({
        destinationClass: "local_slot",
        storagePath: "/x/auth/deployed/alloy_staging_web/storage-state.json",
    });
    assert.equal(r.ok, false);
    assert.equal(r.error, "deployed_storage_cannot_prove_local");
});

test("a deployed restore writes into the deployed namespace", () => {
    const p = deployedAuthStoragePath(TARGET, { authRoot: "/x/auth" });
    assert.equal(p, "/x/auth/deployed/alloy_staging_web/storage-state.json");
    assert.equal(assertStorageMatchesDestination({ destinationClass: "deployed_target", storagePath: p }).ok, true);
});

/* ── 3. The project backing the deployment must be PROVEN ───────────────── */

test("an unmeasured project match fails closed, and never mints", () => {
    const mint = recordingMint();
    // The env side is genuinely measurable here — asserted, because if it were not, this test
    // would pass against an implementation that never checked the deployment at all.
    assert.equal(envProjectRef("/fake", { read: envRead(REF) }), REF);
    // The deployment reports no project — an unmeasured match is not a match.
    const out = executeRestoreDeployedQaSessionSync({
        action: action(), grant: { id: "g" }, grantCheck: grantAll,
        read: envRead(REF), fetchJson: () => ({ ok: true, json: {} }),
        mint, verify: () => ({ ok: true }), authRoot: "/x/auth",
    });
    assert.equal(out.ok, false);
    assert.equal(out.failure_code, "deployed_project_unverified");
    assert.equal(mint.calls.length, 0, "nothing may be minted against an unproven project");
});

test("a project MISMATCH fails closed, and never mints", () => {
    const mint = recordingMint();
    const out = executeRestoreDeployedQaSessionSync({
        action: action(), grant: { id: "g" }, grantCheck: grantAll,
        read: envRead(REF), fetchJson: fetchRef(OTHER_REF),
        mint, verify: () => ({ ok: true }), authRoot: "/x/auth",
    });
    assert.equal(out.ok, false);
    assert.equal(out.failure_code, "deployed_project_mismatch");
    assert.equal(mint.calls.length, 0);
});

test("a refusal never echoes which project either side named", () => {
    const r = proveProjectBacking(
        { base_url: "https://x.example", trusted_env_key: "NOPE" },
        { env: {}, read: envRead(REF), fetchJson: fetchRef(OTHER_REF) },
    );
    assert.equal(r.ok, false);
    const text = JSON.stringify(r);
    assert.equal(/aaaaaaaaaaaaaaaaaaaa|bbbbbbbbbbbbbbbbbbbb/.test(text), false,
        "a refusal must not disclose project refs");
});

/* ── 4. Approval is not optional, and not a parameter ───────────────────── */

test("without a grant nothing privileged runs", () => {
    const mint = recordingMint();
    const out = executeRestoreDeployedQaSessionSync({
        action: action(), grant: null, grantCheck: grantAll,
        read: envRead(REF), fetchJson: fetchRef(REF), mint, verify: () => ({ ok: true }), authRoot: "/x/auth",
    });
    assert.equal(out.ok, false);
    assert.equal(out.failure_code, "grant_missing");
    assert.equal(mint.calls.length, 0);
});

test("a grant that does not authorize THIS action does not run it", () => {
    const mint = recordingMint();
    const out = executeRestoreDeployedQaSessionSync({
        action: action(), grant: { id: "g" }, grantCheck: () => ({ ok: false, error: "grant_subject_mismatch" }),
        read: envRead(REF), fetchJson: fetchRef(REF), mint, verify: () => ({ ok: true }), authRoot: "/x/auth",
    });
    assert.equal(out.ok, false);
    assert.equal(out.failure_code, "grant_subject_mismatch");
    assert.equal(mint.calls.length, 0);
});

/* ── 5. Identity is decided by the APPLICATION, and fails closed ────────── */

test("a different account is wrong_identity, never close enough", () => {
    const v = verifyDeployedBrowserAuthSync(
        { base_url: "https://x.example", expected_identity: IDENTITY, target_key: TARGET },
        { spawnSyncImpl: () => ({ ok: true, stdout: "identity: someone-else@example.com\nresult: PASS", stderr: "" }), storagePath: "/x" },
    );
    assert.equal(v.ok, false);
    assert.equal(v.state, "wrong_identity");
});

test("an ABSENT identity fails closed — a route that did not bounce is not a session", () => {
    const v = verifyDeployedBrowserAuthSync(
        { base_url: "https://x.example", expected_identity: IDENTITY, target_key: TARGET },
        { spawnSyncImpl: () => ({ ok: true, stdout: "result: PASS", stderr: "" }), storagePath: "/x" },
    );
    assert.equal(v.ok, false);
    assert.equal(v.state, "no_identity_reported");
});

test("the matching identity, reported by the application, is what verifies", () => {
    const v = verifyDeployedBrowserAuthSync(
        { base_url: "https://x.example", expected_identity: IDENTITY, target_key: TARGET },
        { spawnSyncImpl: () => ({ ok: true, stdout: `identity: ${IDENTITY}\nresult: PASS`, stderr: "" }), storagePath: "/x" },
    );
    assert.equal(v.ok, true);
    assert.equal(v.actual_identity, IDENTITY);
});

test("a failed verification after a successful mint is NOT restored", () => {
    const { mint, stat } = writingMint();
    const out = executeRestoreDeployedQaSessionSync({
        action: action(), grant: { id: "g" }, grantCheck: grantAll,
        read: envRead(REF), fetchJson: fetchRef(REF), mint, stat,
        verify: () => ({ ok: false, state: "wrong_identity", detail: "different account" }),
        authRoot: "/x/auth",
    });
    assert.equal(mint.calls.length, 1, "this case must actually reach the mint, or it proves nothing");
    assert.equal(out.ok, false);
    assert.equal(out.status, "verification_failed");
    assert.equal(out.verified, false);
    assert.equal(out.verified_at, null);
});

/* ── 5b. The executor must accept the shape the layer actually hands it ──── */

test("an APPROVED action executes from the normalized inputs the layer stored", () => {
    // The defect this pins, observed live on gar_6c7426280d42ed. requestTrustedHostAction stores
    // `validateInputs().normalized`, so an approved action's `inputs` are {targetKey, dedupeKey} —
    // not {deployed_target}. The executor re-ran the CALLER-facing validator over that and refused
    // the layer's own object as `unexpected_input`, surfacing as `execution_failed` on an approval
    // the operator had already granted. The local sibling survives the same path only because its
    // normalized key happens to be in its accepted list.
    const { mint, stat } = writingMint();
    const out = executeRestoreDeployedQaSessionSync({
        action: { id: "tha_test", inputs: { targetKey: TARGET, dedupeKey: `restore_deployed_qa_session:${TARGET}` } },
        grant: { id: "g" }, grantCheck: grantAll,
        read: envRead(REF), fetchJson: fetchRef(REF), mint, stat,
        verify: () => ({ ok: true }), authRoot: "/x/auth",
    });
    assert.equal(mint.calls.length, 1, "the normalized shape must reach the mint, not be refused before it");
    assert.equal(out.ok, true);
    assert.equal(out.target_key, TARGET);
});

test("the raw caller shape still goes through the full validator", () => {
    // Reading the normalized form must not become a way to skip the boundary: a RAW input object
    // is still validated, so a caller-supplied URL is refused exactly as before.
    const mint = recordingMint();
    const out = executeRestoreDeployedQaSessionSync({
        action: action({ deployed_target: TARGET, baseUrl: "https://evil.example" }),
        grant: { id: "g" }, grantCheck: grantAll,
        read: envRead(REF), fetchJson: fetchRef(REF), mint,
        verify: () => ({ ok: true }), authRoot: "/x/auth",
    });
    assert.equal(out.ok, false);
    assert.equal(out.failure_code, "caller_supplied_forbidden_input");
    assert.equal(mint.calls.length, 0);
});

/* ── 6. Nothing on the way out may carry a secret ───────────────────────── */

test("a failure result has no field a token could occupy", () => {
    const f = safeDeployedFailure({ code: "x", detail: "access_token=eyJhbGciOiJIUzI1NiJ9.super.secret" });
    assert.equal(/eyJhbGciOiJIUzI1NiJ9/.test(JSON.stringify(f)), false, "redaction must happen BEFORE truncation");
    // The SHAPE is asserted, not merely scanned. A name regex has to permit `target_key`, and one
    // loose enough to do that is loose enough to permit `anon_key`. Fixing the field list means a
    // future edit that adds somewhere for a secret to live fails here and has to be justified.
    assert.deepEqual(Object.keys(f).sort(), [
        "base_url", "environment", "failure_code", "failure_detail", "ok", "project_ref",
        "registered_identity", "status", "storage_written", "target_key", "verified", "verified_at",
    ]);
});

test("the mint is told the resolved host as its cookie domain, never localhost", () => {
    const mint = recordingMint();
    executeRestoreDeployedQaSessionSync({
        action: action(), grant: { id: "g" }, grantCheck: grantAll,
        read: envRead(REF), fetchJson: fetchRef(REF), mint,
        verify: () => ({ ok: true }), authRoot: "/x/auth",
    });
    assert.equal(mint.calls.length, 1);
    const { validated, opts } = mint.calls[0];
    assert.equal(validated.host, "staging.workwithalloy.com");
    assert.match(opts.storagePath, /\/deployed\/alloy_staging_web\/storage-state\.json$/);
});

/* ── 7. The governance wiring exists, not merely the code ───────────────── */

test("the action is registered, operator-owned, and never standing-eligible", () => {
    const def = getActionDefinition(ACTION_TYPES.ENVIRONMENT_RESTORE_DEPLOYED_QA_SESSION);
    assert.ok(def, "the action must be in the registry");
    assert.equal(def.alwaysRequiresOperatorApproval, true);
    assert.equal(def.riskClass, "privileged_write");
    assert.deepEqual(def.inputSchema.required, ["deployed_target"]);

    assert.ok(OPERATOR_OWNED_ACTION_KEYS.includes("environment.restore_deployed_qa_session"));
    assert.equal(SELF_EXPANSION_ACTION_KEYS.includes("environment.restore_deployed_qa_session"), false);
    assert.equal(standingGrantEligible("environment.restore_deployed_qa_session"), false,
        "authenticating a public host may never be covered by a standing grant");
});

test("every gate the definition names is actually collected", async () => {
    const { collectDirectorEvidence } = await import("../lib/vacilando/director-evidence.mjs");
    const def = getActionDefinition(ACTION_TYPES.ENVIRONMENT_RESTORE_DEPLOYED_QA_SESSION);
    const ev = collectDirectorEvidence(
        { action_key: "environment.restore_deployed_qa_session", inputs: { deployed_target: TARGET } },
        { stateRoot: "/tmp" },
    );
    for (const gate of def.evidenceSchema.filter((g) => g !== "execution_audit")) {
        assert.notEqual(ev[gate], undefined,
            `gate ${gate} is named by the definition and never collected — the escalation would read "unmeasured"`);
    }
});

test("an unresolvable target measures UNMEASURED, never satisfied", () => {
    const g = measureDeployedRestoreGates("no_such_target");
    assert.equal(g.deployed_target_registered, false);
    for (const [k, v] of Object.entries(g)) {
        if (k === "deployed_target_registered") continue;
        assert.equal(v, null, `${k} must be null (unmeasured), never a pass`);
    }
});

test("the env source is a POINTER resolved from the target, never a caller value", () => {
    const t = resolveDeployedTarget(TARGET).target;
    assert.equal(deployedEnvSource(t, { env: { [t.trusted_env_key]: "/trusted/env" } }), "/trusted/env");
    // With the pointer unset a canonical source is used — safe ONLY because the match is then proven.
    assert.equal(typeof deployedEnvSource(t, { env: {} }), "string");
});

test("an unreadable env source yields null, which the match then refuses", () => {
    assert.equal(envProjectRef("/definitely/not/a/file"), null);
});

/* ── The success signal must mean the browser's artifact is current ──────── */

/*
 * `storage_written` was the literal `true` on every success path, so the one failure it names could
 * never be reported. Measured live: three restores returned ok/verified while
 * `storage-state.json` kept its original mtime and the browser stayed signed out. Verification alone
 * cannot catch this — it can pass against a file this run never touched.
 */
test("a mint that writes nothing is not a restore, however well it verifies", () => {
    const mint = recordingMint();
    const out = executeRestoreDeployedQaSessionSync({
        action: action(), grant: { id: "g" }, grantCheck: grantAll,
        read: envRead(REF), fetchJson: fetchRef(REF), mint,
        // Verification says the session is healthy — against an artifact nothing refreshed.
        verify: () => ({ ok: true }),
        stat: () => ({ mtimeMs: 1_000, size: 100 }),
        authRoot: "/x/auth",
    });
    assert.equal(mint.calls.length, 1, "the mint must be reached, or this proves nothing");
    assert.equal(out.ok, false, "an unchanged artifact cannot be reported as restored");
    assert.equal(out.status, "storage_state_unchanged");
    assert.equal(out.storage_written, false);
    assert.equal(out.verified, false);
    assert.equal(out.verified_at, null);
});

test("a successful restore says WHERE the session is", () => {
    /*
     * THE DEFECT THIS CLOSES, MEASURED. A certification lane needed the session this action mints.
     * The result told it the target, the base url, the project ref, that the artifact was written
     * and that verification passed — everything except the one fact it needed. So the lane computed
     * the conventional path, and the conventional path was wrong: `defaultAuthRoot()` joins `auth`
     * onto ALLOY_RUNTIME_ROOT when it is set, so a gateway-rooted executor writes
     * `<root>/gateway/auth/deployed/<target>/storage-state.json` while an unrooted consumer looks
     * under `~/.local/state/alloy-dev/auth/`.
     *
     * It found a stale unrelated file there, loaded it into Playwright, landed on /login and
     * reported the environment blocked — while a valid session minted four minutes earlier sat at
     * the rooted path. The action was truthful and unusable at the same time.
     *
     * A conventional path is not a contract when the runtime boundary can move it.
     */
    const { mint, stat } = writingMint();
    const out = executeRestoreDeployedQaSessionSync({
        action: action(), grant: { id: "g" }, grantCheck: grantAll,
        read: envRead(REF), fetchJson: fetchRef(REF), mint, stat,
        verify: () => ({ ok: true }), authRoot: "/runtime/root/auth",
    });
    assert.equal(out.ok, true);
    assert.equal(
        typeof out.storage_state_path === "string" && out.storage_state_path.length > 0,
        true,
        "a successful restore must return the artifact location",
    );
    /* And it must be the path the action actually stamped — the rooted one, not a convention. */
    assert.equal(out.storage_state_path.startsWith("/runtime/root/auth/"), true);
    assert.equal(out.storage_state_path.endsWith("/storage-state.json"), true);
    /* The location is a path, never the session itself: no cookie or token may ride the result. */
    assert.equal(/cookie|token|password|authorization/i.test(JSON.stringify(out)), false);
});

test("storage_written is measured off the file, not asserted", () => {
    const { mint, stat } = writingMint();
    const out = executeRestoreDeployedQaSessionSync({
        action: action(), grant: { id: "g" }, grantCheck: grantAll,
        read: envRead(REF), fetchJson: fetchRef(REF), mint, stat,
        verify: () => ({ ok: true }), authRoot: "/x/auth",
    });
    assert.equal(out.storage_written, true);
    assert.equal(out.ok, true);
    assert.equal(out.status, "restored");
});

test("an artifact that appears where there was none counts as written", () => {
    // First mint on a clean host: unreadable before, present after. `null` must differ from a real
    // stamp, or the very first restore would report itself unchanged.
    const mint = recordingMint();
    let minted = false;
    const out = executeRestoreDeployedQaSessionSync({
        action: action(), grant: { id: "g" }, grantCheck: grantAll,
        read: envRead(REF), fetchJson: fetchRef(REF),
        mint: (...args) => { minted = true; return mint(...args); },
        stat: () => { if (!minted) throw new Error("ENOENT"); return { mtimeMs: 5, size: 5 }; },
        verify: () => ({ ok: true }), authRoot: "/x/auth",
    });
    assert.equal(out.storage_written, true);
    assert.equal(out.ok, true);
});
