/**
 * Evaluate child drawer overview body from layout runtime.
 *
 * Child drawers open with a **person id** (see openInquiryChildPersonFromOpportunity).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminRouteGateSuccess } from "@/lib/admin/adminRouteGate";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { composeChildDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/child/composeChildDrawerViewModel";
import { resolveLayoutForOrg } from "../resolveLayoutRuntime";
import { buildLayoutRuntimePlan, type LayoutRuntimePlan } from "./layoutRuntimePlan";
import { buildChildLayoutRuntimeRecordFromVm } from "./buildChildLayoutRuntimeRecordFromVm";
import { isLayoutDocRenderableForProduction } from "./isLayoutDocRenderableForProduction";
import type { LayoutDoc } from "../layoutV2";
import type { ProofRuntimeRecord } from "./proofRecordContext";

export type EvaluateChildLayoutRuntimeBodyResult =
    | { ok: true; doc: LayoutDoc; record: ProofRuntimeRecord; plan: LayoutRuntimePlan; layoutSource: string }
    | { ok: false; reason: string; status: number };

export async function evaluateChildLayoutRuntimeBody(input: {
    /** Person id — child drawer entity id (not customer_member id). */
    personId: string;
    gate: AdminRouteGateSuccess;
    supabase: SupabaseClient;
}): Promise<EvaluateChildLayoutRuntimeBodyResult> {
    const personId = input.personId.trim();
    if (!personId) return { ok: false, reason: "missing_person_id", status: 400 };

    const orgCheck = await assertRowOrg(input.supabase, "persons", personId, input.gate.orgId);
    if (!orgCheck.ok) return { ok: false, reason: "person_not_found", status: 404 };

    const composeResult = await composeChildDrawerViewModel({
        supabase: input.supabase,
        gate: input.gate,
        personId,
    });
    if (!composeResult.ok) {
        return { ok: false, reason: composeResult.skipped?.reason ?? "vm_compose_skipped", status: 422 };
    }

    const layoutResolution = await resolveLayoutForOrg({
        orgId: input.gate.orgId,
        entityType: "child",
        surface: "drawer",
        supabase: input.supabase,
        fetchPublishedLayouts: true,
    });

    const doc = layoutResolution.doc;
    if (!isLayoutDocRenderableForProduction(doc)) {
        return { ok: false, reason: "layout_not_renderable", status: 422 };
    }

    const record = buildChildLayoutRuntimeRecordFromVm({
        vmRecord: composeResult.viewModel.record,
        personId,
    });

    return {
        ok: true,
        doc,
        record,
        plan: buildLayoutRuntimePlan(doc),
        layoutSource: layoutResolution.source,
    };
}
