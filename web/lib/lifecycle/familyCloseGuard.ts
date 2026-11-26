/**
 * Can this family case be closed yet?
 *
 * A family opportunity may carry several child enrollment tracks with different outcomes, and the
 * two are independent authorities: `opportunities.status_key` owns the case, each child's
 * `process_instances` row owns that child's enrollment. Closing the family is therefore not a
 * property of the family alone — it is a claim about every child riding on it.
 *
 * Today `update_family_case_status` writes the opportunity row and nothing else. No cascade, which
 * is correct, but also no guard: closing a family while a child is waitlisted or mid-enrollment
 * succeeds silently and strands that child under a closed case. This module is the guard.
 *
 * It decides ONLY. It reads nothing and writes nothing — the caller supplies the tracks, so this
 * cannot mutate a child, and a test can prove that by construction.
 */

import type { ProcessInstanceRow } from "@/lib/process/processInstances";

/**
 * What a child track means for a family close.
 *
 * Four categories, not two, because "not terminal" hides a decision that matters: a WAITLISTED
 * child may legitimately be ended by a governed family close after being named in a preview, but
 * an ENROLLED child may not. Ending an enrollment is an agreement-ending operation with its own
 * governed process; a Lead-close capability must never quietly convert it to `not_enrolling`.
 */
export type ChildTrackClassification =
    /** Already ended. Cannot block anything. */
    | "terminal"
    /** Live, pre-enrollment. Blocks a bare close; a governed family close may end it after preview. */
    | "active_pre_enrollment"
    /** Enrolled. Blocks a bare close, and a governed family close must NOT end it either. */
    | "enrolled_blocking"
    /** Unreadable or unrecognised. Blocks, because guessing is how the invariant gets broken. */
    | "unknown_blocking";

/** Terminal child enrollment states — the only two that end a track. */
const TERMINAL_STATES = new Set(["withdrawn", "not_enrolling"]);

/** Live pre-enrollment states. `null` belongs here: it is the canonical "in process" value. */
const ACTIVE_PRE_ENROLLMENT_STATES = new Set(["waitlisted", "enrolling"]);

/**
 * Classify one child's durable enrollment state.
 *
 * `null` is a real value in this vocabulary — a child riding the family track before any decision
 * has been recorded — so it classifies as live, not unknown. `undefined` is different: it means we
 * did not read the field, which is exactly the case that must not be guessed.
 */
export function classifyChildTrackState(state: string | null | undefined): ChildTrackClassification {
    if (state === null) return "active_pre_enrollment";
    if (typeof state !== "string") return "unknown_blocking";

    const key = state.trim();
    if (!key) return "active_pre_enrollment";
    if (TERMINAL_STATES.has(key)) return "terminal";
    if (ACTIVE_PRE_ENROLLMENT_STATES.has(key)) return "active_pre_enrollment";
    if (key === "enrolled") return "enrolled_blocking";

    // An unrecognised state is a vocabulary the platform has not been taught. Blocking is the only
    // honest answer: treating it as terminal would strand a child, treating it as active would be
    // a guess dressed as a fact.
    return "unknown_blocking";
}

export type BlockedChildTrack = {
    classification: Exclude<ChildTrackClassification, "terminal">;
    /** Identifies the child so a later preview can name them. Absent only if the row lacked it. */
    process_instance_id?: string;
    customer_member_id?: string;
    /** The raw state, so an unknown value can be reported rather than paraphrased. */
    state_key?: string | null;
};

export type FamilyCloseBlockedReasonCode =
    | "child_track_active_pre_enrollment"
    | "child_track_enrolled"
    | "child_track_state_unknown"
    | "child_track_enumeration_failed";

export type FamilyCloseBlockedReason = {
    code: FamilyCloseBlockedReasonCode;
    /** Every track that triggered this reason, so a preview can name all of them at once. */
    tracks: BlockedChildTrack[];
    /** Present only for `child_track_enumeration_failed`. */
    detail?: string;
};

export type FamilyCloseGuardDecision =
    | { allowed: true; child_track_count: number; terminal_track_count: number }
    | { allowed: false; reasons: FamilyCloseBlockedReason[] };

const REASON_FOR_CLASSIFICATION: Record<
    Exclude<ChildTrackClassification, "terminal">,
    FamilyCloseBlockedReasonCode
> = {
    active_pre_enrollment: "child_track_active_pre_enrollment",
    enrolled_blocking: "child_track_enrolled",
    unknown_blocking: "child_track_state_unknown",
};

function trackFromRow(
    row: Pick<ProcessInstanceRow, "id" | "subject_id" | "state">,
    classification: Exclude<ChildTrackClassification, "terminal">,
): BlockedChildTrack {
    return {
        classification,
        ...(row.id ? { process_instance_id: row.id } : {}),
        ...(row.subject_id ? { customer_member_id: row.subject_id } : {}),
        state_key: row.state ?? null,
    };
}

/**
 * Decide whether the family case may close, given every child track on it.
 *
 * Returns STRUCTURED reasons rather than a message: the operator-facing sentence belongs to the
 * command that previews the close ("Ending this lead would affect 2 children: …"), and this layer
 * should not decide how that reads. Reasons are grouped by cause so a preview can list every
 * affected child under one heading instead of repeating itself per child.
 */
export function evaluateFamilyCloseGuard(
    read:
        | { ok: true; rows: ReadonlyArray<Pick<ProcessInstanceRow, "id" | "subject_id" | "state">> }
        | { ok: false; error: string },
): FamilyCloseGuardDecision {
    // Enumeration failure blocks. A guard that cannot see the children cannot vouch for them.
    if (!read.ok) {
        return {
            allowed: false,
            reasons: [{ code: "child_track_enumeration_failed", tracks: [], detail: read.error }],
        };
    }

    const blocked = new Map<FamilyCloseBlockedReasonCode, BlockedChildTrack[]>();
    let terminalCount = 0;

    for (const row of read.rows) {
        const classification = classifyChildTrackState(row.state);
        if (classification === "terminal") {
            terminalCount += 1;
            continue;
        }
        const code = REASON_FOR_CLASSIFICATION[classification];
        const list = blocked.get(code) ?? [];
        list.push(trackFromRow(row, classification));
        blocked.set(code, list);
    }

    if (blocked.size === 0) {
        return {
            allowed: true,
            child_track_count: read.rows.length,
            terminal_track_count: terminalCount,
        };
    }

    // Stable order so a preview reads the same way every time: the hardest block first.
    const order: FamilyCloseBlockedReasonCode[] = [
        "child_track_enrolled",
        "child_track_state_unknown",
        "child_track_active_pre_enrollment",
    ];
    return {
        allowed: false,
        reasons: order
            .filter((code) => blocked.has(code))
            .map((code) => ({ code, tracks: blocked.get(code)! })),
    };
}

/** Compact diagnostic for logs and error strings. Never operator copy. */
export function describeFamilyCloseBlock(decision: FamilyCloseGuardDecision): string {
    if (decision.allowed) return "allowed";
    return decision.reasons
        .map((reason) =>
            reason.code === "child_track_enumeration_failed"
                ? `${reason.code}(${reason.detail ?? "unknown"})`
                : `${reason.code}(${reason.tracks.length})`,
        )
        .join("; ");
}
