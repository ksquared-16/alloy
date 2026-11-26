"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    LIFECYCLE_ACTIVATION_ACTION_PLACEMENTS,
    type LifecycleBaseActionKey,
} from "@/lib/lifecycle/lifecycleStageBaseActions";
import { LIFECYCLE_STAGE_ORDER, LIFECYCLE_STAGE_LABELS } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import type { LifecycleActionsMatrixRow } from "@/lib/lifecycle/lifecycleActionsMatrix";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export type LifecycleActionsMatrixDraftRow = {
    base_action_key: LifecycleBaseActionKey;
    default_label: string;
    saveable: boolean;
    enabled: boolean;
    label: string;
    placement_ids: Set<string>;
    stage_restrictions: Set<LifecycleOperatorStage>;
    restrictStages: boolean;
};

function draftFromRow(row: LifecycleActionsMatrixRow): LifecycleActionsMatrixDraftRow {
    return {
        base_action_key: row.base_action_key,
        default_label: row.default_label,
        saveable: row.saveable,
        enabled: row.enabled,
        label: row.label,
        placement_ids: new Set(row.placement_ids),
        stage_restrictions: new Set(row.stage_restrictions),
        restrictStages: row.stage_restrictions.length > 0,
    };
}

function draftToSaveRow(row: LifecycleActionsMatrixDraftRow, displayOrder: number) {
    return {
        base_action_key: row.base_action_key,
        enabled: row.enabled,
        label: row.label.trim() || row.default_label,
        placement_ids: [...row.placement_ids],
        stage_restrictions: row.enabled && row.restrictStages ? [...row.stage_restrictions] : [],
        display_order: displayOrder,
    };
}

export default function LifecycleActionsMatrix({
    departmentId,
    builderStageKeys,
    embedded = false,
    onSaved,
}: {
    departmentId: string;
    builderStageKeys: readonly string[];
    embedded?: boolean;
    onSaved?: () => void | Promise<void>;
}) {
    const [rows, setRows] = useState<LifecycleActionsMatrixDraftRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const savingRef = useRef(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const operatorStageOptions = useMemo(() => {
        const keys = builderStageKeys.filter((k) =>
            (LIFECYCLE_STAGE_ORDER as readonly string[]).includes(k)
        ) as LifecycleOperatorStage[];
        return keys.length ? keys : ([...LIFECYCLE_STAGE_ORDER] as LifecycleOperatorStage[]);
    }, [builderStageKeys]);

    const load = useCallback(async () => {
        if (!departmentId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/departments/${encodeURIComponent(departmentId)}/lifecycle-actions-matrix`,
                workspaceDataFetchInit()
            );
            const j = (await res.json().catch(() => ({}))) as {
                rows?: LifecycleActionsMatrixRow[];
                error?: string;
            };
            if (!res.ok) throw new Error(j.error ?? "Failed to load actions");
            setRows((j.rows ?? []).map(draftFromRow));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load actions");
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [departmentId]);

    useEffect(() => {
        void load();
    }, [load]);

    const updateRow = useCallback(
        (baseKey: LifecycleBaseActionKey, patch: Partial<LifecycleActionsMatrixDraftRow>) => {
            setRows((prev) =>
                prev.map((r) => (r.base_action_key === baseKey ? { ...r, ...patch } : r))
            );
        },
        []
    );

    const togglePlacement = useCallback((baseKey: LifecycleBaseActionKey, placementId: string) => {
        setRows((prev) =>
            prev.map((r) => {
                if (r.base_action_key !== baseKey) return r;
                const next = new Set(r.placement_ids);
                if (next.has(placementId)) next.delete(placementId);
                else next.add(placementId);
                return { ...r, placement_ids: next };
            })
        );
    }, []);

    const toggleStageRestriction = useCallback((baseKey: LifecycleBaseActionKey, stage: LifecycleOperatorStage) => {
        setRows((prev) =>
            prev.map((r) => {
                if (r.base_action_key !== baseKey) return r;
                const next = new Set(r.stage_restrictions);
                if (next.has(stage)) next.delete(stage);
                else next.add(stage);
                return { ...r, stage_restrictions: next, restrictStages: true };
            })
        );
    }, []);

    const moveRow = useCallback((baseKey: LifecycleBaseActionKey, direction: "up" | "down") => {
        setRows((prev) => {
            const idx = prev.findIndex((r) => r.base_action_key === baseKey);
            if (idx < 0) return prev;
            const swapIdx = direction === "up" ? idx - 1 : idx + 1;
            if (swapIdx < 0 || swapIdx >= prev.length) return prev;
            const next = [...prev];
            const tmp = next[idx]!;
            next[idx] = next[swapIdx]!;
            next[swapIdx] = tmp;
            return next;
        });
    }, []);

    const save = useCallback(async () => {
        if (!departmentId || savingRef.current) return;
        savingRef.current = true;
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            for (const row of rows) {
                if (!row.enabled) continue;
                if (!row.placement_ids.size) {
                    throw new Error(`Select at least one placement for ${row.default_label}.`);
                }
                if (row.restrictStages && !row.stage_restrictions.size) {
                    throw new Error(
                        `Select stages to restrict ${row.default_label}, or leave stage restrictions off for all stages.`
                    );
                }
            }
            const res = await fetch(
                `/api/admin/departments/${encodeURIComponent(departmentId)}/lifecycle-actions-matrix`,
                {
                    ...workspaceDataFetchInit(),
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        rows: rows.map((row, index) => draftToSaveRow(row, index)),
                    }),
                }
            );
            const j = (await res.json().catch(() => ({}))) as { error?: string; rows?: LifecycleActionsMatrixRow[] };
            if (!res.ok) throw new Error(j.error ?? "Save failed");
            if (j.rows) setRows(j.rows.map(draftFromRow));
            setSuccess("Process actions saved.");
            await onSaved?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    }, [departmentId, rows, onSaved]);

    if (loading) {
        return (
            <p className="text-xs text-alloy-midnight/50" data-testid="lifecycle-actions-matrix-loading">
                Loading process actions…
            </p>
        );
    }

    const Wrapper = embedded ? "div" : "section";
    const wrapperClass = embedded
        ? "space-y-2"
        : "rounded-xl border border-alloy-forge/12 bg-white/90 shadow-sm";

    return (
        <Wrapper className={wrapperClass} data-testid="lifecycle-actions-matrix">
            {!embedded ? (
                <header className="border-b border-alloy-forge/8 px-3 py-2.5">
                    <h3 className="text-sm font-semibold text-alloy-midnight">Process Commands</h3>
                    <p className="mt-1 text-[11px] leading-relaxed text-alloy-midnight/60">
                        Configure which actions are available in this process and where they appear. Stage
                        restrictions are optional.
                    </p>
                </header>
            ) : null}

            <div className="overflow-x-auto px-2 py-2">
                <table className="w-full min-w-[720px] border-collapse text-[11px]">
                    <thead>
                        <tr className="text-left text-alloy-midnight/55">
                            <th className="px-2 py-1.5 font-medium">Order</th>
                            <th className="px-2 py-1.5 font-medium">Action</th>
                            <th className="px-2 py-1.5 font-medium">Enabled</th>
                            <th className="px-2 py-1.5 font-medium">Display label</th>
                            {LIFECYCLE_ACTIVATION_ACTION_PLACEMENTS.map((p) => (
                                <th key={p.id} className="px-2 py-1.5 font-medium whitespace-nowrap">
                                    {p.label}
                                </th>
                            ))}
                            <th className="px-2 py-1.5 font-medium">Stage restrictions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIndex) => (
                            <tr
                                key={row.base_action_key}
                                className="border-t border-alloy-forge/8"
                                data-testid={`lifecycle-actions-matrix-row-${row.base_action_key}`}
                            >
                                <td className="px-2 py-2 whitespace-nowrap">
                                    <div className="flex flex-col gap-0.5">
                                        <button
                                            type="button"
                                            className="rounded border border-alloy-forge/15 px-1 text-[10px] disabled:opacity-40"
                                            disabled={rowIndex === 0}
                                            onClick={() => moveRow(row.base_action_key, "up")}
                                            data-testid={`lifecycle-actions-matrix-up-${row.base_action_key}`}
                                            aria-label={`Move ${row.default_label} up`}
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded border border-alloy-forge/15 px-1 text-[10px] disabled:opacity-40"
                                            disabled={rowIndex >= rows.length - 1}
                                            onClick={() => moveRow(row.base_action_key, "down")}
                                            data-testid={`lifecycle-actions-matrix-down-${row.base_action_key}`}
                                            aria-label={`Move ${row.default_label} down`}
                                        >
                                            ↓
                                        </button>
                                    </div>
                                </td>
                                <td className="px-2 py-2 font-medium text-alloy-midnight whitespace-nowrap">
                                    {row.default_label}
                                    {!row.saveable ? (
                                        <span className="ml-1 text-[10px] text-alloy-midnight/45">(unavailable)</span>
                                    ) : null}
                                </td>
                                <td className="px-2 py-2">
                                    <input
                                        type="checkbox"
                                        checked={row.enabled}
                                        disabled={!row.saveable}
                                        onChange={(e) =>
                                            updateRow(row.base_action_key, {
                                                enabled: e.target.checked,
                                                placement_ids: e.target.checked
                                                    ? row.placement_ids.size
                                                        ? row.placement_ids
                                                        : new Set(["overflow"])
                                                    : new Set(),
                                            })
                                        }
                                        data-testid={`lifecycle-actions-matrix-enabled-${row.base_action_key}`}
                                    />
                                </td>
                                <td className="px-2 py-2">
                                    <input
                                        type="text"
                                        className="w-full min-w-[7rem] rounded border border-alloy-forge/15 px-1.5 py-1 disabled:opacity-50"
                                        value={row.label}
                                        disabled={!row.enabled || !row.saveable}
                                        onChange={(e) => updateRow(row.base_action_key, { label: e.target.value })}
                                        data-testid={`lifecycle-actions-matrix-label-${row.base_action_key}`}
                                    />
                                </td>
                                {LIFECYCLE_ACTIVATION_ACTION_PLACEMENTS.map((p) => (
                                    <td key={p.id} className="px-2 py-2 text-center">
                                        <input
                                            type="checkbox"
                                            checked={row.placement_ids.has(p.id)}
                                            disabled={!row.enabled || !row.saveable}
                                            onChange={() => togglePlacement(row.base_action_key, p.id)}
                                            data-testid={`lifecycle-actions-matrix-placement-${row.base_action_key}-${p.id}`}
                                        />
                                    </td>
                                ))}
                                <td className="px-2 py-2">
                                    <label className="flex items-center gap-1.5 text-[10px] text-alloy-midnight/60">
                                        <input
                                            type="checkbox"
                                            checked={!row.restrictStages}
                                            disabled={!row.enabled || !row.saveable}
                                            onChange={(e) =>
                                                updateRow(row.base_action_key, {
                                                    restrictStages: !e.target.checked,
                                                    stage_restrictions: e.target.checked
                                                        ? new Set()
                                                        : row.stage_restrictions,
                                                })
                                            }
                                            data-testid={`lifecycle-actions-matrix-all-stages-${row.base_action_key}`}
                                        />
                                        All stages
                                    </label>
                                    {row.restrictStages && row.enabled ? (
                                        <div
                                            className="mt-1 flex flex-wrap gap-1"
                                            data-testid={`lifecycle-actions-matrix-stages-${row.base_action_key}`}
                                        >
                                            {operatorStageOptions.map((stage) => (
                                                <label
                                                    key={stage}
                                                    className="inline-flex items-center gap-0.5 rounded border border-alloy-forge/10 px-1 py-0.5"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={row.stage_restrictions.has(stage)}
                                                        onChange={() =>
                                                            toggleStageRestriction(row.base_action_key, stage)
                                                        }
                                                    />
                                                    <span>{LIFECYCLE_STAGE_LABELS[stage] ?? stage}</span>
                                                </label>
                                            ))}
                                        </div>
                                    ) : null}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {error ? (
                <p className="px-3 pb-1 text-xs text-red-700" role="alert">
                    {error}
                </p>
            ) : null}
            {success ? (
                <p className="px-3 pb-1 text-xs text-alloy-pine" data-testid="lifecycle-actions-matrix-success">
                    {success}
                </p>
            ) : null}

            <footer className="border-t border-alloy-forge/8 px-3 py-2">
                <button
                    type="button"
                    className="rounded-md bg-alloy-pine px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    disabled={saving}
                    onClick={() => void save()}
                    data-testid="lifecycle-actions-matrix-save"
                >
                    {saving ? "Saving…" : "Save process actions"}
                </button>
            </footer>
        </Wrapper>
    );
}
