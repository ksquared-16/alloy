"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import WorkUnitWorkspace from "@/app/adminV2/components/workspace/shells/WorkUnitWorkspace";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { executeOpportunityRecordAction } from "@/lib/recordChrome/executeOpportunityRecordAction";
import type { WorkspaceAction } from "@/lib/ui-v2/workspace-actions";
import type { WorkspaceOpportunityQueueRuntime } from "@/lib/workspace/types";
import { buildRealOpportunityWorkUnitWorkspaceModel } from "@/lib/ui-v2/adapters/realWorkUnitFromOpportunities";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { workspaceRouteParam } from "@/lib/workspace/workspaceRouteParam";

const WORKSPACE_BASE = "/adminV2/workspace";

type WorkUnitRow = {
    id: string;
    department_id: string;
    key: string | null;
    name: string | null;
};

type DeptRow = { id: string; name: string | null; key: string | null };

export default function AdminV2OpportunityWorkUnitPage() {
    const params = useParams();
    const departmentId = workspaceRouteParam(params.departmentId);
    const workUnitId = workspaceRouteParam(params.workUnitId);
    const searchParams = useSearchParams();
    const { openDrawer, drawer } = useAdminDrawer();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [workUnit, setWorkUnit] = useState<WorkUnitRow | null>(null);
    const [dept, setDept] = useState<DeptRow | null>(null);
    const [oq, setOq] = useState<WorkspaceOpportunityQueueRuntime | null>(null);
    const [needsAttentionWorkUnitId, setNeedsAttentionWorkUnitId] = useState<string | null>(null);

    useEffect(() => {
        if (!departmentId || !workUnitId) {
            setLoading(false);
            setWorkUnit(null);
            setDept(null);
            setOq(null);
            setNeedsAttentionWorkUnitId(null);
            setError("Missing department or work unit in the URL.");
            return;
        }

        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            const init = workspaceDataFetchInit();
            try {
                if (!cancelled) {
                    setWorkUnit(null);
                    setDept(null);
                    setOq(null);
                    setNeedsAttentionWorkUnitId(null);
                }

                const [wuRes, deptRes, deptWusRes] = await Promise.all([
                    fetch(`/api/admin/work-units/${encodeURIComponent(workUnitId)}`, init),
                    fetch(`/api/admin/departments/${encodeURIComponent(departmentId)}`, init),
                    fetch(`/api/admin/work-units?department_id=${encodeURIComponent(departmentId)}`, init),
                ]);

                const wuJson = (await wuRes.json().catch(() => ({}))) as { error?: string } & Partial<WorkUnitRow>;
                const deptJson = (await deptRes.json().catch(() => ({}))) as { error?: string } & Partial<DeptRow>;
                const deptWusJson = (await deptWusRes.json().catch(() => ({}))) as {
                    error?: string;
                    items?: Array<{ id: string; key?: string | null }>;
                };

                if (!wuRes.ok) throw new Error(wuJson.error ?? "Failed to load work unit");
                if (!deptRes.ok) throw new Error(deptJson.error ?? "Failed to load department");

                const wu = wuJson as WorkUnitRow;
                if (wu.department_id !== departmentId) {
                    throw new Error("Work unit does not belong to this department");
                }

                const isAttention = (wu.key ?? "").trim().toLowerCase() === "needs_attention";
                let oqRuntime: WorkspaceOpportunityQueueRuntime;
                try {
                    const oqRes = await fetch(
                        `/api/admin/work-units/${encodeURIComponent(workUnitId)}/${isAttention ? "opportunity-attention-queue" : "opportunity-queue"}`,
                        init
                    );
                    const oqJson = (await oqRes.json().catch(() => ({}))) as {
                        error?: string;
                        total?: number;
                        items?: WorkspaceOpportunityQueueRuntime["items"];
                    };
                    if (!oqRes.ok) {
                        oqRuntime = {
                            total: 0,
                            error: oqJson.error ?? "Failed to load queue",
                            items: [],
                        };
                    } else {
                        oqRuntime = {
                            total: typeof oqJson.total === "number" ? oqJson.total : 0,
                            error: null,
                            items: oqJson.items ?? [],
                        };
                    }
                } catch (e) {
                    const msg = e instanceof Error ? e.message : "Queue request failed";
                    oqRuntime = { total: 0, error: msg, items: [] };
                }

                const naList = deptWusRes.ok ? (deptWusJson.items ?? []) : [];
                const naWu = naList.find((r) => String(r.key ?? "").trim().toLowerCase() === "needs_attention");

                if (!cancelled) {
                    setWorkUnit(wu);
                    setDept(deptJson as DeptRow);
                    setOq(oqRuntime);
                    setNeedsAttentionWorkUnitId(naWu?.id ?? null);
                }
            } catch (e) {
                if (!cancelled) {
                    setError((e as Error).message);
                    setWorkUnit(null);
                    setDept(null);
                    setOq(null);
                    setNeedsAttentionWorkUnitId(null);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [departmentId, workUnitId]);

    const model = useMemo(() => {
        if (!workUnit || !dept || !oq) return null;
        const rawItems = oq.items ?? [];
        const statusKeysRaw = (searchParams?.get("status_keys") ?? "").trim();
        const statusKeys = statusKeysRaw
            ? statusKeysRaw
                  .split(",")
                  .map((s) => s.trim().toLowerCase())
                  .filter(Boolean)
            : [];
        const attentionReason = (searchParams?.get("attention_reason") ?? "").trim();

        const filteredItems = rawItems.filter((it) => {
            if (statusKeys.length) {
                const sk = String(it.status_key ?? "").trim().toLowerCase();
                if (!statusKeys.includes(sk)) return false;
            }
            if (attentionReason) {
                const rl = String((it as { _attention_reason_label?: string | null })._attention_reason_label ?? "").trim();
                if (rl !== attentionReason) return false;
            }
            return true;
        });

        const oqFiltered: WorkspaceOpportunityQueueRuntime = {
            total: filteredItems.length,
            error: oq.error,
            items: filteredItems,
        };
        return buildRealOpportunityWorkUnitWorkspaceModel({
            workUnitId: workUnit.id,
            workUnitKey: workUnit.key ?? "work_unit",
            workUnitName: workUnit.name ?? "Work unit",
            departmentId,
            deptName: dept.name ?? "Department",
            departmentKey: dept.key,
            oq: oqFiltered,
        });
    }, [departmentId, dept, oq, searchParams, workUnit]);

    const onAction = useCallback(
        async (action: WorkspaceAction) => {
            if (action.type === "queue.item.action" && action.actionId === "open_record") {
                openDrawer({ type: "opportunities", id: action.itemId });
                return;
            }
            if (action.type === "queue.item.action" && action.actionId && action.itemId) {
                if (action.actionId === "crm_mailto" || action.actionId === "crm_tel") {
                    const href = action.payload && typeof action.payload.href === "string" ? action.payload.href : "";
                    if (href) window.location.href = href;
                    return;
                }
                // Map queue quick actions → opportunity record actions (event keys).
                const eventKey = action.actionId;
                if (eventKey === "start_quote" || eventKey === "open_quote") {
                    openDrawer({ type: "opportunities", id: action.itemId, defaultOpportunitySurface: "quote_intake" });
                    return;
                }
                const r = await executeOpportunityRecordAction({ opportunityId: action.itemId, eventKey });
                if (r.ok) {
                    // Drawer close will cause refetch in other lanes; here we just rely on refresh-on-next navigation.
                    // Keep simple: do nothing.
                }
                return;
            }
            if (action.type === "actions.block") {
                if (action.actionId === "back_department" || action.actionId === "wu_back_department") {
                    window.location.href = `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}`;
                    return;
                }
                if (action.actionId === "open_admin_opportunities" || action.actionId === "wu_open_all_inquiries") {
                    window.location.href = "/admin/opportunities";
                    return;
                }
                if (action.actionId === "wu_new_inquiry") {
                    window.location.href = "/admin/opportunities";
                    return;
                }
                if (action.actionId === "wu_open_needs_attention") {
                    if (needsAttentionWorkUnitId) {
                        window.location.href = `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(needsAttentionWorkUnitId)}`;
                    } else {
                        window.location.href = `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}`;
                    }
                    return;
                }
                if (action.actionId === "wu_manage_work_units") {
                    window.location.href = "/admin/system/work-units";
                    return;
                }
                if (action.actionId === "wu_workspace_root") {
                    window.location.href = WORKSPACE_BASE;
                }
            }
        },
        [departmentId, needsAttentionWorkUnitId, openDrawer]
    );

    const deptName = dept?.name?.trim() || "Department";
    const wuName = workUnit?.name?.trim() || "Work unit";

    return (
        <WorkspaceChrome
            variant="bridge"
            breadcrumbs={[
                { href: WORKSPACE_BASE, label: "Workspace" },
                { href: `${WORKSPACE_BASE}/dept/${departmentId}`, label: deptName },
                { href: `${WORKSPACE_BASE}/dept/${departmentId}/work-unit/${workUnitId}`, label: wuName },
            ]}
            title={wuName}
            subtitle=""
        >
            {loading ? (
                <p className="text-sm text-alloy-midnight/60 py-4">Loading work unit…</p>
            ) : model ? (
                <WorkUnitWorkspace model={model} onAction={onAction} />
            ) : (
                <p className="text-sm text-alloy-ember px-1 py-4">{error ?? "Unable to load this work unit."}</p>
            )}
        </WorkspaceChrome>
    );
}

