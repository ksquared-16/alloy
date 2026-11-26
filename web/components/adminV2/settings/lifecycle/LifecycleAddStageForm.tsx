"use client";

import { useCallback, useState } from "react";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export default function LifecycleAddStageForm({
    departmentId,
    processId,
    isFirstStage,
    onCreated,
}: {
    departmentId: string;
    processId: string;
    isFirstStage: boolean;
    onCreated: (stageKey: string) => void | Promise<void>;
}) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = useCallback(async () => {
        const trimmed = name.trim();
        if (!trimmed) {
            setError("Stage name is required");
            return;
        }
        const dept = departmentId.trim();
        const pid = processId.trim();
        if (!dept || !pid) {
            setError("Lifecycle workspace is not ready — wait for create to finish, then try again.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/departments/${encodeURIComponent(dept)}/lifecycle-builder`,
                {
                    ...workspaceDataFetchInit(),
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "add_stage",
                        process_id: pid,
                        label: trimmed,
                        description: description.trim() || undefined,
                    }),
                }
            );
            const j = (await res.json().catch(() => ({}))) as {
                error?: string;
                stages?: { key: string; label: string }[];
            };
            if (!res.ok) throw new Error(j.error ?? "Failed to create stage");

            const created = (j.stages ?? []).find((s) => s.label === trimmed);
            const stageKey = created?.key ?? j.stages?.[j.stages.length - 1]?.key ?? "";

            setName("");
            setDescription("");
            await onCreated(stageKey);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to create stage");
        } finally {
            setBusy(false);
        }
    }, [departmentId, processId, name, description, onCreated]);

    return (
        <section
            className="rounded-xl border border-alloy-forge/12 bg-white/90 p-5 shadow-sm"
            data-testid="lifecycle-add-stage-form"
        >
            <h2 className="text-sm font-semibold text-alloy-midnight">
                {isFirstStage ? "Add your first stage" : "Add a stage"}
            </h2>
            <p className="mt-0.5 text-xs text-alloy-midnight/55">
                Stages are the steps operators move work through.
            </p>

            {error ? (
                <p className="mt-2 text-xs text-red-700" role="alert">
                    {error}
                </p>
            ) : null}

            <div className="mt-3 space-y-2">
                <label className="block text-xs font-medium text-alloy-midnight/70">
                    Stage name
                    <input
                        type="text"
                        className="mt-0.5 w-full rounded-md border border-alloy-forge/20 px-2 py-1.5 text-sm"
                        placeholder="Lead, Tour, Decision…"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        data-testid="lifecycle-add-stage-name"
                    />
                </label>
                <label className="block text-xs font-medium text-alloy-midnight/70">
                    Short description (optional)
                    <input
                        type="text"
                        className="mt-0.5 w-full rounded-md border border-alloy-forge/20 px-2 py-1.5 text-sm"
                        placeholder="What happens in this stage?"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        data-testid="lifecycle-add-stage-description"
                    />
                </label>
            </div>

            <button
                type="button"
                className="mt-4 rounded-md bg-alloy-pine px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                disabled={busy || !name.trim()}
                onClick={() => void submit()}
                data-testid="lifecycle-add-stage-submit"
            >
                {busy ? "Creating…" : "Create stage"}
            </button>
        </section>
    );
}
