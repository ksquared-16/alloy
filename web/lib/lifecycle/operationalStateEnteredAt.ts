/**
 * Canonical resolver for time-in-current-operational-state (stage membership entry).
 *
 * Precedence (stage-backed rows):
 * 1. Persisted stage_entered_at for the current stage membership
 * 2. Intake/creation timestamp only when the caller asserts never-transitioned
 * 3. Explicit unknown
 *
 * Never uses unrelated record updated_at / modification time.
 */

export type OperationalStateGrain = "case" | "child" | "candidate" | "participant";

export type OperationalStateEnteredAtSource =
    | "persisted_stage_entered_at"
    | "intake_created_at"
    | "unknown";

export type OperationalStateEnteredAtInput = {
    orgId: string;
    grain: OperationalStateGrain;
    subjectType: string;
    subjectId: string;
    /** Current authoritative stage key for this row subject. */
    currentStageKey: string | null | undefined;
    /** Persisted stage_entered_at from opportunities / process_instances. */
    persistedStageEnteredAt?: string | null;
    /**
     * Subject created_at — used ONLY when `neverTransitioned` is true and equals
     * true entry into the current stage (initial intake still in that stage).
     */
    intakeCreatedAt?: string | null;
    /**
     * Caller-proven: subject has never left the current stage (e.g. still in intake
     * stage and no transition history). Required for intake fallback.
     */
    neverTransitioned?: boolean;
};

export type OperationalStateEnteredAtResult = {
    enteredAtIso: string | null;
    source: OperationalStateEnteredAtSource;
    stageKey: string | null;
    grain: OperationalStateGrain;
    subjectType: string;
    subjectId: string;
    orgId: string;
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function parseIsoOrNull(raw: string | null): string | null {
    if (!raw) return null;
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Resolve when the subject entered its current operational stage / cohort membership.
 * Pure — no I/O. Org/grain/subject fields are carried for occurrence keys and auditing.
 */
export function resolveOperationalStateEnteredAt(
    input: OperationalStateEnteredAtInput,
): OperationalStateEnteredAtResult {
    const orgId = trimOrNull(input.orgId) ?? "";
    const subjectType = trimOrNull(input.subjectType) ?? "";
    const subjectId = trimOrNull(input.subjectId) ?? "";
    const stageKey = trimOrNull(input.currentStageKey);

    const base = {
        stageKey,
        grain: input.grain,
        subjectType,
        subjectId,
        orgId,
    };

    const persisted = parseIsoOrNull(trimOrNull(input.persistedStageEnteredAt));
    if (persisted) {
        return {
            ...base,
            enteredAtIso: persisted,
            source: "persisted_stage_entered_at",
        };
    }

    if (input.neverTransitioned === true && stageKey) {
        const intake = parseIsoOrNull(trimOrNull(input.intakeCreatedAt));
        if (intake) {
            return {
                ...base,
                enteredAtIso: intake,
                source: "intake_created_at",
            };
        }
    }

    return {
        ...base,
        enteredAtIso: null,
        source: "unknown",
    };
}

/**
 * Stable stage-membership occurrence key for personal seen/unseen scoping.
 * Includes entered_at so a return to the same stage_key is a new occurrence when the clock resets.
 */
export function buildStageMembershipOccurrenceKey(input: {
    orgId: string;
    userId: string;
    subjectType: string;
    subjectId: string;
    stageKey: string;
    stageEnteredAtIso: string;
}): string {
    return [
        trimOrNull(input.orgId) ?? "",
        trimOrNull(input.userId) ?? "",
        trimOrNull(input.subjectType) ?? "",
        trimOrNull(input.subjectId) ?? "",
        trimOrNull(input.stageKey) ?? "",
        parseIsoOrNull(trimOrNull(input.stageEnteredAtIso)) ?? "",
    ].join(":");
}

/** ISO now helper for stage-write patches. */
export function stageEnteredAtNowIso(now: Date = new Date()): string {
    return now.toISOString();
}
