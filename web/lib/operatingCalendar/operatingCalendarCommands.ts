/**
 * The operator acts that author an Operating Calendar entry, as ledger tuples.
 *
 *   "We're closed Dec 24–26."                      → create (closed, 3 dates, one row)
 *   "Actually the closure is Dec 23–26."           → revise
 *   "Cancel that closure — we're opening."         → withdraw (a revision)
 *   "Put the closure back."                        → restore (a revision)
 *
 * Pure: no IO, no clock, no identity. The org, the actor and the authorization
 * arrive server-side.
 *
 * ── WHY A REVISION'S FRAME CAN START BEFORE ITS DATES ──
 *
 * The ratified fold truncates a predecessor at the revision's `valid_from` and
 * keeps everything before it. That is right for a plan changed partway through,
 * and wrong for a calendar edit that moves a closure LATER: "Mon–Fri" revised to
 * "Wed–Fri" would leave Monday and Tuesday closed by the original row. So a
 * revision's frame starts at the earlier of the predecessor's start and its own,
 * and the entry's dates live in `params.from_date..to_date`. Within that frame
 * the revision governs, and on a date outside its own dates it says: not on this
 * day. The resolver reads both, so no part of the original survives an edit.
 */

import type { AuthoringInput } from "@/lib/operationalExpectations/intake/authoringTypes";
import {
    OPERATING_CALENDAR_PREDICATES,
    OPERATING_CALENDAR_PURPOSE,
    OPERATING_CALENDAR_SUBJECT_KINDS,
    operatingCalendarModality,
    wallMinutes,
    type OperatingCalendarEntryDraft,
    type OperatingCalendarParams,
} from "@/lib/operatingCalendar/operatingCalendarVocabulary";
import { localDateRangeWindow, wallTimeExists } from "@/lib/operatingCalendar/operatingCalendarTime";

/**
 * Fact types whose appearance changes what an entry is worth: a child arriving
 * on a closed day, a tour booked into a closed interval.
 */
const OPERATING_CALENDAR_FOOTPRINT_FACT_TYPES = ["child_attendance_event", "tour_booking"] as const;

type Common = {
    idempotencyKey: string;
    actorUserId: string;
    orgId: string;
    /** The IANA zone the entry's dates are in: the site's, or the organization's. */
    timezone: string;
};

export type CalendarCommandError = { ok: false; field: string; message: string };

function subjectFor(draft: Pick<OperatingCalendarEntryDraft, "scope" | "locationId">, orgId: string) {
    return draft.scope === "organization"
        ? { kind: OPERATING_CALENDAR_SUBJECT_KINDS.organization, ref: orgId }
        : { kind: OPERATING_CALENDAR_SUBJECT_KINDS.location, ref: String(draft.locationId) };
}

export function paramsFor(draft: OperatingCalendarEntryDraft, timezone: string): OperatingCalendarParams {
    const params: OperatingCalendarParams = {
        name: draft.name,
        designation: draft.designation,
        effect: draft.effect,
        from_date: draft.fromDate,
        to_date: draft.toDate,
        start_time: draft.startTime,
        end_time: draft.endTime,
        timezone,
        reason_key: draft.reasonKey,
    };
    if (draft.note) params.note = draft.note;
    return params;
}

/**
 * Times that do not exist on a date in this zone (spring-forward) are refused,
 * naming the date. Converting them would quietly move the operator's hour.
 */
export function checkWallTimesExist(draft: OperatingCalendarEntryDraft, timezone: string): CalendarCommandError | null {
    if (!draft.startTime || !draft.endTime) return null;
    const s = wallMinutes(draft.startTime)!;
    const e = wallMinutes(draft.endTime, { allowEndOfDay: true })!;
    for (let d = draft.fromDate; d <= draft.toDate; ) {
        if (!wallTimeExists(d, s, timezone)) {
            return { ok: false, field: "start_time", message: `${draft.startTime} does not occur on ${d} in ${timezone} (daylight saving).` };
        }
        if (!wallTimeExists(d, e, timezone)) {
            return { ok: false, field: "end_time", message: `${draft.endTime} does not occur on ${d} in ${timezone} (daylight saving).` };
        }
        const next = new Date(`${d}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        d = next.toISOString().slice(0, 10);
    }
    return null;
}

function tuple(args: {
    verb: "create" | "revise";
    draft: OperatingCalendarEntryDraft;
    predicateKey: keyof typeof OPERATING_CALENDAR_PREDICATES;
    common: Common;
    frameFromDate: string;
    predecessorId?: string | null;
}): AuthoringInput {
    const { draft, common } = args;
    const { validFrom, validTo } = localDateRangeWindow(args.frameFromDate, draft.toDate, common.timezone);
    const effectForModality = args.predicateKey === "withdrawn" ? "withdrawn" : draft.effect;
    return {
        idempotencyKey: common.idempotencyKey,
        verb: args.verb,
        // An individual, not a governed authority key: the act lands `proposed`,
        // exactly like Attendance's closures. The calendar does not grant itself
        // binding force by choosing a grander-sounding key.
        authority: { authorityKey: `user:${common.actorUserId}`, authorClass: "human" },
        modality: operatingCalendarModality(effectForModality),
        subjects: [subjectFor(draft, common.orgId)],
        condition: {
            typeKey: OPERATING_CALENDAR_PURPOSE,
            predicateShape: OPERATING_CALENDAR_PREDICATES[args.predicateKey],
            params: paramsFor(draft, common.timezone) as unknown as Record<string, unknown>,
        },
        temporalFrame: { kind: "window", validFrom, validTo },
        footprint: { factTypes: [...OPERATING_CALENDAR_FOOTPRINT_FACT_TYPES] },
        predecessorId: args.predecessorId ?? null,
    };
}

function requireActor(common: Common): void {
    if (!String(common.actorUserId ?? "").trim()) throw new Error("an authoring actor is required");
    if (!String(common.timezone ?? "").trim()) throw new Error("a timezone is required");
}

/** A new entry. One row however many dates it covers. */
export function createCalendarEntry(draft: OperatingCalendarEntryDraft, common: Common): AuthoringInput {
    requireActor(common);
    return tuple({ verb: "create", draft, predicateKey: draft.effect, common, frameFromDate: draft.fromDate });
}

/** Change an entry's dates, times, effect or wording. Same lineage, same scope. */
export function reviseCalendarEntry(
    draft: OperatingCalendarEntryDraft,
    common: Common,
    predecessor: { id: string; frameFromDate: string },
): AuthoringInput {
    requireActor(common);
    const frameFromDate = predecessor.frameFromDate < draft.fromDate ? predecessor.frameFromDate : draft.fromDate;
    return tuple({
        verb: "revise",
        draft,
        predicateKey: draft.effect,
        common,
        frameFromDate,
        predecessorId: predecessor.id,
    });
}

/**
 * "Cancel it." A revision that says the entry no longer applies on any of its
 * dates. History keeps the entry and its withdrawal; a ledger `cancellation`
 * would make the dates undeterminable instead (it fails closed).
 */
export function withdrawCalendarEntry(
    draft: OperatingCalendarEntryDraft,
    common: Common,
    predecessor: { id: string; frameFromDate: string },
): AuthoringInput {
    requireActor(common);
    const frameFromDate = predecessor.frameFromDate < draft.fromDate ? predecessor.frameFromDate : draft.fromDate;
    return tuple({
        verb: "revise",
        draft,
        predicateKey: "withdrawn",
        common,
        frameFromDate,
        predecessorId: predecessor.id,
    });
}
