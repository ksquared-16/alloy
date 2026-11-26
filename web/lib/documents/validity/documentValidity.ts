/**
 * D7 — THE document validity evaluator. One pure function; every consumer asks it.
 *
 * A document type's published validity policy (D3, `document_type_versions.validity_policy`) is organization
 * configuration; a version's `effective_on` / `expires_on` (D2) are the recorded facts. Validity is derived from both on
 * every read — never stored as a status — exactly as D6 derives requirement satisfaction.
 *
 * No I/O and no clock: `today` is the ORGANIZATION-LOCAL calendar date, resolved on the server
 * (`resolveDocumentsToday`). A client clock never decides whether a document is valid.
 *
 * Dates are calendar dates (YYYY-MM-DD). `expires_on` is the LAST day the document is valid: a document is expired from
 * the day after it. A document is not yet in force before its `effective_on`.
 *
 *   policy kind              expiration                                                   recorded expires_on
 *   none                     none — never expires (`not_tracked`)                          honoured when recorded
 *   explicit_date            the recorded date; none recorded → `date_missing`             the authority
 *   duration                 anchor + value·unit − 1 day; anchor = effective_on, else      overrides the derived date
 *                            the version's received date
 *   periodic_reconfirmation  anchor + value·unit − 1 day; anchor = effective_on, else      overrides the derived date
 *                            the review date, else the received date
 *   event_renewal            resolved from the SUBJECT's authoritative event dates          the authority
 *                            (`ValidityFacts.events`, see below); unresolvable → `date_missing` with the reason
 *
 * Event renewal (D7 batch B2). The anchor is effective_on, else the review date, else the received date.
 *   birthday          recurring: expires the day before the subject's first birthday AFTER the anchor (29 Feb → 28 Feb in
 *                     a common year). Source: customer_members.dob (child) / persons.date_of_birth (person).
 *   enrollment_start  a document covers ONE enrollment: the latest enrollment start on or before the anchor, else (collected
 *                     ahead) the first one after it. It expires the day before the NEXT enrollment start after that one; with
 *                     no later enrollment it is valid with no end date yet. Source: child_enrollment_agreements.start_date
 *                     (voided agreements excluded).
 *   program_year_start  no authoritative source in the platform — never guessed: `date_missing`, reason `event_source_unavailable`.
 * A missing date of birth, a subject with no enrollment, or a subject grain that has neither is `date_missing` with its
 * reason. A recorded expires_on always wins.
 *
 * Expiring soon: within the policy's largest `warning_days` window, inclusive of the expiration day. No warning days,
 * no expiring-soon state (the document is valid until it expires).
 */
import type { ValidityPolicy } from "@/lib/documents/configuration/documentTypePolicy";

export const VALIDITY_STATUSES = Object.freeze(["not_tracked", "valid", "expiring_soon", "expired", "not_yet_effective", "date_missing"] as const);
export type ValidityStatus = (typeof VALIDITY_STATUSES)[number];

export type ValidityFacts = {
    effective_on: string | null;
    expires_on: string | null;
    /** When the version was received (timestamp or date); its org-local date anchors derived durations. */
    received_on: string | null;
    /** When the version was last reviewed (org-local date), anchoring periodic reconfirmation. */
    reviewed_on: string | null;
    /**
     * The subject's authoritative event dates (B2), resolved by the caller for event-renewal types. Absent = not
     * resolved (the event-renewal expiration is then `date_missing`, reason `event_dates_not_resolved`).
     */
    events?: ValidityEventDates | null;
};

/** `null` in a field means the subject has no such date on record (or its grain has no source for it). */
export type ValidityEventDates = {
    birthday: string | null;
    /** Start dates of the subject's non-voided enrollments, any order. Empty = no enrollment. */
    enrollment_starts: string[] | null;
};

export type EventDateUnavailable =
    | "event_dates_not_resolved"
    | "event_source_unavailable"
    | "birthday_not_recorded"
    | "no_enrollment"
    | "event_not_configured";

export type DocumentValidity = {
    status: ValidityStatus;
    /** The expiration that applies (recorded, or derived from the policy), or null. */
    expires_on: string | null;
    expires_source: "recorded" | "derived" | null;
    effective_on: string | null;
    /** First day of the expiring-soon window, or null. */
    warn_from: string | null;
    /** Days from today to `expires_on` (negative once expired), or null. */
    days_remaining: number | null;
    /** Event renewal only: why the event date could not be resolved (status `date_missing`). */
    event_unavailable?: EventDateUnavailable;
    /** Event renewal only: valid until the next event, which is not yet on record (no end date yet). */
    open_until_event?: boolean;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(v: unknown): v is string {
    if (typeof v !== "string" || !DATE.test(v)) return false;
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function asDate(v: string | null): string | null {
    if (!v) return null;
    const head = v.slice(0, 10);
    return isIsoDate(head) ? head : null;
}

export function addDays(isoDate: string, days: number): string {
    const d = new Date(`${isoDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** Calendar addition with month-end clamping: 2026-01-31 + 1 month = 2026-02-28; 2024-02-29 + 1 year = 2025-02-28. */
export function addPeriod(isoDate: string, value: number, unit: "days" | "months" | "years"): string {
    if (unit === "days") return addDays(isoDate, value);
    const [y, m, d] = isoDate.split("-").map(Number);
    const months = unit === "years" ? value * 12 : value;
    const total = y * 12 + (m - 1) + months;
    const ty = Math.floor(total / 12);
    const tm = total % 12;
    const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
    return `${String(ty).padStart(4, "0")}-${String(tm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
    return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

function warningWindow(policy: ValidityPolicy | null | undefined): number | null {
    const w = Array.isArray(policy?.warning_days) ? policy!.warning_days.filter((n) => Number.isInteger(n) && n > 0) : [];
    return w.length ? Math.max(...w) : null;
}

/** The policy's expiration for these facts, before comparing with today. */
type PolicyExpiration = {
    expires_on: string | null;
    source: "recorded" | "derived" | null;
    required: boolean;
    event_unavailable?: EventDateUnavailable;
    open_until_event?: boolean;
};

/** The next anniversary of `birth` strictly after `anchor` (29 Feb in a common year → 28 Feb). */
export function nextBirthdayAfter(birth: string, anchor: string): string {
    const [, bm, bd] = birth.split("-").map(Number);
    const ay = Number(anchor.slice(0, 4));
    for (let y = ay; y <= ay + 1; y++) {
        const last = new Date(Date.UTC(y, bm, 0)).getUTCDate();
        const candidate = `${String(y).padStart(4, "0")}-${String(bm).padStart(2, "0")}-${String(Math.min(bd, last)).padStart(2, "0")}`;
        if (candidate > anchor) return candidate;
    }
    return addPeriod(anchor, 1, "years");
}

function eventExpiration(event: unknown, events: ValidityEventDates | null | undefined, anchor: string | null): PolicyExpiration {
    const missing = (event_unavailable: EventDateUnavailable): PolicyExpiration => ({ expires_on: null, source: null, required: true, event_unavailable });
    if (event === "program_year_start") return missing("event_source_unavailable");
    if (event !== "birthday" && event !== "enrollment_start") return missing("event_not_configured");
    if (!events) return missing("event_dates_not_resolved");
    if (!anchor) return { expires_on: null, source: null, required: true };
    if (event === "birthday") {
        const birth = asDate(events.birthday);
        if (!birth) return missing("birthday_not_recorded");
        return { expires_on: addDays(nextBirthdayAfter(birth, anchor), -1), source: "derived", required: true };
    }
    const starts = [...new Set((events.enrollment_starts ?? []).map(asDate).filter((d): d is string => Boolean(d)))].sort();
    if (starts.length === 0) return missing("no_enrollment");
    const onOrBefore = starts.filter((d) => d <= anchor);
    const covered = onOrBefore.length ? onOrBefore[onOrBefore.length - 1]! : starts[0]!;
    const next = starts.find((d) => d > covered) ?? null;
    if (!next) return { expires_on: null, source: "derived", required: true, open_until_event: true };
    return { expires_on: addDays(next, -1), source: "derived", required: true };
}

export function policyExpiration(policy: ValidityPolicy | null | undefined, facts: ValidityFacts): PolicyExpiration {
    const recorded = asDate(facts.expires_on);
    const kind = policy?.kind ?? "none";
    if (recorded) return { expires_on: recorded, source: "recorded", required: kind !== "none" };
    if (kind === "duration" || kind === "periodic_reconfirmation") {
        const anchor =
            asDate(facts.effective_on) ?? (kind === "periodic_reconfirmation" ? asDate(facts.reviewed_on) : null) ?? asDate(facts.received_on);
        const value = policy?.value;
        const unit = policy?.unit;
        if (anchor && typeof value === "number" && value > 0 && (unit === "days" || unit === "months" || unit === "years")) {
            return { expires_on: addDays(addPeriod(anchor, value, unit), -1), source: "derived", required: true };
        }
        return { expires_on: null, source: null, required: true };
    }
    if (kind === "event_renewal") {
        return eventExpiration(policy?.event, facts.events, asDate(facts.effective_on) ?? asDate(facts.reviewed_on) ?? asDate(facts.received_on));
    }
    if (kind === "explicit_date") return { expires_on: null, source: null, required: true };
    return { expires_on: null, source: null, required: false };
}

/** Evaluate one version's validity on the organization-local `today`. */
export function evaluateDocumentValidity(input: { policy: ValidityPolicy | null | undefined; facts: ValidityFacts; today: string }): DocumentValidity {
    const { policy, facts, today } = input;
    const effective = asDate(facts.effective_on);
    const exp = policyExpiration(policy, facts);
    const window = warningWindow(policy);
    const warn_from = exp.expires_on && window !== null ? addDays(exp.expires_on, -window) : null;
    const days_remaining = exp.expires_on ? daysBetween(today, exp.expires_on) : null;
    const base = {
        expires_on: exp.expires_on,
        expires_source: exp.source,
        effective_on: effective,
        warn_from,
        days_remaining,
        ...(exp.event_unavailable ? { event_unavailable: exp.event_unavailable } : {}),
        ...(exp.open_until_event ? { open_until_event: true } : {}),
    };

    if (effective && today < effective) return { status: "not_yet_effective", ...base };
    if (exp.open_until_event) return { status: "valid", ...base };
    if (!exp.expires_on) return { status: exp.required ? "date_missing" : "not_tracked", ...base };
    if (today > exp.expires_on) return { status: "expired", ...base };
    if (warn_from && today >= warn_from) return { status: "expiring_soon", ...base };
    return { status: "valid", ...base };
}

/** Does this validity let a document count as evidence today? (date_missing counts only once the date is recorded) */
export function validityAllowsEvidence(v: DocumentValidity | null | undefined): boolean {
    if (!v) return true;
    return v.status === "not_tracked" || v.status === "valid" || v.status === "expiring_soon";
}

/** Does the type's policy need its validity dates recorded by a person before the document counts? */
export function validityNeedsRecordedDate(policy: ValidityPolicy | null | undefined): boolean {
    return policy?.kind === "explicit_date" || policy?.kind === "event_renewal";
}

/** Does the type's policy need the subject's event dates (B2)? Callers resolve them only then. */
export function validityNeedsEventDates(policy: ValidityPolicy | null | undefined): boolean {
    return policy?.kind === "event_renewal";
}

export const VALIDITY_STATUS_LABEL: Readonly<Record<ValidityStatus, string>> = Object.freeze({
    not_tracked: "No expiration",
    valid: "Valid",
    expiring_soon: "Expiring soon",
    expired: "Expired",
    not_yet_effective: "Not yet in force",
    date_missing: "Expiration date missing",
});
