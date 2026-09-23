/**
 * The external contract for submitting attendance facts.
 *
 * ── WHAT THIS IS, AND IS NOT ──
 *
 * A translation layer, and deliberately nothing more. Alloy already owns a complete external
 * attendance ingestion path — producer authority, resource mapping, an evidence inbox, replay
 * identity, provenance, corrections and reversals — and this module's whole job is to turn one HTTP
 * request into calls on that authority and one set of outcomes back. It validates SHAPE and it
 * translates VOCABULARY. It decides nothing about who may write what, because the authority it
 * calls already does, and a second opinion is how two answers to one question begin.
 *
 * ── THE OUTCOME VOCABULARY IS MEASURED, NOT INVENTED ──
 *
 * The ingestion function answers with five dispositions — applied, duplicate, conflicted, unmapped,
 * rejected — and each one is a different thing for a partner to do next. They are mapped to public
 * names that say what happened rather than what Alloy calls it. `pending_mapping` is the one worth
 * naming carefully: the event is durably recorded and simply cannot be attributed yet, so it is not
 * a failure to retry blindly and not a success either. Once the identifier is mapped, resubmitting
 * the same event applies it — the inbox reuses its row.
 *
 * ── DETAIL IS NOT ECHOED ──
 *
 * Internal detail strings carry database messages: a failed write surfaces the constraint that
 * refused it, by name. Those are useful in an inbox an operator reads and are not for a partner, so
 * every public message here is written for the partner and the internal detail is dropped at this
 * boundary rather than filtered downstream.
 */

import type { IngestDisposition, IngestOutcome } from "@/lib/childcareOperational/attendance/integration/ingestExternalAttendance";

/**
 * The fact kinds external submission accepts.
 *
 * Measured from `NormalizedExternalAttendanceEvent`, not from the full attendance vocabulary:
 * `present` and `schedule_override` are real internal kinds that the external producer contract
 * does not carry, and accepting them here would be inventing a path the authority below has not
 * agreed to.
 */
export const SUBMITTABLE_EVENT_KINDS = ["check_in", "check_out", "absence", "room_transfer"] as const;
export type SubmittableEventKind = (typeof SUBMITTABLE_EVENT_KINDS)[number];

export const CORRECTION_MODES = ["correction", "reversal"] as const;

/** The most facts one request may carry. Mirrors the read contract's page ceiling. */
export const MAX_SUBMISSION_BATCH = 200;

export type SubmittedEvent = {
    externalEventId: string;
    eventKind: SubmittableEventKind;
    externalChildId: string;
    externalRoomId: string | null;
    externalFromRoomId: string | null;
    externalToRoomId: string | null;
    occurredAt: string;
    recordedAt: string | null;
    correctsExternalEventId: string | null;
    correctionMode: "correction" | "reversal" | null;
};

export type PublicOutcomeName = "accepted" | "replayed" | "pending_mapping" | "conflict" | "rejected";

export type PublicItemOutcome = {
    external_event_id: string;
    outcome: PublicOutcomeName;
    /** The canonical fact, when one exists. Readable immediately through the read contract. */
    attendance_event_id: string | null;
    /** Stable machine-readable reason. Null when the item was accepted or replayed. */
    code: string | null;
    /** One sentence a partner can act on. Never an internal message. */
    message: string | null;
};

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/i;

export type ParseResult =
    | { ok: true; events: SubmittedEvent[] }
    | { ok: false; code: string; message: string };

function asString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: unknown): string | null {
    const s = asString(value);
    return s ? s : null;
}

/**
 * Validate the SHAPE of a submission.
 *
 * Shape only. Whether a child may be written for, whether a site is in reach, whether a correction
 * target exists — all of that belongs to the authority below and is answered per item, because the
 * answers differ per item and a request-level refusal would throw away the items that were fine.
 */
export function parseSubmission(body: unknown): ParseResult {
    if (!body || typeof body !== "object") {
        return { ok: false, code: "invalid_body", message: "The request body must be a JSON object." };
    }
    const events = (body as { events?: unknown }).events;
    if (!Array.isArray(events)) {
        return { ok: false, code: "invalid_body", message: "Provide an `events` array." };
    }
    if (events.length === 0) {
        return { ok: false, code: "empty_batch", message: "Provide at least one event." };
    }
    if (events.length > MAX_SUBMISSION_BATCH) {
        return {
            ok: false,
            code: "batch_too_large",
            message: `A submission may carry at most ${MAX_SUBMISSION_BATCH} events.`,
        };
    }

    const parsed: SubmittedEvent[] = [];
    const seen = new Set<string>();

    for (let index = 0; index < events.length; index += 1) {
        const raw = events[index];
        const where = `events[${index}]`;
        if (!raw || typeof raw !== "object") {
            return { ok: false, code: "invalid_event", message: `${where} must be an object.` };
        }
        const e = raw as Record<string, unknown>;

        const externalEventId = asString(e.external_event_id);
        if (!externalEventId) {
            return { ok: false, code: "invalid_event", message: `${where}.external_event_id is required.` };
        }
        /*
         * A REPEATED ID INSIDE ONE BATCH IS REFUSED, NOT DEDUPLICATED.
         *
         * Two entries sharing an identity in a single request are either the same fact sent twice —
         * in which case the second is noise — or two different facts wearing one id, which is the
         * conflict the replay contract exists to catch. Silently applying one of them would decide
         * which, and this boundary is not entitled to.
         */
        if (seen.has(externalEventId)) {
            return {
                ok: false,
                code: "duplicate_event_id_in_batch",
                message: `${where}.external_event_id "${externalEventId}" appears more than once in this request.`,
            };
        }
        seen.add(externalEventId);

        const eventKind = asString(e.event_kind);
        if (!(SUBMITTABLE_EVENT_KINDS as readonly string[]).includes(eventKind)) {
            return {
                ok: false,
                code: "invalid_event",
                message: `${where}.event_kind must be one of: ${SUBMITTABLE_EVENT_KINDS.join(", ")}.`,
            };
        }

        const externalChildId = asString(e.child_external_id);
        if (!externalChildId) {
            return { ok: false, code: "invalid_event", message: `${where}.child_external_id is required.` };
        }

        const occurredAt = asString(e.occurred_at);
        if (!ISO_WITH_OFFSET.test(occurredAt)) {
            return {
                ok: false,
                code: "invalid_event",
                message: `${where}.occurred_at must be an ISO-8601 timestamp carrying a timezone offset or Z.`,
            };
        }

        const recordedAt = optionalString(e.recorded_at);
        if (recordedAt && !ISO_WITH_OFFSET.test(recordedAt)) {
            return {
                ok: false,
                code: "invalid_event",
                message: `${where}.recorded_at must be an ISO-8601 timestamp carrying a timezone offset or Z.`,
            };
        }

        const correctionMode = optionalString(e.correction_mode);
        if (correctionMode && !(CORRECTION_MODES as readonly string[]).includes(correctionMode)) {
            return {
                ok: false,
                code: "invalid_event",
                message: `${where}.correction_mode must be "correction" or "reversal".`,
            };
        }
        const correctsExternalEventId = optionalString(e.corrects_external_event_id);
        if (correctionMode && !correctsExternalEventId) {
            return {
                ok: false,
                code: "invalid_event",
                message: `${where}.corrects_external_event_id is required when correction_mode is set.`,
            };
        }
        if (correctsExternalEventId === externalEventId) {
            // An event that corrects itself has no prior fact to supersede and would become an
            // original wearing a correction's clothes.
            return {
                ok: false,
                code: "invalid_event",
                message: `${where}.corrects_external_event_id must name a different event.`,
            };
        }

        parsed.push({
            externalEventId,
            eventKind: eventKind as SubmittableEventKind,
            externalChildId,
            externalRoomId: optionalString(e.room_external_id),
            externalFromRoomId: optionalString(e.from_room_external_id),
            externalToRoomId: optionalString(e.to_room_external_id),
            occurredAt,
            recordedAt,
            correctsExternalEventId,
            correctionMode: (correctionMode as "correction" | "reversal" | null) ?? (correctsExternalEventId ? "correction" : null),
        });
    }

    return { ok: true, events: parsed };
}

/** Internal code → the public code and the sentence a partner reads. Anything unlisted is generic. */
const PUBLIC_REASONS: Record<string, { code: string; message: string }> = {
    payload_conflict: {
        code: "idempotency_conflict",
        message: "This external_event_id was already accepted with different content. Use a new id for a new fact, or submit a correction.",
    },
    external_id_missing: {
        code: "missing_external_id",
        message: "No child identifier was supplied for this event.",
    },
    unmapped_external_id: {
        code: "unknown_external_id",
        message: "No active mapping exists for one of the identifiers in this event. Once it is mapped, submit the event again.",
    },
    ambiguous: {
        code: "ambiguous_external_id",
        message: "More than one active mapping claims one of the identifiers in this event.",
    },
    mapping_wrong_entity_kind: {
        code: "external_id_not_a_child",
        message: "The identifier used for the child does not map to a child.",
    },
    no_enrollment_agreement: {
        code: "child_not_enrolled",
        message: "That child has no enrollment to attach attendance to.",
    },
    site_not_authorized: {
        code: "location_not_authorized",
        message: "This installation is not authorized for that child's location.",
    },
    capability_not_granted: {
        code: "scope_not_granted",
        message: "This installation may not record attendance.",
    },
    unknown_correction_target: {
        code: "unknown_correction_target",
        message: "The event this correction references was never accepted here.",
    },
};

const GENERIC_REJECTION = {
    code: "not_accepted",
    message: "Alloy could not accept this event. It has been recorded and can be retried.",
};

const OUTCOME_BY_DISPOSITION: Record<IngestDisposition, PublicOutcomeName> = {
    applied: "accepted",
    duplicate: "replayed",
    conflicted: "conflict",
    unmapped: "pending_mapping",
    rejected: "rejected",
};

/** Translate one internal outcome into the public one. Internal detail is dropped, never echoed. */
export function toPublicOutcome(externalEventId: string, outcome: IngestOutcome): PublicItemOutcome {
    const name = OUTCOME_BY_DISPOSITION[outcome.disposition];
    const accepted = name === "accepted" || name === "replayed";
    const reason = accepted ? null : PUBLIC_REASONS[outcome.code ?? ""] ?? GENERIC_REJECTION;

    return {
        external_event_id: externalEventId,
        outcome: name,
        attendance_event_id: outcome.attendanceEventId ?? null,
        code: reason?.code ?? null,
        message: reason?.message ?? null,
    };
}
