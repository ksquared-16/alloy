"use client";

import {
    LIFECYCLE_ACTIVATION_ACTION_PLACEMENTS,
    type LifecycleBaseActionDefinition,
    type LifecycleBaseActionKey,
} from "@/lib/lifecycle/lifecycleStageBaseActions";
import {
    formatConfiguredActionScopeLabel,
    type LifecycleConfiguredActionRow,
} from "@/lib/lifecycle/lifecycleConfiguredActionRows";
import {
    LIFECYCLE_ACTION_SCOPE_LABELS,
    type LifecycleActionScope,
} from "@/lib/lifecycle/lifecycleStageActionScope";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export default function LifecycleBuilderActionsCard({
    operatorStage,
    availableStages,
    baseActions,
    configuredActions,
    baseActionKey,
    actionLabel,
    actionScope,
    selectedOperatorStages,
    selectedPlacements,
    saving,
    saveError,
    saveSuccess,
    onBaseActionChange,
    onActionLabelChange,
    onActionScopeChange,
    onToggleOperatorStage,
    onTogglePlacement,
    onRemoveConfiguredAction,
}: {
    operatorStage: LifecycleOperatorStage | null;
    availableStages: readonly { key: string; label: string }[];
    baseActions: readonly LifecycleBaseActionDefinition[];
    configuredActions: LifecycleConfiguredActionRow[];
    baseActionKey: LifecycleBaseActionKey | "";
    actionLabel: string;
    actionScope: LifecycleActionScope;
    selectedOperatorStages: Set<string>;
    selectedPlacements: Set<string>;
    saving: boolean;
    saveError: string | null;
    saveSuccess: string | null;
    onBaseActionChange: (key: LifecycleBaseActionKey | "") => void;
    onActionLabelChange: (label: string) => void;
    onActionScopeChange: (scope: LifecycleActionScope) => void;
    onToggleOperatorStage: (stageKey: string) => void;
    onTogglePlacement: (id: string) => void;
    onRemoveConfiguredAction: (row: LifecycleConfiguredActionRow) => void | Promise<void>;
}) {
    if (!operatorStage) {
        return <p className="text-xs text-amber-800">Requires a platform stage key.</p>;
    }

    return (
        <div className="space-y-2" data-testid="lifecycle-builder-actions-card">
            {saveSuccess ? (
                <p
                    className="text-[11px] font-medium text-alloy-pine"
                    role="status"
                    data-testid="lifecycle-action-save-success"
                >
                    {saveSuccess}
                </p>
            ) : null}

            {saveError ? (
                <p className="text-[11px] text-red-700" role="alert">
                    {saveError}
                </p>
            ) : null}

            <section data-testid="lifecycle-configured-actions">
                <h5 className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                    Configured actions
                </h5>
                {configuredActions.length === 0 ? (
                    <p className="mt-1 text-[11px] text-alloy-midnight/50" data-testid="lifecycle-actions-empty">
                        No actions yet.
                    </p>
                ) : (
                    <ul className="mt-1.5 space-y-1.5" data-testid="lifecycle-actions-list">
                        {configuredActions.map((action) => (
                            <li
                                key={action.action_definition_id}
                                className="rounded border border-alloy-forge/10 bg-alloy-stone/5 px-2 py-1.5 text-[11px]"
                                data-testid={`lifecycle-configured-action-${action.key}`}
                            >
                                <p className="font-medium text-alloy-midnight">{action.label}</p>
                                <p className="text-alloy-midnight/50">
                                    Base action: {action.base_action_label ?? action.key}
                                </p>
                                <p className="text-alloy-midnight/50">
                                    Scope: {formatConfiguredActionScopeLabel(action)}
                                </p>
                                <p className="text-alloy-midnight/50">
                                    Placements:{" "}
                                    {action.placements
                                        .filter((p) => p.placement_id)
                                        .map((p) => p.placement_label)
                                        .join(", ") || "—"}
                                </p>
                                <button
                                    type="button"
                                    className="mt-1 text-[10px] font-medium text-red-800 hover:underline"
                                    data-testid={`lifecycle-configured-action-remove-${action.key}`}
                                    onClick={() => void onRemoveConfiguredAction(action)}
                                >
                                    Remove
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section
                className="space-y-2 border-t border-dashed border-alloy-forge/15 pt-2"
                data-testid="lifecycle-add-action"
            >
                <h5 className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                    Add action
                </h5>
                <label className="block text-[11px] font-medium text-alloy-midnight/70">
                    Base action
                    <select
                        className="mt-0.5 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                        value={baseActionKey}
                        onChange={(e) =>
                            onBaseActionChange(e.target.value as LifecycleBaseActionKey | "")
                        }
                        data-testid="lifecycle-add-action-base"
                    >
                        <option value="">Choose base action…</option>
                        {baseActions.map((b) => (
                            <option key={b.key} value={b.key}>
                                {b.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block text-[11px] font-medium text-alloy-midnight/70">
                    Display label
                    <input
                        type="text"
                        className="mt-0.5 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                        value={actionLabel}
                        onChange={(e) => onActionLabelChange(e.target.value)}
                        data-testid="lifecycle-add-action-label"
                    />
                </label>
                <fieldset className="text-[11px]">
                    <legend className="font-medium text-alloy-midnight/70">Scope</legend>
                    <div className="mt-1 flex flex-col gap-1">
                        <label className="flex items-center gap-2">
                            <input
                                type="radio"
                                name="lifecycle-action-scope"
                                checked={actionScope === "lifecycle"}
                                onChange={() => onActionScopeChange("lifecycle")}
                                data-testid="lifecycle-action-scope-lifecycle"
                            />
                            {LIFECYCLE_ACTION_SCOPE_LABELS.lifecycle}
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="radio"
                                name="lifecycle-action-scope"
                                checked={actionScope === "stage"}
                                onChange={() => onActionScopeChange("stage")}
                                data-testid="lifecycle-action-scope-stage"
                            />
                            {LIFECYCLE_ACTION_SCOPE_LABELS.stage}
                        </label>
                    </div>
                </fieldset>
                {actionScope === "stage" ? (
                    <fieldset className="text-[11px]" data-testid="lifecycle-action-stage-picks">
                        <legend className="mb-1 font-medium text-alloy-midnight/70">Stages</legend>
                        <ul className="flex flex-col gap-0.5">
                            {availableStages.map((s) => (
                                <li key={s.key}>
                                    <label className="flex items-center gap-2 text-alloy-midnight/75">
                                        <input
                                            type="checkbox"
                                            checked={selectedOperatorStages.has(s.key)}
                                            onChange={() => onToggleOperatorStage(s.key)}
                                            data-testid={`lifecycle-action-stage-${s.key}`}
                                        />
                                        {s.label}
                                    </label>
                                </li>
                            ))}
                        </ul>
                    </fieldset>
                ) : null}
                <fieldset className="text-[11px]">
                    <legend className="mb-1 font-medium text-alloy-midnight/70">Placements</legend>
                    <ul className="flex flex-col gap-0.5" data-testid="lifecycle-add-action-placements">
                        {LIFECYCLE_ACTIVATION_ACTION_PLACEMENTS.map((p) => (
                            <li key={p.id}>
                                <label className="flex items-center gap-2 text-alloy-midnight/75">
                                    <input
                                        type="checkbox"
                                        checked={selectedPlacements.has(p.id)}
                                        onChange={() => onTogglePlacement(p.id)}
                                        data-testid={`lifecycle-add-action-placement-${p.id}`}
                                    />
                                    {p.label}
                                </label>
                            </li>
                        ))}
                    </ul>
                </fieldset>
            </section>
        </div>
    );
}

/** Whether Add Action form can be saved (footer Save Action uses the same rules). */
export function canSaveLifecycleBuilderAddAction(input: {
    operatorStage: LifecycleOperatorStage | null;
    baseActionKey: LifecycleBaseActionKey | "";
    actionLabel: string;
    actionScope: LifecycleActionScope;
    selectedPlacements: Set<string>;
    selectedOperatorStages: Set<string>;
}): boolean {
    return (
        Boolean(input.operatorStage) &&
        Boolean(input.baseActionKey) &&
        Boolean(input.actionLabel.trim()) &&
        input.selectedPlacements.size > 0 &&
        (input.actionScope === "lifecycle" || input.selectedOperatorStages.size > 0)
    );
}
