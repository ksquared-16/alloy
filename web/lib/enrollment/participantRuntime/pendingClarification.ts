/**
 * An OUTSTANDING QUESTION about a value — durable, but never the value itself.
 *
 * ## The problem this solves without granting the browser authority
 *
 * The runtime read `8/8/20201`, doubted it, and asked "did you mean August 8, 2021?". When the
 * parent says "yes", something has to remember what "yes" refers to. Two wrong answers:
 *
 *   - persist the suspicious value into `shared_values` and fix it later — the thing this whole
 *     tranche exists to prevent, because a document renders from `shared_values`;
 *   - send the pending value to the browser and let it echo back on confirm — that hands a client
 *     the ability to name the value being written, which is precisely the boundary Gate 0 holds.
 *
 * So the pending value lives in session METADATA, beside the D-99 confirmations and in the same
 * shape of place: evidence about the conversation, not an answer of record. `shared_values` stays
 * untouched, so every document, every prefill and every mapped destination is unaffected while the
 * question is open. The browser only ever says "yes"; the server re-derives what yes meant.
 *
 * ## Bounded to the current need
 *
 * At most one pending clarification per need key, and answering any turn for that need clears it.
 * A clarification cannot outlive the question that raised it or leak into a different fact.
 *
 * Pure. The clock is injected.
 */

export const PENDING_CLARIFICATION_METADATA_KEY = "enrollment_pending_clarification_v1" as const;

export type PendingClarification = {
    /** What the runtime would write if the parent says yes. Never sent to the browser. */
    readonly value: unknown;
    /** The question actually asked, so a resumed session asks the same thing. */
    readonly question: string;
    readonly asked_at: string;
};

type MetadataRecord = Record<string, unknown>;

function root(metadata: unknown): Record<string, PendingClarification> {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return {};
    const raw = (metadata as MetadataRecord)[PENDING_CLARIFICATION_METADATA_KEY];
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as Record<string, PendingClarification>;
}

/** The outstanding question for one need, or null. */
export function readPendingClarification(
    metadata: unknown,
    needKey: string | null | undefined,
): PendingClarification | null {
    const key = (needKey ?? "").trim();
    if (!key) return null;
    const entry = root(metadata)[key];
    if (!entry || typeof entry !== "object") return null;
    if (!("value" in entry) || typeof entry.question !== "string") return null;
    return entry;
}

/** Record a question against a need. Returns the FULL metadata to write. */
export function withPendingClarification(input: {
    readonly metadata: unknown;
    readonly needKey: string;
    readonly value: unknown;
    readonly question: string;
    readonly askedAtIso: string;
}): MetadataRecord {
    const base = (input.metadata ?? {}) as MetadataRecord;
    return {
        ...base,
        [PENDING_CLARIFICATION_METADATA_KEY]: {
            ...root(input.metadata),
            [input.needKey]: {
                value: input.value,
                question: input.question,
                asked_at: input.askedAtIso,
            },
        },
    };
}

/**
 * Clear the question for one need. Returns the FULL metadata to write.
 *
 * Called on every resolution — accepted, rejected, or answered some other way. A stale pending
 * clarification would re-ask a question the parent has already moved past.
 */
export function withoutPendingClarification(metadata: unknown, needKey: string): MetadataRecord {
    const base = (metadata ?? {}) as MetadataRecord;
    const current = root(metadata);
    if (!(needKey in current)) return base;
    const next = { ...current };
    delete next[needKey];
    return { ...base, [PENDING_CLARIFICATION_METADATA_KEY]: next };
}
