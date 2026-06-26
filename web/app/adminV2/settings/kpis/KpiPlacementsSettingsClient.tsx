"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import type { WorkspaceKpiPlacementRow, KpiSurface, MetricKey } from "@/lib/kpi/types";
import {
    getMetricDefinition,
    isKnownMetricKey,
    listMetricDefinitions,
    metricFormatUnitLabel,
    validateMetricForSurface,
} from "@/lib/kpi/registry";

const SETTINGS_ROOT = "/admin/settings";

type DeptRow = { id: string; name: string | null; key: string | null };
type WuRow = { id: string; name: string | null; department_id: string; key: string | null };

const SURFACE_ORDER: KpiSurface[] = ["workspace", "department", "work_unit"];

const ADD_PLACEMENT_SURFACES: KpiSurface[] = ["workspace", "department", "work_unit"];

function sortPlacements(items: WorkspaceKpiPlacementRow[]): WorkspaceKpiPlacementRow[] {
    const rank = (s: string) => SURFACE_ORDER.indexOf(s as KpiSurface);
    return [...items].sort((a, b) => {
        const rs = rank(a.surface) - rank(b.surface);
        if (rs !== 0) return rs;
        const da = a.department_id ?? "";
        const db = b.department_id ?? "";
        if (da !== db) return da.localeCompare(db);
        const wa = a.work_unit_id ?? "";
        const wb = b.work_unit_id ?? "";
        if (wa !== wb) return wa.localeCompare(wb);
        if (a.display_order !== b.display_order) return a.display_order - b.display_order;
        return a.metric_key.localeCompare(b.metric_key);
    });
}

function surfaceTitle(s: KpiSurface): string {
    switch (s) {
        case "workspace":
            return "Organization workspace";
        case "department":
            return "Department pages";
        case "work_unit":
            return "Work unit pages";
        default:
            return s;
    }
}

type RowDraft = { display_order: number; is_visible: boolean; label_override: string };

export default function KpiPlacementsSettingsClient({ embedded = false }: { embedded?: boolean }) {
    const { canMutate } = useAdminAuth();
    const [items, setItems] = useState<WorkspaceKpiPlacementRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [draftById, setDraftById] = useState<Record<string, RowDraft>>({});
    const [saveError, setSaveError] = useState<string | null>(null);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [departments, setDepartments] = useState<DeptRow[]>([]);
    const [workUnits, setWorkUnits] = useState<WuRow[]>([]);

    const [addSurface, setAddSurface] = useState<KpiSurface>("workspace");
    const [addDeptId, setAddDeptId] = useState("");
    const [addWorkUnitId, setAddWorkUnitId] = useState("");
    const [addMetricKey, setAddMetricKey] = useState<MetricKey | "">("");
    const [addDisplayOrder, setAddDisplayOrder] = useState(0);
    const [addLabel, setAddLabel] = useState("");
    const [addBusy, setAddBusy] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const reload = useCallback(async () => {
        const init = workspaceDataFetchInit();
        const res = await fetch("/api/admin/workspace-kpi-placements?list=org", init);
        const j = (await res.json().catch(() => ({}))) as { items?: WorkspaceKpiPlacementRow[]; error?: string };
        if (!res.ok) throw new Error(j.error ?? "Failed to load placements");
        const next = sortPlacements(j.items ?? []);
        setItems(next);
        const nextDrafts: Record<string, RowDraft> = {};
        for (const row of next) {
            nextDrafts[row.id] = {
                display_order: row.display_order,
                is_visible: row.is_visible,
                label_override: row.label_override ?? "",
            };
        }
        setDraftById(nextDrafts);
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setLoadError(null);
        void (async () => {
            try {
                const init = workspaceDataFetchInit();
                const [pres, dres, wres] = await Promise.all([
                    fetch("/api/admin/workspace-kpi-placements?list=org", init),
                    fetch("/api/admin/departments", init),
                    fetch("/api/admin/work-units", init),
                ]);
                const pj = (await pres.json().catch(() => ({}))) as { items?: WorkspaceKpiPlacementRow[]; error?: string };
                if (!pres.ok) {
                    throw new Error(pj.error ?? "Failed to load placements");
                }
                const dj = (await dres.json().catch(() => ({}))) as { items?: DeptRow[]; error?: string };
                const wj = (await wres.json().catch(() => ({}))) as { items?: WuRow[]; error?: string };

                if (cancelled) return;
                setItems(sortPlacements(pj.items ?? []));
                const nextDrafts: Record<string, RowDraft> = {};
                for (const row of pj.items ?? []) {
                    nextDrafts[row.id] = {
                        display_order: row.display_order,
                        is_visible: row.is_visible,
                        label_override: row.label_override ?? "",
                    };
                }
                setDraftById(nextDrafts);
                if (dres.ok && Array.isArray(dj.items)) setDepartments(dj.items.map((d) => ({ ...d, id: String(d.id) })));
                if (wres.ok && Array.isArray(wj.items)) {
                    setWorkUnits(
                        (wj.items ?? []).map((w) => ({
                            id: String(w.id),
                            name: w.name ?? null,
                            department_id: String(w.department_id),
                            key: w.key ?? null,
                        }))
                    );
                }
            } catch (e) {
                if (!cancelled) setLoadError(e instanceof Error ? e.message : "Load failed");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const deptName = useMemo(() => {
        const m = new Map<string, string>();
        for (const d of departments) m.set(d.id, d.name?.trim() || d.key || d.id);
        return m;
    }, [departments]);

    const wuName = useMemo(() => {
        const m = new Map<string, string>();
        for (const w of workUnits) m.set(w.id, w.name?.trim() || w.key || w.id);
        return m;
    }, [workUnits]);

    const grouped = useMemo(() => {
        const m = new Map<KpiSurface, WorkspaceKpiPlacementRow[]>();
        for (const s of SURFACE_ORDER) m.set(s, []);
        for (const row of items) {
            const list = m.get(row.surface as KpiSurface) ?? [];
            list.push(row);
            m.set(row.surface as KpiSurface, list);
        }
        return m;
    }, [items]);

    const metricsForAddSurface = useMemo(() => listMetricDefinitions().filter((d) => d.allowedSurfaces.includes(addSurface)), [addSurface]);

    const rowDirty = useCallback(
        (row: WorkspaceKpiPlacementRow) => {
            const d = draftById[row.id];
            if (!d) return false;
            return (
                d.display_order !== row.display_order ||
                d.is_visible !== row.is_visible ||
                (d.label_override || "") !== (row.label_override ?? "")
            );
        },
        [draftById]
    );

    const saveRow = async (row: WorkspaceKpiPlacementRow) => {
        const d = draftById[row.id];
        if (!d) return;
        setSaveError(null);
        setSavingId(row.id);
        try {
            const init: RequestInit = {
                ...(workspaceDataFetchInit() ?? {}),
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: row.id,
                    is_visible: d.is_visible,
                    display_order: d.display_order,
                    label_override: d.label_override.trim() ? d.label_override.trim() : null,
                }),
                cache: "no-store",
            };
            const res = await fetch("/api/admin/workspace-kpi-placements", init);
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Save failed");
            await reload();
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSavingId(null);
        }
    };

    const addPlacement = async () => {
        setAddError(null);
        if (!addMetricKey) {
            setAddError("Select a metric");
            return;
        }
        if (!validateMetricForSurface(addMetricKey, addSurface)) {
            setAddError("Metric is not valid for this surface");
            return;
        }
        if (addSurface === "department" && !addDeptId) {
            setAddError("Select a department");
            return;
        }
        if (addSurface === "work_unit" && (!addDeptId || !addWorkUnitId)) {
            setAddError("Select a department and work unit");
            return;
        }
        setAddBusy(true);
        try {
            const body: Record<string, unknown> = {
                surface: addSurface,
                metric_key: addMetricKey,
                display_order: addDisplayOrder,
                label_override: addLabel.trim() ? addLabel.trim() : null,
            };
            if (addSurface === "department") body.department_id = addDeptId;
            if (addSurface === "work_unit") {
                body.department_id = addDeptId;
                body.work_unit_id = addWorkUnitId;
            }

            const init: RequestInit = {
                ...(workspaceDataFetchInit() ?? {}),
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                cache: "no-store",
            };
            const res = await fetch("/api/admin/workspace-kpi-placements", init);
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Create failed");
            setAddMetricKey("");
            setAddLabel("");
            setAddDisplayOrder(0);
            setAddWorkUnitId("");
            await reload();
        } catch (e) {
            setAddError(e instanceof Error ? e.message : "Create failed");
        } finally {
            setAddBusy(false);
        }
    };

    const removePlacement = async (row: WorkspaceKpiPlacementRow) => {
        if (
            !window.confirm(
                "Remove this KPI placement? The row will be deleted (not just hidden). You can add it again later."
            )
        ) {
            return;
        }
        setSaveError(null);
        setDeletingId(row.id);
        try {
            const init: RequestInit = {
                ...(workspaceDataFetchInit() ?? {}),
                method: "DELETE",
                cache: "no-store",
            };
            const res = await fetch(
                `/api/admin/workspace-kpi-placements?id=${encodeURIComponent(row.id)}`,
                init
            );
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Remove failed");
            await reload();
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : "Remove failed");
        } finally {
            setDeletingId(null);
        }
    };

    if (loading) {
        return <p className="text-sm text-alloy-midnight/70">Loading KPI placements…</p>;
    }

    if (loadError) {
        return (
            <div className="rounded-lg border border-alloy-ember/40 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember">
                {loadError}
                {loadError === "Forbidden" ? (
                    <span className="block mt-1 text-alloy-midnight/70">Admin role is required to view org-wide placement configuration.</span>
                ) : null}
            </div>
        );
    }

    return (
        <div className="w-full min-w-0 space-y-6 pb-8">
            {!embedded ?
                <header>
                    <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Indicator placement</h1>
                    <p className="mt-1 max-w-2xl text-xs leading-snug text-alloy-midnight/60">
                        Control which performance indicators appear on workspace surfaces. Hiding an indicator removes it from
                        view without deleting your configuration.
                    </p>
                </header>
            :   null}

            {saveError ? (
                <div className="rounded-lg border border-alloy-ember/40 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember">{saveError}</div>
            ) : null}

            {SURFACE_ORDER.map((surface) => {
                const rows = grouped.get(surface) ?? [];
                return (
                    <section key={surface} className="space-y-3" aria-labelledby={`kpi-surface-${surface}`}>
                        <h2 id={`kpi-surface-${surface}`} className="text-sm font-semibold text-alloy-midnight">
                            {surfaceTitle(surface)}
                        </h2>
                        {surface === "work_unit" ? (
                            <p className="text-[11px] leading-snug text-alloy-midnight/65 bg-alloy-midnight/[0.02] border border-alloy-forge/15 rounded-md px-2.5 py-2">
                                Work-unit KPIs summarize the <strong className="font-medium">same queue summaries</strong> as the
                                work-unit page (active lane + totals). They do not show org pipeline metrics.
                            </p>
                        ) : null}

                        <div className="overflow-x-auto rounded-lg border border-alloy-forge/12 bg-white/40">
                            <table className="min-w-[720px] w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-alloy-forge/10 bg-alloy-midnight/[0.03] text-[10px] tracking-wide text-alloy-midnight/55">
                                        <th className="px-3 py-2 font-medium">Visible</th>
                                        <th className="px-3 py-2 font-medium">Order</th>
                                        <th className="px-3 py-2 font-medium">Label override</th>
                                        <th className="px-3 py-2 font-medium">Scope</th>
                                        <th className="px-3 py-2 font-medium">Metric key</th>
                                        <th className="px-3 py-2 font-medium">Family</th>
                                        <th className="px-3 py-2 font-medium">Allowed surfaces</th>
                                        <th className="px-3 py-2 font-medium">Unit</th>
                                        <th className="px-3 py-2 font-medium">Default label</th>
                                        {canMutate ? (
                                            <th className="px-3 py-2 font-medium text-left" colSpan={2}>
                                                Actions
                                            </th>
                                        ) : null}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.length === 0 ? (
                                        <tr>
                                            <td colSpan={canMutate ? 11 : 9} className="px-3 py-6 text-center text-alloy-midnight/50">
                                                No rows yet for this surface.
                                            </td>
                                        </tr>
                                    ) : (
                                        rows.map((row) => {
                                            const d = draftById[row.id];
                                            const def = isKnownMetricKey(row.metric_key) ? getMetricDefinition(row.metric_key) : null;
                                            const scopeBits: string[] = [];
                                            if (row.department_id) scopeBits.push(`Dept: ${deptName.get(row.department_id) ?? row.department_id}`);
                                            if (row.work_unit_id) scopeBits.push(`WU: ${wuName.get(row.work_unit_id) ?? row.work_unit_id}`);
                                            const scopeLabel = scopeBits.length ? scopeBits.join(" · ") : "—";

                                            return (
                                                <tr key={row.id} className="border-b border-alloy-forge/8 align-top last:border-0">
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="checkbox"
                                                            className="mt-0.5 h-3.5 w-3.5 rounded border-alloy-forge/30"
                                                            checked={d?.is_visible ?? row.is_visible}
                                                            disabled={!canMutate}
                                                            onChange={(e) =>
                                                                setDraftById((prev) => ({
                                                                    ...prev,
                                                                    [row.id]: {
                                                                        ...(prev[row.id] ?? {
                                                                            display_order: row.display_order,
                                                                            is_visible: row.is_visible,
                                                                            label_override: row.label_override ?? "",
                                                                        }),
                                                                        is_visible: e.target.checked,
                                                                    },
                                                                }))
                                                            }
                                                            aria-label={`Visible ${row.metric_key}`}
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="number"
                                                            className="w-16 rounded border border-alloy-forge/20 bg-white px-1.5 py-1 tabular-nums"
                                                            value={d?.display_order ?? row.display_order}
                                                            disabled={!canMutate}
                                                            onChange={(e) => {
                                                                const n = Number(e.target.value);
                                                                setDraftById((prev) => ({
                                                                    ...prev,
                                                                    [row.id]: {
                                                                        ...(prev[row.id] ?? {
                                                                            display_order: row.display_order,
                                                                            is_visible: row.is_visible,
                                                                            label_override: row.label_override ?? "",
                                                                        }),
                                                                        display_order: Number.isFinite(n) ? Math.trunc(n) : 0,
                                                                    },
                                                                }));
                                                            }}
                                                            aria-label={`Display order ${row.metric_key}`}
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="text"
                                                            className="min-w-[8rem] max-w-[12rem] rounded border border-alloy-forge/20 bg-white px-2 py-1"
                                                            value={d?.label_override ?? ""}
                                                            placeholder="—"
                                                            disabled={!canMutate}
                                                            onChange={(e) =>
                                                                setDraftById((prev) => ({
                                                                    ...prev,
                                                                    [row.id]: {
                                                                        ...(prev[row.id] ?? {
                                                                            display_order: row.display_order,
                                                                            is_visible: row.is_visible,
                                                                            label_override: row.label_override ?? "",
                                                                        }),
                                                                        label_override: e.target.value,
                                                                    },
                                                                }))
                                                            }
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 text-alloy-midnight/80">{scopeLabel}</td>
                                                    <td className="px-3 py-2 font-mono text-[10px] text-alloy-midnight/90">{row.metric_key}</td>
                                                    <td className="px-3 py-2 text-alloy-midnight/75">{def?.family ?? "—"}</td>
                                                    <td className="px-3 py-2 text-alloy-midnight/75">
                                                        {(def?.allowedSurfaces ?? []).join(", ") || "—"}
                                                    </td>
                                                    <td className="px-3 py-2 text-alloy-midnight/75">
                                                        {def ? metricFormatUnitLabel(def.defaultFormat) : "—"}
                                                    </td>
                                                    <td className="px-3 py-2 text-alloy-midnight/75">{def?.defaultLabel ?? "—"}</td>
                                                    {canMutate ? (
                                                        <>
                                                            <td className="px-3 py-2">
                                                                <button
                                                                    type="button"
                                                                    className="rounded-md border border-alloy-forge/20 bg-white px-2 py-1 text-[11px] font-medium text-alloy-midnight hover:bg-alloy-midnight/[0.04] disabled:opacity-40"
                                                                    disabled={!rowDirty(row) || savingId === row.id}
                                                                    onClick={() => void saveRow(row)}
                                                                >
                                                                    {savingId === row.id ? "…" : "Save"}
                                                                </button>
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <button
                                                                    type="button"
                                                                    className="rounded-md border border-alloy-ember/35 bg-white px-2 py-1 text-[11px] font-medium text-alloy-ember hover:bg-alloy-ember/5 disabled:opacity-40"
                                                                    disabled={deletingId === row.id || savingId === row.id}
                                                                    onClick={() => void removePlacement(row)}
                                                                >
                                                                    {deletingId === row.id ? "…" : "Remove"}
                                                                </button>
                                                            </td>
                                                        </>
                                                    ) : null}
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                );
            })}

            {canMutate ? (
                <section className="space-y-2" aria-labelledby="kpi-add-heading">
                    <h2 id="kpi-add-heading" className="text-sm font-semibold text-alloy-midnight">
                        Add placement
                    </h2>
                    <div className="rounded-lg border border-dashed border-alloy-forge/25 bg-white/30 px-3 py-3 space-y-2">
                        <div className="flex flex-wrap items-end gap-2">
                            <label className="flex flex-col gap-0.5 text-[10px] text-alloy-midnight/55">
                                Surface
                                <select
                                    className="rounded border border-alloy-forge/20 bg-white px-2 py-1 text-xs"
                                    value={addSurface}
                                    onChange={(e) => {
                                        const s = e.target.value as KpiSurface;
                                        setAddSurface(s);
                                        setAddDeptId("");
                                        setAddWorkUnitId("");
                                        setAddMetricKey("");
                                    }}
                                >
                                    {ADD_PLACEMENT_SURFACES.map((s) => (
                                        <option key={s} value={s}>
                                            {surfaceTitle(s)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            {(addSurface === "department" || addSurface === "work_unit") && (
                                <label className="flex flex-col gap-0.5 text-[10px] text-alloy-midnight/55">
                                    Department
                                    <select
                                        className="min-w-[10rem] rounded border border-alloy-forge/20 bg-white px-2 py-1 text-xs"
                                        value={addDeptId}
                                        onChange={(e) => {
                                            setAddDeptId(e.target.value);
                                            setAddWorkUnitId("");
                                        }}
                                    >
                                        <option value="">Select…</option>
                                        {departments.map((d) => (
                                            <option key={d.id} value={d.id}>
                                                {d.name?.trim() || d.key || d.id}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}
                            {addSurface === "work_unit" && (
                                <label className="flex flex-col gap-0.5 text-[10px] text-alloy-midnight/55">
                                    Work unit
                                    <select
                                        className="min-w-[10rem] rounded border border-alloy-forge/20 bg-white px-2 py-1 text-xs"
                                        value={addWorkUnitId}
                                        onChange={(e) => setAddWorkUnitId(e.target.value)}
                                        disabled={!addDeptId}
                                    >
                                        <option value="">{addDeptId ? "Select…" : "Pick a department first"}</option>
                                        {workUnits
                                            .filter((w) => w.department_id === addDeptId)
                                            .map((w) => (
                                                <option key={w.id} value={w.id}>
                                                    {w.name?.trim() || w.key || w.id}
                                                </option>
                                            ))}
                                    </select>
                                </label>
                            )}
                            <label className="flex flex-col gap-0.5 text-[10px] text-alloy-midnight/55">
                                Metric (registry)
                                <select
                                    className="min-w-[14rem] rounded border border-alloy-forge/20 bg-white px-2 py-1 text-xs font-mono"
                                    value={addMetricKey}
                                    onChange={(e) => setAddMetricKey(e.target.value as MetricKey | "")}
                                >
                                    <option value="">Select…</option>
                                    {metricsForAddSurface.map((m) => (
                                        <option key={m.key} value={m.key}>
                                            {m.key}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col gap-0.5 text-[10px] text-alloy-midnight/55">
                                Order
                                <input
                                    type="number"
                                    className="w-16 rounded border border-alloy-forge/20 bg-white px-2 py-1 tabular-nums"
                                    value={addDisplayOrder}
                                    onChange={(e) =>
                                        setAddDisplayOrder(
                                            Number.isFinite(Number(e.target.value)) ? Math.trunc(Number(e.target.value)) : 0
                                        )
                                    }
                                />
                            </label>
                            <label className="flex flex-col gap-0.5 text-[10px] text-alloy-midnight/55">
                                Label override (optional)
                                <input
                                    type="text"
                                    className="w-40 rounded border border-alloy-forge/20 bg-white px-2 py-1 text-xs"
                                    value={addLabel}
                                    onChange={(e) => setAddLabel(e.target.value)}
                                />
                            </label>
                            <button
                                type="button"
                                className="rounded-md bg-alloy-midnight px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-95 disabled:opacity-40"
                                disabled={addBusy}
                                onClick={() => void addPlacement()}
                            >
                                {addBusy ? "Adding…" : "Add"}
                            </button>
                        </div>
                        {addError ? <p className="text-xs text-alloy-ember">{addError}</p> : null}
                    </div>
                </section>
            ) : null}

            {!embedded ?
                <footer className="border-t border-alloy-forge/10 pt-3 text-[11px] text-alloy-midnight/50">
                    <Link
                        href={SETTINGS_ROOT}
                        prefetch={shouldDisableAdminV2LinkPrefetch(SETTINGS_ROOT) ? false : undefined}
                        className="font-medium text-alloy-pine hover:underline"
                    >
                        ← Back to Settings
                    </Link>
                    {" · "}
                    <Link
                        href="/workspace"
                        prefetch={shouldDisableAdminV2LinkPrefetch("/workspace") ? false : undefined}
                        className="font-medium text-alloy-pine hover:underline"
                    >
                        Open workspace
                    </Link>
                </footer>
            :   null}
        </div>
    );
}
