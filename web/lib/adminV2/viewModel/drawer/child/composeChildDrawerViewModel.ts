import { evaluateComposedPersonDrawerPayload } from "@/lib/admin/drawer/composedDrawerPayload/evaluateComposedDrawerPayload";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminRouteGateSuccess } from "@/lib/admin/adminRouteGate";
import { PERSON_DRAWER_CHILD_OPEN_SOURCE } from "@/lib/admin/drawer/personDrawerOpenSeed";
import { fetchEffectiveStatusDefinitionsTagged } from "@/lib/admin/statusDefinitionsResolve";
import { drawerFirstPaintDependenciesSettled } from "@/lib/adminV2/viewModel/drawer/drawerFirstPaint";
import { buildChildFirstViewportPlan } from "@/lib/adminV2/viewModel/drawer/child/childDrawerFirstViewportContract";
import type {
    ChildDrawerFirstPaintContract,
    ChildDrawerFirstPaintDependencyState,
    ChildDrawerViewModel,
    ChildDrawerViewModelResult,
} from "@/lib/adminV2/viewModel/drawer/child/types";
import { buildPersonDrawerEntityPayloadForViewModel } from "@/lib/adminV2/viewModel/drawer/person/buildPersonDrawerEntityPayloadForViewModel";
import { buildPersonDrawerStatusControlVm } from "@/lib/adminV2/viewModel/drawer/person/buildPersonDrawerStatusControlVm";
import type { PersonDrawerVmComposeDepth } from "@/lib/adminV2/viewModel/drawer/person/personDrawerVmComposeDepth";
import {
    filterPersonStatusDefinitionsForProfile,
    PERSON_STATUS_PROFILE_CHILD_LIFECYCLE,
} from "@/lib/admin/person/personStatusApplicability";

export const CHILD_DRAWER_VM_COMPOSE_VERSION = "1.0.0";

function trimOrNull(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
}

function buildFirstPaintContract(params: {
    plan: ReturnType<typeof buildChildFirstViewportPlan>;
    record: Record<string, unknown>;
    composedReady: boolean;
    statusDefsCount: number;
}): ChildDrawerFirstPaintContract {
    const dependencies: ChildDrawerFirstPaintDependencyState[] = [
        {
            key: "record_full",
            disposition: "first_paint_required",
            status: "ready",
            satisfied_by: "server_fetch",
        },
        {
            key: "status_definitions",
            disposition: "first_paint_required",
            status: params.statusDefsCount === 0 ? "empty" : "ready",
            satisfied_by: "server_fetch",
        },
        {
            key: "composed_sections",
            disposition: "first_paint_required",
            status: params.composedReady ? "ready" : "pending",
            satisfied_by: "server_fetch",
        },
    ];
    return {
        settled: drawerFirstPaintDependenciesSettled(dependencies),
        viewport_slots: params.plan.viewport_slots,
        dependencies,
        data: {
            record_full: params.record,
            status_definitions: params.statusDefsCount,
            composed_sections: params.composedReady,
        },
        deferred: [],
        background: [],
    };
}

export type ComposeChildDrawerViewModelParams = {
    supabase: SupabaseClient;
    gate: AdminRouteGateSuccess;
    personId: string;
    composeDepth?: PersonDrawerVmComposeDepth;
};

export async function composeChildDrawerViewModel(
    params: ComposeChildDrawerViewModelParams
): Promise<ChildDrawerViewModelResult> {
    const composeStart = Date.now();
    const phases: Record<string, number> = {};
    const { supabase, gate, personId } = params;
    const orgId = gate.orgId;
    const plan = buildChildFirstViewportPlan();

    const composeDepth = params.composeDepth ?? "first_paint";

    const tRecord0 = Date.now();
    const payload = await buildPersonDrawerEntityPayloadForViewModel(
        supabase,
        orgId,
        personId,
        gate.dim,
        composeDepth
    );
    phases.record_full_ms = Date.now() - tRecord0;

    if (!payload.ok) {
        return {
            ok: false,
            skipped: {
                structureSettled: false,
                reason: "person_not_found",
                compose_version: CHILD_DRAWER_VM_COMPOSE_VERSION,
            },
        };
    }

    const record = payload.record;
    record._record_surface = "full";
    record._drawer_presentation_emphasis = "child_lifecycle";

    const tStatus0 = Date.now();
    const statusDefsPack = await fetchEffectiveStatusDefinitionsTagged(supabase, orgId, "persons", {
        activeOnly: true,
    });
    phases.status_definitions_ms = Date.now() - tStatus0;

    const composedEval = evaluateComposedPersonDrawerPayload({
        surface: "child",
        operatingSections: ["child_summary", "household"],
        overviewSectionKeys: [],
        record,
        drawerId: personId,
        bodyHydrated: true,
        childChromeHint: {
            open_source: PERSON_DRAWER_CHILD_OPEN_SOURCE,
            presentation_emphasis: "child_lifecycle",
        },
    });

    if (!composedEval.ready) {
        return {
            ok: false,
            skipped: {
                structureSettled: false,
                reason: "composed_not_ready",
                compose_version: CHILD_DRAWER_VM_COMPOSE_VERSION,
            },
        };
    }

    const first_paint = buildFirstPaintContract({
        plan,
        record,
        composedReady: composedEval.ready,
        statusDefsCount: statusDefsPack.rows.length,
    });

    if (!first_paint.settled) {
        return {
            ok: false,
            skipped: {
                structureSettled: false,
                reason: "composed_not_ready",
                compose_version: CHILD_DRAWER_VM_COMPOSE_VERSION,
            },
        };
    }

    const title = trimOrNull(record._person_name) ?? trimOrNull(record.full_name) ?? "Child";
    const statusLabel = trimOrNull(record._status_display);
    const filteredStatusDefs = filterPersonStatusDefinitionsForProfile(
        statusDefsPack.rows,
        PERSON_STATUS_PROFILE_CHILD_LIFECYCLE
    );
    const status = buildPersonDrawerStatusControlVm({
        record,
        statusDefs: filteredStatusDefs,
        statusProfile: PERSON_STATUS_PROFILE_CHILD_LIFECYCLE,
    });

    const viewModel: ChildDrawerViewModel = {
        generation: `child:${personId}:${plan.variant_key}:${CHILD_DRAWER_VM_COMPOSE_VERSION}`,
        structureSettled: true,
        compose_version: CHILD_DRAWER_VM_COMPOSE_VERSION,
        entity: { type: "person", id: personId },
        surface: "child",
        first_paint,
        header: {
            title,
            subtitle: null,
            status_label: statusLabel,
            status,
        },
        record,
        layout: {
            variant_key: plan.variant_key,
            operating_sections: ["child_summary", "household"],
        },
        background_refresh: {
            allowed:
                composeDepth === "first_paint" ?
                    (["status_values", "record_visibility"] as const)
                :   (["status_values"] as const),
        },
        timing: {
            compose_ms: Date.now() - composeStart,
            phases_ms: phases,
        },
    };

    return { ok: true, viewModel };
}
