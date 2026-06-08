"use client";

import { useCallback, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { createLifecycleViaBuilderPath } from "@/lib/lifecycle/clientCreateLifecycleViaBuilder";
import { isLifecycleDebugUiEnabled } from "@/lib/lifecycle/lifecycleDebugUi";
import { simulationLifecycleDisplayName } from "@/lib/lifecycle/lifecycleSimulationMarkers";
import type { LifecyclePersistenceAudit } from "@/lib/lifecycle/auditLifecyclePersistence";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

type VerifyResult = {
    create: { runtimeDepartmentId: string; processId: string; lifecycleName: string };
    audit: LifecyclePersistenceAudit;
    departments_api_includes_id: boolean;
};

export default function LifecycleDevCreateVerifyButton() {
    const { userId } = useAdminAuth();
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<VerifyResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const run = useCallback(async () => {
        if (!userId) {
            setError("No user id in session");
            return;
        }
        setBusy(true);
        setError(null);
        setResult(null);
        const suffix = Date.now().toString(36).slice(-4);
        const name = simulationLifecycleDisplayName(`Verify Lifecycle ${suffix}`);
        try {
            const created = await createLifecycleViaBuilderPath({
                lifecycleName: name,
                primaryEntity: "opportunity",
                createdByUserId: userId,
            });

            const deptRes = await fetch("/api/admin/departments", workspaceDataFetchInit());
            const deptJ = (await deptRes.json().catch(() => ({}))) as { items?: { id: string }[]; error?: string };
            if (!deptRes.ok) throw new Error(deptJ.error ?? "departments API failed");
            const apiIds = (deptJ.items ?? []).map((d) => d.id);
            const departments_api_includes_id = apiIds.includes(created.runtimeDepartmentId);
            if (!departments_api_includes_id) {
                throw new Error(
                    `GET /api/admin/departments missing runtimeDepartmentId ${created.runtimeDepartmentId}. ids=[${apiIds.join(", ")}]`
                );
            }

            const auditRes = await fetch(
                `/api/admin/departments/${encodeURIComponent(created.runtimeDepartmentId)}/persistence-audit?process_id=${encodeURIComponent(created.processId)}`,
                workspaceDataFetchInit()
            );
            const auditJ = (await auditRes.json().catch(() => ({}))) as {
                audit?: LifecyclePersistenceAudit;
                error?: string;
            };
            if (!auditRes.ok || !auditJ.audit) {
                throw new Error(auditJ.error ?? "Persistence audit failed");
            }
            if (!auditJ.audit.department_row_exists) {
                throw new Error("Persistence audit: department_row_exists is false");
            }
            if (!auditJ.audit.builder_owned_marker) {
                throw new Error("Persistence audit: missing lifecycle_builder_owned_v1");
            }

            setResult({
                create: created,
                audit: auditJ.audit,
                departments_api_includes_id,
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Verify failed");
        } finally {
            setBusy(false);
        }
    }, [userId]);

    if (!isLifecycleDebugUiEnabled()) return null;

    return (
        <div
            className="rounded-lg border border-dashed border-violet-400/50 bg-violet-50/40 p-3"
            data-testid="lifecycle-dev-create-verify"
        >
            <p className="text-[11px] font-semibold text-violet-950">Dev: Create test lifecycle and verify</p>
            <p className="mt-0.5 text-[10px] text-violet-900/75">
                Uses the same POST /api/admin/departments + lifecycle-builder path as Create Lifecycle.
            </p>
            <button
                type="button"
                className="mt-2 rounded-md bg-violet-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                disabled={busy}
                onClick={() => void run()}
            >
                {busy ? "Running…" : "Create + verify"}
            </button>
            {error ? (
                <pre className="mt-2 max-h-32 overflow-auto text-[10px] text-red-800">{error}</pre>
            ) : null}
            {result ? (
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[10px] text-violet-950">
                    {JSON.stringify(result, null, 2)}
                </pre>
            ) : null}
        </div>
    );
}
