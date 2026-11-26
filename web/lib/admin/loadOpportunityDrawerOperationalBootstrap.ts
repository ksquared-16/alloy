import type { SupabaseClient } from "@supabase/supabase-js";
import { documentActorFromAdminGate } from "@/lib/documents/projectPersonProfilePhotos";
import { fetchEffectiveRecordDrawerLayout } from "@/lib/admin/effectiveRecordDrawerLayout";
import { buildOpportunityDrawerVisiblePayload } from "@/lib/admin/opportunityEntityRecord";
import type {
    OpportunityDrawerBootstrapRecordLayout,
    OpportunityDrawerOperationalBootstrapResponse,
} from "@/lib/admin/opportunityDrawerOperationalBootstrapTypes";
import {
    drawerBootstrapTimingFromPhases,
    type DrawerBootstrapPerfPhases,
} from "@/lib/admin/opportunityDrawerOperationalBootstrapPerf";
import { sanitizeDrawerOperTrustPreviewFromHints } from "@/lib/admin/sanitizeDrawerOperTrustPreview";
import { validateQueueDefinition, type QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";
import type { AdminRouteGateSuccess } from "@/lib/admin/adminRouteGate";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";
import { OPPORTUNITY_CANONICAL_ADMIN_SELECT } from "@/lib/fields/canonicalEntitySelectColumns";
import { tryEvaluateDrawerRecordReadiness } from "@/lib/completion/readinessDrawerBootstrap";
import { createReadinessMemoScope } from "@/lib/completion/readinessEvaluationMemo";
import type { ReadinessResult } from "@/lib/completion/readinessTypes";

export type LoadOpportunityDrawerBootstrapParams = {
    supabase: SupabaseClient;
    gate: AdminRouteGateSuccess;
    opportunityId: string;
    departmentId: string | null;
    workUnitId: string | null;
    hintOpportunityStatusKey?: string | null;
    hintOpportunityMetadata?: Record<string, unknown> | null;
    hintOperTrustHeadline?: string | null;
    hintOperTrustUrgency?: string | null;
    routeGateMs: number;
};

function layoutFromEffective(
    effective: Awaited<ReturnType<typeof fetchEffectiveRecordDrawerLayout>>
): OpportunityDrawerBootstrapRecordLayout | null {
    if (!effective.ok || !effective.layout) return null;
    const cfg = (effective.layout.config_json ?? {}) as RecordLayoutConfigJson;
    const mode = cfg.inquiry_drawer_mode === "workflow_v1" ? "workflow_v1" : "classic";
    return {
        source: effective.layout.source,
        key: effective.layout.key,
        config_json: cfg,
        inquiry_drawer_mode: mode,
    };
}

export async function loadOpportunityDrawerOperationalBootstrap(
    params: LoadOpportunityDrawerBootstrapParams
): Promise<OpportunityDrawerOperationalBootstrapResponse> {
    const loaderT0 = Date.now();
    const phases: DrawerBootstrapPerfPhases = {};
    const { supabase, gate, opportunityId } = params;
    const orgId = gate.orgId;

    const tOpp0 = Date.now();
    const { data: oppRow, error: oppErr } = await supabase
        .from("opportunities")
        .select(OPPORTUNITY_CANONICAL_ADMIN_SELECT)
        .eq("id", opportunityId)
        .eq("org_id", orgId)
        .single();
    phases.opportunity_select_ms = Date.now() - tOpp0;
    if (oppErr || !oppRow) {
        throw new Error(oppErr?.message ?? "Not found");
    }

    const ctxDept = (params.departmentId ?? "").trim();
    const ctxWu = (params.workUnitId ?? "").trim();
    const rowWu = String((oppRow as { work_unit_id?: unknown }).work_unit_id ?? "").trim();
    const workUnitId = ctxWu || rowWu;
    const skipWorkUnitDbLookup = !!(ctxDept && ctxWu);

    const tVis0 = Date.now();
    const entityP = buildOpportunityDrawerVisiblePayload(supabase, orgId, oppRow as Record<string, unknown>, {
        hintDepartmentId: ctxDept || null,
        // Same reason as the drawer VM composer: without the actor the bootstrap seeds
        // `_inquiry_children` with no `resolved_photo_url` and avatars degrade to initials.
        documentActor: documentActorFromAdminGate(gate),
    });
    const tLayout0 = Date.now();
    const layoutP = fetchEffectiveRecordDrawerLayout(supabase, orgId, "opportunity");
    const tWu0 = Date.now();
    const wuP =
        skipWorkUnitDbLookup ?
            Promise.resolve({
                data: { id: ctxWu, department_id: ctxDept, queue_definition: null },
                error: null,
            })
        : workUnitId ?
            supabase
                .from("work_units")
                .select("id, department_id, queue_definition")
                .eq("id", workUnitId)
                .eq("org_id", orgId)
                .maybeSingle()
        :   Promise.resolve({ data: null, error: null });

    const deptMetaP =
        ctxDept ?
            supabase
                .from("departments")
                .select("metadata")
                .eq("id", ctxDept)
                .eq("org_id", orgId)
                .maybeSingle()
        :   Promise.resolve({ data: null, error: null });

    const [entity, layoutRes, wuRes, deptMetaRes] = await Promise.all([
        entityP,
        layoutP,
        wuP,
        deptMetaP,
    ]);
    phases.visible_entity_ms = Date.now() - tVis0;
    phases.record_layout_ms = Date.now() - tLayout0;
    phases.work_unit_ms = Date.now() - tWu0;

    const record_layout = layoutFromEffective(layoutRes);

    let work_unit: OpportunityDrawerOperationalBootstrapResponse["work_unit"] = null;
    if (wuRes.data && !wuRes.error) {
        const wu = wuRes.data as {
            id: string;
            department_id?: string | null;
            queue_definition?: unknown;
        };
        let queue_definition: QueueDefinitionV1 | null = null;
        try {
            if (wu.queue_definition && typeof wu.queue_definition === "object") {
                queue_definition = validateQueueDefinition(wu.queue_definition);
            }
        } catch {
            queue_definition = null;
        }
        const dept = String(wu.department_id ?? "").trim();
        if (dept) {
            work_unit = {
                id: String(wu.id),
                department_id: dept,
                queue_definition,
            };
        }
    }

    const deptFromEntity = String((entity as { _work_unit_department_id?: unknown })._work_unit_department_id ?? "").trim();
    const departmentId = ctxDept || work_unit?.department_id || deptFromEntity || null;

    const departmentMetadata =
        deptMetaRes.data &&
        typeof (deptMetaRes.data as { metadata?: unknown }).metadata === "object" &&
        !Array.isArray((deptMetaRes.data as { metadata?: unknown }).metadata)
            ? ((deptMetaRes.data as { metadata: Record<string, unknown> }).metadata)
            : null;

    const readinessMemo = createReadinessMemoScope();
    const readiness = tryEvaluateDrawerRecordReadiness({
        orgId,
        opportunityId,
        entity: entity as Record<string, unknown>,
        departmentId,
        workUnitId: workUnitId || null,
        departmentMetadata,
        memoScope: readinessMemo,
    });

    /** Header actions load client-side after primary reveal — keeps bootstrap off the critical path. */
    const tAct0 = Date.now();
    phases.record_header_actions_ms = Date.now() - tAct0;

    const oper_trust_preview = sanitizeDrawerOperTrustPreviewFromHints({
        hintHeadline: params.hintOperTrustHeadline,
        hintUrgency: params.hintOperTrustUrgency,
    });
    phases.oper_trust_preview_ms = 0;

    const totalMs = Date.now() - loaderT0;
    phases.total_loader_ms = totalMs;

    return {
        entity,
        record_layout,
        record_header_actions: null,
        work_unit,
        workspace_scope: {
            department_id: departmentId,
            work_unit_id: workUnitId || null,
        },
        oper_trust_preview,
        readiness: readiness ?? null,
        timing: drawerBootstrapTimingFromPhases(params.routeGateMs, phases, totalMs),
    };
}
