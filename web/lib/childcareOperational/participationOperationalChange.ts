/**
 * THE ONE WAY EFFECTIVE-DATED PARTICIPATION TRUTH IS PERSISTED.
 *
 * `apply_participation_operational_change` owns exactly four things TypeScript cannot own across two
 * tables: atomic persistence, supersession linkage, truth-interval integrity, and concurrency/retry
 * protection. It owns nothing else — no eligibility, no authorization, no choice of room or pattern,
 * no events. Those stay in the canonical services, which call through here.
 *
 * WHY THIS MODULE EXISTS RATHER THAN A DIRECT `supabase.rpc` IN EACH SERVICE. Two callers of the same
 * primitive drift: one forgets the stale-row precondition, one invents its own idempotency key shape,
 * one maps `stale_placement` to a 500. This is the single gateway, so the mapping and the key
 * discipline exist once. Ordinary callers use the canonical Placement and Assignment services; those
 * services use this; nothing else calls the primitive.
 *
 * WHAT THIS DOES NOT DO: it does not emit domain events. The primitive commits, then the calling
 * service emits — in that order, so a rolled-back transaction cannot produce an event. See
 * `docs/platform/core/effective-dated-assignment-doctrine.md`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { OperationalEnrollmentServiceError } from "./operationalEnrollmentErrors";

const FN = "apply_participation_operational_change";

/**
 * Placement fields the caller may change.
 *
 * KEY PRESENCE IS THE INSTRUCTION. Including `roomLocationId: null` clears the room; omitting the key
 * leaves it as the prior row had it. `undefined` is treated as "omitted" and the key is not sent, so
 * the two are never confused — see migration 20261110120000, which exists because `COALESCE` could
 * not tell them apart and would have turned a documented clear into a silent retain.
 */
export type PlacementChangeFields = {
    /** The successor's effective start. Post-materialisation this IS operational truth-interval start. */
    startDate: string;
    programCategoryId?: string | null;
    roomLocationId?: string | null;
    reasonKey?: string | null;
    sourceKey?: string | null;
    metadata?: Record<string, unknown>;
};

/**
 * Assignment fields the caller may change.
 *
 * Deliberately narrower than the placement payload: room, site, program category, assignment type and
 * commitment kind are NOT accepted here, because no caller intent distinguishes them — the primitive
 * carries them forward from the prior row (migration 20261109120000). Adding them here would invent a
 * capability the operator surfaces cannot express.
 */
export type AssignmentChangeFields = {
    startDate: string;
    schedulePatternId?: string | null;
    sourceKey?: string | null;
    metadata?: Record<string, unknown>;
};

export type ParticipationOperationalChangeInput = {
    orgId: string;
    enrollmentAgreementId: string;
    /**
     * Retry protection. Two calls with the same key are ONE change: the second replays the first's
     * stored result instead of superseding the first's own successor and chaining a spurious row.
     * Callers derive this from the requested end state, so an operator double-submit is a replay.
     */
    idempotencyKey: string;
    /** Successor status is derived from this, never chosen by the caller. */
    todayYmd: string;
    actorUserId?: string | null;
    placement?: PlacementChangeFields;
    assignment?: AssignmentChangeFields;
    /** Optimistic preconditions: the row the caller believes is current. */
    expectedPlacementId?: string | null;
    expectedAssignmentId?: string | null;
};

export type SupersededRowResult = {
    priorId: string;
    priorEndDate: string | null;
    successorId: string;
    successorStatus: string;
    successorStart: string;
};

export type ParticipationOperationalChangeResult = {
    /** True when the idempotency key had already been used; no new rows were written. */
    replayed: boolean;
    placement: SupersededRowResult | null;
    assignment: SupersededRowResult | null;
};

function jsonPayload(
    fields: PlacementChangeFields | AssignmentChangeFields
): Record<string, unknown> {
    const out: Record<string, unknown> = { start_date: fields.startDate };
    // Only keys the caller actually named are sent. `undefined` means "not named".
    const put = (key: string, value: unknown) => {
        if (value !== undefined) out[key] = value;
    };
    if ("programCategoryId" in fields) put("program_category_id", fields.programCategoryId);
    if ("roomLocationId" in fields) put("room_location_id", fields.roomLocationId);
    if ("reasonKey" in fields) put("reason_key", (fields as PlacementChangeFields).reasonKey);
    if ("schedulePatternId" in fields) {
        put("schedule_pattern_id", (fields as AssignmentChangeFields).schedulePatternId);
    }
    put("source_key", fields.sourceKey);
    if (fields.metadata !== undefined) out.metadata = fields.metadata;
    return out;
}

function parseRow(value: unknown): SupersededRowResult | null {
    if (!value || typeof value !== "object") return null;
    const r = value as Record<string, unknown>;
    return {
        priorId: String(r.prior_id),
        priorEndDate: r.prior_end_date == null ? null : String(r.prior_end_date),
        successorId: String(r.successor_id),
        successorStatus: String(r.successor_status),
        successorStart: String(r.successor_start),
    };
}

/**
 * Maps the primitive's own refusals onto service error codes.
 *
 * These are `RAISE EXCEPTION` messages, so they arrive as Postgres `P0001`. Mapping them here keeps a
 * stale-write out of the 500 bucket: it is a conflict the caller can act on by re-reading and
 * retrying, which is a different instruction to the operator than "something broke".
 */
function translate(message: string): OperationalEnrollmentServiceError {
    const m = message || "persistence failed";
    if (m.includes("stale_placement") || m.includes("stale_assignment")) {
        return new OperationalEnrollmentServiceError(
            "conflict",
            "The record changed since it was read; re-read the current row and retry",
            { cause: m }
        );
    }
    if (m.includes("no_operational_placement") || m.includes("no_operational_assignment")) {
        return new OperationalEnrollmentServiceError("invalid_state", m);
    }
    if (
        m.includes("invalid_placement_start")
        || m.includes("invalid_assignment_start")
        || m.includes("placement_start_date_required")
        || m.includes("assignment_start_date_required")
        || m.includes("nothing_to_change")
        || m.includes("today_required")
    ) {
        return new OperationalEnrollmentServiceError("validation_failed", m);
    }
    return new OperationalEnrollmentServiceError("db_error", m);
}

export async function applyParticipationOperationalChange(
    supabase: SupabaseClient,
    input: ParticipationOperationalChangeInput
): Promise<ParticipationOperationalChangeResult> {
    if (!input.placement && !input.assignment) {
        throw new OperationalEnrollmentServiceError(
            "invalid_input",
            "nothing_to_change: supply placement, assignment, or both"
        );
    }
    if (!input.idempotencyKey?.trim()) {
        throw new OperationalEnrollmentServiceError(
            "invalid_input",
            "idempotencyKey is required; without it a retry chains a spurious successor"
        );
    }

    const { data, error } = await supabase.rpc(FN, {
        p_org_id: input.orgId,
        p_enrollment_agreement_id: input.enrollmentAgreementId,
        p_idempotency_key: input.idempotencyKey.trim(),
        p_today: input.todayYmd,
        p_actor: input.actorUserId ?? null,
        p_placement: input.placement ? jsonPayload(input.placement) : null,
        p_assignment: input.assignment ? jsonPayload(input.assignment) : null,
        p_expected_placement_id: input.expectedPlacementId ?? null,
        p_expected_assignment_id: input.expectedAssignmentId ?? null,
    });

    if (error) throw translate(error.message);

    const envelope = (data ?? {}) as Record<string, unknown>;
    const result = (envelope.result ?? {}) as Record<string, unknown>;
    return {
        replayed: envelope.replayed === true,
        placement: parseRow(result.placement),
        assignment: parseRow(result.assignment),
    };
}

/**
 * A retry key derived from the requested end state.
 *
 * The same operator intent submitted twice produces the same key and therefore one change. A
 * genuinely different change produces a different key. This is what makes the path retry-idempotent,
 * which `supersedeChildPlacement` was not: it would find its own successor and supersede THAT.
 */
export function deriveParticipationIdempotencyKey(parts: {
    scope: string;
    enrollmentAgreementId: string;
    values: Array<string | null | undefined>;
}): string {
    const tail = parts.values.map((v) => (v == null ? "~" : String(v))).join("|");
    return `${parts.scope}:${parts.enrollmentAgreementId}:${tail}`;
}
