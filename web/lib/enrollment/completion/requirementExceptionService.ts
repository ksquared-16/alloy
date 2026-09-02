/**
 * The write seam for governed requirement exceptions, and the read the runtime consults.
 *
 * ## Authorization happens HERE, once
 *
 * Every caller — the registered actions, any future surface, a completion preflight — passes the
 * actor's real grants and this refuses without `enrollment.requirement_exception.manage`. The check
 * is not repeated in the adapters, because a second copy is a second thing to keep in agreement,
 * and the first time they disagree the laxer one is the one guarding the write.
 *
 * ## Idempotent because the DATABASE says so
 *
 * `uq_enrollment_requirement_exception_active` permits one active exception per
 * (org, participation, stage, requirement). A retry that races another writer loses the insert with
 * a unique violation, and this reads the winner back and reports it rather than failing — so "apply
 * this exception" is safe to repeat whatever the caller believes it already wrote.
 *
 * ## Nothing here touches the requirement
 *
 * No Form submission is written, no requirement definition is edited, no status is changed. The
 * only effect of an exception is that shared sufficiency stops counting that one requirement as
 * blocking, and reports it as `excepted` with the reason and the approver attached.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { RequirementExceptionRef } from "@/lib/enrollment/completion/enrollmentCompletionSufficiency";
import {
    activeRequirementExceptionsByRequirementId,
    evaluateRequirementExceptionAuthority,
    validateRequirementExceptionRequest,
    type RequirementExceptionIdentity,
    type RequirementExceptionRecord,
    type RequirementExceptionRefusal,
} from "@/lib/enrollment/completion/requirementException";

const TABLE = "enrollment_requirement_exceptions" as const;

const SELECT_COLUMNS =
    "id, org_id, enrollment_participation_id, stage_key, requirement_id, disposition, reason, state, approved_by, approved_at, revoked_by, revoked_at, revoke_reason";

/** Postgres unique-violation. A concurrent writer got there first; that is not a failure. */
const UNIQUE_VIOLATION = "23505";

export type RequirementExceptionOutcome =
    | { readonly ok: true; readonly record: RequirementExceptionRecord; readonly changed: boolean }
    | { readonly ok: false; readonly refusal: RequirementExceptionRefusal | { readonly code: string; readonly detail: string } };

export type RequirementExceptionActor = {
    /** The caller's resolved grants. `null` means the grant read FAILED — deny. */
    readonly permissionKeys: readonly string[] | null;
    readonly userId: string | null;
};

async function readActive(
    supabase: SupabaseClient,
    identity: RequirementExceptionIdentity,
): Promise<{ ok: true; record: RequirementExceptionRecord | null } | { ok: false; detail: string }> {
    const { data, error } = await supabase
        .from(TABLE)
        .select(SELECT_COLUMNS)
        .eq("org_id", identity.orgId)
        .eq("enrollment_participation_id", identity.participationId)
        .eq("stage_key", identity.stageKey)
        .eq("requirement_id", identity.requirementId)
        .eq("state", "active")
        .maybeSingle();
    if (error) return { ok: false, detail: error.message };
    return { ok: true, record: (data as RequirementExceptionRecord | null) ?? null };
}

/**
 * Record that one requirement is excepted for one child.
 *
 * Returns `changed: false` when an active exception already stood — the retry answer, not an error.
 */
export async function grantRequirementException(
    supabase: SupabaseClient,
    input: {
        readonly actor: RequirementExceptionActor;
        readonly identity: RequirementExceptionIdentity;
        readonly reason: string;
    },
): Promise<RequirementExceptionOutcome> {
    const authority = evaluateRequirementExceptionAuthority(input.actor);
    if (!authority.allowed) return { ok: false, refusal: authority.refusal };

    const valid = validateRequirementExceptionRequest({
        identity: input.identity,
        reason: input.reason,
        actorUserId: input.actor.userId,
    });
    if (!valid.ok) return { ok: false, refusal: valid.refusal };

    const existing = await readActive(supabase, input.identity);
    if (!existing.ok) return { ok: false, refusal: { code: "exception_read_failed", detail: existing.detail } };
    if (existing.record) return { ok: true, record: existing.record, changed: false };

    const { data, error } = await supabase
        .from(TABLE)
        .insert({
            org_id: input.identity.orgId,
            enrollment_participation_id: input.identity.participationId,
            stage_key: input.identity.stageKey,
            requirement_id: input.identity.requirementId,
            disposition: "excepted",
            reason: input.reason.trim(),
            state: "active",
            approved_by: input.actor.userId,
            created_by: input.actor.userId,
        })
        .select(SELECT_COLUMNS)
        .maybeSingle();

    if (error) {
        // Lost the race, not a failure: read the winner back and report it as the standing decision.
        if (error.code === UNIQUE_VIOLATION) {
            const raced = await readActive(supabase, input.identity);
            if (raced.ok && raced.record) return { ok: true, record: raced.record, changed: false };
        }
        return { ok: false, refusal: { code: "exception_write_failed", detail: error.message } };
    }
    if (!data) return { ok: false, refusal: { code: "exception_write_failed", detail: "The exception was not recorded." } };
    return { ok: true, record: data as RequirementExceptionRecord, changed: true };
}

/**
 * Withdraw the decision. The requirement blocks again from this moment if it is still outstanding —
 * revocation restores the original state rather than asserting a new one.
 */
export async function revokeRequirementException(
    supabase: SupabaseClient,
    input: {
        readonly actor: RequirementExceptionActor;
        readonly identity: RequirementExceptionIdentity;
        readonly reason?: string | null;
    },
): Promise<
    | { readonly ok: true; readonly record: RequirementExceptionRecord | null; readonly changed: boolean }
    | { readonly ok: false; readonly refusal: RequirementExceptionRefusal | { readonly code: string; readonly detail: string } }
> {
    const authority = evaluateRequirementExceptionAuthority(input.actor);
    if (!authority.allowed) return { ok: false, refusal: authority.refusal };

    // Revocation states no new reason, so `reason` is not required — but the actor still is: a
    // revocation with no author is the same defect as an exception with no author.
    const valid = validateRequirementExceptionRequest({
        identity: input.identity,
        reason: "revocation",
        actorUserId: input.actor.userId,
    });
    if (!valid.ok) return { ok: false, refusal: valid.refusal };

    const existing = await readActive(supabase, input.identity);
    if (!existing.ok) return { ok: false, refusal: { code: "exception_read_failed", detail: existing.detail } };
    // Nothing active to withdraw. Idempotent: a repeat revoke is a no-op, not a refusal.
    if (!existing.record) return { ok: true, record: null, changed: false };

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
        .from(TABLE)
        .update({
            state: "revoked",
            revoked_by: input.actor.userId,
            revoked_at: nowIso,
            revoke_reason: (input.reason ?? "").trim() || null,
            updated_at: nowIso,
        })
        .eq("id", existing.record.id)
        .eq("org_id", input.identity.orgId)
        // Only an ACTIVE row may be revoked, so two concurrent revocations cannot both claim it.
        .eq("state", "active")
        .select(SELECT_COLUMNS)
        .maybeSingle();

    if (error) return { ok: false, refusal: { code: "exception_write_failed", detail: error.message } };
    if (!data) return { ok: true, record: null, changed: false };
    return { ok: true, record: data as RequirementExceptionRecord, changed: true };
}

/**
 * The active exceptions for one enrolment at one stage, in the shape sufficiency consumes.
 *
 * A failed read returns `{}` — no exception is applied — so a database problem can only ever make
 * completion HARDER, never let a blocking requirement through.
 */
export async function loadActiveRequirementExceptions(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly participationId: string | null;
        readonly stageKey: string | null;
    },
): Promise<Record<string, RequirementExceptionRef>> {
    const participationId = (input.participationId ?? "").trim();
    const stageKey = (input.stageKey ?? "").trim();
    if (!input.orgId || !participationId || !stageKey) return {};

    const { data, error } = await supabase
        .from(TABLE)
        .select(SELECT_COLUMNS)
        .eq("org_id", input.orgId)
        .eq("enrollment_participation_id", participationId)
        .eq("stage_key", stageKey)
        .eq("state", "active");
    if (error) return {};
    return activeRequirementExceptionsByRequirementId((data ?? []) as RequirementExceptionRecord[], stageKey);
}
