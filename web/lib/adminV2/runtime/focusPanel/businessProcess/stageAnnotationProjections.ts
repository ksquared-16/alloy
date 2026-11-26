/**
 * THE BOUNDED STAGE ANNOTATION CONTRACT — what a configured stage may say about itself.
 *
 * The approved rail lets every stage carry a little supporting truth beneath its label:
 *
 *     Lead            Tour                              Waitlist
 *     Aug 11          Aug 27 · 10:00 AM · North Campus  #4 · Toddler · Joined Aug 19
 *
 * Those are EXAMPLES of one process's configuration, not Enrollment fields to hardcode. The split
 * of ownership is the whole point of this module:
 *
 *   the PLATFORM owns the anatomy   — at most TWO slots per stage, and this fixed registry of
 *                                     projections, each reading canonical truth
 *   CONFIGURATION owns the choice   — which projection fills slot one and slot two, per stage
 *   the CARD owns nothing           — `ProcessCard` renders whatever arrives and branches on no
 *                                     domain at all
 *
 * The cap lives here rather than with configuration: configuration chooses WHICH canonical fact
 * fills a slot, never how many slots there are. A process that declares none renders none — an
 * unannotated stage is a normal, honest state, not a placeholder to fill.
 *
 * ── WHY A REGISTRY AND NOT FREE FIELD PATHS ──
 *
 * Letting configuration name arbitrary record paths would make every stored column an operator-
 * facing string, formatted by whoever wrote the config, with no way to know which are safe to
 * render or how to present a date. Each projection here is named, documented, reads canonical
 * truth, and formats it the platform's way. Adding a projection is a platform change; selecting
 * one is a configuration change.
 */

export type StageAnnotationProjectionKey =
    | "record_created_on"
    | "record_updated_on"
    | "scheduled_date"
    | "scheduled_time"
    | "scheduled_datetime"
    | "location_label"
    | "assigned_owner"
    | "source_label"
    | "value_amount"
    | "queue_position"
    | "program_label"
    | "expected_start_date"
    | "outcome_label";

type ProjectionInput = {
    record: Record<string, unknown>;
    /** Labels the record carries only as ids — resolved once by the caller, never re-fetched here. */
    labels: { locationLabel?: string | null; ownerLabel?: string | null };
};

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

/** A date the way an operator reads it. Null — never a placeholder — when there is no date. */
function dateLabel(v: unknown): string | null {
    const raw = t(v);
    if (!raw) return null;
    const d = new Date(raw.length <= 10 ? `${raw}T00:00:00` : raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function timeLabel(v: unknown): string | null {
    const raw = t(v);
    if (!raw) return null;
    // A stored window ("10:00-11:00" / "morning") is already operator-facing; pass it through.
    if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Metadata is where a process keeps its own operating facts; these keys are the canonical ones. */
function meta(record: Record<string, unknown>, key: string): unknown {
    const m = record.metadata;
    if (!m || typeof m !== "object" || Array.isArray(m)) return null;
    return (m as Record<string, unknown>)[key] ?? null;
}

export const STAGE_ANNOTATION_PROJECTIONS: Record<
    StageAnnotationProjectionKey,
    { label: string; resolve: (input: ProjectionInput) => string | null }
> = {
    record_created_on: {
        label: "When the record was created",
        resolve: ({ record }) => dateLabel(record.created_at),
    },
    record_updated_on: {
        label: "When the record last changed",
        resolve: ({ record }) => dateLabel(record.updated_at),
    },
    scheduled_date: {
        label: "The scheduled date",
        resolve: ({ record }) => dateLabel(record.job_date),
    },
    scheduled_time: {
        label: "The scheduled time",
        resolve: ({ record }) => timeLabel(record.job_time_window),
    },
    scheduled_datetime: {
        label: "The scheduled date and time",
        resolve: ({ record }) => {
            const d = dateLabel(record.job_date);
            const time = timeLabel(record.job_time_window);
            return [d, time].filter(Boolean).join(" · ") || null;
        },
    },
    location_label: {
        label: "Where it happens",
        resolve: ({ labels }) => t(labels.locationLabel) || null,
    },
    assigned_owner: {
        label: "Who owns it",
        resolve: ({ labels }) => t(labels.ownerLabel) || null,
    },
    source_label: {
        label: "Where the record came from",
        resolve: ({ record }) => t(record.source) || null,
    },
    value_amount: {
        label: "The record's monetary value",
        resolve: ({ record }) => {
            const cents = record.monetary_value_cents;
            if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
            return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
        },
    },
    queue_position: {
        label: "Position in a queue",
        resolve: ({ record }) => {
            const v = meta(record, "queue_position") ?? meta(record, "waitlist_position");
            const n = t(v);
            return n ? `#${n.replace(/^#/, "")}` : null;
        },
    },
    program_label: {
        label: "The program or offering",
        resolve: ({ record }) => t(meta(record, "program_label")) || null,
    },
    expected_start_date: {
        label: "When it is expected to start",
        resolve: ({ record }) => {
            const d = dateLabel(meta(record, "expected_start_date"));
            return d ? `Start ${d}` : null;
        },
    },
    outcome_label: {
        label: "How it ended",
        resolve: ({ record }) => t(record.lost_reason) || null,
    },
};

export function isStageAnnotationProjectionKey(v: unknown): v is StageAnnotationProjectionKey {
    return typeof v === "string" && v in STAGE_ANNOTATION_PROJECTIONS;
}

/**
 * Resolve a stage's configured slots into the two bounded strings the rail renders.
 *
 * A slot whose projection resolves to nothing yields nothing — the rail simply shows the stage.
 * That is why a slot is not a template string: an unresolvable projection must vanish, not print
 * a label with an empty value beside it.
 */
export function resolveStageAnnotations(
    slots: readonly string[] | undefined,
    input: ProjectionInput,
): string[] {
    if (!slots?.length) return [];
    return slots
        // TWO SLOTS, capped by the platform. Configuration cannot grow a third by authoring one.
        .slice(0, 2)
        .filter(isStageAnnotationProjectionKey)
        .map((key) => STAGE_ANNOTATION_PROJECTIONS[key].resolve(input))
        .filter((v): v is string => Boolean(v && v.trim()));
}
