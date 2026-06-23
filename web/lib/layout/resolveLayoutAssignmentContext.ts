/**
 * Resolve LayoutAssignmentContext from opportunity / department metadata.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LayoutAssignmentContext } from "@/lib/layout/businessProcessLayoutAssignmentTypes";
import { activeProcessFromDepartmentMetadata } from "@/lib/businessProcesses/businessProcessConfigReader";
import { lifecycleBuilderFromDepartmentMetadata, stageKeysForProcess } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveStatusProcessStageAssignment } from "@/lib/businessProcesses/resolveStatusProcessStageAssignment";

export type ResolveLayoutAssignmentContextInput = {
    businessProcessKey?: string | null;
    stageKey?: string | null;
    statusKey?: string | null;
};

/** Build context when process key is known (no I/O). Returns undefined without process key. */
export function buildLayoutAssignmentContext(
    input: ResolveLayoutAssignmentContextInput,
): LayoutAssignmentContext | undefined {
    const businessProcessKey = input.businessProcessKey?.trim();
    if (!businessProcessKey) return undefined;
    return {
        businessProcessKey,
        stageKey: input.stageKey?.trim() || null,
        statusKey: input.statusKey?.trim() || null,
    };
}

export async function resolveLayoutAssignmentContextFromDepartment(input: {
    supabase: SupabaseClient;
    orgId: string;
    departmentId: string;
    stageKey?: string | null;
    statusKey?: string | null;
}): Promise<LayoutAssignmentContext | undefined> {
    const { data: dept, error } = await input.supabase
        .from("departments")
        .select("metadata")
        .eq("id", input.departmentId)
        .eq("org_id", input.orgId)
        .maybeSingle();
    if (error || !dept) return undefined;

    const metadata =
        dept.metadata != null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};

    const process = activeProcessFromDepartmentMetadata(metadata);
    if (!process?.key) return undefined;

    let stageKey = input.stageKey?.trim() || null;
    const statusKey = input.statusKey?.trim() || null;

    if (!stageKey && statusKey) {
        const configuredStages = stageKeysForProcess(process);
        const { data: statusRow } = await input.supabase
            .from("status_definitions")
            .select("metadata")
            .eq("org_id", input.orgId)
            .eq("entity_type", "opportunities")
            .eq("status_key", statusKey)
            .maybeSingle();
        const statusMeta =
            statusRow?.metadata != null && typeof statusRow.metadata === "object"
                ? (statusRow.metadata as Record<string, unknown>)
                : null;
        const assignment = resolveStatusProcessStageAssignment(statusKey, statusMeta, configuredStages);
        stageKey = assignment.stage;
    }

    return buildLayoutAssignmentContext({
        businessProcessKey: process.key,
        stageKey,
        statusKey,
    });
}

export async function resolveLayoutAssignmentContextFromOpportunity(input: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    departmentId?: string | null;
    processStageKey?: string | null;
    statusKey?: string | null;
}): Promise<LayoutAssignmentContext | undefined> {
    let departmentId = input.departmentId?.trim() || null;

    if (!departmentId) {
        const { data: opp } = await input.supabase
            .from("opportunities")
            .select("metadata")
            .eq("id", input.opportunityId)
            .eq("org_id", input.orgId)
            .maybeSingle();
        const md = (opp?.metadata ?? {}) as Record<string, unknown>;
        departmentId =
            (typeof md.enrollment_department_id === "string" ? md.enrollment_department_id.trim() : null)
            || (typeof md.department_id === "string" ? md.department_id.trim() : null);
    }

    if (!departmentId) return undefined;

    return resolveLayoutAssignmentContextFromDepartment({
        supabase: input.supabase,
        orgId: input.orgId,
        departmentId,
        stageKey: input.processStageKey,
        statusKey: input.statusKey,
    });
}
