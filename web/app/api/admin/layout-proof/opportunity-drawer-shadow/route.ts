/**
 * Layout proof — opportunity drawer shadow parity (Phase 3–4).
 *
 * GET /api/admin/layout-proof/opportunity-drawer-shadow
 *   ?opportunityId=<uuid>  — real record validation (Phase 4)
 *   (no id)                — fixture sample (Phase 3 fallback)
 *
 * Shadow-only. Gated by preview or shadow flag. No production drawer wiring.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { compileOpportunityRecordDrawerShell } from "@/lib/adminV2/shellContracts/compileOpportunityRecordDrawerShell";
import {
    buildOpportunityDrawerViewModelAboveFold,
    compileOpportunityDrawerViewModelShell,
} from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerViewModelAboveFold";
import { isLayoutRuntimeShadowReadPathEnabled } from "@/lib/layout/featureFlag";
import { resolveLayout } from "@/lib/layout/layoutResolver";
import {
    buildOpportunityDrawerShadowParityReport,
    buildRealRecordShadowValidationFromVm,
    captureLayoutRuntimeDrawerStructure,
    captureVmOpportunityDrawerStructure,
    enrichShadowParityReport,
    runRealOpportunityShadowValidation,
} from "@/lib/layout/runtime/shadow";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import { OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP } from "@/lib/adminV2/shellContracts/opportunityInquiryWorkflowTabs";
import { createAdminClient } from "@/lib/supabaseAdmin";

const WORKFLOW_V1_CFG = {
    inquiry_drawer_mode: "workflow_v1" as const,
    inquiry_workflow_sections: [
        { key: "inq_identity", title: "Identity", field_keys: ["name"], default_expanded: true },
    ],
    overview_section_order: ["inq_identity", "inquiry_children", "inquiry_tuition", "details"],
};

const FIELD_DEFS = [
    {
        field_key: "name",
        field_type: "text",
        label: "Name",
        section_key: "details",
        sort_order: 0,
        is_visible_in_drawer: true,
    },
];

function buildFixtureVm(recordId: string): OpportunityDrawerViewModel {
    const shellCompiled = compileOpportunityRecordDrawerShell({
        config_json: WORKFLOW_V1_CFG,
        field_definitions: FIELD_DEFS,
        field_section_labels: { details: "Details" },
    });
    const record = { id: recordId, name: "Shadow parity sample", status_key: "qualified" };
    const shell = compileOpportunityDrawerViewModelShell({ layoutConfig: WORKFLOW_V1_CFG, record });
    if (!shell || !shellCompiled) {
        throw new Error("Failed to compile opportunity drawer shell for shadow parity");
    }

    const aboveFold = buildOpportunityDrawerViewModelAboveFold({
        shell,
        record,
        reminders: { state: "empty", next_follow_up_iso: null, scheduled_send_count: 0, scheduled_sends: [] },
        task_assist_enabled: true,
        tour_display_source: "none",
    });

    const tabs = shell.tabs.length ? shell.tabs : ([...OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP] as DrawerTabKey[]);

    return {
        generation: "shadow-proof",
        structureSettled: true,
        compose_version: "shadow-1",
        entity: { type: "opportunity", id: recordId },
        workspace: { department_id: null, work_unit_id: null, queue_definition: null, lifecycle_rail: null, stage_context: null, work_intent_runtime: null, stage_work_runtime: null },
        first_paint: {
            settled: true,
            viewport_slots: [],
            dependencies: [],
            data: { tour_bookings: [], tasks_preview: null, scheduled_sends: null },
            deferred: [],
            background: [],
        },
        header: {
            title: "Shadow parity sample",
            subtitle: null,
            status: { renderAs: "readonly_pill", label: "Qualified" },
            status_can_mutate: false,
            oper_trust_preview: null,
        },
        actions: { header: [], header_menu: [], manage_menu: [], record_header: null },
        layout: {
            mode: "workflow_v1",
            tabs,
            default_tab: "overview",
            shell: {
                ...shell,
                overview_sections: shellCompiled.overview_sections,
                section_slots: shellCompiled.section_slots.map((s) => ({
                    section_key: s.section_key,
                    lifecycle: s.lifecycle,
                    shell_min_height_class: s.shell_min_height_class,
                })),
            },
        },
        activity: {
            communicationsPreviewVm: null,
        },
        above_fold: { render_model: aboveFold, record },
        summaries: {
            tasks: { state: "loaded", open_count: 0, open_tasks: [] },
            active_tour_bookings: [],
            operator_relevant_tour_booking: null,
            reminders: { state: "ready", next_follow_up_iso: null, scheduled_send_count: 0, scheduled_sends: [] },
            bos: null,
            attention: null,
        },
        background_refresh: { allowed: [] },
        timing: { compose_ms: 0, phases_ms: {} },
    };
}

export async function GET(request: NextRequest) {
    if (!isLayoutRuntimeShadowReadPathEnabled()) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const opportunityId = request.nextUrl.searchParams.get("opportunityId")?.trim() ?? "";

    try {
        if (opportunityId) {
            const gate = await loadAdminRouteGate();
            if (!gate.ok) return adminRouteGateFailureResponse(gate);

            const supabase = createAdminClient();
            const result = await runRealOpportunityShadowValidation({
                opportunityId,
                gate,
                supabase,
                departmentId: request.nextUrl.searchParams.get("departmentId"),
                workUnitId: request.nextUrl.searchParams.get("workUnitId"),
            });

            if (!result.ok) {
                return NextResponse.json({ error: result.reason }, { status: result.status });
            }

            return NextResponse.json({
                shadow: true,
                realRecord: true,
                recordId: opportunityId,
                layoutSource: result.layoutSource,
                composeMs: result.composeMs,
                vm: result.vm,
                layout: result.layout,
                report: result.report,
            });
        }

        const recordId = "shadow-proof-opp";
        const resolved = resolveLayout({ entityType: "opportunities", surface: "drawer" });
        const vm = buildFixtureVm(recordId);
        const base = buildOpportunityDrawerShadowParityReport({
            vm,
            doc: resolved.doc,
            layoutKey: resolved.doc.metadata?.template as string | undefined,
        });
        const vmSnap = captureVmOpportunityDrawerStructure(vm);
        const layoutSnap = captureLayoutRuntimeDrawerStructure({ doc: resolved.doc, recordId });
        const report = enrichShadowParityReport({
            base: { ...base, layoutSource: resolved.source },
            vm: vmSnap,
            layout: layoutSnap,
            opportunityId: recordId,
            layoutSource: resolved.source,
        });

        return NextResponse.json({
            shadow: true,
            realRecord: false,
            recordId,
            layoutSource: resolved.source,
            vm: vmSnap,
            layout: layoutSnap,
            report,
        });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
