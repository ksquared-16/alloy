/**
 * Client mutations for childcare operational enrollment edit flows (Batch 5).
 */

import type {
    ChildEnrollmentAgreementRow,
    ChildPlacementRow,
    ScheduleAssignmentRow,
} from "@/lib/childcareOperational/enrollmentOperationalTypes";
import type { SchedulePatternRow } from "@/lib/childcareOperational/fetchOperationalEnrollment";

async function postOperationalEnrollmentJson<T>(
    url: string,
    body?: Record<string, unknown>
): Promise<T> {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: body != null ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) {
        throw new Error(json.error ?? `Request failed (${res.status})`);
    }
    return json;
}

export async function submitChildPlacement(input: {
    enrollment_agreement_id: string;
    start_date: string;
    supersede: boolean;
    program_category_id?: string | null;
    room_location_id?: string | null;
    reason_key?: string | null;
    source_key?: string;
}): Promise<ChildPlacementRow> {
    const json = await postOperationalEnrollmentJson<{ placement?: ChildPlacementRow }>(
        "/api/admin/child-placements",
        {
            enrollment_agreement_id: input.enrollment_agreement_id,
            start_date: input.start_date,
            supersede: input.supersede,
            program_category_id: input.program_category_id ?? null,
            room_location_id: input.room_location_id ?? null,
            reason_key: input.reason_key ?? null,
            source_key: input.source_key ?? "operator_edit",
        }
    );
    if (!json.placement) throw new Error("Placement missing from response");
    return json.placement;
}

export async function submitScheduleAssignment(input: {
    enrollment_agreement_id: string;
    schedule_pattern_id: string;
    start_date: string;
    supersede: boolean;
    source_key?: string;
}): Promise<ScheduleAssignmentRow> {
    const json = await postOperationalEnrollmentJson<{ assignment?: ScheduleAssignmentRow }>(
        "/api/admin/schedule-assignments",
        {
            enrollment_agreement_id: input.enrollment_agreement_id,
            schedule_pattern_id: input.schedule_pattern_id,
            start_date: input.start_date,
            supersede: input.supersede,
            source_key: input.source_key ?? "operator_edit",
        }
    );
    if (!json.assignment) throw new Error("Schedule assignment missing from response");
    return json.assignment;
}

export async function markChildEnrollmentAgreementEnding(
    agreementId: string,
    endDate: string
): Promise<ChildEnrollmentAgreementRow> {
    const json = await postOperationalEnrollmentJson<{ agreement?: ChildEnrollmentAgreementRow }>(
        `/api/admin/child-enrollment-agreements/${agreementId}/ending`,
        { end_date: endDate }
    );
    if (!json.agreement) throw new Error("Agreement missing from response");
    return json.agreement;
}

export async function markChildEnrollmentAgreementEnded(
    agreementId: string,
    endDate?: string | null
): Promise<ChildEnrollmentAgreementRow> {
    const body =
        endDate?.trim() ?
            { end_date: endDate.trim() }
        :   undefined;
    const json = await postOperationalEnrollmentJson<{ agreement?: ChildEnrollmentAgreementRow }>(
        `/api/admin/child-enrollment-agreements/${agreementId}/ended`,
        body
    );
    if (!json.agreement) throw new Error("Agreement missing from response");
    return json.agreement;
}

export async function cancelChildEnrollmentAgreementBeforeStart(
    agreementId: string
): Promise<ChildEnrollmentAgreementRow> {
    const json = await postOperationalEnrollmentJson<{ agreement?: ChildEnrollmentAgreementRow }>(
        `/api/admin/child-enrollment-agreements/${agreementId}/cancel`
    );
    if (!json.agreement) throw new Error("Agreement missing from response");
    return json.agreement;
}

export async function fetchActiveSchedulePatternsForSite(
    siteLocationId: string
): Promise<SchedulePatternRow[]> {
    const search = new URLSearchParams({
        site_location_id: siteLocationId,
        is_active: "true",
    });
    const res = await fetch(`/api/admin/schedule-patterns?${search.toString()}`, {
        credentials: "include",
    });
    const json = (await res.json().catch(() => ({}))) as {
        patterns?: SchedulePatternRow[];
        error?: string;
    };
    if (!res.ok) {
        throw new Error(json.error ?? `Failed to load schedule patterns (${res.status})`);
    }
    return json.patterns ?? [];
}

/** Org-local today approximation for client validation (server enforces org calendar). */
export function operationalEnrollmentClientTodayYmd(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
