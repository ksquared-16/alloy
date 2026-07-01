/**
 * Service capabilities — the "switchboard" model (Alloy Services V1 blueprint).
 *
 * A Service is an operational switchboard: each capability is an operational
 * truth the offering switches on, not a checkbox for its own sake. The frozen
 * `financial_services` table is a non-versioned catalog with a `metadata` jsonb;
 * capabilities, the default revenue category, and program associations live in
 * `metadata` (additive — no migration; the catalog stays a list, per the frozen
 * Commercial Model). Cross-domain *consumption* of these flags (the schedule
 * engine actually reading "creates a schedule") is deferred — here they are
 * configured, summarized, and validated.
 *
 * Billing rhythm is derived from the existing `service_type` column
 * (recurring / one_time / usage|attendance_derived → Recurring / One-time /
 * Usage-based) and is the hinge that gates the visible capability set.
 *
 * Pure module — no IO. Used by the store (round-trip), the UI (switchboard,
 * progressive disclosure), and validation.
 */

import type { FinancialServiceType } from "@/lib/financials/services/financialServicesStore";

export const SERVICE_CAPABILITIES = [
    "creates_schedule",
    "tracks_attendance",
    "consumes_capacity",
    "supports_waitlist",
    "uses_rate_plans",
    "parent_portal_visible",
] as const;
export type ServiceCapability = (typeof SERVICE_CAPABILITIES)[number];

export type ServiceCapabilityMap = Record<ServiceCapability, boolean>;

/** Operator-facing label + the plain-language read shown when the switch is on. */
export const SERVICE_CAPABILITY_REGISTRY: Record<
    ServiceCapability,
    { label: string; onRead: string; offRead: string }
> = {
    creates_schedule: {
        label: "Creates a schedule",
        onRead: "Enrolling a child here creates a weekly schedule.",
        offRead: "Enrolling a child here creates no schedule.",
    },
    tracks_attendance: {
        label: "Tracks attendance",
        onRead: "Attendance is recorded for this service.",
        offRead: "Attendance is not recorded for this service.",
    },
    consumes_capacity: {
        label: "Consumes capacity",
        onRead: "Enrollments count against room and ratio capacity.",
        offRead: "Enrollments don't count against room or ratio capacity.",
    },
    supports_waitlist: {
        label: "Families can wait for it",
        onRead: "Families can join a waitlist when it's full.",
        offRead: "No waitlist when it's full.",
    },
    uses_rate_plans: {
        label: "Priced by a Rate Plan",
        onRead: "Priced by a recurring Rate Plan.",
        offRead: "Not priced by a Rate Plan.",
    },
    parent_portal_visible: {
        label: "Visible to families",
        onRead: "Families can see and request this in the parent portal.",
        offRead: "Internal only — families don't see this.",
    },
};

/** Toggling these off on a live service is high-consequence: confirm with the named effect. */
export const HIGH_CONSEQUENCE_OFF: Record<ServiceCapability, string | null> = {
    creates_schedule:
        "Turning off Scheduling means enrolling a child here no longer creates a weekly schedule. Existing schedules are unaffected.",
    tracks_attendance:
        "Turning off Attendance means attended-days pricing and attendance-based charges for this service have nothing to read.",
    consumes_capacity:
        "Turning off Capacity means enrollments here no longer count against room limits or ratios.",
    supports_waitlist: null,
    uses_rate_plans:
        "Turning off pricing means this service is no longer priced by a Rate Plan — families enrolling would have no tuition.",
    parent_portal_visible: "Families will no longer see this service in the parent portal.",
};

// --- Billing rhythm (derived from service_type) -----------------------------

export const SERVICE_RHYTHMS = ["recurring", "one_time", "usage"] as const;
export type ServiceRhythm = (typeof SERVICE_RHYTHMS)[number];

export const SERVICE_RHYTHM_LABEL: Record<ServiceRhythm, string> = {
    recurring: "Recurring",
    one_time: "One-time",
    usage: "Usage-based",
};

/** Map the stored service_type onto the operator-facing billing rhythm. */
export function rhythmOf(serviceType: FinancialServiceType): ServiceRhythm {
    if (serviceType === "recurring") return "recurring";
    if (serviceType === "one_time") return "one_time";
    return "usage"; // usage + attendance_derived
}

/** Default capability posture for a service type — the operator confirms, not fills. */
export function defaultCapabilities(serviceType: FinancialServiceType): ServiceCapabilityMap {
    const rhythm = rhythmOf(serviceType);
    if (rhythm === "recurring") {
        return {
            creates_schedule: true,
            tracks_attendance: true,
            consumes_capacity: true,
            supports_waitlist: true,
            uses_rate_plans: true,
            parent_portal_visible: true,
        };
    }
    if (rhythm === "one_time") {
        return {
            creates_schedule: false,
            tracks_attendance: false,
            consumes_capacity: false,
            supports_waitlist: false,
            uses_rate_plans: false,
            parent_portal_visible: true,
        };
    }
    // usage-based (incl. attendance_derived)
    return {
        creates_schedule: false,
        tracks_attendance: serviceType === "attendance_derived",
        consumes_capacity: false,
        supports_waitlist: false,
        uses_rate_plans: false,
        parent_portal_visible: false,
    };
}

/** Coerce an unknown metadata value into a complete, valid capability map. */
export function normalizeCapabilities(
    raw: unknown,
    serviceType: FinancialServiceType,
): ServiceCapabilityMap {
    const base = defaultCapabilities(serviceType);
    if (raw && typeof raw === "object") {
        const obj = raw as Record<string, unknown>;
        for (const cap of SERVICE_CAPABILITIES) {
            if (typeof obj[cap] === "boolean") base[cap] = obj[cap] as boolean;
        }
    }
    return base;
}

/** True when this service is priced by Rate Plans (reveals the Pricing card vs Charges). */
export function isPricedByRatePlans(caps: ServiceCapabilityMap): boolean {
    return caps.uses_rate_plans === true;
}
