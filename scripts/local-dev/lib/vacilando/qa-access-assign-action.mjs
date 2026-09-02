/**
 * `environment.assign_qa_identity_access` — resolution, guarding and execution.
 *
 * Provisioning creates the auth account; this grants it a place in the application. Three separate
 * governed actions now exist for three separate decisions — create, grant access, sign in — because
 * collapsing any two of them would let one approval imply another the operator never gave.
 *
 * The request carries a lane id and nothing else. Identity and slot come from the registry, the role
 * is this module's own constant, and the organization is resolved inside the trusted child from the
 * configured seeded staging organization (`DEV_QUEUE_ORG_ID`), falling back to derivation from
 * existing staging admins. Ambiguity is refused rather than resolved.
 */
import { redactAuthText } from "./browser-auth.mjs";
import { getDurableLane } from "./development-lane.mjs";
import { MANAGED_QA_IDENTITY } from "./qa-identity-provision-action.mjs";
import { resolveRestoreTarget } from "./qa-session-restore-action.mjs";
import { runQaAccessAssignSync } from "./qa-access-assign-runner.mjs";
import { assertManagedLaneEnvironment } from "./lane-worktree-lifecycle.mjs";

/** The only role this action may ever grant. Not a parameter — a constant. */
export const ASSIGNABLE_ROLE = "admin";

export const FORBIDDEN_ASSIGN_INPUTS = Object.freeze([
    "email", "identity", "expectedIdentity", "orgId", "org_id", "organizationId", "organization",
    "role", "roleKey", "supabaseUrl", "projectRef", "storagePath", "worktree", "port", "slot",
    "baseUrl", "token", "password", "serviceRoleKey", "accessToken",
]);

const FRAMEWORK_INJECTED_INPUTS = Object.freeze([
    "queryArtifactPath", "databaseTarget", "worktreePath", "worktree_path", "artifactRoot",
]);

export function validateAssignQaAccessInputs(rawInputs = {}) {
    const inputs = Object.fromEntries(
        Object.entries(rawInputs || {}).filter(([k]) => !FRAMEWORK_INJECTED_INPUTS.includes(k)),
    );
    const supplied = Object.keys(inputs);
    const offending = supplied.filter((k) => FORBIDDEN_ASSIGN_INPUTS.includes(k));
    if (offending.length) {
        return { ok: false, error: "caller_supplied_forbidden_input", detail: offending.join(", ") };
    }
    const laneId = inputs.laneId || inputs.lane_id || null;
    if (!laneId || !/^lane_[A-Za-z0-9]+$/.test(String(laneId))) return { ok: false, error: "lane_id_required" };
    const unknown = supplied.filter((k) => !["laneId", "lane_id"].includes(k));
    if (unknown.length) return { ok: false, error: "unexpected_input", detail: unknown.join(", ") };
    // MANAGED REGISTRATION IS A PRECONDITION, NOT A RUNTIME SURPRISE.
    //
    // This action resolves slot, port, worktree and QA identity from the
    // registries at EXECUTION time. Accepting it for a lane whose worktree is
    // unregistered creates a governed action that can never execute — an
    // operator card asking approval for something impossible.
    // gar_97d071ef22861f was exactly that: filed against Slot 1 after Slot 1's
    // registration had been archived by a capacity release.
    //
    // The refusal names the missing prerequisite, so the answer is "register
    // the worktree", not "denied".
    const managed = assertManagedLaneEnvironment(String(laneId));
    if (!managed.ok) {
        return { ok: false, error: managed.error, detail: managed.detail, lane_worktree: managed.resolution || null };
    }
    return { ok: true, normalized: { laneId: String(laneId) } };
}

/**
 * Execute an APPROVED assignment. Synchronous, because the governed path does not await.
 *
 * Without a grant authorizing exactly this action the trusted child is never spawned, so a pending
 * or denied request cannot write a membership row at all.
 */
export function executeAssignQaAccessSync({
    action,
    grant,
    grantCheck,
    nowMs = Date.now(),
    assign = runQaAccessAssignSync,
    getLane = getDurableLane,
} = {}) {
    if (!grant) return safeAssignFailure({ code: "grant_missing" });
    const authorized = grantCheck ? grantCheck(grant, action, { nowMs }) : { ok: true };
    if (!authorized.ok) return safeAssignFailure({ code: authorized.error || "grant_rejected" });

    const inputCheck = validateAssignQaAccessInputs(action?.inputs || {});
    if (!inputCheck.ok) return safeAssignFailure({ code: inputCheck.error, detail: inputCheck.detail });

    const resolved = resolveRestoreTarget(inputCheck.normalized.laneId, { getLane });
    if (!resolved.ok) return safeAssignFailure({ code: resolved.error, detail: resolved.detail });
    const validated = resolved.validated;

    if (!MANAGED_QA_IDENTITY.test(String(validated.expected_identity || ""))) {
        return safeAssignFailure({
            code: "identity_not_managed_qa_shape", lane: validated.lane_id, slot: validated.slot,
        });
    }

    const out = assign(validated, { role: ASSIGNABLE_ROLE });
    if (!out.ok) {
        return safeAssignFailure({
            code: out.error, detail: out.detail, lane: validated.lane_id, slot: validated.slot,
            identity: validated.expected_identity,
        });
    }
    return {
        ok: true,
        status: out.result === "already_exists" ? "already_exists" : "assigned",
        lane_id: validated.lane_id,
        slot: validated.slot,
        registered_identity: validated.expected_identity,
        user_id: out.user_id ?? null,
        org_id: out.org_id ?? null,
        role: ASSIGNABLE_ROLE,
        mutated: out.mutated === true,
        memberships_for_user: out.memberships_for_user ?? null,
        candidate_orgs_seen: out.candidate_orgs_seen ?? null,
        org_source: out.org_source ?? null,
        // Granting access is not signing in; this action can never assert a verified session.
        verified: false,
        assigned_at: new Date(nowMs).toISOString(),
        failure_code: null,
    };
}

/** The only failure shape. No field here can carry a credential. */
export function safeAssignFailure({ code, detail = null, lane = null, slot = null, identity = null }) {
    return {
        ok: false,
        status: "failed",
        lane_id: lane,
        slot,
        registered_identity: identity,
        user_id: null,
        org_id: null,
        role: null,
        mutated: false,
        verified: false,
        assigned_at: null,
        failure_code: String(code || "unknown").slice(0, 64),
        failure_detail: detail == null ? null : redactAuthText(String(detail)).slice(0, 160),
    };
}
