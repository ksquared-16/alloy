/**
 * Assignment Type CRUD — org-scoped configuration on `operational_assignment_types`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { SCHEDULE_ASSIGNMENT_OPERATIONAL_STATUSES } from "@/lib/childcareOperational/enrollmentOperationalStatus";
import type { AssignmentTypePresentation } from "@/lib/scheduling/projection/schedulingProjectionTypes";
import {
    defaultVisualToneForAssignmentTypeLabel,
    readAssignmentTypeBehavior,
    slugAssignmentTypeKey,
    writeAssignmentTypeBehavior,
    type AssignmentTypeBehavior,
} from "@/lib/operationalAssignments/assignmentTypeBehavior";

type AssignmentTypeRow = {
    id: string;
    org_id: string;
    key: string;
    label: string;
    icon_key: string | null;
    visual_tone: AssignmentTypePresentation["visualTone"];
    subject_types: string[] | null;
    default_behavior: Record<string, unknown> | null;
    billing_participation: AssignmentTypePresentation["billingParticipation"];
    attendance_participation: AssignmentTypePresentation["attendanceParticipation"];
    staffing_participation: AssignmentTypePresentation["staffingParticipation"];
    sort_order: number | null;
    is_active: boolean;
};

export type AssignmentTypeAdminRecord = AssignmentTypePresentation & {
    subjectTypes: Array<"child" | "staff">;
    sortOrder: number;
    isActive: boolean;
    behavior: AssignmentTypeBehavior;
};

export type AssignmentTypeWriteInput = {
    label: string;
    iconKey?: string;
    visualTone?: AssignmentTypePresentation["visualTone"];
    subjectTypes?: Array<"child" | "staff">;
    billingParticipation?: AssignmentTypePresentation["billingParticipation"];
    attendanceParticipation?: AssignmentTypePresentation["attendanceParticipation"];
    staffingParticipation?: AssignmentTypePresentation["staffingParticipation"];
    sortOrder?: number;
    behavior?: AssignmentTypeBehavior;
};

function mapAdminRow(raw: AssignmentTypeRow): AssignmentTypeAdminRecord {
    const subjectTypes = (raw.subject_types ?? ["child"]).filter(
        (s): s is "child" | "staff" => s === "child" || s === "staff",
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
        isActive: raw.is_active,
        behavior: readAssignmentTypeBehavior(raw.default_behavior),
    };
}

const SELECT_COLS =
    "id, org_id, key, label, icon_key, visual_tone, subject_types, default_behavior, billing_participation, attendance_participation, staffing_participation, sort_order, is_active";

export async function loadOrgAssignmentTypesAdmin(
    supabase: SupabaseClient,
    orgId: string,
): Promise<AssignmentTypeAdminRecord[]> {
    const { data, error } = await supabase
        .from("operational_assignment_types")
        .select(SELECT_COLS)
        .eq("org_id", orgId)
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    return ((data ?? []) as AssignmentTypeRow[]).map(mapAdminRow);
}

function behaviorPayload(behavior?: AssignmentTypeBehavior): Record<string, unknown> {
    if (!behavior) return {};
    return writeAssignmentTypeBehavior(behavior) as Record<string, unknown>;
}

export async function createOrgAssignmentType(
    supabase: SupabaseClient,
    orgId: string,
    input: AssignmentTypeWriteInput,
): Promise<AssignmentTypeAdminRecord> {
    const label = input.label.trim();
    if (!label) throw new OperationalEnrollmentServiceError("invalid_input", "Name is required");
    const key = slugAssignmentTypeKey(label);
    const { data, error } = await supabase
        .from("operational_assignment_types")
        .insert({
            org_id: orgId,
            key,
            label,
            icon_key: input.iconKey?.trim() || "calendar-clock",
            // Runtime default by label (not a migration edit) — see
            // `ASSIGNMENT_CATEGORY_DEFAULT_TONE_BY_LABEL` for why label, not key.
            visual_tone: input.visualTone ?? defaultVisualToneForAssignmentTypeLabel(label) ?? "neutral",
            subject_types: input.subjectTypes?.length ? input.subjectTypes : ["child"],
            billing_participation: input.billingParticipation ?? "none",
            attendance_participation: input.attendanceParticipation ?? "expected",
            staffing_participation: input.staffingParticipation ?? "none",
            sort_order: input.sortOrder ?? 100,
            default_behavior: behaviorPayload(input.behavior),
            is_active: true,
        })
        .select(SELECT_COLS)
        .single();
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    return mapAdminRow(data as AssignmentTypeRow);
}

export async function updateOrgAssignmentType(
    supabase: SupabaseClient,
    orgId: string,
    typeId: string,
    input: AssignmentTypeWriteInput,
): Promise<AssignmentTypeAdminRecord> {
    const label = input.label.trim();
    if (!label) throw new OperationalEnrollmentServiceError("invalid_input", "Name is required");
    const { data: existing, error: loadErr } = await supabase
        .from("operational_assignment_types")
        .select("default_behavior")
        .eq("org_id", orgId)
        .eq("id", typeId)
        .maybeSingle();
    if (loadErr) throw new OperationalEnrollmentServiceError("db_error", loadErr.message);
    if (!existing) throw new OperationalEnrollmentServiceError("not_found", "Assignment Category not found");

    const priorBehavior = readAssignmentTypeBehavior(
        (existing as { default_behavior?: unknown }).default_behavior,
    );
    const mergedBehavior = { ...priorBehavior, ...input.behavior };

    const { data, error } = await supabase
        .from("operational_assignment_types")
        .update({
            label,
            icon_key: input.iconKey?.trim() || "calendar-clock",
            visual_tone: input.visualTone ?? "neutral",
            subject_types: input.subjectTypes?.length ? input.subjectTypes : ["child"],
            billing_participation: input.billingParticipation ?? "none",
            attendance_participation: input.attendanceParticipation ?? "expected",
            staffing_participation: input.staffingParticipation ?? "none",
            sort_order: input.sortOrder ?? 100,
            default_behavior: behaviorPayload(mergedBehavior),
        })
        .eq("org_id", orgId)
        .eq("id", typeId)
        .select(SELECT_COLS)
        .single();
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    return mapAdminRow(data as AssignmentTypeRow);
}

export async function setOrgAssignmentTypeActive(
    supabase: SupabaseClient,
    orgId: string,
    typeId: string,
    isActive: boolean,
): Promise<AssignmentTypeAdminRecord> {
    if (!isActive) {
        const block = await archiveBlockReasonForAssignmentType(supabase, orgId, typeId);
        if (block) throw new OperationalEnrollmentServiceError("conflict", block);
    }
    const { data, error } = await supabase
        .from("operational_assignment_types")
        .update({ is_active: isActive })
        .eq("org_id", orgId)
        .eq("id", typeId)
        .select(SELECT_COLS)
        .single();
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    return mapAdminRow(data as AssignmentTypeRow);
}

export async function reorderOrgAssignmentTypes(
    supabase: SupabaseClient,
    orgId: string,
    orderedIds: string[],
): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await supabase
            .from("operational_assignment_types")
            .update({ sort_order: (i + 1) * 10 })
            .eq("org_id", orgId)
            .eq("id", orderedIds[i]);
        if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
}

export async function archiveBlockReasonForAssignmentType(
    supabase: SupabaseClient,
    orgId: string,
    typeId: string,
): Promise<string | null> {
    const { count, error } = await supabase
        .from("schedule_assignments")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("operational_assignment_type_id", typeId)
        .in("status", [...SCHEDULE_ASSIGNMENT_OPERATIONAL_STATUSES]);
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    if ((count ?? 0) > 0) {
        return `${count} active assignment${count === 1 ? "" : "s"} use this type — archive or retype them first.`;
    }
    return null;
}
