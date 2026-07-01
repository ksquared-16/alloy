import type { SupabaseClient } from "@supabase/supabase-js";
import {
    getAgreementById,
    getOperationalAgreementForMemberSite,
} from "@/lib/childcareOperational/enrollmentAgreementService";
import { getOperationalPlacementForAgreement } from "@/lib/childcareOperational/childPlacementService";
import { getOperationalScheduleAssignmentForAgreement } from "@/lib/childcareOperational/scheduleAssignmentService";
import type {
    ChildEnrollmentAgreementRow,
    ChildPlacementRow,
    ProgramCategoryLabelRow,
    ScheduleAssignmentRow,
    SchedulePatternRow,
} from "@/lib/childcareOperational/enrollmentOperationalTypes";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { isPlacementOperationalStatus } from "@/lib/childcareOperational/enrollmentOperationalStatus";

export type OperationalEnrollmentWarningCode =
    | "missing_placement"
    | "missing_schedule_assignment"
    | "schedule_pattern_unresolved"
    | "agreement_ending"
    | "agreement_ended";

export type OperationalEnrollmentDisplayLabels = {
    site: string | null;
    program: string | null;
    room: string | null;
    schedule: string | null;
};

export type OperationalEnrollmentReadModel = {
    agreement: ChildEnrollmentAgreementRow | null;
    placement: ChildPlacementRow | null;
    scheduleAssignment: ScheduleAssignmentRow | null;
    schedulePattern: SchedulePatternRow | null;
    labels: OperationalEnrollmentDisplayLabels;
    warnings: OperationalEnrollmentWarningCode[];
};

function formatWeekdays(weekdays: number[]): string {
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return weekdays
        .slice()
        .sort((a, b) => a - b)
        .map((d) => names[d] ?? String(d))
        .join(", ");
}

async function resolveLocationLabel(
    supabase: SupabaseClient,
    orgId: string,
    locationId: string | null | undefined
): Promise<string | null> {
    if (!locationId) return null;
    const { data } = await supabase
        .from("locations")
        .select("label")
        .eq("org_id", orgId)
        .eq("id", locationId)
        .maybeSingle();
    const label = (data as { label?: string | null } | null)?.label;
    return label != null ? String(label).trim() || null : null;
}

async function resolveProgramLabel(
    supabase: SupabaseClient,
    orgId: string,
    programCategoryId: string | null | undefined
): Promise<string | null> {
    if (!programCategoryId) return null;
    const { data } = await supabase
        .from("location_program_categories")
        .select("label, key")
        .eq("org_id", orgId)
        .eq("id", programCategoryId)
        .maybeSingle();
    if (!data) return null;
    const row = data as ProgramCategoryLabelRow;
    return row.label?.trim() || row.key?.trim() || null;
}

async function loadSchedulePattern(
    supabase: SupabaseClient,
    orgId: string,
    patternId: string | null | undefined
): Promise<SchedulePatternRow | null> {
    if (!patternId) return null;
    const { data, error } = await supabase
        .from("schedule_patterns")
        .select("*")
        .eq("org_id", orgId)
        .eq("id", patternId)
        .maybeSingle();
    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
    return data ? (data as SchedulePatternRow) : null;
}

function buildWarnings(
    agreement: ChildEnrollmentAgreementRow | null,
    placement: ChildPlacementRow | null,
    scheduleAssignment: ScheduleAssignmentRow | null,
    schedulePattern: SchedulePatternRow | null
): OperationalEnrollmentWarningCode[] {
    const warnings: OperationalEnrollmentWarningCode[] = [];
    if (!agreement) return warnings;

    if (agreement.status === "ending") {
        warnings.push("agreement_ending");
    }
    if (agreement.status === "ended") {
        warnings.push("agreement_ended");
    }

    if (
        agreement.status !== "canceled" &&
        agreement.status !== "ended" &&
        !placement
    ) {
        warnings.push("missing_placement");
    }

    if (
        agreement.status !== "canceled" &&
        agreement.status !== "ended" &&
        !scheduleAssignment
    ) {
        warnings.push("missing_schedule_assignment");
    }

    if (scheduleAssignment && !schedulePattern) {
        warnings.push("schedule_pattern_unresolved");
    }

    const meta = agreement.metadata ?? {};
    if (meta.schedule_pattern_unresolved === true) {
        warnings.push("schedule_pattern_unresolved");
    }

    return warnings;
}

async function buildLabels(
    supabase: SupabaseClient,
    orgId: string,
    agreement: ChildEnrollmentAgreementRow | null,
    placement: ChildPlacementRow | null,
    schedulePattern: SchedulePatternRow | null
): Promise<OperationalEnrollmentDisplayLabels> {
    const siteLabel = agreement
        ? await resolveLocationLabel(supabase, orgId, agreement.site_location_id)
        : null;
    const programLabel = placement
        ? await resolveProgramLabel(supabase, orgId, placement.program_category_id)
        : null;
    const roomLabel = placement
        ? await resolveLocationLabel(supabase, orgId, placement.room_location_id)
        : null;

    let scheduleLabel: string | null = null;
    if (schedulePattern) {
        const weekdays = formatWeekdays(schedulePattern.weekdays ?? []);
        scheduleLabel = weekdays
            ? `${schedulePattern.label} (${weekdays})`
            : schedulePattern.label;
    }

    return {
        site: siteLabel,
        program: programLabel,
        room: roomLabel,
        schedule: scheduleLabel,
    };
}

export async function buildOperationalEnrollmentReadModelForAgreement(
    supabase: SupabaseClient,
    orgId: string,
    agreementId: string
): Promise<OperationalEnrollmentReadModel> {
    const agreement = await getAgreementById(supabase, orgId, agreementId);
    if (!agreement) {
        return {
            agreement: null,
            placement: null,
            scheduleAssignment: null,
            schedulePattern: null,
            labels: { site: null, program: null, room: null, schedule: null },
            warnings: [],
        };
    }

    const placement = await getOperationalPlacementForAgreement(supabase, orgId, agreementId);
    const scheduleAssignment = await getOperationalScheduleAssignmentForAgreement(
        supabase,
        orgId,
        agreementId
    );
    const schedulePattern = scheduleAssignment
        ? await loadSchedulePattern(supabase, orgId, scheduleAssignment.schedule_pattern_id)
        : null;

    const labels = await buildLabels(supabase, orgId, agreement, placement, schedulePattern);
    const warnings = buildWarnings(agreement, placement, scheduleAssignment, schedulePattern);

    return {
        agreement,
        placement,
        scheduleAssignment,
        schedulePattern,
        labels,
        warnings,
    };
}

export async function buildOperationalEnrollmentReadModelForMemberSite(
    supabase: SupabaseClient,
    orgId: string,
    customerMemberId: string,
    siteLocationId: string
): Promise<OperationalEnrollmentReadModel> {
    const agreement = await getOperationalAgreementForMemberSite(
        supabase,
        orgId,
        customerMemberId,
        siteLocationId
    );

    if (!agreement) {
        return {
            agreement: null,
            placement: null,
            scheduleAssignment: null,
            schedulePattern: null,
            labels: { site: null, program: null, room: null, schedule: null },
            warnings: [],
        };
    }

    return buildOperationalEnrollmentReadModelForAgreement(supabase, orgId, agreement.id);
}

/** Prefer most recent terminal agreement when no operational row exists (history display). */
export async function getLatestAgreementForMemberSite(
    supabase: SupabaseClient,
    orgId: string,
    customerMemberId: string,
    siteLocationId: string
): Promise<ChildEnrollmentAgreementRow | null> {
    const operational = await getOperationalAgreementForMemberSite(
        supabase,
        orgId,
        customerMemberId,
        siteLocationId
    );
    if (operational) return operational;

    const { data, error } = await supabase
        .from("child_enrollment_agreements")
        .select("*")
        .eq("org_id", orgId)
        .eq("customer_member_id", customerMemberId)
        .eq("site_location_id", siteLocationId)
        .in("status", ["ended", "canceled"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
    return data ? (data as ChildEnrollmentAgreementRow) : null;
}

export function isCurrentOperationalPlacement(placement: ChildPlacementRow | null): boolean {
    return placement != null && isPlacementOperationalStatus(placement.status);
}
