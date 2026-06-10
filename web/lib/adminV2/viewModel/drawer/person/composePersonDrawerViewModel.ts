import { evaluateComposedPersonDrawerPayload } from "@/lib/admin/drawer/composedDrawerPayload/evaluateComposedDrawerPayload";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminRouteGateSuccess } from "@/lib/admin/adminRouteGate";
import { fetchEffectiveStatusDefinitionsTagged } from "@/lib/admin/statusDefinitionsResolve";
import { drawerFirstPaintDependenciesSettled } from "@/lib/adminV2/viewModel/drawer/drawerFirstPaint";
import { buildPersonDrawerEntityPayloadForViewModel } from "@/lib/adminV2/viewModel/drawer/person/buildPersonDrawerEntityPayloadForViewModel";
import { buildPersonDrawerStatusControlVm } from "@/lib/adminV2/viewModel/drawer/person/buildPersonDrawerStatusControlVm";
import {
    buildPersonFirstViewportPlan,
    resolvePersonDrawerVmSurface,
} from "@/lib/adminV2/viewModel/drawer/person/personDrawerFirstViewportContract";
import type {
    PersonDrawerFirstPaintContract,
    PersonDrawerFirstPaintDependencyState,
    PersonDrawerViewModel,
    PersonDrawerViewModelResult,
} from "@/lib/adminV2/viewModel/drawer/person/types";
import type { PersonDrawerVmComposeDepth } from "@/lib/adminV2/viewModel/drawer/person/personDrawerVmComposeDepth";
import { resolvePersonDrawerProfileFromRecordWithHint } from "@/lib/admin/person/personDrawerChildChrome";
import {
    filterPersonStatusDefinitionsForProfile,
    PERSON_STATUS_PROFILE_GENERIC,
    resolvePersonDrawerStatusProfile,
} from "@/lib/admin/person/personStatusApplicability";

export const PERSON_DRAWER_VM_COMPOSE_VERSION = "1.0.0";

function trimOrNull(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
}

function buildFirstPaintContract(params: {
    plan: ReturnType<typeof buildPersonFirstViewportPlan>;
    record: Record<string, unknown>;
    composedReady: boolean;
    statusDefsCount: number;
}): PersonDrawerFirstPaintContract {
    const dependencies: PersonDrawerFirstPaintDependencyState[] = [
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
    const settled = drawerFirstPaintDependenciesSettled(dependencies);
    return {
        settled,
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

export type ComposePersonDrawerViewModelParams = {
    supabase: SupabaseClient;
    gate: AdminRouteGateSuccess;
    personId: string;
    openSource?: string | null;
    presentationEmphasis?: string | null;
    composeDepth?: PersonDrawerVmComposeDepth;
};

export async function composePersonDrawerViewModel(
    params: ComposePersonDrawerViewModelParams
): Promise<PersonDrawerViewModelResult> {
    const composeStart = Date.now();
    const phases: Record<string, number> = {};
    const { supabase, gate, personId } = params;
    const orgId = gate.orgId;

    const surface = resolvePersonDrawerVmSurface({
        openSource: params.openSource,
        presentationEmphasis: params.presentationEmphasis,
    });
    const plan = buildPersonFirstViewportPlan(surface);

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
                compose_version: PERSON_DRAWER_VM_COMPOSE_VERSION,
            },
        };
    }

    const record = payload.record;
    record._record_surface = "full";

    const tStatus0 = Date.now();
    const statusDefsPack = await fetchEffectiveStatusDefinitionsTagged(supabase, orgId, "persons", {
        activeOnly: true,
    });
    phases.status_definitions_ms = Date.now() - tStatus0;

    const composedEval =
        surface === "generic" ?
            { ready: true, missing: [], blockingSections: [] }
        :   evaluateComposedPersonDrawerPayload({
                surface: "parent",
                operatingSections: plan.operating_sections,
                overviewSectionKeys: [],
                record,
                drawerId: personId,
                bodyHydrated: true,
            });

    if (!composedEval.ready) {
        return {
            ok: false,
            skipped: {
                structureSettled: false,
                reason: "composed_not_ready",
                compose_version: PERSON_DRAWER_VM_COMPOSE_VERSION,
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
                compose_version: PERSON_DRAWER_VM_COMPOSE_VERSION,
            },
        };
    }

    const title = trimOrNull(record._person_name) ?? trimOrNull(record.full_name) ?? "Person";
    const statusLabel = trimOrNull(record._status_display);

    const profileHint =
        params.presentationEmphasis === "child_lifecycle" ?
            { presentation_emphasis: "child_lifecycle" as const }
        :   undefined;
    const resolvedProfile = resolvePersonDrawerProfileFromRecordWithHint(record, {
        open_source: params.openSource,
        ...profileHint,
    });
    const statusProfile = resolvePersonDrawerStatusProfile(resolvedProfile, { childChrome: false });
    const filteredStatusDefs =
        statusProfile ?
            filterPersonStatusDefinitionsForProfile(statusDefsPack.rows, statusProfile)
        :   [];
    const status =
        statusProfile === PERSON_STATUS_PROFILE_GENERIC ?
            buildPersonDrawerStatusControlVm({ record, statusDefs: filteredStatusDefs })
        :   { renderAs: "hidden" as const };

    const viewModel: PersonDrawerViewModel = {
        generation: `person:${personId}:${plan.variant_key}:${PERSON_DRAWER_VM_COMPOSE_VERSION}`,
        structureSettled: true,
        compose_version: PERSON_DRAWER_VM_COMPOSE_VERSION,
        entity: { type: "person", id: personId },
        surface,
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
            operating_sections: plan.operating_sections,
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
