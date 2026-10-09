/**
 * Spawn the trusted-host access-assignment child and return its metadata.
 *
 * Separate process so the service-role key is read, used and discarded in a scope the agent's stdout
 * was never attached to. Synchronous, because the governed execution path does not await.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { redactAuthText } from "./browser-auth.mjs";
import { trustedEnvSource } from "./qa-session-mint-runner.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

export function runQaAccessAssignSync(validated, {
    role = "admin",
    spawnSyncImpl = null,
    scriptPath = null,
    envSource = null,
    timeoutMs = 120_000,
} = {}) {
    const script = scriptPath || join(HERE, "..", "..", "vac-qa-access-assign.mjs");
    const argv = [
        script,
        "--identity", validated.expected_identity,
        "--env-source", envSource || trustedEnvSource(),
        "--slot", String(validated.slot),
        "--role", role,
    ];
    const run = spawnSyncImpl || defaultSpawnSync;
    const out = run(process.execPath, argv, { timeoutMs });

    const line = String(out.stdout || "").trim().split("\n").filter(Boolean).pop();
    let parsed = null;
    try { parsed = line ? JSON.parse(line) : null; } catch { parsed = null; }
    if (!parsed) {
        return { ok: false, error: "assign_no_result", detail: redactAuthText(out.stderr || out.error || "no metadata returned") };
    }
    if (!parsed.ok) {
        return { ok: false, error: String(parsed.error || "assign_failed"), detail: redactAuthText(parsed.detail || "") };
    }
    // Re-shaped deliberately: only known-safe identifiers and counts are carried forward.
    return {
        ok: true,
        result: parsed.result === "already_exists" ? "already_exists" : "assigned",
        mutated: parsed.mutated === true,
        user_id: typeof parsed.user_id === "string" ? parsed.user_id : null,
        org_id: typeof parsed.org_id === "string" ? parsed.org_id : null,
        memberships_for_user: Number.isFinite(parsed.memberships_for_user) ? parsed.memberships_for_user : null,
        candidate_orgs_seen: Number.isFinite(parsed.candidate_orgs_seen) ? parsed.candidate_orgs_seen : null,
        org_source: typeof parsed.org_source === "string" ? parsed.org_source : null,
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
