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
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import { redactAuthText, slotAuthStoragePath } from "./browser-auth.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The trusted env source that `alloy-dev-start` uses; privileged values never enter the worktree. */
export function trustedEnvSource() {
    return process.env.ALLOY_SERVER_ENV_SOURCE
        || join(process.env.ALLOY_REPO || join(homedir(), "Alloy"), "web", ".env.local");
}

export function runQaSessionMint(validated, {
    spawn = null,
    scriptPath = null,
    envSource = null,
    storagePath = null,
    timeoutMs = 120_000,
} = {}) {
    const { cmd, argv } = mintInvocation(validated, { scriptPath, envSource, storagePath });
    const run = spawn || defaultSpawn;
    return run(cmd, argv, { timeoutMs }).then(interpretMintOutput);
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
    const { cmd, argv } = mintInvocation(validated, { scriptPath, envSource, storagePath });
    const run = spawnSyncImpl || defaultSpawnSync;
    return interpretMintOutput(run(cmd, argv, { timeoutMs }));
}

/** The command line, built once so the sync and async forms cannot drift apart. */
function mintInvocation(validated, { scriptPath = null, envSource = null, storagePath = null } = {}) {
    const script = scriptPath || join(HERE, "..", "..", "vac-qa-session-mint.mjs");
    const storage = storagePath || slotAuthStoragePath(validated.slot);
    return {
        cmd: process.execPath,
        argv: [
            script,
            "--identity", validated.expected_identity,
            "--storage", storage,
            "--env-source", envSource || trustedEnvSource(),
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
