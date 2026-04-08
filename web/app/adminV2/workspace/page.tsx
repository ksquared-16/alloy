"use client";

import { useEffect, useMemo, useState } from "react";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import {
    WorkspaceRootDepartmentGrid,
    type WorkspaceRootDepartmentRow,
} from "@/components/admin/workspace/WorkspaceRootDepartmentGrid";

const WORKSPACE_BASE = "/adminV2/workspace";

/**
 * Organization workspace — top of hierarchy: workspace → department → work unit → record/drawer.
 * Departments load from GET /api/admin/departments (real org rows; no redirect).
 */
export default function AdminV2WorkspaceIndexPage() {
    const [departments, setDepartments] = useState<WorkspaceRootDepartmentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch("/api/admin/departments");
                const json = (await res.json().catch(() => ({}))) as {
                    items?: WorkspaceRootDepartmentRow[];
                    error?: string;
                };
                if (!res.ok) throw new Error(json.error ?? "Failed to load departments");
                const items = json.items ?? [];
                const active = items.filter((d) => d.is_active !== false);
                if (!cancelled) setDepartments(active);
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const subtitle = useMemo(() => {
        if (loading) return "Loading departments…";
        if (error) return error;
        if (departments.length === 0) {
            return "No active departments found for your organization. Add departments under Organization, then return here.";
        }
        return "Pick a department to open its workspace — signals, throughput, and actions are scoped under each function.";
    }, [loading, error, departments.length]);

    return (
        <WorkspaceChrome
            breadcrumbs={[{ href: WORKSPACE_BASE, label: "Workspace" }]}
            title="Organization workspace"
            subtitle={subtitle}
        >
            {loading ? (
                <p className="text-sm text-alloy-midnight/60">Loading…</p>
            ) : error ? (
                <p className="text-sm text-alloy-ember">{error}</p>
            ) : departments.length === 0 ? (
                <p className="text-sm text-alloy-midnight/60">
                    No departments to show. Create one under Organization → Departments.
                </p>
            ) : (
                <>
                    <p className="text-xs font-semibold uppercase tracking-wide text-alloy-forge/70">
                        Departments ({departments.length})
                    </p>
                    <WorkspaceRootDepartmentGrid workspaceBasePath={WORKSPACE_BASE} departments={departments} />
                </>
            )}
        </WorkspaceChrome>
    );
}
