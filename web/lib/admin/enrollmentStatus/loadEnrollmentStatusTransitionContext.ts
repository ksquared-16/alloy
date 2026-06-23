/**
 * Load modal context — child options, current status, BP-resolved destinations.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
    EnrollmentStatusTransitionChildOption,
    EnrollmentStatusTransitionDestinationOption,
    EnrollmentStatusTransitionScope,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import { resolveBpEnrollmentStatusDestinations } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionBpResolver";
import { resolveEnrollmentOperatorStageDisplay } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionLabels";
import { canonicalOperatorStageForStatusKey } from "@/lib/lifecycle/enrollmentOperatorStage";

export type EnrollmentStatusTransitionContextResult = {
    scope: EnrollmentStatusTransitionScope;
    children: EnrollmentStatusTransitionChildOption[];
    currentStatusKey: string | null;
    /** Operator-facing BP / queue lane label (primary). */
    currentStatusLabel: string;
    currentOperatorStage: string | null;
    currentBuilderStageKey: string | null;
    destinationSource: "bp" | "default_fallback";
    destinations: EnrollmentStatusTransitionDestinationOption[];
    requiresChildSelection: boolean;
    /** True when multiple children exist and action is child-scoped. */
    childScoped: boolean;
};

async function loadChildOptions(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    departmentMetadata: Record<string, unknown> | null,
): Promise<EnrollmentStatusTransitionChildOption[]> {
    const { data: ocmRows } = await supabase
        .from("opportunity_customer_members")
        .select("id, outcome_status_key, customer_member_id, customer_members(first_name, last_name, display_name)")
        .eq("org_id", orgId)
        .eq("opportunity_id", opportunityId);

    const out: EnrollmentStatusTransitionChildOption[] = [];
    for (const row of ocmRows ?? []) {
        const rec = row as {
            id?: string;
            outcome_status_key?: string | null;
            customer_members?: {
                first_name?: string | null;
                last_name?: string | null;
                display_name?: string | null;
            } | null;
        };
        const ocmId = rec.id?.trim();
        if (!ocmId) continue;
        const cm = rec.customer_members;
        const displayName =
            cm?.display_name?.trim() ||
            [cm?.first_name, cm?.last_name].filter(Boolean).join(" ").trim() ||
            "Child";
        const statusKey = rec.outcome_status_key?.trim() || null;
        const stageDisplay = resolveEnrollmentOperatorStageDisplay({
            statusKey,
            departmentMetadata,
        });
        out.push({
            opportunityCustomerMemberId: ocmId,
            displayName,
            outcomeStatusKey: statusKey,
            outcomeStatusLabel: stageDisplay.label,
            operatorStageKey: statusKey ? canonicalOperatorStageForStatusKey(statusKey) : null,
        });
    }
    return out;
}

async function loadDepartmentMetadata(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string | null | undefined,
): Promise<Record<string, unknown> | null> {
    const id = departmentId?.trim();
    if (!id) return null;
    const { data } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();
    const md = (data as { metadata?: unknown } | null)?.metadata;
    return md != null && typeof md === "object" && !Array.isArray(md)
        ? (md as Record<string, unknown>)
        : null;
}

export async function loadEnrollmentStatusTransitionContext(
    supabase: SupabaseClient,
    orgId: string,
    scope: EnrollmentStatusTransitionScope,
    options?: {
        departmentId?: string | null;
        builderStageKey?: string | null;
    },
): Promise<EnrollmentStatusTransitionContextResult> {
    const { data: opp } = await supabase
        .from("opportunities")
        .select("status_key, department_id")
        .eq("id", scope.opportunityId)
        .eq("org_id", orgId)
        .maybeSingle();

    const oppRow = opp as { status_key?: string | null; department_id?: string | null } | null;
    const departmentId = options?.departmentId?.trim() || oppRow?.department_id?.trim() || null;
    const departmentMetadata = await loadDepartmentMetadata(supabase, orgId, departmentId);

    const children = await loadChildOptions(supabase, orgId, scope.opportunityId, departmentMetadata);
    const childScoped = children.length > 0;
    const requiresChildSelection = children.length > 1 && !scope.opportunityCustomerMemberId?.trim();

    let effectiveScope = scope;
    if (children.length === 1 && !scope.opportunityCustomerMemberId?.trim() && scope.grain === "case") {
        effectiveScope = {
            ...scope,
            grain: "child",
            opportunityCustomerMemberId: children[0]!.opportunityCustomerMemberId,
            childDisplayName: children[0]!.displayName,
        };
    }

    let currentStatusKey: string | null = null;

    if (effectiveScope.opportunityCustomerMemberId) {
        const match = children.find(
            (c) => c.opportunityCustomerMemberId === effectiveScope.opportunityCustomerMemberId,
        );
        currentStatusKey = match?.outcomeStatusKey ?? null;
    } else {
        currentStatusKey = oppRow?.status_key?.trim() || null;
    }

    const grain =
        effectiveScope.grain === "case" && children.length === 0 ? "case" : "child";

    const bpResolved = resolveBpEnrollmentStatusDestinations({
        departmentMetadata,
        currentStatusKey,
        grain,
        builderStageKey: options?.builderStageKey,
    });

    const stageDisplay = resolveEnrollmentOperatorStageDisplay({
        statusKey: currentStatusKey,
        departmentMetadata,
        builderStageKey: bpResolved.currentBuilderStageKey,
    });

    return {
        scope: effectiveScope,
        children,
        currentStatusKey,
        currentStatusLabel: stageDisplay.label,
        currentOperatorStage: currentStatusKey
            ? canonicalOperatorStageForStatusKey(currentStatusKey)
            : null,
        currentBuilderStageKey: bpResolved.currentBuilderStageKey,
        destinationSource: bpResolved.destinationSource,
        destinations: bpResolved.destinations,
        requiresChildSelection,
        childScoped,
    };
}
