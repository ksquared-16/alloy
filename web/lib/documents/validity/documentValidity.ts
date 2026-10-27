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
 *   event_renewal            the recorded date; none recorded → `date_missing` (renewal    the authority
 *                            events are not yet resolvable from the record)
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
};

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
export function policyExpiration(policy: ValidityPolicy | null | undefined, facts: ValidityFacts): { expires_on: string | null; source: "recorded" | "derived" | null; required: boolean } {
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
    if (kind === "explicit_date" || kind === "event_renewal") return { expires_on: null, source: null, required: true };
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
    const base = { expires_on: exp.expires_on, expires_source: exp.source, effective_on: effective, warn_from, days_remaining };

    if (effective && today < effective) return { status: "not_yet_effective", ...base };
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

export const VALIDITY_STATUS_LABEL: Readonly<Record<ValidityStatus, string>> = Object.freeze({
    not_tracked: "No expiration",
    valid: "Valid",
    expiring_soon: "Expiring soon",
    expired: "Expired",
    not_yet_effective: "Not yet in force",
    date_missing: "Expiration date missing",
});
