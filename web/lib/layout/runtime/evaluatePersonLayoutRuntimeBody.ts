/**
 * Evaluate person drawer overview body from layout runtime.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminRouteGateSuccess } from "@/lib/admin/adminRouteGate";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { composePersonDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/person/composePersonDrawerViewModel";
import { resolveLayoutForOrg } from "../resolveLayoutRuntime";
import { buildLayoutRuntimePlan, type LayoutRuntimePlan } from "./layoutRuntimePlan";
import { buildPersonLayoutRuntimeRecordFromVm } from "./buildPersonLayoutRuntimeRecordFromVm";
import { enrichPersonVmRecordWithOpportunityContext } from "./enrichPersonVmRecordWithOpportunityContext";
import { isLayoutDocRenderableForProduction } from "./isLayoutDocRenderableForProduction";
import { resolveEffectiveProductionLayoutDoc } from "./resolveEffectiveProductionLayoutDoc";
import type { LayoutDoc } from "../layoutV2";
import type { ProofRuntimeRecord } from "./proofRecordContext";

export type EvaluatePersonLayoutRuntimeBodyResult =
    | { ok: true; doc: LayoutDoc; record: ProofRuntimeRecord; plan: LayoutRuntimePlan; layoutSource: string }
    | { ok: false; reason: string; status: number };

export async function evaluatePersonLayoutRuntimeBody(input: {
    personId: string;
    gate: AdminRouteGateSuccess;
    supabase: SupabaseClient;
    opportunityId?: string | null;
}): Promise<EvaluatePersonLayoutRuntimeBodyResult> {
    const personId = input.personId.trim();
    if (!personId) return { ok: false, reason: "missing_person_id", status: 400 };

    const orgCheck = await assertRowOrg(input.supabase, "persons", personId, input.gate.orgId);
    if (!orgCheck.ok) return { ok: false, reason: "person_not_found", status: 404 };

    const composeResult = await composePersonDrawerViewModel({
        supabase: input.supabase,
        gate: input.gate,
        personId,
    });
    if (!composeResult.ok) {
        return { ok: false, reason: composeResult.skipped?.reason ?? "vm_compose_skipped", status: 422 };
    }

    const layoutResolution = await resolveLayoutForOrg({
        orgId: input.gate.orgId,
        entityType: "person",
        surface: "drawer",
        supabase: input.supabase,
        fetchPublishedLayouts: true,
    });

    const effective = resolveEffectiveProductionLayoutDoc({
        doc: layoutResolution.doc,
        source: layoutResolution.source,
        layoutKey: layoutResolution.layoutKey,
        entityType: "person",
        surface: "drawer",
    });

    const doc = effective.doc;
    if (!isLayoutDocRenderableForProduction(doc)) {
        return { ok: false, reason: "layout_not_renderable", status: 422 };
    }

    const enrichedVmRecord = await enrichPersonVmRecordWithOpportunityContext({
        supabase: input.supabase,
        orgId: input.gate.orgId,
        personId,
        opportunityId: input.opportunityId,
        vmRecord: composeResult.viewModel.record,
    });

    const record = buildPersonLayoutRuntimeRecordFromVm({
        vmRecord: enrichedVmRecord,
        personId,
    });

    return {
        ok: true,
        doc,
        record,
        plan: buildLayoutRuntimePlan(doc),
        layoutSource: effective.usedFallback ? effective.source : layoutResolution.source,
    };
}
