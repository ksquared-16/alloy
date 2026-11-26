/**
 * Spawn the trusted-host provisioning child and return its metadata.
 *
 * Separate process on purpose: the service-role key is read, used and discarded in a scope that
 * never had the agent's stdout attached to it, and this module only ever handles the JSON metadata
 * line the child prints. Everything crossing back is redacted before it can reach a result or a log.
 *
 * Synchronous, because the governed execution path does not await its executor.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { redactAuthText } from "./browser-auth.mjs";
import { trustedEnvSource } from "./qa-session-mint-runner.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

export function runQaIdentityProvisionSync(validated, {
    spawnSyncImpl = null,
    scriptPath = null,
    envSource = null,
    timeoutMs = 120_000,
} = {}) {
    const script = scriptPath || join(HERE, "..", "..", "vac-qa-identity-provision.mjs");
    const argv = [
        script,
        "--identity", validated.expected_identity,
        "--env-source", envSource || trustedEnvSource(),
        "--slot", String(validated.slot),
        "--lane", String(validated.lane_id),
    ];
    const run = spawnSyncImpl || defaultSpawnSync;
    const out = run(process.execPath, argv, { timeoutMs });

    const line = String(out.stdout || "").trim().split("\n").filter(Boolean).pop();
    let parsed = null;
    try { parsed = line ? JSON.parse(line) : null; } catch { parsed = null; }
    if (!parsed) {
        return { ok: false, error: "provision_no_result", detail: redactAuthText(out.stderr || out.error || "no metadata returned") };
    }
    if (!parsed.ok) {
        return { ok: false, error: String(parsed.error || "provision_failed"), detail: redactAuthText(parsed.detail || "") };
    }
    // Re-shaped deliberately: only known-safe fields are carried forward.
    return {
        ok: true,
        result: parsed.result === "already_exists" ? "already_exists" : "created",
        mutated: parsed.mutated === true,
        occurrences: Number.isFinite(parsed.occurrences) ? parsed.occurrences : null,
        directory_entries_scanned: Number.isFinite(parsed.directory_entries_scanned) ? parsed.directory_entries_scanned : null,
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
