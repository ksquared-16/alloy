"use client";

import { useCallback, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { notifyWorkspaceDepartmentsChanged } from "@/lib/workspace/notifyWorkspaceDepartmentsChanged";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

type CleanupResponse = {
    dry_run: boolean;
    removed: Array<{ department_id: string; name: string; deleted: boolean; error?: string }>;
    error?: string;
};

export default function LifecycleTestCleanupButton({ onCleaned }: { onCleaned?: () => void | Promise<void> }) {
    const { orgId, userId, role } = useAdminAuth();
    const [busy, setBusy] = useState(false);
    const [preview, setPreview] = useState<CleanupResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    const run = useCallback(
        async (confirm: boolean) => {
            setBusy(true);
            setError(null);
            try {
                const res = await fetch("/api/admin/lifecycle-catalog/cleanup-test", {
                    ...workspaceDataFetchInit(),
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ dry_run: !confirm, confirm }),
                });
                const j = (await res.json().catch(() => ({}))) as CleanupResponse;
                if (!res.ok) throw new Error(j.error ?? "Cleanup failed");
                setPreview(j);
                if (confirm) {
                    notifyWorkspaceDepartmentsChanged(orgId, userId, null);
                    await onCleaned?.();
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : "Cleanup failed");
            } finally {
                setBusy(false);
            }
        },
        [orgId, userId, onCleaned]
    );

    if (role !== "admin") return null;

    return (
        <div
            className="rounded-lg border border-alloy-forge/12 bg-alloy-stone/5 px-3 py-2"
            data-testid="lifecycle-test-cleanup"
        >
            <p className="text-[11px] font-medium text-alloy-midnight/70">Admin: Remove test lifecycles</p>
            <p className="mt-0.5 text-[10px] text-alloy-midnight/50">
                Deletes only builder-owned or simulation departments with test names (e.g. Admissions Test). Never
                removes Enrollment, Operations, Finance, Compliance, or System.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
                <button
                    type="button"
                    className="rounded-md border border-alloy-forge/20 px-2.5 py-1 text-[10px] font-medium disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void run(false)}
                    data-testid="lifecycle-test-cleanup-preview"
                >
                    Preview
                </button>
                <button
                    type="button"
                    className="rounded-md bg-red-800 px-2.5 py-1 text-[10px] font-medium text-white disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void run(true)}
                    data-testid="lifecycle-test-cleanup-confirm"
                >
                    {busy ? "Working…" : "Remove test lifecycles"}
                </button>
            </div>
            {error ? <p className="mt-2 text-[10px] text-red-700">{error}</p> : null}
            {preview?.removed?.length ? (
                <ul className="mt-2 max-h-24 overflow-auto text-[10px] text-alloy-midnight/65">
                    {preview.removed.map((r) => (
                        <li key={r.department_id}>
                            {r.name}
                            {preview.dry_run ? " (preview)" : r.deleted ? " — removed" : ` — ${r.error ?? "failed"}`}
                        </li>
                    ))}
                </ul>
            ) : preview && !preview.removed.length ? (
                <p className="mt-2 text-[10px] text-alloy-midnight/50">No test lifecycles matched.</p>
            ) : null}
        </div>
    );
}
