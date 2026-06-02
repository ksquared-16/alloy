"use client";

import { useCallback, useEffect, useState } from "react";
import { isLifecycleDebugUiEnabled } from "@/lib/lifecycle/lifecycleDebugUi";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

type AccessScopeDebug = {
    user_id: string;
    org_id: string;
    role: string;
    role_keys: string[];
    is_portal_admin_or_ops: boolean;
    is_portal_admin_mutate: boolean;
    compatibility_portal_role: string;
    user_access_profiles: { department_scope: string; site_scope: string } | null;
    department_scope_raw: string;
    department_scope_effective: string;
    allowed_department_ids_count_raw: number | null;
    allowed_department_ids_count_effective: number | null;
    portal_admin_bypasses_department_scope: boolean;
    department_scope_rule: string;
    site_scope_effective: string;
};

export default function AdminAccessScopeDebugPanel({ surface }: { surface: "lifecycle" | "workspace" }) {
    const [data, setData] = useState<AccessScopeDebug | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const res = await fetch("/api/admin/access-scope-debug", workspaceDataFetchInit());
            const j = (await res.json().catch(() => ({}))) as AccessScopeDebug & { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Failed to load access scope");
            setData(j);
        } catch (e) {
            setData(null);
            setError(e instanceof Error ? e.message : "Failed to load");
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    if (!isLifecycleDebugUiEnabled()) return null;

    return (
        <aside
            className="rounded-lg border border-dashed border-sky-400/45 bg-sky-50/50 p-3"
            data-testid={`admin-access-scope-debug-${surface}`}
        >
            <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-sky-950">Access scope debug ({surface})</p>
                <button
                    type="button"
                    className="text-[10px] text-sky-800 underline"
                    onClick={() => void load()}
                >
                    Refresh
                </button>
            </div>
            {error ? (
                <p className="mt-1 text-[10px] text-red-700">{error}</p>
            ) : data ? (
                <dl className="mt-2 grid gap-1 font-mono text-[10px] text-sky-950/90">
                    <div>
                        <dt className="inline opacity-60">user_id: </dt>
                        <dd className="inline break-all">{data.user_id}</dd>
                    </div>
                    <div>
                        <dt className="inline opacity-60">org_id: </dt>
                        <dd className="inline break-all">{data.org_id}</dd>
                    </div>
                    <div>
                        <dt className="inline opacity-60">role / keys: </dt>
                        <dd className="inline">
                            {data.role} [{data.role_keys.join(", ")}]
                        </dd>
                    </div>
                    <div>
                        <dt className="inline opacity-60">admin mutate: </dt>
                        <dd className="inline">{data.is_portal_admin_mutate ? "yes" : "no"}</dd>
                    </div>
                    <div>
                        <dt className="inline opacity-60">dept scope raw → effective: </dt>
                        <dd className="inline">
                            {data.department_scope_raw} → {data.department_scope_effective}
                            {data.portal_admin_bypasses_department_scope ? " (portal bypass)" : ""}
                        </dd>
                    </div>
                    <div>
                        <dt className="inline opacity-60">allowed dept count raw / effective: </dt>
                        <dd className="inline">
                            {data.allowed_department_ids_count_raw ?? "n/a"} /{" "}
                            {data.allowed_department_ids_count_effective ?? "n/a"}
                        </dd>
                    </div>
                    <div className="text-[9px] leading-snug text-sky-900/80">{data.department_scope_rule}</div>
                </dl>
            ) : (
                <p className="mt-1 text-[10px] text-sky-900/60">Loading…</p>
            )}
        </aside>
    );
}
