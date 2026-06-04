import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminRouteGateSuccess } from "@/lib/admin/adminRouteGate";
import { resolveActionsForContext } from "@/lib/admin/actions/resolveActionsForContext";
import { fetchEffectiveRecordDrawerLayout } from "@/lib/admin/effectiveRecordDrawerLayout";
import { fetchDepartmentMetadataForActivity } from "@/lib/admin/loadOpportunityActivitySignal";
import { attachOpportunityAttentionSuggestionBundle } from "@/lib/admin/opportunityAttentionSuggestionAttachment";
import { buildOpportunityDrawerVisiblePayload } from "@/lib/admin/opportunityEntityRecord";
import { sanitizeDrawerOperTrustPreviewFromHints } from "@/lib/admin/sanitizeDrawerOperTrustPreview";
import { fetchEffectiveStatusDefinitionsTagged } from "@/lib/admin/statusDefinitionsResolve";
import { createReadinessMemoScope } from "@/lib/completion/readinessEvaluationMemo";
import { tryEvaluateDrawerRecordReadiness } from "@/lib/completion/readinessDrawerBootstrap";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";
import {
    buildOpportunityDrawerViewModelAboveFold,
    compileOpportunityDrawerViewModelShell,
} from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerViewModelAboveFold";
import {
    buildOpportunityDrawerHeaderSubtitle,
    buildOpportunityDrawerHeaderTitle,
    buildOpportunityStatusControlVm,
} from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerViewModelHeader";
import {
    buildOpportunityDrawerAttentionSummary,
    buildOpportunityDrawerBosSummary,
    parseInquirySummaryTasksFromRecord,
} from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerViewModelSummaries";
import {
    aboveFoldSectionsStructureSettled,
    OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION,
    stripOpportunityDrawerRecordStaging,
} from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelContract";
import { computeOpportunityDrawerViewModelGeneration } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelGeneration";
import { loadOpportunityScheduledSendsPreview } from "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityScheduledSendsPreview";
import type {
    OpportunityDrawerViewModel,
    OpportunityDrawerViewModelResult,
} from "@/lib/adminV2/viewModel/drawer/types";

function trimOrNull(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
}

function layoutFromEffective(
    effective: Awaited<ReturnType<typeof fetchEffectiveRecordDrawerLayout>>
): {
    config_json: RecordLayoutConfigJson;
    inquiry_drawer_mode: "workflow_v1" | "classic";
    layout_version: string;
} | null {
    if (!effective.ok || !effective.layout) return null;
    const cfg = (effective.layout.config_json ?? {}) as RecordLayoutConfigJson;
    const mode = cfg.inquiry_drawer_mode === "workflow_v1" ? "workflow_v1" : "classic";
    return {
        config_json: cfg,
        inquiry_drawer_mode: mode,
        layout_version: effective.layout.key,
    };
}

function taskAssistEnabledOnServer(): boolean {
    const v = process.env.NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED?.trim().toLowerCase();
    return v === "true" || v === "1";
}

export type ComposeOpportunityDrawerViewModelParams = {
    supabase: SupabaseClient;
    gate: AdminRouteGateSuccess;
    opportunityId: string;
    departmentId: string | null;
    workUnitId: string | null;
    hintOperTrustHeadline?: string | null;
    hintOperTrustUrgency?: string | null;
};

export async function composeOpportunityDrawerViewModel(
    params: ComposeOpportunityDrawerViewModelParams
): Promise<OpportunityDrawerViewModelResult> {
    const composeStart = Date.now();
    const phases: Record<string, number> = {};
    const { supabase, gate, opportunityId } = params;
    const orgId = gate.orgId;

    const tOpp0 = Date.now();
    const { data: oppRow, error: oppErr } = await supabase
        .from("opportunities")
        .select("*")
        .eq("id", opportunityId)
        .eq("org_id", orgId)
        .single();
    phases.opportunity_select_ms = Date.now() - tOpp0;

    if (oppErr || !oppRow) {
        return {
            ok: false,
            skipped: {
                structureSettled: false,
                reason: "opportunity_not_found",
                compose_version: OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION,
            },
        };
    }

    const ctxDept = trimOrNull(params.departmentId);
    const ctxWu = trimOrNull(params.workUnitId);
    const rowWu = trimOrNull((oppRow as { work_unit_id?: unknown }).work_unit_id);
    const workUnitId = ctxWu || rowWu;
    const skipWorkUnitDbLookup = !!(ctxDept && ctxWu);

    const tLayout0 = Date.now();
    const layoutP = fetchEffectiveRecordDrawerLayout(supabase, orgId, "opportunity");
    const wuP =
        skipWorkUnitDbLookup ?
            Promise.resolve({
                data: { id: ctxWu, department_id: ctxDept, metadata: null, queue_definition: null },
                error: null,
            })
        : workUnitId ?
            supabase
                .from("work_units")
                .select("id, department_id, metadata, queue_definition")
                .eq("id", workUnitId)
                .eq("org_id", orgId)
                .maybeSingle()
        :   Promise.resolve({ data: null, error: null });

    const [layoutRes, wuRes] = await Promise.all([layoutP, wuP]);
    phases.record_layout_ms = Date.now() - tLayout0;

    const layoutParsed = layoutFromEffective(layoutRes);
    if (!layoutParsed || layoutParsed.inquiry_drawer_mode !== "workflow_v1") {
        return {
            ok: false,
            skipped: {
                structureSettled: false,
                reason: layoutParsed ? "classic_layout_deferred" : "layout_unavailable",
                compose_version: OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION,
            },
        };
    }

    const tVisible0 = Date.now();
    const record = await buildOpportunityDrawerVisiblePayload(
        supabase,
        orgId,
        oppRow as Record<string, unknown>,
        { hintDepartmentId: ctxDept }
    );
    phases.visible_entity_ms = Date.now() - tVisible0;

    const wuData = wuRes.data as { id?: string; department_id?: string | null; metadata?: unknown } | null;
    const departmentId =
        ctxDept ||
        trimOrNull(wuData?.department_id) ||
        trimOrNull(record._work_unit_department_id as string | null);

    const deptMetaP =
        departmentId ?
            fetchDepartmentMetadataForActivity(supabase, orgId, departmentId)
        :   Promise.resolve(null);

    const statusDefsP = fetchEffectiveStatusDefinitionsTagged(supabase, orgId, "opportunities", {
        activeOnly: true,
    });

    const [deptMetadata, statusDefsPack, reminders] = await Promise.all([
        deptMetaP,
        statusDefsP,
        loadOpportunityScheduledSendsPreview({
            supabase,
            orgId,
            opportunityId,
            record,
        }),
    ]);

    const statusDefs = statusDefsPack.rows;
    const statusKey =
        record.status_key != null ? String(record.status_key).trim() : null;

    const readinessMemo = createReadinessMemoScope();
    const readiness = tryEvaluateDrawerRecordReadiness({
        orgId,
        opportunityId,
        entity: record,
        departmentId,
        workUnitId: workUnitId || null,
        departmentMetadata: deptMetadata as Record<string, unknown> | null,
        memoScope: readinessMemo,
    });

    const tAttention0 = Date.now();
    const attentionBundle = await attachOpportunityAttentionSuggestionBundle({
        supabase,
        orgId,
        opportunityRow: record,
        defs: statusDefs,
        attentionConfigMetadata: wuData?.metadata ?? null,
        departmentMetadata: deptMetadata,
        departmentId,
        workUnitId: workUnitId || null,
        statusKey,
        preloadedActivityOrgMetadata: {
            workUnitMetadata: wuData?.metadata ?? null,
            departmentMetadata: deptMetadata,
        },
        readiness: readiness ?? null,
        readinessMemoScope: readinessMemo,
    });
    Object.assign(record, attentionBundle);
    phases.attention_bundle_ms = Date.now() - tAttention0;

    const tActions0 = Date.now();
    const resolvedActions = await resolveActionsForContext(supabase, {
        orgId,
        surface: "record_header",
        entityType: "opportunity",
        entityId: opportunityId,
        departmentId,
        workUnitId: workUnitId || null,
        hintOpportunityStatusKey: statusKey,
        hintOpportunityMetadata:
            record.metadata && typeof record.metadata === "object" ?
                (record.metadata as Record<string, unknown>)
            :   null,
    });
    phases.header_actions_ms = Date.now() - tActions0;

    record._record_surface = "full";

    const shell = compileOpportunityDrawerViewModelShell({
        layoutConfig: layoutParsed.config_json,
        record,
    });
    if (!shell) {
        return {
            ok: false,
            skipped: {
                structureSettled: false,
                reason: "layout_unavailable",
                compose_version: OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION,
            },
        };
    }

    const task_assist_enabled = taskAssistEnabledOnServer();
    const aboveFoldRenderModel = buildOpportunityDrawerViewModelAboveFold({
        shell,
        record,
        reminders,
        task_assist_enabled,
    });

    if (!aboveFoldSectionsStructureSettled(aboveFoldRenderModel.sections)) {
        throw new Error("drawer_vm_above_fold_not_structure_settled");
    }

    const headerActions = resolvedActions.header ?? [];
    const tabs = shell.tabs;
    const default_tab: DrawerTabKey = tabs.includes("overview") ? "overview" : (tabs[0] ?? "overview");

    const oper_trust_preview = sanitizeDrawerOperTrustPreviewFromHints({
        hintHeadline: params.hintOperTrustHeadline,
        hintUrgency: params.hintOperTrustUrgency,
    });

    const viewModel: OpportunityDrawerViewModel = {
        generation: computeOpportunityDrawerViewModelGeneration({
            orgId,
            opportunityId,
            departmentId,
            workUnitId: workUnitId || null,
            statusKey,
            layoutVersion: layoutParsed.layout_version,
            headerActionKeys: headerActions.map((a) => a.key),
            aboveFoldSectionKeys: aboveFoldRenderModel.sections.map((s) => s.section_key),
        }),
        structureSettled: true,
        compose_version: OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION,
        entity: { type: "opportunity", id: opportunityId },
        workspace: {
            department_id: departmentId,
            work_unit_id: workUnitId || null,
        },
        header: {
            title: buildOpportunityDrawerHeaderTitle(record),
            subtitle: buildOpportunityDrawerHeaderSubtitle(record),
            status: buildOpportunityStatusControlVm({
                record,
                statusDefs,
                layoutMode: "workflow_v1",
            }),
            oper_trust_preview,
        },
        actions: {
            header: headerActions,
        },
        layout: {
            mode: "workflow_v1",
            tabs,
            default_tab,
            shell,
        },
        above_fold: {
            render_model: aboveFoldRenderModel,
            record: stripOpportunityDrawerRecordStaging(record),
        },
        summaries: {
            tasks: parseInquirySummaryTasksFromRecord(record),
            reminders,
            bos: buildOpportunityDrawerBosSummary(record),
            attention: buildOpportunityDrawerAttentionSummary(attentionBundle._operational_attention),
        },
        background_refresh: {
            allowed: ["task_status", "scheduled_send_status", "readiness_values"],
        },
        timing: {
            compose_ms: Date.now() - composeStart,
            phases_ms: phases,
        },
    };

    return { ok: true, viewModel };
}
