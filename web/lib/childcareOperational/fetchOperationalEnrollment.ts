/**
 * Client fetch + presentation helpers for operational enrollment read surfaces.
 */

import type {
    OperationalEnrollmentReadModel,
    OperationalEnrollmentWarningCode,
} from "@/lib/childcareOperational/operationalEnrollmentReadModel";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function trimOrNull(v: unknown): string | null {
    const s = v != null ? String(v).trim() : "";
    return s || null;
}

function isUuid(value: string | null): boolean {
    return value != null && UUID_RE.test(value);
}

export type OperationalEnrollmentSummaryResponse = {
    summary: OperationalEnrollmentReadModel;
};

export async function fetchOperationalEnrollmentSummary(params: {
    customerMemberId?: string | null;
    siteLocationId?: string | null;
    enrollmentAgreementId?: string | null;
}): Promise<OperationalEnrollmentSummaryResponse> {
    const search = new URLSearchParams();
    const customerMemberId = trimOrNull(params.customerMemberId);
    const siteLocationId = trimOrNull(params.siteLocationId);
    const enrollmentAgreementId = trimOrNull(params.enrollmentAgreementId);

    if (enrollmentAgreementId) {
        search.set("enrollment_agreement_id", enrollmentAgreementId);
    } else if (customerMemberId) {
        search.set("customer_member_id", customerMemberId);
        if (siteLocationId) search.set("site_location_id", siteLocationId);
    } else {
        throw new Error("customer_member_id or enrollment_agreement_id is required");
    }

    const res = await fetch(`/api/admin/operational-enrollment/summary?${search.toString()}`, {
        credentials: "include",
    });
    const json = (await res.json().catch(() => ({}))) as OperationalEnrollmentSummaryResponse & {
        error?: string;
    };
    if (!res.ok) {
        throw new Error(json.error ?? `Failed to load operational enrollment (${res.status})`);
    }
    return json;
}

export async function fetchChildEnrollmentAgreementsForOpportunity(opportunityId: string) {
    const search = new URLSearchParams({ opportunity_id: opportunityId });
    const res = await fetch(`/api/admin/child-enrollment-agreements?${search.toString()}`, {
        credentials: "include",
    });
    const json = (await res.json().catch(() => ({}))) as {
        agreements?: Array<{
            id: string;
            customer_member_id: string;
            opportunity_customer_member_id: string | null;
            status: string;
        }>;
        error?: string;
    };
    if (!res.ok) {
        throw new Error(json.error ?? `Failed to load agreements (${res.status})`);
    }
    return json.agreements ?? [];
}

export function resolveOperationalEnrollmentFetchParams(
    record: ProofRuntimeRecord
): { customerMemberId: string | null; siteLocationId: string | null } {
    const customerMemberId =
        trimOrNull(record.customer_member_id) ?? trimOrNull(record["child.customer_member_id"]);

    let siteLocationId =
        trimOrNull(record["inquiry_child.location_id"]) ?? trimOrNull(record.location_id);

    if (!isUuid(siteLocationId)) {
        siteLocationId = null;
    }

    const mirror = record._enrollment_mirror;
    if (!siteLocationId && Array.isArray(mirror) && mirror.length > 0) {
        const first = mirror[0] as { location_id?: string | null };
        const mirrorSite = trimOrNull(first.location_id);
        if (isUuid(mirrorSite)) siteLocationId = mirrorSite;
    }

    return { customerMemberId, siteLocationId };
}

export const OPERATIONAL_ENROLLMENT_WARNING_LABELS: Record<OperationalEnrollmentWarningCode, string> = {
    missing_placement: "Missing placement",
    missing_schedule_assignment: "Missing schedule assignment",
    schedule_pattern_unresolved: "Schedule pattern unresolved",
    agreement_ending: "Agreement ending",
    agreement_ended: "Agreement ended",
};

export function formatOperationalEnrollmentAgreementStatus(status: string | null | undefined): string {
    const raw = trimOrNull(status);
    if (!raw) return "—";
    return raw.replace(/_/g, " ");
}

export function formatOperationalEnrollmentDate(value: string | null | undefined): string {
    const raw = trimOrNull(value);
    if (!raw) return "—";
    return raw.length >= 10 ? raw.slice(0, 10) : raw;
}

export type SchedulePatternRow = {
    id: string;
    org_id: string;
    site_location_id: string;
    key: string;
    label: string;
    schedule_type_key: string;
    weekdays: number[];
    sort_order: number;
    is_active: boolean;
    metadata?: Record<string, unknown>;
};

export async function fetchSchedulePatternsForSite(siteLocationId: string): Promise<SchedulePatternRow[]> {
    const search = new URLSearchParams({ site_location_id: siteLocationId });
    const res = await fetch(`/api/admin/schedule-patterns?${search.toString()}`, { credentials: "include" });
    const json = (await res.json().catch(() => ({}))) as { patterns?: SchedulePatternRow[]; error?: string };
    if (!res.ok) throw new Error(json.error ?? `Failed to load schedule patterns (${res.status})`);
    return json.patterns ?? [];
}

export async function createSchedulePattern(input: {
    site_location_id: string;
    key: string;
    label: string;
    schedule_type_key: string;
    weekdays: number[];
    sort_order?: number;
}): Promise<SchedulePatternRow> {
    const res = await fetch("/api/admin/schedule-patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
    });
    const json = (await res.json().catch(() => ({}))) as { pattern?: SchedulePatternRow; error?: string };
    if (!res.ok) throw new Error(json.error ?? `Failed to create schedule pattern (${res.status})`);
    if (!json.pattern) throw new Error("Schedule pattern missing from response");
    return json.pattern;
}

export async function patchSchedulePattern(
    patternId: string,
    patch: Partial<{
        label: string;
        schedule_type_key: string;
        weekdays: number[];
        sort_order: number;
        is_active: boolean;
    }>
): Promise<SchedulePatternRow> {
    const res = await fetch(`/api/admin/schedule-patterns/${patternId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
    });
    const json = (await res.json().catch(() => ({}))) as { pattern?: SchedulePatternRow; error?: string };
    if (!res.ok) throw new Error(json.error ?? `Failed to update schedule pattern (${res.status})`);
    if (!json.pattern) throw new Error("Schedule pattern missing from response");
    return json.pattern;
}

export const WEEKDAY_OPTIONS = [
    { value: 0, label: "Sun" },
    { value: 1, label: "Mon" },
    { value: 2, label: "Tue" },
    { value: 3, label: "Wed" },
    { value: 4, label: "Thu" },
    { value: 5, label: "Fri" },
    { value: 6, label: "Sat" },
] as const;

export function formatWeekdaySelection(weekdays: number[]): string {
    const labels = WEEKDAY_OPTIONS.filter((d) => weekdays.includes(d.value)).map((d) => d.label);
    return labels.join(", ");
}
