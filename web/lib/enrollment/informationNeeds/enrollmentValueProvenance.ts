/**
 * WHERE a settled value came from — the distinction the runtime could not previously make.
 *
 * ## The modeling error this closes
 *
 * Settled history was projected from `state === "confirmed"`, and that read as "the parent confirmed
 * this". It does not. The runtime deliberately records a D-99 confirmation when a participant
 * SUPPLIES a value too, because without that evidence the corrected fact recomputes straight back to
 * `known_requires_confirmation` and the conversation asks about the value they typed three seconds
 * earlier. So `confirmed` means EVIDENCED, not "confirmed pre-existing truth".
 *
 * The consequence was a card headed "Your family's details · Confirmed" containing employers,
 * emergency contacts, custody arrangements, a physician, developmental history, toileting, sleep,
 * fears, previous schools and a material fee — every household-scoped question the parent had just
 * answered, presented back to them as information they had verified. Thirty-one of them behind a
 * "Show 31 more".
 *
 * ## The primitive
 *
 * Two lifecycle states were being conflated, so the fix is to record which one actually occurred, at
 * the moment it occurs:
 *
 * ```
 *   the value existed as usable truth BEFORE this ask, and the parent agreed  ->  confirmed_prior_truth
 *   the value did not exist, and the parent supplied it in this session       ->  collected_in_session
 *   the value came from an attachment                                         ->  uploaded_evidence
 *   the platform wrote it                                                     ->  derived
 * ```
 *
 * The deciding input is the need's DETERMINISTIC STATE at the instant the turn was answered —
 * `known_requires_confirmation` means the platform already held a usable value and was asking the
 * parent to verify it; `missing` means it did not. Nothing here reads a label, a field id, an
 * artifact name or a section heading, which is what makes the next imported packet inherit this
 * behaviour with no code change.
 *
 * ## Where it lives, and why not a new table
 *
 * `form_packet_sessions.metadata`, beside the D-99 confirmations and the declines, for exactly the
 * reasons that store gives: it is the session's extensibility owner, it is `NOT NULL DEFAULT '{}'`,
 * and this is a fact about the INTERACTION rather than about the family. No migration, no new
 * authority, and it cannot leak into `shared_values` where every entry is treated as scalar prefill.
 *
 * ## Absence fails CLOSED
 *
 * A need with no recorded provenance is NOT eligible for a confirmation card. A session that ran
 * before this existed therefore shows no confirmation history rather than a wrong one, and any
 * future write path that forgets to record provenance loses a card instead of gaining a false claim.
 */

/** Namespaced so it can never collide with another session concern. */
export const ENROLLMENT_PROVENANCE_METADATA_KEY = "enrollment_value_provenance_v1" as const;

/**
 * How a settled value came to be.
 *
 * Deliberately about the VALUE's origin, not about the interaction's shape: "the parent tapped Yes"
 * is not a lifecycle state, but "this was already true and they verified it" is.
 */
export const ENROLLMENT_VALUE_ORIGINS = [
    /** Existed as usable truth before this ask; the participant verified it. */
    "confirmed_prior_truth",
    /** Did not exist; the participant supplied it during this session. */
    "collected_in_session",
    /** Came from a document the participant attached. */
    "uploaded_evidence",
    /** Written by the platform — a clock, an execution date, a computed default. */
    "derived",
] as const;

export type EnrollmentValueOrigin = (typeof ENROLLMENT_VALUE_ORIGINS)[number];

export type EnrollmentValueProvenance = {
    readonly origin: EnrollmentValueOrigin;
    readonly recorded_at: string;
};

export type EnrollmentValueProvenanceMap = Readonly<Record<string, EnrollmentValueProvenance>>;

/** Read the provenance map out of a session's `metadata`. Absent or malformed reads as empty. */
export function readEnrollmentValueProvenance(metadata: unknown): EnrollmentValueProvenanceMap {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return {};
    const root = (metadata as Record<string, unknown>)[ENROLLMENT_PROVENANCE_METADATA_KEY];
    if (root == null || typeof root !== "object" || Array.isArray(root)) return {};

    const out: Record<string, EnrollmentValueProvenance> = {};
    for (const [needKey, raw] of Object.entries(root as Record<string, unknown>)) {
        if (raw == null || typeof raw !== "object" || Array.isArray(raw)) continue;
        const row = raw as Record<string, unknown>;
        const origin = typeof row.origin === "string" ? row.origin.trim() : "";
        const recordedAt = typeof row.recorded_at === "string" ? row.recorded_at.trim() : "";
        // An unreadable entry is dropped, which fails closed: the fact simply has no provenance and
        // therefore cannot claim to be a confirmation.
        if (!(ENROLLMENT_VALUE_ORIGINS as readonly string[]).includes(origin) || !recordedAt) continue;
        out[needKey] = { origin: origin as EnrollmentValueOrigin, recorded_at: recordedAt };
    }
    return out;
}

/**
 * The origin a turn's outcome establishes, from the need's state when it was ASKED.
 *
 * This is the whole classification, and it is two lines because the deterministic runtime had
 * already computed the distinction — it simply threw it away after using it to choose the turn.
 */
export function originForSettledTurn(needState: string): EnrollmentValueOrigin {
    return needState === "known_requires_confirmation" ? "confirmed_prior_truth" : "collected_in_session";
}

/**
 * The metadata patch recording one value's provenance.
 *
 * Returns the WHOLE metadata object, so the caller writes it back through the ordinary session
 * update and no other key is disturbed — the same contract the confirmation and decline patches use.
 *
 * ## A correction does not change where a fact came from
 *
 * `preserveExisting` is how an edit keeps its origin. A parent fixing a birthday the school already
 * held is still dealing with pre-existing truth; the value moved, its lifecycle did not. Without
 * this, editing a confirmed fact would silently reclassify it as collected and drop it out of the
 * confirmation card it belongs to.
 */
export function buildEnrollmentValueProvenancePatch(input: {
    readonly metadata: unknown;
    readonly needKey: string;
    readonly origin: EnrollmentValueOrigin;
    readonly recordedAtIso: string;
    /** Keep an origin already on file rather than overwriting it. Used by every edit path. */
    readonly preserveExisting?: boolean;
}): Record<string, unknown> {
    const base =
        input.metadata != null && typeof input.metadata === "object" && !Array.isArray(input.metadata)
            ? { ...(input.metadata as Record<string, unknown>) }
            : {};

    const existing = readEnrollmentValueProvenance(base);
    const held = existing[input.needKey];
    if (held && input.preserveExisting) return base;

    return {
        ...base,
        [ENROLLMENT_PROVENANCE_METADATA_KEY]: {
            ...existing,
            [input.needKey]: { origin: input.origin, recorded_at: input.recordedAtIso },
        },
    };
}

/**
 * May this settled fact appear in a CONFIRMATION group?
 *
 * Only pre-existing truth the participant actually verified. Everything else — an answer given in
 * this session, an attachment, a value the platform wrote — is not a confirmation, however it is
 * evidenced, and presenting it as one tells the parent they checked something they never saw.
 */
export function isConfirmationOfPriorTruth(
    provenance: EnrollmentValueProvenance | undefined,
): boolean {
    return provenance?.origin === "confirmed_prior_truth";
}
