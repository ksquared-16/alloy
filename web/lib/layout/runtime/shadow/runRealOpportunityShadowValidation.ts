/**
 * Real opportunity record shadow validation (Phase 4).
 *
 * Composes live VM + resolves org layout for a real opportunity id.
 * Shadow-only — never mounts layout runtime in production drawers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminRouteGateSuccess } from "@/lib/admin/adminRouteGate";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { composeOpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel";
import { resolveLayoutForOrg } from "@/lib/layout/resolveLayoutRuntime";
import { isLayoutRuntimeShadowReadPathEnabled } from "@/lib/layout/featureFlag";
import { buildOpportunityDrawerShadowParityReport } from "./buildOpportunityDrawerShadowParityReport";
import { captureLayoutRuntimeDrawerStructure } from "./captureLayoutRuntimeDrawerStructure";
import { captureVmOpportunityDrawerStructure } from "./captureVmOpportunityDrawerStructure";
import { enrichShadowParityReport } from "./enrichShadowParityReport";
import type { RealRecordShadowValidationReport } from "./drawerStructureSnapshot";
import type { DrawerStructureSnapshot } from "./drawerStructureSnapshot";

export type RunRealOpportunityShadowValidationInput = {
    opportunityId: string;
    gate: AdminRouteGateSuccess;
    supabase: SupabaseClient;
    departmentId?: string | null;
    workUnitId?: string | null;
};

export type RealOpportunityShadowValidationResult =
    | {
          ok: true;
          report: RealRecordShadowValidationReport;
          vm: DrawerStructureSnapshot;
          layout: DrawerStructureSnapshot;
          layoutSource: string;
          composeMs: number;
      }
    | {
          ok: false;
          status: number;
          reason: string;
      };

/**
 * Evaluate one real opportunity: VM snapshot vs layout runtime snapshot → parity report.
 * Requires shadow/preview read path flag on server (default off).
 */
export async function runRealOpportunityShadowValidation(
    input: RunRealOpportunityShadowValidationInput,
): Promise<RealOpportunityShadowValidationResult> {
    if (!isLayoutRuntimeShadowReadPathEnabled()) {
        return { ok: false, status: 404, reason: "shadow_read_path_disabled" };
    }

    const opportunityId = input.opportunityId.trim();
    if (!opportunityId) {
        return { ok: false, status: 400, reason: "missing_opportunity_id" };
    }

    const orgCheck = await assertRowOrg(input.supabase, "opportunities", opportunityId, input.gate.orgId);
    if (!orgCheck.ok) {
        return { ok: false, status: 404, reason: "opportunity_not_found" };
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
            status: 422,
            reason: composeResult.skipped?.reason ?? "vm_compose_skipped",
        };
    }

    const vm = composeResult.viewModel;
    if (vm.layout.mode !== "workflow_v1") {
        return { ok: false, status: 422, reason: "classic_drawer_not_in_scope" };
    }

    const layoutResolution = await resolveLayoutForOrg({
        orgId: input.gate.orgId,
        entityType: "opportunities",
        surface: "drawer",
        supabase: input.supabase,
        fetchPublishedLayouts: true,
    });

    const baseReport = buildOpportunityDrawerShadowParityReport({
        vm,
        doc: layoutResolution.doc,
        layoutKey: layoutResolution.doc.metadata?.template as string | undefined,
    });

    const vmSnapshot = captureVmOpportunityDrawerStructure(vm);
    const layoutSnapshot = captureLayoutRuntimeDrawerStructure({
        doc: layoutResolution.doc,
        recordId: opportunityId,
    });

    const report = enrichShadowParityReport({
        base: { ...baseReport, layoutSource: layoutResolution.source },
        vm: vmSnapshot,
        layout: layoutSnapshot,
        opportunityId,
        layoutSource: layoutResolution.source,
    });

    return {
        ok: true,
        report,
        vm: vmSnapshot,
        layout: layoutSnapshot,
        layoutSource: layoutResolution.source,
        composeMs: vm.timing.compose_ms,
    };
}

/** Build enriched report from an already-composed VM (tests / fixtures). */
export function buildRealRecordShadowValidationFromVm(
    vm: Parameters<typeof buildOpportunityDrawerShadowParityReport>[0]["vm"],
    doc: Parameters<typeof buildOpportunityDrawerShadowParityReport>[0]["doc"],
    options: { layoutSource?: string; layoutKey?: string } = {},
): RealRecordShadowValidationReport {
    const base = buildOpportunityDrawerShadowParityReport({
        vm,
        doc,
        layoutKey: options.layoutKey,
    });
    const vmSnapshot = captureVmOpportunityDrawerStructure(vm);
    const layoutSnapshot = captureLayoutRuntimeDrawerStructure({ doc, recordId: vm.entity.id });
    return enrichShadowParityReport({
        base: { ...base, layoutSource: options.layoutSource },
        vm: vmSnapshot,
        layout: layoutSnapshot,
        opportunityId: vm.entity.id,
        layoutSource: options.layoutSource,
    });
}
