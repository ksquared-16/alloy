/**
 * The Operating Calendar's vocabulary — what an entry can SAY.
 *
 * ── ONE AUTHORITY, ONE MORE PURPOSE ──
 *
 * There is no calendar table. An entry is an authored Operational Expectation
 * under its own reviewed purpose (`location.operating_calendar`), in the same
 * append-only ledger that already holds Attendance's service-day closures. The
 * ledger owns storage, lineage and effectivity; this vocabulary owns what an
 * entry means for whether a location operates. Attendance's purpose keeps its
 * meaning and its rows untouched (see `resolveOperatingCalendar` for how both
 * are read together).
 *
 * ── DESIGNATION IS NOT EFFECT ──
 *
 * "Presidents' Day" is a NAME for a date. Whether the school is closed that day
 * is a separate, explicit decision. So every entry carries a designation (what
 * the day is called, and what kind of day it is) AND an effect (what happens to
 * operation). A holiday whose effect is `none` changes nothing that operates: it
 * labels the day and nothing else.
 *
 * ── SUPPORTED LIMITATIONS (V1) ──
 *
 *   - An interval never crosses midnight. Close-at 02:00 the next morning is
 *     refused rather than reinterpreted.
 *   - A partial closure and modified hours apply the SAME wall-clock interval to
 *     every date in the entry's range ("closes at 3 PM all week").
 *   - Scope is the organization (every location inherits) or one site. A room is
 *     not a calendar scope: room closures stay Attendance-owned day statements,
 *     and a room's intent can never widen into a site or org closure here.
 */

export const OPERATING_CALENDAR_PURPOSE = "location.operating_calendar" as const;

/** What happens to operation on the entry's dates. */
export const OPERATING_CALENDAR_EFFECTS = [
    /** A named day that changes nothing operational. */
    "none",
    /** Not operating for the whole local day. */
    "closed",
    /** Not operating for one interval of each local day. */
    "partial_closure",
    /** Operating only within this interval on each local day. */
    "modified_hours",
    /**
     * Operating as usual. Only meaningful at a location, as the explicit
     * exception to an inherited organization closure or change.
     */
    "open_as_usual",
] as const;
export type OperatingCalendarEffect = (typeof OPERATING_CALENDAR_EFFECTS)[number];

/** What kind of day it is. A label for operators, never an effect. */
export const OPERATING_CALENDAR_DESIGNATIONS = ["holiday", "closure", "modified_hours", "event", "other"] as const;
export type OperatingCalendarDesignation = (typeof OPERATING_CALENDAR_DESIGNATIONS)[number];

/** Reason keys. The closure reasons match Attendance's closure copy on purpose. */
export const OPERATING_CALENDAR_REASONS = [
    "holiday_closure",
    "staff_training",
    "weather_closure",
    "maintenance",
    "special_event",
    "other",
] as const;
export type OperatingCalendarReason = (typeof OPERATING_CALENDAR_REASONS)[number];

export type OperatingCalendarScope = "organization" | "location";

/** Ledger subject kinds. `site` is the same kind Attendance closes, deliberately. */
export const OPERATING_CALENDAR_SUBJECT_KINDS = {
    organization: "organization",
    location: "site",
} as const;

/**
 * Predicates: the Condition shape per effect. A withdrawn entry is a REVISION
 * whose predicate says the entry no longer applies — never a ledger
 * `cancellation`, which the resolver fails closed on (the same reasoning as
 * Attendance's reopen).
 */
export const OPERATING_CALENDAR_PREDICATES = {
    none: "calendar_day_designated",
    closed: "calendar_closed",
    partial_closure: "calendar_partially_closed",
    modified_hours: "calendar_hours_modified",
    open_as_usual: "calendar_open_as_usual",
    withdrawn: "calendar_entry_withdrawn",
} as const;

/** Modality per effect: a closure is deontic ("must not operate"), everything else intent. */
export function operatingCalendarModality(effect: OperatingCalendarEffect | "withdrawn"): "prohibited" | "intended" {
    return effect === "closed" || effect === "partial_closure" ? "prohibited" : "intended";
}

export function effectForPredicate(predicate: string): OperatingCalendarEffect | "withdrawn" | null {
    for (const [effect, p] of Object.entries(OPERATING_CALENDAR_PREDICATES)) {
        if (p === predicate) return effect as OperatingCalendarEffect | "withdrawn";
    }
    return null;
}

/** Effects that change operation (and so take part in scope precedence). */
export function isOperationalEffect(effect: OperatingCalendarEffect): boolean {
    return effect !== "none";
}

/**
 * The entry as an operator describes it. Dates are the LOCATION's calendar dates
 * (YYYY-MM-DD, inclusive); times are wall-clock HH:MM in that location's zone.
 */
export type OperatingCalendarEntryDraft = {
    scope: OperatingCalendarScope;
    /** The site, for `location` scope. Null for `organization`. */
    locationId: string | null;
    name: string;
    designation: OperatingCalendarDesignation;
    effect: OperatingCalendarEffect;
    fromDate: string;
    toDate: string;
    /** `partial_closure`: the closed interval. `modified_hours`: the open interval. */
    startTime: string | null;
    endTime: string | null;
    reasonKey: OperatingCalendarReason | null;
    note: string | null;
};

/** The Condition params the ledger stores. Every field is a fact about the plan, none a sensor. */
export type OperatingCalendarParams = {
    name: string;
    designation: OperatingCalendarDesignation;
    effect: OperatingCalendarEffect;
    from_date: string;
    to_date: string;
    start_time: string | null;
    end_time: string | null;
    /** The IANA zone the frame's instants were computed in. */
    timezone: string;
    reason_key: string | null;
    note?: string;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isCalendarDate(v: unknown): v is string {
    if (typeof v !== "string" || !YMD.test(v)) return false;
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** "HH:MM" → minutes after local midnight. "24:00" is accepted as an END only. */
export function wallMinutes(v: string, opts?: { allowEndOfDay?: boolean }): number | null {
    if (opts?.allowEndOfDay && v === "24:00") return 24 * 60;
    const m = HM.exec(v);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
}

/** The longest range one entry may cover. A year keeps a typo from closing a decade. */
export const OPERATING_CALENDAR_MAX_DAYS = 366;

export type DraftValidation = { ok: true; draft: OperatingCalendarEntryDraft } | { ok: false; field: string; message: string };

function str(v: unknown): string {
    return typeof v === "string" ? v.trim() : "";
}

/**
 * Parse and validate an operator draft. Unknown keys are refused rather than
 * dropped, so a client cannot believe it set something the server ignored.
 */
export function parseOperatingCalendarDraft(body: unknown): DraftValidation {
    if (body == null || typeof body !== "object" || Array.isArray(body)) {
        return { ok: false, field: "body", message: "Expected an object." };
    }
    const b = body as Record<string, unknown>;
    const allowed = new Set([
        "scope",
        "location_id",
        "name",
        "designation",
        "effect",
        "from_date",
        "to_date",
        "start_time",
        "end_time",
        "reason_key",
        "note",
    ]);
    for (const key of Object.keys(b)) {
        if (!allowed.has(key)) return { ok: false, field: key, message: `Unknown field: ${key}` };
    }

    const scope = str(b.scope);
    if (scope !== "organization" && scope !== "location") {
        return { ok: false, field: "scope", message: "Scope must be organization or location." };
    }
    const locationId = str(b.location_id) || null;
    if (scope === "location" && !locationId) {
        return { ok: false, field: "location_id", message: "A location entry needs its location." };
    }
    if (scope === "organization" && locationId) {
        return { ok: false, field: "location_id", message: "An organization entry applies to every location." };
    }

    const name = str(b.name);
    if (!name) return { ok: false, field: "name", message: "Give the entry a name." };
    if (name.length > 120) return { ok: false, field: "name", message: "Keep the name under 120 characters." };

    const designation = str(b.designation) as OperatingCalendarDesignation;
    if (!OPERATING_CALENDAR_DESIGNATIONS.includes(designation)) {
        return { ok: false, field: "designation", message: "Unknown designation." };
    }
    const effect = str(b.effect) as OperatingCalendarEffect;
    if (!OPERATING_CALENDAR_EFFECTS.includes(effect)) {
        return { ok: false, field: "effect", message: "Unknown effect." };
    }
    if (effect === "open_as_usual" && scope !== "location") {
        return {
            ok: false,
            field: "effect",
            message: "“Open as usual” is a location exception to an organization entry.",
        };
    }

    const fromDate = str(b.from_date);
    const toDate = str(b.to_date) || fromDate;
    if (!isCalendarDate(fromDate)) return { ok: false, field: "from_date", message: "Choose a start date." };
    if (!isCalendarDate(toDate)) return { ok: false, field: "to_date", message: "Choose a valid end date." };
    if (toDate < fromDate) return { ok: false, field: "to_date", message: "The end date is before the start date." };
    const days = (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000 + 1;
    if (days > OPERATING_CALENDAR_MAX_DAYS) {
        return { ok: false, field: "to_date", message: `One entry can cover at most ${OPERATING_CALENDAR_MAX_DAYS} days.` };
    }

    let startTime: string | null = null;
    let endTime: string | null = null;
    if (effect === "partial_closure" || effect === "modified_hours") {
        startTime = str(b.start_time);
        endTime = str(b.end_time);
        const s = wallMinutes(startTime);
        const e = wallMinutes(endTime, { allowEndOfDay: true });
        if (s == null) return { ok: false, field: "start_time", message: "Use a start time like 09:00." };
        if (e == null) return { ok: false, field: "end_time", message: "Use an end time like 15:00." };
        if (e <= s) {
            return {
                ok: false,
                field: "end_time",
                message: "The end must be after the start on the same day. Intervals that cross midnight are not supported.",
            };
        }
        if (effect === "partial_closure" && s === 0 && e === 24 * 60) {
            return { ok: false, field: "effect", message: "A closure for the whole day is a full-day closure." };
        }
    } else if (str(b.start_time) || str(b.end_time)) {
        return { ok: false, field: "start_time", message: "Times apply only to a partial closure or modified hours." };
    }

    const reasonRaw = str(b.reason_key);
    const reasonKey = reasonRaw ? (reasonRaw as OperatingCalendarReason) : null;
    if (reasonKey && !OPERATING_CALENDAR_REASONS.includes(reasonKey)) {
        return { ok: false, field: "reason_key", message: "Unknown reason." };
    }
    const note = str(b.note) || null;
    if (note && note.length > 500) return { ok: false, field: "note", message: "Keep the note under 500 characters." };

    return {
        ok: true,
        draft: {
            scope,
            locationId: scope === "location" ? locationId : null,
            name,
            designation,
            effect,
            fromDate,
            toDate,
            startTime,
            endTime,
            reasonKey,
            note,
        },
    };
}
