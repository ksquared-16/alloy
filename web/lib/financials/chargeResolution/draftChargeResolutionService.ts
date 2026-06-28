/**
 * Draft Charge Resolution service (P3.3) — DB orchestration.
 *
 * Turns committed enrollment intent + a service period into an IDEMPOTENT draft
 * childcare charge using:
 *   - committed enrollment agreement (responsibility + billable source)
 *   - active schedule assignment + pattern (schedule basis + scheduled days)
 *   - committed placement (program / room / age group)
 *   - resolved rate (P3.2 Rate Resolution)
 *   - P2 attendance facts (only for the `attendance_actual` strategy)
 *
 * Strictly Financial Resolution, NOT Posting:
 *   - only ever writes DRAFT charges, via `childcareChargeService`
 *   - idempotent on (agreement, period, schedule_basis, rate_rule)
 *   - recalculates an existing draft in place (safe pre-post recompute)
 *   - NEVER mutates a posted charge (it is skipped and reported)
 *   - no invoices, AR, ledger, payments, subsidy, or job-table coupling
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { getAgreementById } from "@/lib/childcareOperational/enrollmentAgreementService";
import { listAttendanceEvents } from "@/lib/childcareOperational/attendance/attendanceService";
import { summarizeAttendanceByDay } from "@/lib/childcareOperational/attendance/attendanceFold";
import { loadExpectationAgeGroups } from "@/lib/childcareOperational/expectations/resolveExpectationAgeGroups";
import {
    createChildcareDraftCharge,
    recalculateDraftCharge,
    type ChargeRow,
} from "@/lib/financials/childcareChargeService";
import { fetchResolvedRate } from "@/lib/financials/rates/rateConfigService";
import { resolveScheduleBasis } from "@/lib/financials/chargeResolution/scheduleBasis";
import { scheduledServiceDates } from "@/lib/financials/chargeResolution/billableQuantity";
import { resolveChargeResponsibility } from "@/lib/financials/chargeResolution/responsibility";
import {
    resolveDraftTuitionCharge,
    type DraftChargeIntent,
    type ServicePeriod,
} from "@/lib/financials/chargeResolution/resolveDraftCharges";
import type { ScheduleBasis } from "@/lib/financials/rates/rateTypes";

const ROW_OPERATIONAL = new Set(["planned", "active", "ending"]);
const BILLABLE_SOURCE_ENROLLMENT = "enrollment_agreement";

export type ResolveDraftChargeArgs = {
    orgId: string;
    enrollmentAgreementId: string;
    period: ServicePeriod;
    /** Defaults to `period.start` for rate effective-dating. */
    asOfDate?: string;
    /** Disambiguate when an org runs multiple named plans at a scope. */
    planKey?: string | null;
    /** Authoritative per-pattern schedule-basis override. */
    scheduleBasisByPatternId?: Record<string, ScheduleBasis | null | undefined>;
    /** Override age-group resolution (else derived from placement). */
    ageGroupKey?: string | null;
};

export type DraftChargeOutcome =
    | { status: "created"; charge: ChargeRow; resolutionKey: string }
    | { status: "recalculated"; charge: ChargeRow; resolutionKey: string }
    | { status: "unchanged"; charge: ChargeRow; resolutionKey: string }
    | { status: "skipped_posted"; charge: ChargeRow; resolutionKey: string }
    | { status: "unresolved"; reason: string };

function operationalRow<T extends { status?: unknown; start_date?: unknown; end_date?: unknown }>(
    rows: readonly T[],
    onDate: string
): T | null {
    for (const r of rows) {
        if (!ROW_OPERATIONAL.has(String(r.status))) continue;
        const start = r.start_date == null ? null : String(r.start_date);
        const end = r.end_date == null ? null : String(r.end_date);
        if (start && onDate < start) continue;
        if (end && onDate > end) continue;
        return r;
    }
    return null;
}

async function loadActiveAssignmentPattern(
    supabase: SupabaseClient,
    orgId: string,
    agreementId: string,
    onDate: string
): Promise<{ pattern: { id: string; weekdays: number[]; schedule_type_key: string; metadata?: Record<string, unknown> } } | null> {
    const { data: assignmentData, error: assignmentError } = await supabase
        .from("schedule_assignments")
        .select("schedule_pattern_id, start_date, end_date, status")
        .eq("org_id", orgId)
        .eq("enrollment_agreement_id", agreementId);
    if (assignmentError) throw new OperationalEnrollmentServiceError("db_error", assignmentError.message);
    const assignment = operationalRow(
        (assignmentData ?? []) as { schedule_pattern_id: string; start_date: string; end_date: string | null; status: string }[],
        onDate
    );
    if (!assignment) return null;

    const { data: patternData, error: patternError } = await supabase
        .from("schedule_patterns")
        .select("id, weekdays, schedule_type_key, metadata")
        .eq("org_id", orgId)
        .eq("id", assignment.schedule_pattern_id)
        .maybeSingle();
    if (patternError) throw new OperationalEnrollmentServiceError("db_error", patternError.message);
    if (!patternData) return null;
    return { pattern: patternData as { id: string; weekdays: number[]; schedule_type_key: string; metadata?: Record<string, unknown> } };
}

async function loadActivePlacement(
    supabase: SupabaseClient,
    orgId: string,
    agreementId: string,
    onDate: string
): Promise<{ program_category_id: string | null; room_location_id: string | null } | null> {
    const { data, error } = await supabase
        .from("child_placements")
        .select("program_category_id, room_location_id, start_date, end_date, status")
        .eq("org_id", orgId)
        .eq("enrollment_agreement_id", agreementId);
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    const placement = operationalRow(
        (data ?? []) as { program_category_id: string | null; room_location_id: string | null; start_date: string; end_date: string | null; status: string }[],
        onDate
    );
    return placement
        ? { program_category_id: placement.program_category_id, room_location_id: placement.room_location_id }
        : null;
}

async function attendedDatesInPeriod(
    supabase: SupabaseClient,
    orgId: string,
    agreementId: string,
    period: ServicePeriod
): Promise<string[]> {
    const events = await listAttendanceEvents(supabase, orgId, { enrollmentAgreementId: agreementId });
    return summarizeAttendanceByDay(events)
        .filter((d) => d.present && d.serviceDate >= period.start && d.serviceDate <= period.end)
        .map((d) => d.serviceDate);
}

async function findExistingByResolutionKey(
    supabase: SupabaseClient,
    orgId: string,
    agreementId: string,
    resolutionKey: string
): Promise<ChargeRow | null> {
    const { data, error } = await supabase
        .from("charges")
        .select(
            "id, org_id, job_id, source_charge_id, billable_source_type, billable_source_id, charge_type, charge_category, status, currency_code, amount_cents, service_date, due_date, posted_at, voided_at, description, metadata, created_at, updated_at"
        )
        .eq("org_id", orgId)
        .eq("billable_source_type", BILLABLE_SOURCE_ENROLLMENT)
        .eq("billable_source_id", agreementId);
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    const rows = (data ?? []) as ChargeRow[];
    const match = rows.find(
        (c) =>
            c.voided_at == null &&
            (c.metadata as Record<string, unknown> | null)?.["resolution_key"] === resolutionKey
    );
    return match ?? null;
}

function draftNeedsRecalc(existing: ChargeRow, intent: DraftChargeIntent): boolean {
    return (
        existing.amount_cents !== intent.amountCents ||
        existing.charge_category !== intent.chargeCategory ||
        existing.currency_code !== intent.currencyCode ||
        existing.service_date !== intent.serviceDate ||
        existing.description !== intent.description ||
        JSON.stringify(existing.metadata ?? {}) !== JSON.stringify(intent.metadata)
    );
}

/**
 * Resolve and idempotently persist a single tuition draft charge for an
 * agreement + service period. Returns a structured outcome (never throws for a
 * non-billable resolution).
 */
export async function resolveDraftChargeForAgreementPeriod(
    supabase: SupabaseClient,
    args: ResolveDraftChargeArgs
): Promise<DraftChargeOutcome> {
    const orgId = args.orgId?.trim();
    const agreementId = args.enrollmentAgreementId?.trim();
    if (!orgId || !agreementId) {
        throw new OperationalEnrollmentServiceError("invalid_input", "orgId and enrollmentAgreementId are required");
    }
    const asOf = args.asOfDate ?? args.period.start;

    const agreement = await getAgreementById(supabase, orgId, agreementId);
    if (!agreement) {
        throw new OperationalEnrollmentServiceError("not_found", `agreement ${agreementId} not found`);
    }

    const assignment = await loadActiveAssignmentPattern(supabase, orgId, agreementId, asOf);
    if (!assignment) return { status: "unresolved", reason: "no_schedule_assignment" };

    const scheduleBasis = resolveScheduleBasis(assignment.pattern, {
        scheduleBasisByPatternId: args.scheduleBasisByPatternId,
    });
    if (!scheduleBasis) return { status: "unresolved", reason: "unresolved_schedule_basis" };

    const placement = await loadActivePlacement(supabase, orgId, agreementId, asOf);

    let ageGroupKey = args.ageGroupKey ?? null;
    if (args.ageGroupKey === undefined && placement) {
        const maps = await loadExpectationAgeGroups(supabase, orgId, {
            programCategoryIds: placement.program_category_id ? [placement.program_category_id] : [],
            roomLocationIds: placement.room_location_id ? [placement.room_location_id] : [],
        });
        ageGroupKey =
            (placement.program_category_id ? maps.ageGroupByProgramCategoryId[placement.program_category_id] : null) ??
            (placement.room_location_id ? maps.ageGroupByRoomLocationId[placement.room_location_id] : null) ??
            null;
    }

    const rate = await fetchResolvedRate(
        supabase,
        orgId,
        {
            siteLocationId: agreement.site_location_id,
            programCategoryId: placement?.program_category_id ?? null,
            roomLocationId: placement?.room_location_id ?? null,
            ageGroupKey,
            scheduleBasis,
            planKey: args.planKey ?? null,
        },
        asOf
    );
    if (!rate.resolved) return { status: "unresolved", reason: `no_rate:${rate.reason}` };

    const scheduledDates = scheduledServiceDates(args.period.start, args.period.end, assignment.pattern.weekdays);
    const attendedDates =
        rate.calculationStrategy === "attendance_actual"
            ? await attendedDatesInPeriod(supabase, orgId, agreementId, args.period)
            : undefined;

    const responsibility = resolveChargeResponsibility({
        customer_id: agreement.customer_id,
        customer_member_id: agreement.customer_member_id,
    });

    const resolution = resolveDraftTuitionCharge({
        orgId,
        enrollmentAgreementId: agreementId,
        period: args.period,
        rate,
        responsibility,
        signal: { scheduledDates, attendedDates },
    });
    if (!resolution.resolved) return { status: "unresolved", reason: resolution.reason };

    const existing = await findExistingByResolutionKey(supabase, orgId, agreementId, resolution.resolutionKey);
    if (existing) {
        if (existing.status !== "draft") {
            return { status: "skipped_posted", charge: existing, resolutionKey: resolution.resolutionKey };
        }
        if (!draftNeedsRecalc(existing, resolution)) {
            return { status: "unchanged", charge: existing, resolutionKey: resolution.resolutionKey };
        }
        const updated = await recalculateDraftCharge(supabase, {
            orgId,
            chargeId: existing.id,
            amountCents: resolution.amountCents,
            chargeCategory: resolution.chargeCategory,
            serviceDate: resolution.serviceDate,
            description: resolution.description,
            metadata: resolution.metadata,
        });
        return { status: "recalculated", charge: updated, resolutionKey: resolution.resolutionKey };
    }

    const created = await createChildcareDraftCharge(supabase, {
        orgId,
        enrollmentAgreementId: agreementId,
        chargeCategory: resolution.chargeCategory,
        amountCents: resolution.amountCents,
        currencyCode: resolution.currencyCode,
        serviceDate: resolution.serviceDate,
        description: resolution.description,
        metadata: resolution.metadata,
    });
    return { status: "created", charge: created, resolutionKey: resolution.resolutionKey };
}
