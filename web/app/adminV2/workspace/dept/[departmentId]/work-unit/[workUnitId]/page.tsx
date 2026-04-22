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
    const departmentId = typeof params.departmentId === "string" ? params.departmentId : "";
    const workUnitId = typeof params.workUnitId === "string" ? params.workUnitId : "";
    const searchParams = useSearchParams();
    const { openDrawer, drawer } = useAdminDrawer();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [workUnit, setWorkUnit] = useState<WorkUnitRow | null>(null);
    const [dept, setDept] = useState<DeptRow | null>(null);
    const [oq, setOq] = useState<WorkspaceOpportunityQueueRuntime | null>(null);

    useEffect(() => {
        if (!departmentId || !workUnitId) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const [wuRes, deptRes] = await Promise.all([
                    fetch(`/api/admin/work-units/${encodeURIComponent(workUnitId)}`),
                    fetch(`/api/admin/departments/${encodeURIComponent(departmentId)}`),
                ]);

                const wuJson = (await wuRes.json().catch(() => ({}))) as { error?: string } & Partial<WorkUnitRow>;
                const deptJson = (await deptRes.json().catch(() => ({}))) as { error?: string } & Partial<DeptRow>;

                if (!wuRes.ok) throw new Error(wuJson.error ?? "Failed to load work unit");
                if (!deptRes.ok) throw new Error(deptJson.error ?? "Failed to load department");

                const wu = wuJson as WorkUnitRow;
                if (wu.department_id !== departmentId) {
                    throw new Error("Work unit does not belong to this department");
                }

                const isAttention = (wu.key ?? "").trim().toLowerCase() === "needs_attention";
                const oqRes = await fetch(
                    `/api/admin/work-units/${encodeURIComponent(workUnitId)}/${isAttention ? "opportunity-attention-queue" : "opportunity-queue"}`
                );
                const oqJson = (await oqRes.json().catch(() => ({}))) as {
                    error?: string;
                    total?: number;
                    items?: WorkspaceOpportunityQueueRuntime["items"];
                };
                if (!oqRes.ok) throw new Error(oqJson.error ?? "Failed to load queue");

                const oqRuntime: WorkspaceOpportunityQueueRuntime = {
                    total: typeof oqJson.total === "number" ? oqJson.total : 0,
                    error: null,
                    items: oqJson.items ?? [],
                };

                if (!cancelled) {
                    setWorkUnit(wu);
                    setDept(deptJson as DeptRow);
                    setOq(oqRuntime);
                }
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
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
                if (action.actionId === "back_department") {
                    window.location.href = `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}`;
                }
                if (action.actionId === "open_admin_opportunities") {
                    window.location.href = "/admin/opportunities";
                }
            }
        },
        [departmentId, openDrawer]
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
            {error ? <p className="text-sm text-alloy-ember px-1">{error}</p> : null}
            {loading || !model ? (
                <p className="text-sm text-alloy-midnight/60 py-4">Loading work unit…</p>
            ) : (
                <WorkUnitWorkspace model={model} onAction={onAction} />
            )}
        </WorkspaceChrome>
    );
}

