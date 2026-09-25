/**
 * REGION B — WHERE THE 500ms BETWEEN CANONICAL TRUTH AND A CLEARED CARD ACTUALLY GOES.
 *
 * Correlated measurement on deployed 5038bef4 put canonical `_inquiry_children` at P50 783ms and the
 * cards clearing at P50 1,677ms. Server emission is not the owner — truth-ready to emitted is 3ms —
 * so the remainder is somewhere between the server writing the line and the card rendering, and
 * nothing currently marks any of it.
 *
 * A fresh-connection curl probe suggested ~952ms of that was transport. It was discarded: it opens a
 * new TLS connection per sample, and the same carrier line reaches the mounted panel in-page at P50
 * 90–141ms against curl's 1,342ms. So the in-page stream path was never actually measured, and the
 * marks below are the first ones on it.
 *
 * ── WHAT THIS RECORDS, AND WHAT IT REFUSES TO ──
 *
 * Monotonic `performance.now()` offsets, a bounded outcome enum, and the subject id that scopes
 * them. No roster, no names, no counts of anything but marks. The subject id is already the key the
 * carrier store and the panel use; nothing new about a person crosses this boundary.
 *
 * Diagnostics only — nothing here decides what renders, and every writer is wrapped so a diagnostic
 * can never take down the path it is observing. This programme has shipped three probes that ran
 * green while observing nothing, so the reader is expected to assert `observed` before trusting a
 * number: a MISSING mark is missing, never zero.
 */

export type TruthPatchMergeOutcome =
    | "APPLIED"
    | "NO_CHANGE"
    | "REFUSED_SUBJECT"
    | "REFUSED_SHAPE";

type SubjectMarks = {
    subject_id: string;
    /** In-page stream reader recognized the truth-patch phase. */
    arrived_at?: number;
    /** JSON already parsed by the reader; identity validation finished. */
    validated_at?: number;
    /** The canonical merge ran, and what it decided. */
    merge_at?: number;
    merge_outcome?: TruthPatchMergeOutcome;
    /** First mounted Focus snapshot whose truth bag CONTAINS the roster key. Presence only. */
    focus_truth_at?: number;
};

type Diag = {
    /** Positive control: a reader must be able to prove the probe saw each kind of event. */
    observed: { arrivals: number; merges: number; focusTransitions: number };
    subjects: Record<string, SubjectMarks>;
};

const KEY = "__ALLOY_TRUTH_PATCH_DIAG__";

function diag(): Diag | null {
    if (typeof window === "undefined") return null;
    const w = window as unknown as Record<string, unknown>;
    let d = w[KEY] as Diag | undefined;
    if (!d) {
        d = { observed: { arrivals: 0, merges: 0, focusTransitions: 0 }, subjects: {} };
        w[KEY] = d;
    }
    return d;
}

function marksFor(d: Diag, subjectId: string): SubjectMarks {
    const existing = d.subjects[subjectId];
    if (existing) return existing;
    const created: SubjectMarks = { subject_id: subjectId };
    d.subjects[subjectId] = created;
    return created;
}

const now = (): number => (typeof performance !== "undefined" ? Math.round(performance.now()) : 0);

/** B1 — the earliest point the existing stream reader recognizes the phase, before any parse work. */
export function markTruthPatchArrived(subjectId: string | null | undefined): void {
    try {
        const d = diag();
        const id = subjectId?.trim();
        if (!d || !id) return;
        const m = marksFor(d, id);
        if (m.arrived_at == null) {
            m.arrived_at = now();
            d.observed.arrivals += 1;
        }
    } catch { /* a diagnostic must never break the stream it observes */ }
}

/** B2/B3 — parsed and identity-validated. Expected to be sub-millisecond; recorded so that is a measurement rather than an assumption. */
export function markTruthPatchValidated(subjectId: string | null | undefined): void {
    try {
        const d = diag();
        const id = subjectId?.trim();
        if (!d || !id) return;
        const m = marksFor(d, id);
        if (m.validated_at == null) m.validated_at = now();
    } catch { /* ignore */ }
}

/** B4/B5 — the canonical merge ran. The outcome is a bounded enum, never a value. */
export function markTruthPatchMerged(
    subjectId: string | null | undefined,
    outcome: TruthPatchMergeOutcome,
): void {
    try {
        const d = diag();
        const id = subjectId?.trim();
        if (!d || !id) return;
        const m = marksFor(d, id);
        if (m.merge_at == null) {
            m.merge_at = now();
            m.merge_outcome = outcome;
            d.observed.merges += 1;
        }
    } catch { /* ignore */ }
}

/** B6 — the first mounted Focus truth bag that CONTAINS the roster key. Presence only, never contents. */
export function markFocusTruthHasRoster(subjectId: string | null | undefined): void {
    try {
        const d = diag();
        const id = subjectId?.trim();
        if (!d || !id) return;
        const m = marksFor(d, id);
        if (m.focus_truth_at == null) {
            m.focus_truth_at = now();
            d.observed.focusTransitions += 1;
        }
    } catch { /* ignore */ }
}
