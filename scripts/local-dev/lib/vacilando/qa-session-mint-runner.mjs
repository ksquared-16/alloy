/**
 * Spawn the trusted-host minting child and return its metadata.
 *
 * The child is a separate process on purpose. Keeping the Supabase work out of the CLI process
 * means the privileged keys are read, used and discarded in a scope that never had the agent's
 * stdout attached to it, and this module only ever handles the JSON metadata line the child prints.
 *
 * Everything crossing back is passed through `redactAuthText` before it can reach a result or a log,
 * so even a future child that misbehaved could not smuggle a token out through an error string.
 */
import { execFile, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import { redactAuthText, slotAuthStoragePath, qaEnvSourceForSlot } from "./browser-auth.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The trusted env source that `alloy-dev-start` uses; privileged values never enter the worktree. */
export function trustedEnvSource() {
    return process.env.ALLOY_SERVER_ENV_SOURCE
        || join(process.env.ALLOY_REPO || join(homedir(), "Alloy"), "web", ".env.local");
}

/** Named so a refusal reads as what it is, rather than as a mint that went wrong. */
export const QA_ENV_SOURCE_MISSING = "qa_env_source_missing";

/**
 * THE ENV SOURCE THIS SLOT'S SESSION MUST BE MINTED FROM.
 *
 * A slot that declares nothing gets `trustedEnvSource()` — the host default,
 * unchanged, which is why no hosted slot's behaviour moves. A slot that declares
 * one gets it, so a server pointed at the certification stack is authenticated
 * against the certification stack.
 *
 * DECLARED-BUT-MISSING REFUSES. Falling back to the host default there would put
 * back the exact defect this closes, and put it back invisibly: a certification
 * slot would quietly mint a hosted cookie again, and the only symptom would be an
 * auth failure three layers away that looks like a product problem. A slot that
 * says where it authenticates and is wrong about it must fail saying so.
 */
export function resolveMintEnvSource(slot) {
    const declared = qaEnvSourceForSlot(slot);
    if (!declared) return { ok: true, envSource: trustedEnvSource(), declared: false };
    if (!existsSync(declared)) {
        return {
            ok: false,
            error: QA_ENV_SOURCE_MISSING,
            detail: `Slot ${slot} declares ALLOY_SLOT_${Number(slot)}_QA_ENV_SOURCE but the file does not exist: ${declared}`,
            envSource: declared,
            declared: true,
        };
    }
    return { ok: true, envSource: declared, declared: true };
}

export function runQaSessionMint(validated, {
    spawn = null,
    scriptPath = null,
    envSource = null,
    storagePath = null,
    timeoutMs = 120_000,
} = {}) {
    const invocation = mintInvocation(validated, { scriptPath, envSource, storagePath });
    // Refuse BEFORE spawning. A slot that cannot say where it authenticates must
    // not reach Supabase at all, let alone reach the wrong one.
    if (invocation.refusal) return Promise.resolve(mintRefusal(invocation.refusal));
    const { cmd, argv } = invocation;
    const run = spawn || defaultSpawn;
    return run(cmd, argv, { timeoutMs }).then(interpretMintOutput);
}

/** A refusal shaped exactly like a failed mint, so every caller already handles it. */
function mintRefusal(resolved) {
    return { ok: false, error: resolved.error, detail: redactAuthText(resolved.detail || "") };
}

/**
 * The same mint, synchronously.
 *
 * `processGovernedAction` executes without awaiting, and the trusted-host actions beside this one
 * do their real work through `spawnSync` — git for push, gh for merge. Returning a Promise into
 * that path is scored as a failed execution, so the governed route needs a synchronous form.
 * `interpretMintOutput` is shared with the async form so the two cannot disagree about what a
 * successful mint looks like.
 */
export function runQaSessionMintSync(validated, {
    spawnSyncImpl = null,
    scriptPath = null,
    envSource = null,
    storagePath = null,
    timeoutMs = 120_000,
} = {}) {
    const invocation = mintInvocation(validated, { scriptPath, envSource, storagePath });
    if (invocation.refusal) return mintRefusal(invocation.refusal);
    const { cmd, argv } = invocation;
    const run = spawnSyncImpl || defaultSpawnSync;
    return interpretMintOutput(run(cmd, argv, { timeoutMs }));
}

/** The command line, built once so the sync and async forms cannot drift apart. */
function mintInvocation(validated, { scriptPath = null, envSource = null, storagePath = null } = {}) {
    const script = scriptPath || join(HERE, "..", "..", "vac-qa-session-mint.mjs");
    const storage = storagePath || slotAuthStoragePath(validated.slot);
    // An explicit caller-supplied source still wins — that is the test seam and
    // the escape hatch. Otherwise the SLOT decides, and only then the host default.
    const resolved = envSource
        ? { ok: true, envSource }
        : resolveMintEnvSource(validated.slot);
    if (!resolved.ok) return { refusal: resolved };
    return {
        cmd: process.execPath,
        argv: [
            script,
            "--identity", validated.expected_identity,
            "--storage", storage,
            "--env-source", resolved.envSource,
            "--base-url", validated.base_url,
        ],
    };
}

/** Reduce the child's output to safe metadata. Shared by both forms. */
function interpretMintOutput(out) {
    const line = String(out.stdout || "").trim().split("\n").filter(Boolean).pop();
    let parsed = null;
    try { parsed = line ? JSON.parse(line) : null; } catch { parsed = null; }
    if (!parsed) {
        return { ok: false, error: "mint_no_result", detail: redactAuthText(out.stderr || out.error || "no metadata returned") };
    }
    if (!parsed.ok) {
        return { ok: false, error: String(parsed.error || "mint_failed"), detail: redactAuthText(parsed.detail || "") };
    }
    return {
        ok: true,
        mechanism: parsed.mechanism || "single_use_magiclink",
        password_involved: parsed.password_involved === true,
        cookie_domains: Array.isArray(parsed.cookie_domains) ? parsed.cookie_domains : [],
        storage_mode: parsed.storage_mode || null,
        expires_at: parsed.expires_at || null,
    };
}

function defaultSpawnSync(cmd, argv, { timeoutMs }) {
    const r = spawnSync(cmd, argv, {
        timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, encoding: "utf8",
        cwd: join(HERE, "..", "..", "..", ".."),
    });
    return {
        ok: r.status === 0,
        stdout: String(r.stdout || ""),
        stderr: String(r.stderr || ""),
        error: r.error ? String(r.error.message || r.error) : null,
    };
}

function defaultSpawn(cmd, argv, { timeoutMs }) {
    return new Promise((resolveP) => {
        execFile(cmd, argv, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, encoding: "utf8", cwd: join(HERE, "..", "..", "..", "..") },
            (err, stdout, stderr) => {
                resolveP({
                    ok: !err,
                    stdout: String(stdout || ""),
                    stderr: String(stderr || ""),
                    error: err ? String(err.message || err) : null,
                });
            });
    });
}
