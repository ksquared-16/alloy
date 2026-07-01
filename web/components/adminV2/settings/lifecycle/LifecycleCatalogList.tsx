"use client";

import type { LifecycleCatalogEntry, LifecycleWorkspaceRuntimeStatus } from "@/lib/lifecycle/lifecycleCatalogTypes";

function runtimeLabel(status: LifecycleWorkspaceRuntimeStatus): string {
    switch (status) {
        case "visible":
            return "Visible on workspace";
        case "access_issue":
            return "Access issue";
        case "name_mismatch":
            return "Name mismatch";
        case "inactive":
            return "Inactive";
        default:
            return "Not visible";
    }
}

export default function LifecycleCatalogList({
    items,
    selectedId,
    loading,
    repairingId,
    onSelect,
    onCreateNew,
    onRepair,
    onDelete,
}: {
    items: LifecycleCatalogEntry[];
    selectedId: string | null;
    loading: boolean;
    repairingId: string | null;
    onSelect: (entry: LifecycleCatalogEntry) => void;
    onCreateNew: () => void;
    onRepair: (entry: LifecycleCatalogEntry) => void;
    onDelete: (entry: LifecycleCatalogEntry) => void;
}) {
    if (loading) {
        return <p className="text-xs text-alloy-midnight/50">Loading Lifecycles…</p>;
    }

    return (
        <section className="space-y-3" data-testid="lifecycle-catalog-list">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-alloy-midnight">Available Lifecycles</h2>
                <button
                    type="button"
                    className="rounded-md bg-alloy-pine px-3 py-1.5 text-xs font-medium text-white"
                    onClick={onCreateNew}
                    data-testid="lifecycle-catalog-create-new"
                >
                    Create new Lifecycle
                </button>
            </div>

            {!items.length ? (
                <p className="text-xs text-alloy-midnight/55">No Lifecycles configured yet. Create one to begin.</p>
            ) : (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {items.map((entry) => {
                        const selected = selectedId === entry.id;
                        const visible = entry.workspace.runtime_status === "visible";
                        return (
                            <li
                                key={entry.id}
                                className={`rounded-lg border p-3 ${selected ? "border-alloy-pine/40 bg-alloy-pine/5" : "border-alloy-forge/12 bg-white/90"}`}
                                data-testid={`lifecycle-catalog-row-${entry.process_key}`}
                            >
                                <button
                                    type="button"
                                    className="w-full text-left"
                                    onClick={() => onSelect(entry)}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <span className="text-sm font-medium text-alloy-midnight">
                                            {entry.lifecycle_name}
                                        </span>
                                        <span className="text-[10px] text-alloy-midnight/45">
                                            {entry.source === "builder_owned" ? "Builder-owned" : "Legacy"}
                                        </span>
                                    </div>
                                    <p
                                        className={`mt-1 text-[10px] font-medium ${visible ? "text-alloy-pine" : "text-amber-800"}`}
                                    >
                                        {runtimeLabel(entry.workspace.runtime_status)}
                                    </p>
                                    <p className="mt-0.5 text-[10px] text-alloy-midnight/50">
                                        {entry.stage_count} stage{entry.stage_count === 1 ? "" : "s"} ·{" "}
                                        {entry.work_unit_count} queue view
                                        {entry.work_unit_count === 1 ? "" : "s"}
                                    </p>
                                </button>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {entry.can_repair ? (
                                        <button
                                            type="button"
                                            className="text-[10px] font-medium text-alloy-pine hover:underline disabled:opacity-50"
                                            disabled={repairingId === entry.id}
                                            onClick={() => onRepair(entry)}
                                            data-testid={`lifecycle-catalog-repair-${entry.process_key}`}
                                        >
                                            {repairingId === entry.id
                                                ? "Repairing…"
                                                : "Repair workspace visibility"}
                                        </button>
                                    ) : null}
                                    {entry.can_delete ? (
                                        <button
                                            type="button"
                                            className="text-[10px] font-medium text-red-800 hover:underline"
                                            onClick={() => onDelete(entry)}
                                            data-testid={`lifecycle-catalog-delete-${entry.process_key}`}
                                        >
                                            Delete
                                        </button>
                                    ) : null}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
