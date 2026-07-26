/**
 * Load active org Assignment Types for operator pickers (create / duplicate).
 * Presentation only — configuration ownership stays on `operational_assignment_types`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssignmentTypePresentation } from "@/lib/scheduling/projection/schedulingProjectionTypes";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";

type AssignmentTypeRow = {
    id: string;
    key: string;
    label: string;
    icon_key: string | null;
    visual_tone: AssignmentTypePresentation["visualTone"];
    billing_participation: AssignmentTypePresentation["billingParticipation"];
    attendance_participation: AssignmentTypePresentation["attendanceParticipation"];
    staffing_participation: AssignmentTypePresentation["staffingParticipation"];
    subject_types: string[] | null;
    sort_order: number | null;
};

export type OrgAssignmentTypeOption = AssignmentTypePresentation & {
    subjectTypes: Array<"child" | "staff">;
    sortOrder: number;
};

function mapRow(raw: AssignmentTypeRow): OrgAssignmentTypeOption {
    const subjectTypes = (raw.subject_types ?? ["child"]).filter(
        (s): s is "child" | "staff" => s === "child" || s === "staff"
    );
    return {
        id: raw.id,
        key: raw.key,
        label: raw.label,
        iconKey: raw.icon_key,
        visualTone: raw.visual_tone,
        billingParticipation: raw.billing_participation,
        attendanceParticipation: raw.attendance_participation,
        staffingParticipation: raw.staffing_participation,
        subjectTypes: subjectTypes.length ? subjectTypes : ["child"],
        sortOrder: raw.sort_order ?? 100,
    };
}

/** Active Assignment Types for an org, sorted for operator pickers. */
export async function loadOrgAssignmentTypes(
    supabase: SupabaseClient,
    orgId: string,
    opts?: { subjectType?: "child" | "staff" }
): Promise<OrgAssignmentTypeOption[]> {
    const { data, error } = await supabase
        .from("operational_assignment_types")
        .select(
            "id, key, label, icon_key, visual_tone, billing_participation, attendance_participation, staffing_participation, subject_types, sort_order"
        )
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    const rows = ((data ?? []) as AssignmentTypeRow[]).map(mapRow);
    if (!opts?.subjectType) return rows;
    return rows.filter((t) => t.subjectTypes.includes(opts.subjectType!));
}
