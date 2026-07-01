/**
 * C1b — evaluate opportunity drawer overview body from layout runtime.
 *
 * Resolves org layout doc + VM record context. Returns failure reasons for VM fallback.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminRouteGateSuccess } from "@/lib/admin/adminRouteGate";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { composeOpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel";
import type { LayoutDoc } from "../layoutV2";
import { resolveLayoutForOrg } from "../resolveLayoutRuntime";
import { buildLayoutRuntimePlan, layoutDocSupportsAllSprint1ItemKinds, type LayoutRuntimePlan } from "./layoutRuntimePlan";
import { resolveLayoutAssignmentContextFromOpportunity } from "../resolveLayoutAssignmentContext";
import {
    buildLayoutRuntimeRecordBindingEvidence,
    buildOpportunityLayoutRuntimeRecordFromVm,
    type LayoutRuntimeRecordBindingEvidence,
} from "./buildOpportunityLayoutRuntimeRecordFromVm";
import { enrichOpportunityVmRecordWithHouseholdChildren } from "./enrichOpportunityVmRecordWithHouseholdChildren";
import { enrichLayoutDocDrawerFieldEditable } from "./enrichLayoutDocChildFieldsEditable";
import { collectLayoutItems } from "./classifyLayoutItemBinding";
import {
    isLayoutItemSupportedForProduction,
    layoutDocHasProductionSupportedItems,
} from "./isLayoutItemSupportedForProduction";
import { resolveEffectiveProductionLayoutDoc } from "./resolveEffectiveProductionLayoutDoc";
import type { ProofRuntimeRecord } from "./proofRecordContext";

export type EvaluateOpportunityLayoutRuntimeBodyInput = {
    opportunityId: string;
    gate: AdminRouteGateSuccess;
    supabase: SupabaseClient;
    departmentId?: string | null;
    workUnitId?: string | null;
    pinnedEntityLayoutId?: string | null;
};

export type EvaluateOpportunityLayoutRuntimeBodySuccess = {
    ok: true;
    doc: LayoutDoc;
    record: ProofRuntimeRecord;
    plan: LayoutRuntimePlan;
    layoutSource: string;
    layoutKey: string | null;
    /** entity_layouts.id when resolved from DB; null on registry/builtin fallback. */
    layoutRecordId: string | null;
    layoutVersion: number | null;
    layoutFallbackReason?: string;
    /** RefKey → record binding evidence (configured refKeys vs record keys). */
    binding: LayoutRuntimeRecordBindingEvidence;
};

export type EvaluateOpportunityLayoutRuntimeBodyFailure = {
    ok: false;
    reason: string;
    status: number;
};

export type EvaluateOpportunityLayoutRuntimeBodyResult =
    | EvaluateOpportunityLayoutRuntimeBodySuccess
    | EvaluateOpportunityLayoutRuntimeBodyFailure;

export function isOpportunityLayoutDocRenderable(doc: LayoutDoc): boolean {
    if (!doc?.sections?.length) return false;
    if (!layoutDocSupportsAllSprint1ItemKinds(doc)) return false;
    const items = collectLayoutItems(doc);
    return layoutDocHasProductionSupportedItems(items);
}

/** Evaluate layout runtime body payload for one opportunity (server-side). */
export async function evaluateOpportunityLayoutRuntimeBody(
    input: EvaluateOpportunityLayoutRuntimeBodyInput,
): Promise<EvaluateOpportunityLayoutRuntimeBodyResult> {
    const opportunityId = input.opportunityId.trim();
    if (!opportunityId) {
        return { ok: false, reason: "missing_opportunity_id", status: 400 };
    }

    const orgCheck = await assertRowOrg(input.supabase, "opportunities", opportunityId, input.gate.orgId);
    if (!orgCheck.ok) {
        return { ok: false, reason: "opportunity_not_found", status: 404 };
    }

    const composeResult = await composeOpportunityDrawerViewModel({
        supabase: input.supabase,
        gate: input.gate,
        opportunityId,
        departmentId: input.departmentId ?? null,
        workUnitId: input.workUnitId ?? null,
    });

    if (!composeResult.ok) {
        return {
            ok: false,
            reason: composeResult.skipped?.reason ?? "vm_compose_skipped",
            status: 422,
        };
    }

    const vm = composeResult.viewModel;
    if (vm.layout.mode !== "workflow_v1") {
        return { ok: false, reason: "classic_drawer_not_in_scope", status: 422 };
    }

    const enrichedVmRecord = await enrichOpportunityVmRecordWithHouseholdChildren({
        supabase: input.supabase,
        orgId: input.gate.orgId,
        vmRecord: vm.above_fold.record,
    });

    const statusKey =
        typeof enrichedVmRecord.status_key === "string" ? enrichedVmRecord.status_key
        : typeof vm.above_fold.record.status_key === "string" ? vm.above_fold.record.status_key
        : null;
    const processStageKey = vm.workspace.lifecycle_rail?.current_stage_key ?? null;

    const layoutResolution = await resolveLayoutForOrg({
        orgId: input.gate.orgId,
        entityType: "opportunities",
        surface: "drawer",
        assignmentContext: await resolveLayoutAssignmentContextFromOpportunity({
            supabase: input.supabase,
            orgId: input.gate.orgId,
            opportunityId,
            departmentId: input.departmentId ?? null,
            processStageKey,
            statusKey,
        }),
        supabase: input.supabase,
        fetchPublishedLayouts: true,
        pinnedEntityLayoutId: input.pinnedEntityLayoutId,
    });

    const effective = resolveEffectiveProductionLayoutDoc({
        doc: layoutResolution.doc,
        source: layoutResolution.source,
        layoutKey: layoutResolution.layoutKey,
        entityType: "opportunities",
        surface: "drawer",
    });

    const doc = effective.doc;
    if (!isOpportunityLayoutDocRenderable(doc)) {
        return { ok: false, reason: "layout_not_renderable", status: 422 };
    }

    const record = buildOpportunityLayoutRuntimeRecordFromVm({
        vmRecord: enrichedVmRecord,
        opportunityId,
        statusDisplay:
            vm.header.status.renderAs !== "hidden" ? vm.header.status.label : null,
        summaries: vm.summaries,
        doc,
    });

    const enrichedDoc = enrichLayoutDocDrawerFieldEditable(doc);
    const plan = buildLayoutRuntimePlan(enrichedDoc);

    return {
        ok: true,
        doc: enrichedDoc,
        record,
        plan,
        layoutSource: effective.usedFallback ? effective.source : layoutResolution.source,
        layoutKey: effective.layoutKey ?? layoutResolution.layoutKey ?? plan.layoutKey ?? null,
        layoutRecordId: effective.usedFallback ? null : (layoutResolution.record?.id ?? null),
        layoutVersion: effective.usedFallback ? null : (layoutResolution.record?.version ?? null),
        layoutFallbackReason: effective.usedFallback ? effective.fallbackReason : undefined,
        binding: buildLayoutRuntimeRecordBindingEvidence(doc, record),
    };
}

/** Pure resolver for tests — doc + VM record without compose/fetch. */
export function evaluateOpportunityLayoutRuntimeBodyFromVm(input: {
    doc: LayoutDoc;
    vmRecord: Record<string, unknown>;
    opportunityId: string;
    statusDisplay?: string | null;
    layoutSource?: string;
}): EvaluateOpportunityLayoutRuntimeBodyResult {
    if (!isOpportunityLayoutDocRenderable(input.doc)) {
        return { ok: false, reason: "layout_not_renderable", status: 422 };
    }

    const enrichedDoc = enrichLayoutDocDrawerFieldEditable(input.doc);
    const record = buildOpportunityLayoutRuntimeRecordFromVm({
        vmRecord: input.vmRecord,
        opportunityId: input.opportunityId,
        statusDisplay: input.statusDisplay,
        doc: enrichedDoc,
    });

    return {
        ok: true,
        doc: enrichedDoc,
        record,
        plan: buildLayoutRuntimePlan(enrichedDoc),
        layoutSource: input.layoutSource ?? "test",
        layoutKey: input.doc.metadata?.layoutKey as string | undefined ?? null,
        layoutRecordId: null,
        layoutVersion: null,
        binding: buildLayoutRuntimeRecordBindingEvidence(input.doc, record),
    };
}

/** Exported for tests — unsupported items are omitted at render, not body-level fallback. */
export function filterProductionSupportedItems(items: ReturnType<typeof collectLayoutItems>) {
    return items.filter(isLayoutItemSupportedForProduction);
}
