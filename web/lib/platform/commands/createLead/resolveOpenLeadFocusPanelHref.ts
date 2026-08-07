/**
 * Resolve Open Lead Focus Panel href when Create Lead succeeds without a
 * session-owned Work Unit (e.g. BOS started from workspace home).
 *
 * Prefers an already-correct Work View href; otherwise loads the created opportunity's
 * work unit + department Work Views and builds the operator nav URL
 * (`/workspace/work-unit/leads?work_view_id=new_leads&subject_id=…`).
 * Rejects internal lifecycle stage work-unit slugs as destinations.
 */

import { isLifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { resolveCreateLeadWorkViewForHandoff } from "@/lib/platform/commands/createLead/resolveCreateLeadWorkViewForHandoff";
import { resolveCreatedRecordProcessContextHref } from "@/lib/platform/commands/createLead/resolveCreatedRecordProcessContextHref";
import { workUnitRouteSlugToKey } from "@/lib/admin/workUnitRouteSlug";

const WORKSPACE_HOME = "/workspace";

function isCanonicalFocusPanelHref(href: string): boolean {
    if (href === WORKSPACE_HOME || !href.includes("subject_id=")) return false;
    if (!/\/workspace\/work-unit\//.test(href)) return false;
    const slugMatch = href.match(/\/workspace\/work-unit\/([^/?#]+)/);
    const slugKey = slugMatch?.[1] ? workUnitRouteSlugToKey(decodeURIComponent(slugMatch[1])) : "";
    if (slugKey && isLifecycleStageWorkUnitKey(slugKey)) return false;
    return true;
}

async function readOpportunityWorkUnitId(
    opportunityId: string,
    fetchFn: typeof fetch,
): Promise<string> {
    try {
        const res = await fetchFn(
            `/api/admin/entity/opportunities/${encodeURIComponent(opportunityId)}`,
            { credentials: "include" },
        );
        if (!res.ok) return "";
        const body = (await res.json()) as {
            data?: { entity?: { work_unit_id?: string | null; status_key?: string | null; stage_key?: string | null } };
            entity?: { work_unit_id?: string | null; status_key?: string | null; stage_key?: string | null };
            work_unit_id?: string | null;
            status_key?: string | null;
            stage_key?: string | null;
        };
        const fromEnvelope = body.data?.entity?.work_unit_id;
        const fromLegacy = body.entity?.work_unit_id ?? body.work_unit_id;
        const raw = typeof fromEnvelope === "string" ? fromEnvelope : fromLegacy;
        return typeof raw === "string" ? raw.trim() : "";
    } catch {
        return "";
    }
}

async function readOpportunityStatusStage(
    opportunityId: string,
    fetchFn: typeof fetch,
): Promise<{ statusKey: string; stageKey: string }> {
    try {
        const res = await fetchFn(
            `/api/admin/entity/opportunities/${encodeURIComponent(opportunityId)}`,
            { credentials: "include" },
        );
        if (!res.ok) return { statusKey: "", stageKey: "" };
        const body = (await res.json()) as {
            data?: { entity?: { status_key?: string | null; stage_key?: string | null } };
            entity?: { status_key?: string | null; stage_key?: string | null };
            status_key?: string | null;
            stage_key?: string | null;
        };
        const entity = body.data?.entity ?? body.entity ?? body;
        return {
            statusKey: typeof entity.status_key === "string" ? entity.status_key.trim() : "",
            stageKey: typeof entity.stage_key === "string" ? entity.stage_key.trim() : "",
        };
    } catch {
        return { statusKey: "", stageKey: "" };
    }
}

async function readWorkUnitRow(
    workUnitId: string,
    fetchFn: typeof fetch,
): Promise<{ key: string; departmentId: string }> {
    try {
        const res = await fetchFn(`/api/admin/work-units/${encodeURIComponent(workUnitId)}`, {
            credentials: "include",
        });
        if (!res.ok) return { key: "", departmentId: "" };
        const body = (await res.json()) as {
            key?: string | null;
            department_id?: string | null;
        };
        return {
            key: typeof body.key === "string" ? body.key.trim() : "",
            departmentId: typeof body.department_id === "string" ? body.department_id.trim() : "",
        };
    } catch {
        return { key: "", departmentId: "" };
    }
}

async function readDepartmentMetadata(
    departmentId: string,
    fetchFn: typeof fetch,
): Promise<unknown | null> {
    try {
        const res = await fetchFn(`/api/admin/departments/${encodeURIComponent(departmentId)}`, {
            credentials: "include",
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { metadata?: unknown };
        return body.metadata ?? null;
    } catch {
        return null;
    }
}

export async function resolveOpenLeadFocusPanelHref(args: {
    preferredHref?: string | null;
    opportunityId: string | null | undefined;
    /** Optional: when the command was started inside a Work Unit. */
    sessionWorkUnitId?: string | null;
    /** From Create Lead success detail when already resolved server-side. */
    workViewId?: string | null;
    workViewRouteKey?: string | null;
    statusKey?: string | null;
    stageKey?: string | null;
    fetchImpl?: typeof fetch;
}): Promise<string> {
    const fetchFn = args.fetchImpl ?? fetch;
    const opportunityId =
        typeof args.opportunityId === "string" ? args.opportunityId.trim() : "";
    const preferred = typeof args.preferredHref === "string" ? args.preferredHref.trim() : "";
    const workViewId = typeof args.workViewId === "string" ? args.workViewId.trim() : "";
    const workViewRouteKey =
        typeof args.workViewRouteKey === "string" ? args.workViewRouteKey.trim() : "";

    if (preferred && isCanonicalFocusPanelHref(preferred)) {
        return preferred;
    }

    if (opportunityId && (workViewId || workViewRouteKey)) {
        return resolveCreatedRecordProcessContextHref({
            recordId: opportunityId,
            workViewId: workViewId || null,
            workViewRouteKey: workViewRouteKey || null,
        });
    }

    if (!opportunityId) {
        return preferred || WORKSPACE_HOME;
    }

    let workUnitId =
        typeof args.sessionWorkUnitId === "string" ? args.sessionWorkUnitId.trim() : "";

    if (!workUnitId) {
        workUnitId = await readOpportunityWorkUnitId(opportunityId, fetchFn);
    }

    if (!workUnitId) {
        return preferred || WORKSPACE_HOME;
    }

    const wu = await readWorkUnitRow(workUnitId, fetchFn);
    if (!wu.key) {
        return preferred || WORKSPACE_HOME;
    }

    let statusKey = typeof args.statusKey === "string" ? args.statusKey.trim() : "";
    let stageKey = typeof args.stageKey === "string" ? args.stageKey.trim() : "";
    if (!statusKey || !stageKey) {
        const fromOpp = await readOpportunityStatusStage(opportunityId, fetchFn);
        statusKey = statusKey || fromOpp.statusKey;
        stageKey = stageKey || fromOpp.stageKey || "lead";
    }

    if (wu.departmentId) {
        const metadata = await readDepartmentMetadata(wu.departmentId, fetchFn);
        const handoff = resolveCreateLeadWorkViewForHandoff({
            departmentMetadata: metadata,
            statusKey,
            stageKey,
        });
        if (handoff) {
            return resolveCreatedRecordProcessContextHref({
                recordId: opportunityId,
                workViewId: handoff.workViewId,
                workViewRouteKey: handoff.workViewRouteKey,
            });
        }
    }

    if (isLifecycleStageWorkUnitKey(wu.key)) {
        return preferred && isCanonicalFocusPanelHref(preferred)
            ? preferred
            : WORKSPACE_HOME;
    }

    return resolveCreatedRecordProcessContextHref({
        recordId: opportunityId,
        workUnitKey: wu.key,
    });
}
