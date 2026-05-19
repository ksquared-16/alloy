"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
    ACTION_PLACEMENT_SLOTS,
    OPERATOR_EDITABLE_ACTION_SURFACES,
} from "@/lib/admin/actions/actionPlacementMutation";
import {
    actionPlacementEditorCapabilities,
    actionPlacementOwnershipLabel,
    actionPlacementSurfaceLabel,
    formatActionPlacementWhere,
    groupPlacementEditorRows,
    type ActionPlacementEditorRow,
} from "@/lib/admin/actions/actionPlacementEditorUi";

type InventoryItem = {
    definition: {
        id: string;
        key: string;
        label: string;
        action_type: string;
        entity_type: string | null;
        org_id: string | null;
    };
    placement: {
        id: string;
        org_id: string | null;
        surface: string;
        slot: string;
        entity_type: string | null;
        section_key: string | null;
        order_index: number;
        display_style: string;
        is_active: boolean;
    };
};

function toEditorRow(item: InventoryItem): ActionPlacementEditorRow {
    return {
        placement_id: item.placement.id,
        definition_id: item.definition.id,
        definition_key: item.definition.key,
        label: item.definition.label,
        action_type: item.definition.action_type,
        entity_type: item.placement.entity_type ?? item.definition.entity_type,
        org_id: item.placement.org_id,
        surface: item.placement.surface,
        slot: item.placement.slot,
        section_key: item.placement.section_key,
        order_index: item.placement.order_index,
        display_style: item.placement.display_style,
        is_active: item.placement.is_active,
    };
}

export default function ActionPlacementsSettingsClient() {
    const searchParams = useSearchParams();
    const initialEntity = searchParams.get("entity_type")?.trim() ?? "";
    const initialSection = searchParams.get("section_key")?.trim() ?? "";

    const { canMutate, orgId, role } = useAdminAuth();
    const [rows, setRows] = useState<ActionPlacementEditorRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
    const [savingId, setSavingId] = useState<string | null>(null);
    const [entityFilter, setEntityFilter] = useState(initialEntity);
    const [sectionFilter, setSectionFilter] = useState(initialSection);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/actions/inventory", { credentials: "include" });
            const j = (await res.json().catch(() => ({}))) as { items?: InventoryItem[]; error?: string };
            if (!res.ok) {
                setRows([]);
                setError(j.error ?? "Failed to load");
                return;
            }
            setRows((j.items ?? []).map(toEditorRow));
            setError(null);
        } catch (e) {
            setRows([]);
            setError(e instanceof Error ? e.message : "Failed to load");
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const entityOptions = useMemo(() => {
        const set = new Set<string>();
        for (const r of rows ?? []) {
            if (r.entity_type) set.add(r.entity_type);
        }
        return [...set].sort();
    }, [rows]);

    const filteredRows = useMemo(() => {
        const all = rows ?? [];
        return all.filter((r) => {
            if (entityFilter && (r.entity_type ?? "") !== entityFilter) return false;
            if (sectionFilter && (r.section_key ?? "") !== sectionFilter) return false;
            return true;
        });
    }, [rows, entityFilter, sectionFilter]);

    const groups = useMemo(() => groupPlacementEditorRows(filteredRows), [filteredRows]);
    const isAdmin = role === "admin";

    const patchPlacement = async (placementId: string, body: Record<string, unknown>) => {
        setSavingId(placementId);
        setRowErrors((prev) => {
            const next = { ...prev };
            delete next[placementId];
            return next;
        });
        try {
            const res = await fetch(`/api/admin/action-placements/${placementId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Update failed");
            await load();
        } catch (e) {
            setRowErrors((prev) => ({ ...prev, [placementId]: (e as Error).message }));
        } finally {
            setSavingId(null);
        }
    };

    const patchLabel = async (definitionId: string, label: string, placementId: string) => {
        setSavingId(placementId);
        setRowErrors((prev) => {
            const next = { ...prev };
            delete next[placementId];
            return next;
        });
        try {
            const res = await fetch(`/api/admin/action-definitions/${definitionId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label }),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Update failed");
            await load();
        } catch (e) {
            setRowErrors((prev) => ({ ...prev, [placementId]: (e as Error).message }));
        } finally {
            setSavingId(null);
        }
    };

    return (
        <div className="space-y-5" data-testid="action-placements-settings">
            <div className="rounded-xl border border-alloy-pine/20 bg-alloy-pine/[0.04] px-4 py-3 text-sm text-alloy-midnight/75">
                <p className="font-medium text-alloy-midnight">What you can change here</p>
                <ul className="mt-1 list-inside list-disc text-xs leading-relaxed">
                    <li>Which buttons are enabled for your organization</li>
                    <li>Button label (org-owned definitions)</li>
                    <li>Where record buttons appear — header vs drawer section, slot, and order</li>
                </ul>
                <p className="mt-2 text-xs leading-relaxed">
                    What happens when a button is clicked is configured in{" "}
                    <Link href="/adminV2/workflows" className="font-medium text-alloy-pine hover:underline">
                        Automations
                    </Link>
                    . Status names live on{" "}
                    <Link href="/adminV2/settings/statuses" className="font-medium text-alloy-pine hover:underline">
                        Statuses
                    </Link>
                    .
                </p>
            </div>

            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-alloy-forge/12 bg-white/60 px-3 py-2.5">
                <label className="text-xs">
                    <span className="mb-0.5 block font-medium text-alloy-midnight/55">Record type</span>
                    <select
                        value={entityFilter}
                        onChange={(e) => setEntityFilter(e.target.value)}
                        className="rounded border border-[#e6e8ec] px-2 py-1 text-xs"
                    >
                        <option value="">All types</option>
                        {entityOptions.map((et) => (
                            <option key={et} value={et}>
                                {et}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-xs">
                    <span className="mb-0.5 block font-medium text-alloy-midnight/55">Drawer section key</span>
                    <input
                        type="text"
                        value={sectionFilter}
                        onChange={(e) => setSectionFilter(e.target.value)}
                        placeholder="e.g. details"
                        className="w-40 rounded border border-[#e6e8ec] px-2 py-1 font-mono text-[11px]"
                    />
                </label>
                {(entityFilter || sectionFilter) && (
                    <button
                        type="button"
                        className="text-xs text-alloy-pine hover:underline"
                        onClick={() => {
                            setEntityFilter("");
                            setSectionFilter("");
                        }}
                    >
                        Clear filters
                    </button>
                )}
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {rows == null ? <p className="text-sm text-alloy-midnight/55">Loading…</p> : null}

            {rows != null && filteredRows.length === 0 && !error ? (
                <p className="text-sm text-alloy-midnight/55">
                    {rows.length === 0
                        ? "No configured buttons for this organization."
                        : "No buttons match the current filters."}
                </p>
            ) : null}

            <div className="space-y-4">
                {groups.map((group) => (
                    <section key={group.id} className="rounded-xl border border-alloy-forge/12 bg-white/55 shadow-sm">
                        <div className="border-b border-alloy-forge/10 px-4 py-3">
                            <h2 className="text-sm font-semibold text-alloy-midnight">{group.title}</h2>
                            <p className="text-xs text-alloy-midnight/50">{group.items.length} button placement(s)</p>
                        </div>
                        <ul className="divide-y divide-alloy-forge/8">
                            {group.items.map((row) => {
                                const cap = actionPlacementEditorCapabilities(row, orgId ?? "");
                                const saving = savingId === row.placement_id;
                                const ownership = actionPlacementOwnershipLabel(row.org_id);
                                return (
                                    <li key={row.placement_id} className="px-4 py-3" data-testid={`action-placement-${row.placement_id}`}>
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1 space-y-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {cap.canEditLabel && isAdmin && canMutate ? (
                                                        <input
                                                            type="text"
                                                            defaultValue={row.label}
                                                            disabled={saving}
                                                            className="w-full max-w-md rounded border border-[#e6e8ec] px-2 py-1 text-sm font-medium"
                                                            onBlur={(e) => {
                                                                const next = e.target.value.trim();
                                                                if (next && next !== row.label) {
                                                                    void patchLabel(row.definition_id, next, row.placement_id);
                                                                }
                                                            }}
                                                        />
                                                    ) : (
                                                        <div className="font-medium text-alloy-midnight">{row.label}</div>
                                                    )}
                                                    <span
                                                        className={[
                                                            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                                            ownership === "org"
                                                                ? "bg-alloy-pine/10 text-alloy-pine"
                                                                : "bg-alloy-forge/10 text-alloy-forge/70",
                                                        ].join(" ")}
                                                    >
                                                        {ownership === "org" ? "Your org" : "Platform"}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-alloy-midnight/50">
                                                    {row.definition_key} · {row.action_type}
                                                </p>
                                                <p className="text-xs text-alloy-midnight/70">
                                                    <span className="font-medium text-alloy-midnight/80">Appears on: </span>
                                                    {formatActionPlacementWhere(row)}
                                                </p>
                                                {cap.editable && isAdmin && canMutate ? (
                                                    <div className="flex flex-wrap gap-2 text-xs">
                                                        <label className="flex items-center gap-1.5">
                                                            <span className="text-alloy-midnight/55">Surface</span>
                                                            <select
                                                                value={row.surface}
                                                                disabled={saving}
                                                                className="rounded border border-[#e6e8ec] px-1.5 py-0.5"
                                                                onChange={(e) =>
                                                                    void patchPlacement(row.placement_id, {
                                                                        surface: e.target.value,
                                                                    })
                                                                }
                                                            >
                                                                {OPERATOR_EDITABLE_ACTION_SURFACES.map((s) => (
                                                                    <option key={s} value={s}>
                                                                        {actionPlacementSurfaceLabel(s)}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </label>
                                                        <label className="flex items-center gap-1.5">
                                                            <span className="text-alloy-midnight/55">Slot</span>
                                                            <select
                                                                value={row.slot}
                                                                disabled={saving}
                                                                className="rounded border border-[#e6e8ec] px-1.5 py-0.5"
                                                                onChange={(e) =>
                                                                    void patchPlacement(row.placement_id, { slot: e.target.value })
                                                                }
                                                            >
                                                                {ACTION_PLACEMENT_SLOTS.map((s) => (
                                                                    <option key={s} value={s}>
                                                                        {s}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </label>
                                                        {row.surface === "record_section" ? (
                                                            <label className="flex items-center gap-1.5">
                                                                <span className="text-alloy-midnight/55">Section key</span>
                                                                <input
                                                                    type="text"
                                                                    defaultValue={row.section_key ?? ""}
                                                                    disabled={saving}
                                                                    className="w-36 rounded border border-[#e6e8ec] px-1.5 py-0.5 font-mono text-[11px]"
                                                                    onBlur={(e) => {
                                                                        const sk = e.target.value.trim();
                                                                        if (sk !== (row.section_key ?? "")) {
                                                                            void patchPlacement(row.placement_id, {
                                                                                section_key: sk,
                                                                            });
                                                                        }
                                                                    }}
                                                                />
                                                            </label>
                                                        ) : null}
                                                        <label className="flex items-center gap-1.5">
                                                            <span className="text-alloy-midnight/55">Order</span>
                                                            <input
                                                                type="number"
                                                                defaultValue={row.order_index}
                                                                disabled={saving}
                                                                className="w-16 rounded border border-[#e6e8ec] px-1.5 py-0.5"
                                                                onBlur={(e) => {
                                                                    const n = Number(e.target.value);
                                                                    if (Number.isFinite(n) && n !== row.order_index) {
                                                                        void patchPlacement(row.placement_id, {
                                                                            order_index: n,
                                                                        });
                                                                    }
                                                                }}
                                                            />
                                                        </label>
                                                    </div>
                                                ) : null}
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <label className="flex items-center gap-2 text-xs">
                                                    <span className="text-alloy-midnight/55">Enabled</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={row.is_active}
                                                        disabled={!cap.canToggleActive || !isAdmin || !canMutate || saving}
                                                        onChange={(e) =>
                                                            void patchPlacement(row.placement_id, {
                                                                is_active: e.target.checked,
                                                            })
                                                        }
                                                    />
                                                </label>
                                                {!cap.editable ? (
                                                    <span className="max-w-[12rem] text-right text-[10px] text-alloy-midnight/45">
                                                        {cap.lockedReason}
                                                    </span>
                                                ) : saving ? (
                                                    <span className="text-[10px] text-alloy-midnight/45">Saving…</span>
                                                ) : null}
                                            </div>
                                        </div>
                                        {rowErrors[row.placement_id] ? (
                                            <p className="mt-1 text-[11px] text-red-600">{rowErrors[row.placement_id]}</p>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}
            </div>
        </div>
    );
}
