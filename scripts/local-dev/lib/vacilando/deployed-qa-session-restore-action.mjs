/**
 * `environment.restore_deployed_qa_session` — the deployed sibling of `environment.restore_qa_session`.
 *
 * A SECOND ACTION, NOT A WIDER FIRST ONE.
 *
 * The local action takes a lane id and resolves a loopback slot session. This one takes a deployed
 * TARGET KEY and resolves a deployed session. Neither can produce the other's shape, so a deployed
 * "proof" can never be satisfied by the dev server on localhost, and a slot restore can never be
 * quietly redirected at a public host. That mirror-imaging is the whole point: the failure being
 * designed out is a loopback session presented as deployed evidence, and its reverse is equally wrong.
 *
 * What a caller may say is one registry key. Base URL, host, cookie domain, Supabase project,
 * expected identity, storage path and the credential pointer are all resolved HERE from the trusted
 * registry. There is no input through which a worker can name a URL, a project, a cookie domain or
 * an account, so there is nothing to smuggle a different target through.
 *
 * The one thing this action will not do on trust is believe that the credentials it is about to use
 * belong to the deployment it is about to authenticate. That is measured, from both ends, before
 * anything privileged runs — see `proveProjectBacking`.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
    assertStorageMatchesDestination,
    destinationClassOf,
    redactAuthText,
    validateDeployedBrowserAuthRequest,
} from "./browser-auth.mjs";
import {
    FORBIDDEN_DEPLOYED_INPUTS,
    deployedAuthStoragePath,
    projectRefFromSupabaseUrl,
    verifyDeployedProjectMatch,
} from "./deployed-target-registry.mjs";
import { trustedEnvSource } from "./qa-session-mint-runner.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Keys the governed layer spreads into every validator before the caller is consulted.
 *
 * Identical reasoning to the local action: these are the FRAMEWORK's values, and a validator cannot
 * tell an injected field from a supplied one. They are stripped rather than refused, because
 * refusing them rejects the layer's own request — and stripping is safe here for the same reason it
 * is safe there: nothing downstream reads them.
 */
export const DEPLOYED_RESTORE_FRAMEWORK_INPUTS = Object.freeze([
    "queryArtifactPath", "databaseTarget", "worktreePath", "worktree_path", "artifactRoot",
]);

/** The only fields a caller may name. Everything else is refused BY NAME so the boundary is learnable. */
export const DEPLOYED_RESTORE_ACCEPTED_INPUTS = Object.freeze(["deployed_target", "deployedTarget", "target_key"]);

/**
 * Validate the request shape.
 *
 * Returns `normalized` even on the narrowest success, because `requestTrustedHostAction` reads
 * `validated.normalized.dedupeKey` unconditionally — a validator that returns a bare `{ ok: true }`
 * throws a TypeError before the action exists, which surfaces to the Director as `execution_threw`
 * with nothing to read. That is not a hypothetical; it is how the toolkit install action first failed.
 */
export function validateRestoreDeployedQaSessionInputs(rawInputs = {}) {
    const inputs = Object.fromEntries(
        Object.entries(rawInputs || {}).filter(([k]) => !DEPLOYED_RESTORE_FRAMEWORK_INPUTS.includes(k)),
    );
    const supplied = Object.keys(inputs);

    const offending = supplied.filter((k) => FORBIDDEN_DEPLOYED_INPUTS.includes(k));
    if (offending.length) {
        return { ok: false, error: "caller_supplied_forbidden_input", detail: offending.join(", ") };
    }
    const unknown = supplied.filter((k) => !DEPLOYED_RESTORE_ACCEPTED_INPUTS.includes(k));
    if (unknown.length) {
        return { ok: false, error: "unexpected_input", detail: unknown.join(", ") };
    }
    const key = inputs.deployed_target ?? inputs.deployedTarget ?? inputs.target_key ?? null;
    if (!key) return { ok: false, error: "deployed_target_required", detail: "name a registered deployed target key" };

    // Resolution happens at validation time as well as at execution time, so an unknown key is
    // refused when it is FILED rather than becoming an approved action that cannot execute.
    const resolved = validateDeployedBrowserAuthRequest({ deployed_target: key });
    if (!resolved.ok) return resolved;

    return {
        ok: true,
        normalized: {
            targetKey: resolved.target_key,
            // One in-flight restore per target: two approvals for the same deployed session are the
            // same request, and the second would overwrite the storage the first is verifying.
            dedupeKey: `restore_deployed_qa_session:${resolved.target_key}`,
        },
    };
}

/** Resolve every privileged dimension from the registry. Reads no caller input beyond the key. */
export function resolveDeployedRestoreTarget(targetKey, { validate = validateDeployedBrowserAuthRequest } = {}) {
    const validated = validate({ deployed_target: targetKey });
    if (!validated.ok) return { ok: false, error: validated.error, detail: validated.detail || null };
    return { ok: true, validated };
}

/**
 * Where the credentials come from.
 *
 * The target names an env-source POINTER, never a value. When that pointer is unset the canonical
 * host env source is used — and that fallback is safe only because `proveProjectBacking` then has
 * to demonstrate that this env source actually backs this deployment. Without the gate the fallback
 * would be a guess; with it, a wrong env source is a refusal rather than a session minted against
 * the wrong project.
 */
export function deployedEnvSource(target, { env = process.env } = {}) {
    const pointed = target?.trusted_env_key ? String(env[target.trusted_env_key] || "").trim() : "";
    return pointed || trustedEnvSource();
}

/** The project ref named by a trusted env file. The REF only — never the URL and never a key. */
export function envProjectRef(envSourcePath, { read = readFileSync } = {}) {
    let text = "";
    try {
        text = String(read(envSourcePath, "utf8"));
    } catch {
        return null;
    }
    const m = text.match(/^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+)$/m);
    if (!m) return null;
    return projectRefFromSupabaseUrl(m[1].trim().replace(/^["']|["']$/g, ""));
}

/**
 * The project ref the DEPLOYMENT itself reports.
 *
 * Asked of the target's own `/api/build-info`, which returns the ref and deliberately not the URL
 * or the anon key. The URL is the registry's, never a caller's, so this cannot be pointed anywhere.
 */
export function observedProjectRef(baseUrl, { fetchJson = defaultFetchJson, timeoutMs = 25_000 } = {}) {
    const out = fetchJson(`${String(baseUrl).replace(/\/$/, "")}/api/build-info`, { timeoutMs });
    if (!out.ok) return null;
    const ref = out.json?.supabaseProjectRef;
    return ref ? String(ref).trim() : null;
}

/**
 * Prove the credentials belong to the deployment BEFORE minting anything.
 *
 * Both sides must be observed. An unmeasured match is not a match — a deployment that does not
 * report its project, or an env source that names none, yields a refusal, never a pass. The refusal
 * carries no values: which project a host runs is not this action's to disclose on the way out.
 */
export function proveProjectBacking(validated, {
    env = process.env,
    read = readFileSync,
    fetchJson = defaultFetchJson,
} = {}) {
    const envSource = deployedEnvSource(validated, { env });
    const match = verifyDeployedProjectMatch({
        envProjectRef: envProjectRef(envSource, { read }),
        observedProjectRef: observedProjectRef(validated.base_url, { fetchJson }),
    });
    if (!match.ok) return { ok: false, error: match.error, detail: match.detail };
    return { ok: true, envSource, projectRef: match.project_ref };
}

/**
 * Execute an APPROVED deployed restore.
 *
 * `grant` is the operator's decision. Without one that authorizes exactly this action nothing
 * privileged runs: the mint child is never spawned, so a pending or denied request cannot reach
 * Supabase at all. `restored` is decided by the fresh-context verification against the DEPLOYED
 * host, never by the mint.
 */
export function executeRestoreDeployedQaSessionSync({
    action,
    grant,
    grantCheck,
    nowMs = Date.now(),
    env = process.env,
    read = readFileSync,
    fetchJson = defaultFetchJson,
    mint = runDeployedMintSync,
    verify = verifyDeployedBrowserAuthSync,
    authRoot = defaultAuthRoot(),
} = {}) {
    if (!grant) return safeDeployedFailure({ code: "grant_missing" });
    const authorized = grantCheck ? grantCheck(grant, action, { nowMs }) : { ok: true };
    if (!authorized.ok) return safeDeployedFailure({ code: authorized.error || "grant_rejected" });

    /*
     * `action.inputs` AT EXECUTION TIME IS THE NORMALIZED SHAPE, NOT THE CALLER'S.
     *
     * requestTrustedHostAction stores `validateInputs().normalized`, so by the time an approved
     * action executes its inputs are `{targetKey, dedupeKey}` — not `{deployed_target}`. Re-running
     * the caller-facing validator over that refused the layer's own normalized object as
     * `unexpected_input`, and because the request had already been approved it surfaced as
     * `execution_failed` on an approval the operator had granted.
     *
     * The local sibling survives the same path only by coincidence: its normalized key is `laneId`,
     * which its validator happens to accept. That is not a design, and it is why this is spelled out
     * rather than mirrored.
     *
     * The caller boundary is NOT weakened by reading the normalized form here. It was enforced when
     * the request was created; a normalized object cannot carry a caller-supplied URL, project or
     * identity, because the validator that produced it emits only these two fields.
     */
    const raw = action?.inputs || {};
    let targetKey = raw.targetKey ?? null;
    if (targetKey == null) {
        const inputCheck = validateRestoreDeployedQaSessionInputs(raw);
        if (!inputCheck.ok) return safeDeployedFailure({ code: inputCheck.error, detail: inputCheck.detail });
        targetKey = inputCheck.normalized.targetKey;
    }

    const resolved = resolveDeployedRestoreTarget(targetKey);
    if (!resolved.ok) return safeDeployedFailure({ code: resolved.error, detail: resolved.detail });
    const validated = resolved.validated;

    // The storage destination is derived, then CHECKED against the destination class. Deriving it
    // correctly and asserting it are different controls: the second is what catches a future edit
    // that reroutes the path, which is precisely the defect this capability exists to prevent.
    const storagePath = deployedAuthStoragePath(validated.target_key, { authRoot });
    const destinationClass = destinationClassOf(validated);
    const placed = assertStorageMatchesDestination({ destinationClass, storagePath });
    if (!placed.ok) return safeDeployedFailure({ code: placed.error, target: validated.target_key });

    const backing = proveProjectBacking(validated, { env, read, fetchJson });
    if (!backing.ok) {
        return safeDeployedFailure({ code: backing.error, detail: backing.detail, target: validated.target_key });
    }

    const minted = mint(validated, { storagePath, envSource: backing.envSource });
    if (!minted.ok) {
        return safeDeployedFailure({
            code: minted.error, target: validated.target_key, identity: validated.expected_identity,
        });
    }

    const verified = verify(validated, { storagePath });
    const ok = verified.ok === true;
    return {
        ok,
        status: ok ? "restored" : "verification_failed",
        target_key: validated.target_key,
        environment: validated.environment,
        base_url: validated.base_url,
        registered_identity: validated.expected_identity,
        project_ref: backing.projectRef,
        storage_written: true,
        verified: ok,
        verified_at: ok ? new Date(nowMs).toISOString() : null,
        failure_code: ok ? null : (verified.state || "verification_failed"),
        failure_detail: ok ? null : (verified.detail == null ? null : redactAuthText(String(verified.detail)).slice(0, 120)),
    };
}

/** The deployed mint: the same child as the local class, told a cookie domain instead of localhost. */
export function runDeployedMintSync(validated, {
    spawnSyncImpl = null,
    scriptPath = null,
    storagePath,
    envSource,
    timeoutMs = 120_000,
} = {}) {
    const script = scriptPath || join(HERE, "..", "..", "vac-qa-session-mint.mjs");
    const run = spawnSyncImpl || defaultSpawnSync;
    const out = run(process.execPath, [
        script,
        "--identity", validated.expected_identity,
        "--storage", storagePath,
        "--env-source", envSource,
        "--base-url", validated.base_url,
        "--cookie-domain", validated.host,
    ], { timeoutMs });
    if (!out.ok) {
        return { ok: false, error: "deployed_mint_failed", detail: redactAuthText(out.stderr || out.error || "") };
    }
    return { ok: true };
}

/**
 * Verify the deployed session the only way that proves anything: a FRESH browser context, against
 * the real deployment.
 *
 * `alloy-agent-verify` is the slot-shaped wrapper — it resolves a port and requires a toolkit-owned
 * local server, neither of which exists for a public host. The Node command underneath it is the
 * part that actually opens a context and asks the application who is signed in, so the deployed
 * class calls that directly with a registry-resolved base URL. The wrapper's host allow-list is not
 * being bypassed so much as replaced by a stricter one: the only bases reachable here are the
 * registry's entries, and a caller cannot add to them.
 */
export function verifyDeployedBrowserAuthSync(validated, {
    spawnSyncImpl = null,
    verifyScript = null,
    webDir = defaultWebDir(),
    evidenceDir = null,
    storagePath,
    timeoutMs = 180_000,
} = {}) {
    const script = verifyScript || join(HERE, "..", "agent-verify.mjs");
    const run = spawnSyncImpl || defaultSpawnSync;
    const out = run(process.execPath, [
        script,
        "--web-dir", webDir,
        "--base-url", validated.base_url,
        "--storage", storagePath,
        "--evidence", evidenceDir || join(defaultAuthRoot(), "evidence", "deployed", validated.target_key),
        "authenticated-home",
    ], { timeoutMs });

    const text = `${out.stdout || ""}\n${out.stderr || ""}`;
    const EMAIL = "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}";
    const named = text.match(new RegExp(`^\\s*identity:\\s*(${EMAIL})\\s*$`, "m"));
    const actual = named ? named[1] : null;

    // ABSENT identity fails closed. A deployment that renders no identity has not proven a session;
    // it has proven only that a route did not bounce, which is not the question being asked.
    if (!actual) {
        return {
            ok: false,
            state: out.ok ? "no_identity_reported" : "verification_failed",
            detail: redactAuthText(out.stderr || out.error || "the deployment reported no signed-in identity"),
            actual_identity: null,
        };
    }
    // A DIFFERENT account is wrong_identity, never "close enough" — accepting another QA account is
    // how one certification run starts asserting against another account's data.
    if (actual.toLowerCase() !== String(validated.expected_identity).toLowerCase()) {
        return { ok: false, state: "wrong_identity", detail: "the deployment reported a different account", actual_identity: actual };
    }
    return { ok: out.ok === true, state: out.ok ? "restored" : "verification_failed", detail: null, actual_identity: actual };
}

/**
 * The only result shape a failed deployed restore may return.
 *
 * Allow-listed by construction, exactly as the local action's is: there is no field a cookie, token,
 * link or raw child error could occupy, so a future edit cannot leak one by forgetting to redact.
 */
export function safeDeployedFailure({ code, detail = null, target = null, identity = null }) {
    return {
        ok: false,
        status: "failed",
        target_key: target,
        environment: null,
        base_url: null,
        registered_identity: identity,
        project_ref: null,
        storage_written: false,
        verified: false,
        verified_at: null,
        failure_code: String(code || "unknown").slice(0, 64),
        // Redact BEFORE truncating: a child error beginning "access_token=eyJ..." is still a usable
        // token in its first 120 characters.
        failure_detail: detail == null ? null : redactAuthText(String(detail)).slice(0, 120),
    };
}

/**
 * The gates the Director sees. `null` is UNMEASURED and never passes — the same convention the
 * authority policy uses, so an unreadable env source cannot read as a satisfied precondition.
 */
export function measureDeployedRestoreGates(targetKey, {
    env = process.env,
    read = readFileSync,
    fetchJson = defaultFetchJson,
} = {}) {
    const resolved = resolveDeployedRestoreTarget(targetKey);
    if (!resolved.ok) {
        return {
            deployed_target_registered: false,
            deployed_base_is_https: null,
            trusted_env_source_readable: null,
            deployment_states_its_project: null,
            project_backing_proven: null,
            storage_destination_is_deployed: null,
        };
    }
    const v = resolved.validated;
    const source = deployedEnvSource(v, { env });
    const envRef = envProjectRef(source, { read });
    const seenRef = observedProjectRef(v.base_url, { fetchJson });
    const storagePath = deployedAuthStoragePath(v.target_key, { authRoot: defaultAuthRoot() });
    return {
        deployed_target_registered: true,
        deployed_base_is_https: /^https:\/\//i.test(v.base_url),
        trusted_env_source_readable: envRef != null,
        deployment_states_its_project: seenRef != null,
        project_backing_proven: verifyDeployedProjectMatch({ envProjectRef: envRef, observedProjectRef: seenRef }).ok,
        storage_destination_is_deployed:
            assertStorageMatchesDestination({ destinationClass: "deployed_target", storagePath }).ok,
    };
}

function defaultAuthRoot() {
    const configured = process.env.ALLOY_RUNTIME_ROOT?.trim();
    return join(configured || join(homedir(), ".local", "state", "alloy-dev"), "auth");
}

function defaultWebDir() {
    return join(process.env.ALLOY_REPO || join(homedir(), "Alloy"), "web");
}

function defaultSpawnSync(cmd, argv, { timeoutMs }) {
    const r = spawnSync(cmd, argv, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" });
    return {
        ok: r.status === 0,
        stdout: String(r.stdout || ""),
        stderr: String(r.stderr || ""),
        error: r.error ? String(r.error.message || r.error) : null,
    };
}

/** curl rather than fetch: the governed execution path is synchronous and may not return a Promise. */
function defaultFetchJson(url, { timeoutMs = 25_000 } = {}) {
    const r = spawnSync("curl", ["-fsS", "--max-time", String(Math.ceil(timeoutMs / 1000)), url], {
        timeout: timeoutMs + 5_000, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
    });
    if (r.status !== 0) return { ok: false, json: null };
    try { return { ok: true, json: JSON.parse(String(r.stdout || "")) }; } catch { return { ok: false, json: null }; }
}
