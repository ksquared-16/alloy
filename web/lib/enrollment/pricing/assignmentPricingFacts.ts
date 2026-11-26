/**
 * THE ASSIGNMENT FACTS A TUITION RESOLUTION IS COMPUTED FROM — read from the owners that hold them.
 *
 * Nothing here is copied onto the child profile to make resolution easier, and nothing is invented
 * when an owner is silent. Each fact is read in AUTHORITY ORDER: what has been committed wins over
 * what has been proposed, because a committed placement is a decision and a proposal is an
 * intention, and pricing a decision against an intention is how a family gets a number nobody
 * agreed to.
 *
 *   program        committed `child_placements.program_category_id`, else the proposal, else the assignment's own
 *   attendance     committed primary pattern's schedule type, else the proposal's, else the assignment's
 *   days a week    the committed PRIMARY `schedule_assignments` pattern, else the proposal's weekdays /
 *                  requested days, else the assignment's requested days
 *   site           the committed placement's site, else the proposal's, else the assignment's
 *   date           the caller's date, else the proposal's start, else the assignment's, else today
 *
 * THE PROPOSAL is the child's enrollment process instance metadata — the PRE-MATERIALISATION
 * participation facts the Assignment editor's Save writes (`applyChildParticipationEdit`) and Create
 * Lead seeds. The documented priority (`inquiryChildrenProcessDraftFactsOverlay`) is committed >
 * proposal > assignment row. This reader used to skip the middle tier, so a lead's saved schedule —
 * weekdays, schedule type, start, even the program — never reached tuition, and every lead read as
 * `missing_required_input` ("No rate matches this assignment"). Measured on staging: Lennon
 * Kurzman's proposal carried program `toddler` while the assignment row carried nothing.
 *
 * The provenance of each choice travels with the facts, because "why is this family priced at five
 * days" is answerable only if the record says which owner said five.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAssignmentTimes } from "@/lib/assignmentTime/resolveAssignmentTime";
import { DATED_ROW_STATUSES, rowEffectiveOn } from "@/lib/childcareOperational/expectations/scheduleExpectationCore";
import type { AssignmentPricingFacts } from "@/lib/commercial/execution/evaluate/resolveOptions";
import { REQUESTED_DAYS_PER_WEEK_METADATA_KEY } from "@/lib/enrollment/effectiveDateAuthority";
import { listEnrollmentInstancesForLead } from "@/lib/process/processInstances";

/** Which owner supplied each fact. Carried into the accepted term's provenance. */
export type AssignmentFactSources = {
    programKey: "committed_placement" | "proposal" | "assignment" | "none";
    attendanceType?: "committed_schedule" | "proposal" | "assignment" | "none";
    daysPerWeek: "committed_schedule" | "proposal" | "requested" | "none";
    locationId: "committed_placement" | "proposal" | "assignment" | "none";
    /*
     * `assignment_desired_start` is GONE, and its absence is the point. It named a second column,
     * `desired_start_date`, which `20260711000000_enrollment_participation_canonical_fields`
     * RENAMED to `start_date` — they were never two dates, and since that migration they are not
     * even two names. Keeping the value would invite the select that asks for both.
     */
    asOf: "requested" | "proposal_start" | "assignment_start" | "today";
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

type DatedPricingRow = Record<string, unknown> & {
    enrollment_agreement_id: string;
    start_date: string;
    end_date: string | null;
    status: string;
};

/** The row in effect on `date`; without a date, or when none covers it, the newest open-ended live row (rows arrive newest first). */
function rowInEffect(rows: DatedPricingRow[], date: string | null): DatedPricingRow | null {
    return (date ? rowEffectiveOn(rows, date) : null) ?? rows.find((r) => r.end_date == null && LIVE_ROW_STATUSES.has(r.status)) ?? null;
}

const LIVE_ROW_STATUSES = new Set(["planned", "active", "ending"]);

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
        /*
         * `desired_start_date` IS NOT A COLUMN. `20260711000000_enrollment_participation_canonical_fields`
         * renamed it to `start_date` — the canonical per-child start — and this select kept asking
         * for both. PostgREST answered `42703 column
         * opportunity_customer_members.desired_start_date does not exist`, so EVERY assignment
         * pricing read failed, on every tenant, since July.
         *
         * Nothing said so. The error became `{ ok: false, code: "db_error" }`, which
         * `buildAssignmentTuitionView` turned into `null`, which `buildOpportunityTuitionViews`
         * dropped — and the surface reported "No assignment on this record to price." This is the
         * SAME defect this module's sibling route already carried once: a select left pointing at
         * columns a July migration had renamed, invisible because its tests built their own rows.
         */
        .select("id, opportunity_id, customer_member_id, schedule_type, location_id, program_category_id, start_date, metadata")
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
    let scheduleTypeKey: string | null = null;
    if (agreement) {
        /*
         * THE ROWS IN EFFECT ON THE DATE BEING PRICED (V7 C1). A future-dated change closes today's
         * primary and placement (`superseded`, ending the day before) and opens their successors from
         * the change date. Reading "the open-ended row" priced today at the successor's schedule
         * before it began. A caller that names the date being priced now gets the row whose window
         * covers it — the window rule expectations and homerooms already use (`rowEffectiveOn`).
         * Without a named date, or on a date no row covers (an enrolment priced before it starts), the
         * former answer stands: the newest open-ended live row. (Unnamed, `asOf` defaults to the
         * enrolment's start, and pricing today's quote at the schedule of that day would be a new
         * rule, not this repair.) Proven live: `tests/enrollment/live/c1PricingFactsProbe.live.test.ts`.
         */
        const pricedOn = t(args.asOf) || null;
        const { data: placementRows } = await supabase
            .from("child_placements")
            .select("id, enrollment_agreement_id, site_location_id, program_category_id, room_location_id, start_date, end_date, status")
            .eq("org_id", args.orgId)
            .eq("enrollment_agreement_id", agreement.id)
            .in("status", [...DATED_ROW_STATUSES])
            .order("start_date", { ascending: false });
        placement = rowInEffect((placementRows ?? []) as DatedPricingRow[], pricedOn);

        /*
         * THE PRIMARY's schedule, never "the latest open row". A committed secondary (Before Care,
         * Enrichment …) carries the same agreement, so reading the latest-starting open row let a
         * three-day secondary that began after a five-day primary price the child at three days —
         * and made an accepted five-day term read as stale. Proven live:
         * `tests/enrollment/live/primaryTuitionFacts.live.test.ts`.
         */
        const { data: assignmentRows } = await supabase
            .from("schedule_assignments")
            .select("id, enrollment_agreement_id, schedule_pattern_id, start_date, end_date, status")
            .eq("org_id", args.orgId)
            .eq("enrollment_agreement_id", agreement.id)
            .eq("is_primary", true)
            .in("status", [...DATED_ROW_STATUSES])
            .order("start_date", { ascending: false });
        const primary = rowInEffect((assignmentRows ?? []) as DatedPricingRow[], pricedOn);
        const patternId = t(primary?.schedule_pattern_id);
        if (patternId) {
            const { data: pattern } = await supabase
                .from("schedule_patterns")
                .select("id, weekdays, schedule_type_key")
                .eq("org_id", args.orgId)
                .eq("id", patternId)
                .maybeSingle();
            const weekdays = (pattern as { weekdays?: unknown[] } | null)?.weekdays;
            if (Array.isArray(weekdays)) scheduleDays = weekdays.length;
            scheduleTypeKey = t((pattern as { schedule_type_key?: unknown } | null)?.schedule_type_key) || null;
        }
        /*
         * THE DAYS THE CHILD ATTENDS — the primary's own Assignment Time when it has one (V7 C1). A
         * custom week (S3/A6) is carried by a pattern whose weekdays are not the chosen days; counting
         * the pattern priced a Tue/Thu child at five days. Without intervals the pattern decides, as
         * in expectations (`recurringWeekdays`).
         */
        const primaryId = t(primary?.id);
        if (primaryId) {
            try {
                const own = (await resolveAssignmentTimes(supabase, { orgId: args.orgId, assignmentIds: [primaryId] })).get(primaryId);
                if (own?.hasIntervals) scheduleDays = new Set(own.weekdays).size;
            } catch {
                // An unreadable Assignment Time leaves the pattern's count — the former answer.
            }
        }
    }

    // ── The proposal, while nothing is committed ─────────────────────────────────────────────
    const proposal = agreement ? null : await readProposalFacts(supabase, args.orgId, t(ocm.opportunity_id), customerMemberId);

    // ── Program: the key, never the id — Commercial authors against `program_key` ────────────
    const programCategoryId =
        t(placement?.program_category_id) || t(proposal?.programCategoryId) || t(ocm.program_category_id);
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
            : proposal?.daysPerWeek != null
              ? proposal.daysPerWeek
              : Number.isFinite(requestedDays as number)
                ? (requestedDays as number)
                : null;

    // ── The date being priced ────────────────────────────────────────────────────────────────
    const requestedAsOf = t(args.asOf);
    const proposalStart = t(proposal?.startDate);
    const assignmentStart = t(ocm.start_date);
    const asOf = requestedAsOf || proposalStart || assignmentStart || todayYmd();
    const attendanceType = scheduleTypeKey || t(proposal?.scheduleType) || t(ocm.schedule_type) || null;

    const sources: AssignmentFactSources = {
        programKey: t(placement?.program_category_id)
            ? "committed_placement"
            : t(proposal?.programCategoryId)
              ? "proposal"
              : t(ocm.program_category_id)
                ? "assignment"
                : "none",
        attendanceType: scheduleTypeKey
            ? "committed_schedule"
            : t(proposal?.scheduleType)
              ? "proposal"
              : t(ocm.schedule_type)
                ? "assignment"
                : "none",
        daysPerWeek:
            scheduleDays != null
                ? "committed_schedule"
                : proposal?.daysPerWeek != null
                  ? "proposal"
                  : daysPerWeek != null
                    ? "requested"
                    : "none",
        locationId: t(placement?.site_location_id)
            ? "committed_placement"
            : t(proposal?.locationId)
              ? "proposal"
              : t(ocm.location_id)
                ? "assignment"
                : "none",
        asOf: requestedAsOf
            ? "requested"
            : proposalStart
              ? "proposal_start"
              : assignmentStart
                ? "assignment_start"
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
            attendanceType,
            daysPerWeek,
            locationId: t(placement?.site_location_id) || t(proposal?.locationId) || t(ocm.location_id) || null,
            // Funding attribution is Thread 6's. Private pay is the only payer this platform can
            // honestly claim today, and claiming it explicitly beats leaving it implied.
            payerType: "private_pay",
            cadenceKey: t(args.cadenceKey) || null,
            asOf,
        },
        sources,
    };
}

/** The pre-materialisation participation facts on the child's enrollment process instance. */
export type ProposalFacts = {
    programCategoryId: string | null;
    scheduleType: string | null;
    daysPerWeek: number | null;
    startDate: string | null;
    locationId: string | null;
};

/** Pure: the proposal's pricing facts from process-instance metadata. Exported for tests. */
export function proposalFactsFromMetadata(meta: Record<string, unknown> | null | undefined): ProposalFacts {
    const m = meta ?? {};
    const weekdays = Array.isArray(m.weekdays) ? (m.weekdays as unknown[]).filter((d) => Number.isInteger(Number(d))) : null;
    const requested = m[REQUESTED_DAYS_PER_WEEK_METADATA_KEY];
    const requestedDays = requested == null || requested === "" ? null : Number(requested);
    return {
        programCategoryId: t(m.program_category_id) || null,
        scheduleType: t(m.schedule_type) || null,
        // Exact weekdays describe the week; requested days are the fallback when they are unknown.
        daysPerWeek:
            weekdays && weekdays.length > 0
                ? new Set(weekdays.map(Number)).size
                : Number.isFinite(requestedDays as number) && (requestedDays as number) > 0
                  ? (requestedDays as number)
                  : null,
        startDate: t(m.start_date) || null,
        locationId: t(m.site_location_id) || t(m.location_id) || null,
    };
}

async function readProposalFacts(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    customerMemberId: string,
): Promise<ProposalFacts | null> {
    if (!opportunityId || !customerMemberId) return null;
    // The same lead-scoped reader the Focus Panel's draft overlay uses (both journey anchors).
    const instances = await listEnrollmentInstancesForLead(supabase, { orgId, opportunityId });
    const mine = instances
        .filter((pi) => pi.subject_id === customerMemberId)
        .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    if (!mine.length) return null;
    return proposalFactsFromMetadata(mine[0]!.metadata);
}
