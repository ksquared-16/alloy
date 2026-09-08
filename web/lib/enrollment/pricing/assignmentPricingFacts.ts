/**
 * THE ASSIGNMENT FACTS A TUITION RESOLUTION IS COMPUTED FROM — read from the owners that hold them.
 *
 * Nothing here is copied onto the child profile to make resolution easier, and nothing is invented
 * when an owner is silent. Each fact is read in AUTHORITY ORDER: what has been committed wins over
 * what has been proposed, because a committed placement is a decision and a proposal is an
 * intention, and pricing a decision against an intention is how a family gets a number nobody
 * agreed to.
 *
 *   program        committed `child_placements.program_category_id`, else the assignment's own
 *   attendance     the assignment's `schedule_type` — the shape of the week, not its length
 *   days a week    the committed `schedule_assignments` pattern, else the requested days
 *   site           the committed placement's site, else the assignment's
 *   date           the caller's date, else the assignment's start, else its desired start, else today
 *
 * The provenance of each choice travels with the facts, because "why is this family priced at five
 * days" is answerable only if the record says which owner said five.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AssignmentPricingFacts } from "@/lib/commercial/execution/evaluate/resolveOptions";
import { REQUESTED_DAYS_PER_WEEK_METADATA_KEY } from "@/lib/enrollment/effectiveDateAuthority";

/** Which owner supplied each fact. Carried into the accepted term's provenance. */
export type AssignmentFactSources = {
    programKey: "committed_placement" | "assignment" | "none";
    daysPerWeek: "committed_schedule" | "requested" | "none";
    locationId: "committed_placement" | "assignment" | "none";
    asOf: "requested" | "assignment_start" | "assignment_desired_start" | "today";
};

export type AssignmentPricingSubject = {
    opportunityCustomerMemberId: string;
    customerMemberId: string;
    /** Present once the assignment has enrolled; null while it is still a proposal. */
    enrollmentAgreementId: string | null;
    childLabel: string | null;
};

export type AssignmentPricingFactsRead =
    | { ok: true; subject: AssignmentPricingSubject; facts: AssignmentPricingFacts; sources: AssignmentFactSources }
    | { ok: false; code: "assignment_not_found" | "db_error"; message: string };

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function todayYmd(): string {
    return new Date().toISOString().slice(0, 10);
}

/**
 * Read the canonical facts for one assignment.
 *
 * @param asOf the date being priced. Omitted, the assignment's own start date answers — which is
 *   what makes a FUTURE-EFFECTIVE assignment price at the rate that will apply when it begins,
 *   rather than at today's.
 */
export async function readAssignmentPricingFacts(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        opportunityCustomerMemberId: string;
        asOf?: string | null;
        /** The operator's chosen billing frequency, when they have chosen one. */
        cadenceKey?: string | null;
    },
): Promise<AssignmentPricingFactsRead> {
    const ocmId = t(args.opportunityCustomerMemberId);
    if (!ocmId) {
        return { ok: false, code: "assignment_not_found", message: "No assignment was named." };
    }

    const { data: ocmRow, error: ocmError } = await supabase
        .from("opportunity_customer_members")
        .select("id, customer_member_id, schedule_type, location_id, program_category_id, start_date, desired_start_date, metadata")
        .eq("org_id", args.orgId)
        .eq("id", ocmId)
        .maybeSingle();
    if (ocmError) return { ok: false, code: "db_error", message: ocmError.message };
    if (!ocmRow) {
        return {
            ok: false,
            code: "assignment_not_found",
            message: "That assignment does not exist in this organisation.",
        };
    }
    const ocm = ocmRow as Record<string, unknown>;
    const customerMemberId = t(ocm.customer_member_id);

    // The enrolment, when there is one. Null is the ordinary pre-enrolment answer, not a failure.
    const { data: agreementRows } = await supabase
        .from("child_enrollment_agreements")
        .select("id, status, created_at")
        .eq("org_id", args.orgId)
        .eq("opportunity_customer_member_id", ocmId)
        .order("created_at", { ascending: false });
    const agreements = (agreementRows ?? []) as Array<{ id: string; status: string }>;
    const agreement = agreements.find((a) => t(a.status) === "active") ?? agreements[0] ?? null;

    // ── The committed owners, when they have spoken ──────────────────────────────────────────
    let placement: Record<string, unknown> | null = null;
    let scheduleDays: number | null = null;
    if (agreement) {
        const { data: placementRows } = await supabase
            .from("child_placements")
            .select("id, site_location_id, program_category_id, room_location_id, start_date, status")
            .eq("org_id", args.orgId)
            .eq("enrollment_agreement_id", agreement.id)
            .is("end_date", null)
            .order("start_date", { ascending: false });
        placement = ((placementRows ?? [])[0] as Record<string, unknown>) ?? null;

        const { data: assignmentRows } = await supabase
            .from("schedule_assignments")
            .select("id, schedule_pattern_id, start_date, status")
            .eq("org_id", args.orgId)
            .eq("enrollment_agreement_id", agreement.id)
            .is("end_date", null)
            .order("start_date", { ascending: false });
        const patternId = t(((assignmentRows ?? [])[0] as Record<string, unknown> | undefined)?.schedule_pattern_id);
        if (patternId) {
            const { data: pattern } = await supabase
                .from("schedule_patterns")
                .select("id, weekdays")
                .eq("org_id", args.orgId)
                .eq("id", patternId)
                .maybeSingle();
            const weekdays = (pattern as { weekdays?: unknown[] } | null)?.weekdays;
            if (Array.isArray(weekdays)) scheduleDays = weekdays.length;
        }
    }

    // ── Program: the key, never the id — Commercial authors against `program_key` ────────────
    const programCategoryId = t(placement?.program_category_id) || t(ocm.program_category_id);
    let programKey: string | null = null;
    if (programCategoryId) {
        const { data: category } = await supabase
            .from("location_program_categories")
            .select("id, key")
            .eq("org_id", args.orgId)
            .eq("id", programCategoryId)
            .maybeSingle();
        programKey = t((category as { key?: unknown } | null)?.key) || null;
    }

    // ── Days a week ──────────────────────────────────────────────────────────────────────────
    const metadata = (ocm.metadata ?? {}) as Record<string, unknown>;
    const requestedDaysRaw = metadata[REQUESTED_DAYS_PER_WEEK_METADATA_KEY];
    const requestedDays =
        requestedDaysRaw == null || requestedDaysRaw === "" ? null : Number(requestedDaysRaw);
    const daysPerWeek =
        scheduleDays != null
            ? scheduleDays
            : Number.isFinite(requestedDays as number)
              ? (requestedDays as number)
              : null;

    // ── The date being priced ────────────────────────────────────────────────────────────────
    const requestedAsOf = t(args.asOf);
    const assignmentStart = t(ocm.start_date);
    const desiredStart = t(ocm.desired_start_date);
    const asOf = requestedAsOf || assignmentStart || desiredStart || todayYmd();

    const sources: AssignmentFactSources = {
        programKey: t(placement?.program_category_id)
            ? "committed_placement"
            : t(ocm.program_category_id)
              ? "assignment"
              : "none",
        daysPerWeek: scheduleDays != null ? "committed_schedule" : daysPerWeek != null ? "requested" : "none",
        locationId: t(placement?.site_location_id)
            ? "committed_placement"
            : t(ocm.location_id)
              ? "assignment"
              : "none",
        asOf: requestedAsOf
            ? "requested"
            : assignmentStart
              ? "assignment_start"
              : desiredStart
                ? "assignment_desired_start"
                : "today",
    };

    return {
        ok: true,
        subject: {
            opportunityCustomerMemberId: ocmId,
            customerMemberId,
            enrollmentAgreementId: agreement?.id ?? null,
            childLabel: null,
        },
        facts: {
            programKey,
            // The assignment's schedule TYPE is the attendance shape Commercial authors offerings
            // against. It is a configured vocabulary on both sides, so no translation table exists
            // and none is invented here.
            attendanceType: t(ocm.schedule_type) || null,
            daysPerWeek,
            locationId: t(placement?.site_location_id) || t(ocm.location_id) || null,
            // Funding attribution is Thread 6's. Private pay is the only payer this platform can
            // honestly claim today, and claiming it explicitly beats leaving it implied.
            payerType: "private_pay",
            cadenceKey: t(args.cadenceKey) || null,
            asOf,
        },
        sources,
    };
}
