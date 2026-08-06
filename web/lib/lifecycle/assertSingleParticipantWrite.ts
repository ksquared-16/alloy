/**
 * THE WRITE-COUNT CONTRACT for participant-scoped writes.
 *
 * `setEnrollmentInstanceStateByScope` and `moveEnrollmentInstanceStageByScope` target a child by
 * SCOPE — `(org_id, process_key, context_id, subject_id)` — and return how many rows they touched.
 * Every caller discarded that number, which made two different failures indistinguishable from
 * success:
 *
 *   moved = 0  the child has no enrollment process instance under this lead. The update matched
 *              nothing, PostgREST returned no error, and the operator was told the decision was
 *              recorded. Nothing was.
 *   moved > 1  the scope matched more than one instance. Something the platform believes is one
 *              child's journey is actually several rows, and the write went to all of them — the
 *              precise fan-out every guard on this path exists to prevent, arriving underneath
 *              them at the database.
 *
 * So the contract is exact: 1 succeeds, 0 fails, more than 1 is an integrity failure. `>1` is
 * separated from `0` because they demand different responses — a missing instance is a data gap
 * the operator can act on, duplicate instances are a corruption no retry will fix, and collapsing
 * them into one "failed" would lose that.
 *
 * This runs AFTER the write. It cannot prevent a multi-row update, only refuse to report it as
 * success and hand the caller something its compensation pass can unwind.
 */

export type ParticipantWriteCountFailure = {
    code: "participant_write_missing" | "participant_write_ambiguous";
    /** Operator-facing. Names no ids and no table. */
    message: string;
    /** Engineering detail — the actual count, for the trace. */
    moved: number;
};

export type ParticipantWriteCountResult =
    | { ok: true }
    | { ok: false; failure: ParticipantWriteCountFailure };

export function assertSingleParticipantWrite(input: {
    moved: number;
    /** What was being written, in operator language — e.g. "enrollment path", "stage". */
    operation: string;
    /** Operator-facing participant name. Never an id. */
    participantLabel?: string | null;
}): ParticipantWriteCountResult {
    const who = input.participantLabel?.trim() || "this child";
    const moved = Number.isFinite(input.moved) ? input.moved : -1;

    if (moved === 1) return { ok: true };

    if (moved <= 0) {
        return {
            ok: false,
            failure: {
                code: "participant_write_missing",
                message:
                    `Could not record the ${input.operation} for ${who} — no enrollment track was `
                    + `found for them on this lead.`,
                moved,
            },
        };
    }

    return {
        ok: false,
        failure: {
            code: "participant_write_ambiguous",
            message:
                `Could not record the ${input.operation} for ${who} — they have more than one `
                + `enrollment track on this lead, so the platform cannot tell which one you meant. `
                + `This needs to be corrected before enrollment decisions can be recorded.`,
            moved,
        },
    };
}
