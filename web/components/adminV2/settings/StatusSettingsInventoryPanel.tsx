"use client";

import { useCallback, useState } from "react";
import type { StatusDefinitionsInventoryReport } from "@/lib/admin/statusDefinitionsInventory";

export default function StatusSettingsInventoryPanel() {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [report, setReport] = useState<StatusDefinitionsInventoryReport | null>(null);

    const loadInventory = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/status-definitions/inventory");
            const json = (await res.json().catch(() => ({}))) as StatusDefinitionsInventoryReport & {
                error?: string;
            };
            if (!res.ok) throw new Error(json.error ?? "Failed to load inventory");
            setReport(json);
            setOpen(true);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    return (
        <section
            className="mt-8 rounded-xl border border-alloy-stone/40 bg-white shadow-sm overflow-hidden"
            data-status-settings-inventory-panel="true"
        >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-alloy-stone/40 bg-alloy-stone/[0.04] px-5 py-3">
                <div>
                    <h2 className="text-sm font-semibold text-alloy-midnight">Status inventory</h2>
                    <p className="mt-0.5 text-xs leading-snug text-alloy-forge/70">
                        Compare active status definitions with persisted values. Read-only — no data changes.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void loadInventory()}
                    disabled={loading}
                    className="shrink-0 rounded-md border border-alloy-stone/40 bg-white px-3 py-1.5 text-xs font-medium text-alloy-midnight hover:bg-alloy-stone/10 disabled:opacity-60"
                    data-status-settings-inventory-run="true"
                >
                    {loading ? "Running…" : report && open ? "Refresh inventory" : "Run inventory"}
                </button>
            </div>

            {error ?
                <p className="px-5 py-3 text-sm text-red-600">{error}</p>
            :   null}

            {open && report ?
                <div className="space-y-4 p-5 text-sm">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                        {Object.entries(report.summary).map(([key, value]) => (
                            <div
                                key={key}
                                className="rounded-lg border border-alloy-stone/20 bg-alloy-stone/5 px-3 py-2"
                                data-status-inventory-summary={key}
                            >
                                <div className="text-[10px] font-medium uppercase tracking-wide text-alloy-forge/70">
                                    {key.replace(/_/g, " ")}
                                </div>
                                <div className="text-lg font-semibold text-alloy-midnight">{value}</div>
                            </div>
                        ))}
                    </div>

                    {report.layers.map((layer) => (
                        <div
                            key={layer.entity_type}
                            className="rounded-lg border border-alloy-stone/40 p-4"
                            data-status-inventory-layer={layer.entity_type}
                        >
                            <h3 className="text-sm font-semibold text-alloy-midnight">
                                {layer.entity_type}{" "}
                                <span className="font-normal text-alloy-forge/70">({layer.column})</span>
                            </h3>
                            <div className="mt-2 grid gap-3 md:grid-cols-2">
                                <div>
                                    <p className="text-xs font-semibold text-alloy-forge/70">Orphan persisted keys</p>
                                    {layer.orphan_persisted_keys.length === 0 ?
                                        <p className="mt-1 text-xs text-alloy-forge/70">None</p>
                                    :   <ul className="mt-1 space-y-0.5 text-xs text-alloy-midnight">
                                            {layer.orphan_persisted_keys.slice(0, 12).map((row) => (
                                                <li key={row.status_key}>
                                                    <code className="rounded bg-alloy-stone/10 px-1">{row.status_key}</code>
                                                    {" — "}
                                                    {row.count} record{row.count === 1 ? "" : "s"}
                                                </li>
                                            ))}
                                        </ul>
                                    }
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-alloy-forge/70">Unused active definitions</p>
                                    {layer.unused_definition_keys.length === 0 ?
                                        <p className="mt-1 text-xs text-alloy-forge/70">None</p>
                                    :   <p className="mt-1 text-xs text-alloy-midnight">
                                            {layer.unused_definition_keys.slice(0, 12).join(", ")}
                                            {layer.unused_definition_keys.length > 12 ? "…" : ""}
                                        </p>
                                    }
                                </div>
                            </div>
                            {layer.entity_type === "persons" ?
                                <div className="mt-3 grid gap-2 md:grid-cols-3 text-xs text-alloy-forge/70">
                                    <div>
                                        Missing <code>applies_to_profiles</code>:{" "}
                                        {layer.missing_applicability_metadata?.length ?? 0}
                                    </div>
                                    <div>
                                        Hidden from Person drawer:{" "}
                                        {layer.hidden_from_person_drawer?.length ?? 0}
                                    </div>
                                    <div>
                                        Hidden from Child drawer:{" "}
                                        {layer.hidden_from_child_drawer?.length ?? 0}
                                    </div>
                                </div>
                            :   null}
                        </div>
                    ))}
                </div>
            :   null}
        </section>
    );
}
