"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    LIFECYCLE_ACTIVATION_ACTION_PLACEMENTS,
    type LifecycleBaseActionKey,
} from "@/lib/lifecycle/lifecycleStageBaseActions";
import {
    LIFECYCLE_STAGE_LABELS,
    LIFECYCLE_STAGE_ORDER,
    type LifecycleOperatorStage,
} from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import type { LifecycleActionsMatrixRow } from "@/lib/lifecycle/lifecycleActionsMatrix";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import {
    BUSINESS_PROCESS_PROCESS_ACTIONS_SUMMARY,
    BUSINESS_PROCESS_PROCESS_ACTIONS_TITLE,
} from "@/lib/lifecycle/businessProcessUiLabels";

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

function placementSummary(row: LifecycleActionsMatrixDraftRow): string {
    if (!row.enabled) return "Disabled";
    if (!row.placement_ids.size) return "No placements";
    return [...row.placement_ids]
        .map((id) => LIFECYCLE_ACTIVATION_ACTION_PLACEMENTS.find((p) => p.id === id)?.label ?? id)
        .join(", ");
}

function stageSummary(row: LifecycleActionsMatrixDraftRow): string {
    if (!row.enabled || !row.restrictStages) return "All stages";
    if (!row.stage_restrictions.size) return "No stages selected";
    return [...row.stage_restrictions].map((s) => LIFECYCLE_STAGE_LABELS[s] ?? s).join(", ");
}

export function useProcessActionsMatrixDraft(departmentId: string, builderStageKeys: readonly string[]) {
    const [rows, setRows] = useState<LifecycleActionsMatrixDraftRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const operatorStageOptions = useMemo(() => {
        const keys = builderStageKeys.filter((k) =>
            (LIFECYCLE_STAGE_ORDER as readonly string[]).includes(k),
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
                workspaceDataFetchInit(),
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
            setRows((prev) => prev.map((r) => (r.base_action_key === baseKey ? { ...r, ...patch } : r)));
        },
        [],
    );

    const togglePlacement = useCallback((baseKey: LifecycleBaseActionKey, placementId: string) => {
        setRows((prev) =>
            prev.map((r) => {
                if (r.base_action_key !== baseKey) return r;
                const next = new Set(r.placement_ids);
                if (next.has(placementId)) next.delete(placementId);
                else next.add(placementId);
                return { ...r, placement_ids: next };
            }),
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
            }),
        );
    }, []);

    const save = useCallback(
        async (onSaved?: () => void | Promise<void>) => {
            if (!departmentId || saving) return;
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
                            `Select stages to restrict ${row.default_label}, or allow all stages.`,
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
                    },
                );
                const j = (await res.json().catch(() => ({}))) as {
                    error?: string;
                    rows?: LifecycleActionsMatrixRow[];
                    publication_required?: boolean;
                };
                if (!res.ok) throw new Error(j.error ?? "Save failed");
                if (j.rows) setRows(j.rows.map(draftFromRow));
                setSuccess(
                    j.publication_required
                        ? "Process actions saved. Publish Business Process configuration to make Helpful Actions live at runtime."
                        : "Process actions saved.",
                );                await onSaved?.();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Save failed");
            } finally {
                setSaving(false);
            }
        },
        [departmentId, rows, saving],
    );

    return {
        rows,
        loading,
        saving,
        error,
        success,
        operatorStageOptions,
        updateRow,
        togglePlacement,
        toggleStageRestriction,
        save,
        placementSummary,
        stageSummary,
    };
}

export default function BusinessProcessActionsListColumn({
    rows,
    loading,
    selectedKey,
    onSelect,
    placementSummary: placementSummaryFn,
    stageSummary: stageSummaryFn,
}: {
    rows: LifecycleActionsMatrixDraftRow[];
    loading: boolean;
    selectedKey: LifecycleBaseActionKey | null;
    onSelect: (key: LifecycleBaseActionKey) => void;
    placementSummary: (row: LifecycleActionsMatrixDraftRow) => string;
    stageSummary: (row: LifecycleActionsMatrixDraftRow) => string;
}) {
    if (loading) {
        return (
            <p className="text-xs text-alloy-midnight/50" data-testid="business-process-actions-list-loading">
                Loading actions…
            </p>
        );
    }

    return (
        <div className="space-y-3" data-testid="business-process-actions-list-column">
            <div>
                <h4 className="text-sm font-semibold text-alloy-midnight">{BUSINESS_PROCESS_PROCESS_ACTIONS_TITLE}</h4>
                <p className="text-[11px] text-alloy-midnight/50">{rows.length} configured</p>
            </div>
            <div className="space-y-2">
                {rows.map((row) => {
                    const active = row.base_action_key === selectedKey;
                    return (
                        <button
                            key={row.base_action_key}
                            type="button"
                            onClick={() => onSelect(row.base_action_key)}
                            className={`process-config-work-view-list-card ${active ? "process-config-work-view-list-card--active" : ""}`}
                            data-testid={`business-process-action-list-${row.base_action_key}`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <p className="truncate text-sm font-semibold text-alloy-midnight">
                                    {row.label.trim() || row.default_label}
                                </p>
                                <span
                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                                        row.enabled
                                            ? "bg-alloy-pine/10 text-alloy-pine"
                                            : "bg-alloy-forge/8 text-alloy-midnight/45"
                                    }`}
                                >
                                    {row.enabled ? "On" : "Off"}
                                </span>
                            </div>
                            <p className="mt-0.5 truncate text-[11px] text-alloy-midnight/50">
                                {placementSummaryFn(row)}
                            </p>
                            <p className="truncate text-[10px] text-alloy-midnight/40">{stageSummaryFn(row)}</p>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

const ACTION_HELP: Partial<Record<LifecycleBaseActionKey, string>> = {
    create_record: "Creates a new primary record in this process and opens it for follow-up work.",
    add_person: "Adds a parent or guardian contact and links them to the active record.",
    add_child: "Adds a child profile and associates them with the family record.",
    send_form: "Sends a configured form link and tracks completion on the record.",
    schedule_tour: "Books a tour slot and writes scheduling context to the record timeline.",
    waitlist_child:
        "Moves a child to Waitlist. Enabling here writes placements immediately and drafts Move to Waitlist into the process command set for Stages → Operator work → Actions & Results (Helpful Actions). Publish Business Process configuration for runtime. Focus Panel Manage is the overflow menu — not What's Next.",
    enroll_child: "Confirms a child's enrollment with audit and workflow side effects.",
    close_lead: "Closes or loses this lead with audit and workflow side effects.",
    create_task: "Creates an operator task tied to the record with due date and assignee.",
    quick_message: "Opens a quick message composer prefilled with record context.",
};

export function BusinessProcessActionsSetupWorkspace({
    row,
    operatorStageOptions,
    saving,
    error,
    success,
    onUpdate,
    onTogglePlacement,
    onToggleStageRestriction,
    onSave,
}: {
    row: LifecycleActionsMatrixDraftRow | null;
    operatorStageOptions: LifecycleOperatorStage[];
    saving: boolean;
    error: string | null;
    success: string | null;
    onUpdate: (patch: Partial<LifecycleActionsMatrixDraftRow>) => void;
    onTogglePlacement: (placementId: string) => void;
    onToggleStageRestriction: (stage: LifecycleOperatorStage) => void;
    onSave: () => void;
}) {
    if (!row) {
        return (
            <div
                className="process-config-setup-card flex min-h-[12rem] items-center justify-center p-8 text-sm text-alloy-midnight/50"
                data-testid="business-process-actions-workspace-empty"
            >
                Select an action to configure placement and stage restrictions.
            </div>
        );
    }

    return (
        <div className="process-config-setup-card space-y-4 p-4" data-testid="business-process-actions-workspace">
            <header>
                <h3 className="text-lg font-semibold text-alloy-midnight">{row.label.trim() || row.default_label}</h3>
                <p className="mt-1 text-sm text-alloy-midnight/60">{BUSINESS_PROCESS_PROCESS_ACTIONS_SUMMARY}</p>
                {ACTION_HELP[row.base_action_key] ?
                    <p
                        className="mt-2 rounded-lg border border-alloy-forge/10 bg-alloy-pine/[0.04] px-3 py-2 text-xs leading-relaxed text-alloy-midnight/70"
                        data-testid={`business-process-action-help-${row.base_action_key}`}
                    >
                        {ACTION_HELP[row.base_action_key]}
                    </p>
                :   null}
            </header>

            <label className="flex items-center gap-2 text-sm text-alloy-midnight/80">
                <input
                    type="checkbox"
                    checked={row.enabled}
                    disabled={!row.saveable}
                    onChange={(e) =>
                        onUpdate({
                            enabled: e.target.checked,
                            placement_ids: e.target.checked
                                ? row.placement_ids.size
                                    ? row.placement_ids
                                    : new Set(["overflow"])
                                : new Set(),
                        })
                    }
                    className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                    data-testid={`business-process-action-enabled-${row.base_action_key}`}
                />
                Enabled
            </label>

            <label className="block space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                    Display label
                </span>
                <input
                    type="text"
                    value={row.label}
                    disabled={!row.enabled || !row.saveable}
                    onChange={(e) => onUpdate({ label: e.target.value })}
                    className="config-runtime-input"
                    data-testid={`business-process-action-label-${row.base_action_key}`}
                />
            </label>

            <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                    Where it appears
                </p>
                <div className="flex flex-wrap gap-2">
                    {LIFECYCLE_ACTIVATION_ACTION_PLACEMENTS.map((p) => (
                        <label
                            key={p.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-alloy-forge/12 bg-white px-2.5 py-1.5 text-xs"
                        >
                            <input
                                type="checkbox"
                                checked={row.placement_ids.has(p.id)}
                                disabled={!row.enabled || !row.saveable}
                                onChange={() => onTogglePlacement(p.id)}
                                className="h-4 w-4 rounded border-alloy-stone/40 config-mode-control"
                                data-testid={`business-process-action-placement-${row.base_action_key}-${p.id}`}
                            />
                            {p.label}
                        </label>
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                    Stage restrictions
                </p>
                <label className="flex items-center gap-2 text-xs text-alloy-midnight/70">
                    <input
                        type="checkbox"
                        checked={!row.restrictStages}
                        disabled={!row.enabled || !row.saveable}
                        onChange={(e) =>
                            onUpdate({
                                restrictStages: !e.target.checked,
                                stage_restrictions: e.target.checked ? new Set() : row.stage_restrictions,
                            })
                        }
                        className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                    />
                    Available in all stages
                </label>
                {row.restrictStages && row.enabled ?
                    <div className="flex flex-wrap gap-2">
                        {operatorStageOptions.map((stage) => (
                            <label
                                key={stage}
                                className="inline-flex items-center gap-1 rounded-lg border border-alloy-forge/12 px-2 py-1 text-xs"
                            >
                                <input
                                    type="checkbox"
                                    checked={row.stage_restrictions.has(stage)}
                                    onChange={() => onToggleStageRestriction(stage)}
                                    className="h-4 w-4 rounded border-alloy-stone/40 config-mode-control"
                                />
                                {LIFECYCLE_STAGE_LABELS[stage] ?? stage}
                            </label>
                        ))}
                    </div>
                :   null}
            </div>

            {error ?
                <p className="text-xs text-red-700" role="alert">
                    {error}
                </p>
            :   null}
            {success ?
                <p className="text-xs text-alloy-pine">{success}</p>
            :   null}

            <button
                type="button"
                className="config-primary-btn disabled:opacity-50"
                disabled={saving || !row.saveable}
                onClick={onSave}
                data-testid="business-process-actions-save"
            >
                {saving ? "Saving…" : "Save process actions"}
            </button>
        </div>
    );
}
