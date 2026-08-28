/**
 * `environment.provision_qa_identity` — resolution, guarding and execution.
 *
 * Registered slot QA identities are managed, non-human accounts in hosted staging: machine
 * identifiers rather than mailboxes. This action creates exactly the identity the slot registry
 * already resolves, and nothing else.
 *
 * It deliberately does NOT belong to the restore action. Restoration must never quietly create a
 * user — an account appearing as a side effect of "restore my session" is an account nobody decided
 * to make. Creating and signing in are separate decisions, so they are separate approvals.
 *
 * The request carries a lane id and nothing else. Slot, worktree, port, Supabase project and the
 * identity itself are resolved here from the canonical registries, exactly as the restore does, so
 * there is no input through which a caller could aim this at another address.
 */
import { redactAuthText } from "./browser-auth.mjs";
import { getDurableLane } from "./development-lane.mjs";
import { resolveRestoreTarget } from "./qa-session-restore-action.mjs";
import { runQaIdentityProvisionSync } from "./qa-identity-provision-runner.mjs";

/** Inputs a caller may never supply, mirroring the restore action's boundary. */
export const FORBIDDEN_PROVISION_INPUTS = Object.freeze([
    "email", "identity", "expectedIdentity", "supabaseUrl", "supabaseProject", "projectRef",
    "serviceUrl", "redirectUrl", "redirectTo", "storagePath", "storage",
    "worktree", "port", "slot", "baseUrl", "token", "password", "serviceRoleKey", "accessToken",
]);

/** Keys the governed layer injects into every validator; ignored, never honoured. */
const FRAMEWORK_INJECTED_INPUTS = Object.freeze([
    "queryArtifactPath", "databaseTarget", "worktreePath", "worktree_path", "artifactRoot",
]);

/**
 * The shape a managed QA identity must have.
 *
 * This is the line that keeps the action from ever touching a customer or employee account. It is
 * checked here AND again inside the trusted child, because a single check in one process is a
 * single edit away from being removed.
 */
export const MANAGED_QA_IDENTITY = /^qa-slot[1-6]-[a-z0-9-]+@[a-z0-9.-]+$/i;

export function validateProvisionQaIdentityInputs(rawInputs = {}) {
    const inputs = Object.fromEntries(
        Object.entries(rawInputs || {}).filter(([k]) => !FRAMEWORK_INJECTED_INPUTS.includes(k)),
    );
    const supplied = Object.keys(inputs);
    const offending = supplied.filter((k) => FORBIDDEN_PROVISION_INPUTS.includes(k));
    if (offending.length) {
        return { ok: false, error: "caller_supplied_forbidden_input", detail: offending.join(", ") };
    }
    const laneId = inputs.laneId || inputs.lane_id || null;
    if (!laneId || !/^lane_[A-Za-z0-9]+$/.test(String(laneId))) {
        return { ok: false, error: "lane_id_required" };
    }
    const unknown = supplied.filter((k) => !["laneId", "lane_id"].includes(k));
    if (unknown.length) return { ok: false, error: "unexpected_input", detail: unknown.join(", ") };
    return { ok: true, normalized: { laneId: String(laneId) } };
}

/**
 * Execute an APPROVED provisioning.
 *
 * Synchronous because the governed path is: `processGovernedAction` calls its executor without
 * awaiting, and the trusted-host actions beside this one work through `spawnSync`. Without a grant
 * that authorizes exactly this action, the trusted child is never spawned, so a pending or denied
 * request cannot reach Supabase at all.
 */
export function executeProvisionQaIdentitySync({
    action,
    grant,
    grantCheck,
    nowMs = Date.now(),
    provision = runQaIdentityProvisionSync,
    getLane = getDurableLane,
} = {}) {
    if (!grant) return safeProvisionFailure({ code: "grant_missing" });
    const authorized = grantCheck ? grantCheck(grant, action, { nowMs }) : { ok: true };
    if (!authorized.ok) return safeProvisionFailure({ code: authorized.error || "grant_rejected" });

    const inputCheck = validateProvisionQaIdentityInputs(action?.inputs || {});
    if (!inputCheck.ok) return safeProvisionFailure({ code: inputCheck.error, detail: inputCheck.detail });

    const resolved = resolveRestoreTarget(inputCheck.normalized.laneId, { getLane });
    if (!resolved.ok) return safeProvisionFailure({ code: resolved.error, detail: resolved.detail });
    const validated = resolved.validated;

    // Second, independent check on the identity SHAPE. The registry resolved it, but a registry can
    // be misconfigured, and this action must never be the thing that creates a customer account.
    if (!MANAGED_QA_IDENTITY.test(String(validated.expected_identity || ""))) {
        return safeProvisionFailure({
            code: "identity_not_managed_qa_shape",
            lane: validated.lane_id,
            slot: validated.slot,
        });
    }

    const out = provision(validated);
    if (!out.ok) {
        return safeProvisionFailure({
            code: out.error, detail: out.detail, lane: validated.lane_id, slot: validated.slot,
            identity: validated.expected_identity,
        });
    }
    return {
        ok: true,
        // `already_exists` is a success, not a no-op failure: the desired state is reached either way.
        status: out.result === "already_exists" ? "already_exists" : "provisioned",
        lane_id: validated.lane_id,
        slot: validated.slot,
        registered_identity: validated.expected_identity,
        mutated: out.mutated === true,
        occurrences: out.occurrences ?? null,
        directory_entries_scanned: out.directory_entries_scanned ?? null,
        email_sent: false,
        password_exposed: false,
        managed_by: "alloy",
        // Provisioning creates no session, so it can never assert verification.
        verified: false,
        provisioned_at: new Date(nowMs).toISOString(),
        failure_code: null,
    };
}

/** The only failure shape. No field here can carry a credential. */
export function safeProvisionFailure({ code, detail = null, lane = null, slot = null, identity = null }) {
    return {
        ok: false,
        status: "failed",
        lane_id: lane,
        slot,
        registered_identity: identity,
        mutated: false,
        email_sent: false,
        password_exposed: false,
        verified: false,
        provisioned_at: null,
        failure_code: String(code || "unknown").slice(0, 64),
        failure_detail: detail == null ? null : redactAuthText(String(detail)).slice(0, 120),
    };
}
