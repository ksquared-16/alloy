/**
 * `environment.restore_qa_session` — resolution, guarding and execution.
 *
 * The request a worker may make is deliberately the smallest one expressible: a lane id. Every other
 * dimension — slot, worktree, port, base URL, Supabase project, storage path and the QA identity
 * itself — is resolved HERE from the canonical registries. A caller cannot name an email, a URL or a
 * storage path, so there is no input to smuggle a different target through; refusing such fields
 * would still leave the shape suggesting they were negotiable, and they are not.
 *
 * Approval is not a parameter. `authorizeQaBootstrap` still takes `operatorApproved`, but the only
 * caller that may set it is this executor, and it sets it from an operator GRANT that the governed
 * action layer issued — never from a CLI flag, an environment variable or an agent's assertion.
 */
import {
    laneSlot,
    qaIdentityForSlot,
    redactAuthText,
    slotAuthStoragePath,
    validateBrowserAuthRequest,
    verifyBrowserAuth,
} from "./browser-auth.mjs";
import { getDurableLane } from "./development-lane.mjs";
import { authorizeQaBootstrap, consumeQaBootstrap, openQaBootstrap } from "./qa-session-bootstrap.mjs";
import { runQaSessionMint } from "./qa-session-mint-runner.mjs";

/** Inputs a caller may never supply. Present so the refusal is explicit rather than implied. */
export const FORBIDDEN_RESTORE_INPUTS = Object.freeze([
    "email", "identity", "expectedIdentity", "supabaseUrl", "supabaseProject", "projectRef",
    "serviceUrl", "redirectUrl", "redirectTo", "storagePath", "storage", "worktreePath",
    "worktree", "port", "slot", "baseUrl", "token", "password", "serviceRoleKey", "accessToken",
]);

/**
 * Validate the request shape. Only `laneId` is accepted; anything else is refused by name so a
 * caller learns the boundary rather than silently having a field ignored.
 */
export function validateRestoreQaSessionInputs(inputs = {}) {
    const supplied = Object.keys(inputs || {});
    const offending = supplied.filter((k) => FORBIDDEN_RESTORE_INPUTS.includes(k));
    if (offending.length) {
        return { ok: false, error: "caller_supplied_forbidden_input", detail: offending.join(", ") };
    }
    const laneId = inputs.laneId || inputs.lane_id || null;
    if (!laneId || !/^lane_[A-Za-z0-9]+$/.test(String(laneId))) {
        return { ok: false, error: "lane_id_required" };
    }
    const unknown = supplied.filter((k) => !["laneId", "lane_id", "registrationToken", "registration_token"].includes(k));
    if (unknown.length) {
        return { ok: false, error: "unexpected_input", detail: unknown.join(", ") };
    }
    return { ok: true, normalized: { laneId: String(laneId) } };
}

/**
 * Resolve every privileged dimension from the registries. Nothing here reads caller input beyond
 * the lane id, so a disagreement between lane, slot, worktree or port fails rather than picking one.
 */
export function resolveRestoreTarget(laneId, { getLane = getDurableLane } = {}) {
    const lane = getLane(laneId);
    if (!lane?.lane_id) return { ok: false, error: "unregistered_lane" };
    const slot = laneSlot(lane);
    if (!Number.isInteger(Number(slot))) return { ok: false, error: "lane_has_no_managed_slot" };
    const identity = qaIdentityForSlot(Number(slot));
    if (!identity) return { ok: false, error: "no_registered_qa_identity" };
    const validated = validateBrowserAuthRequest({ lane, slot, expectedIdentity: identity });
    if (!validated.ok) return { ok: false, error: validated.error, detail: validated.detail || null };
    return { ok: true, validated };
}

/**
 * Execute an APPROVED restore.
 *
 * `grant` is the operator's decision. Without one that authorizes exactly this action, nothing
 * privileged runs — the mint child is not spawned, so a denied or pending request cannot reach
 * Supabase at all. `restored` is still decided by the fresh-context verification, never by the mint.
 */
export async function executeRestoreQaSession({
    action,
    grant,
    grantCheck,
    nowMs = Date.now(),
    mint = runQaSessionMint,
    verify = verifyBrowserAuth,
    getLane = getDurableLane,
} = {}) {
    if (!grant) return safeFailure({ code: "grant_missing" });
    const authorized = grantCheck ? grantCheck(grant, action, { nowMs }) : { ok: true };
    if (!authorized.ok) return safeFailure({ code: authorized.error || "grant_rejected" });

    const inputCheck = validateRestoreQaSessionInputs(action?.inputs || {});
    if (!inputCheck.ok) return safeFailure({ code: inputCheck.error, detail: inputCheck.detail });

    const resolved = resolveRestoreTarget(inputCheck.normalized.laneId, { getLane });
    if (!resolved.ok) return safeFailure({ code: resolved.error, detail: resolved.detail });
    const validated = resolved.validated;

    // Operator approval is carried from the grant. This is the ONLY place it may be true.
    const allowed = authorizeQaBootstrap({
        validated,
        requestedIdentity: null,
        operatorApproved: true,
        repositoryProfile: "alloy",
        nowMs,
    });
    if (!allowed.ok) return safeFailure({ code: allowed.error, lane: validated.lane_id, slot: validated.slot });

    openQaBootstrap({ slot: validated.slot, nowMs });
    const minted = await mint(validated, { storagePath: slotAuthStoragePath(validated.slot) });
    const consumed = consumeQaBootstrap({ slot: validated.slot, nowMs });
    if (!minted.ok || !consumed.ok) {
        return safeFailure({
            code: minted.ok ? consumed.error : minted.error,
            lane: validated.lane_id,
            slot: validated.slot,
            identity: validated.expected_identity,
            storageWritten: false,
        });
    }

    const verified = await verify(validated);
    return {
        ok: verified.ok === true,
        status: verified.ok === true ? "restored" : "verification_failed",
        lane_id: validated.lane_id,
        slot: validated.slot,
        registered_identity: validated.expected_identity,
        storage_written: true,
        verified: verified.ok === true,
        verified_at: verified.ok === true ? new Date(nowMs).toISOString() : null,
        failure_code: verified.ok === true ? null : "verification_failed",
    };
}

/**
 * The only result shape this action may return.
 *
 * Allow-listed by construction: there is no field a token, cookie, link or child error could occupy,
 * so a future edit cannot leak one by forgetting to redact. A restore returns a RESTORE result —
 * never an unrelated census-shaped envelope, which is what made an earlier failure unreadable.
 */
export function safeFailure({ code, detail = null, lane = null, slot = null, identity = null, storageWritten = false }) {
    return {
        ok: false,
        status: "failed",
        lane_id: lane,
        slot,
        registered_identity: identity,
        storage_written: storageWritten,
        verified: false,
        verified_at: null,
        // A code, never a message: child text could carry anything.
        failure_code: String(code || "unknown").slice(0, 64),
        /*
         * Redact BEFORE truncating. Truncation alone is not a defence: a child error beginning
         * "access_token=eyJ..." stays a usable token in its first 120 characters. Caught by the
         * control below rather than by review, which is why the control asserts on the value and
         * not merely on the field name.
         */
        failure_detail: detail == null ? null : redactAuthText(String(detail)).slice(0, 120),
    };
}
