"use client";

import type { StageCompletionOutcomeV1, StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import {
    addWorkTemplateHelpfulAction,
    markWorkTemplateAlternatePathsEmpty,
    markWorkTemplateHelpfulActionsEmpty,
    markWorkTemplateOutcomeRefsEmpty,
    removeWorkTemplateHelpfulAction,
    reorderWorkTemplateHelpfulActions,
    reorderWorkTemplateOutcomeRefs,
    setWorkTemplateAlternatePathDraftRefs,
    setWorkTemplateOutcomeRefs,
    setWorkTemplatePrimaryActionRef,
    workTemplateAlternatePathDraftRefs,
    workTemplateHelpfulActionRefs,
    workTemplateOutcomeRefs,
    workTemplatePrimaryActionRef,
    type StageWorkTemplateAlternatePathDraftRef,
} from "@/lib/lifecycle/stageWorkTemplateActionRefs";
import {
    resolveWorkTemplateActionOptions,
    type WorkTemplateActionOption,
} from "@/lib/lifecycle/resolveWorkTemplateActionOptions";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import type { LifecycleConfiguredActionRow } from "@/lib/lifecycle/lifecycleConfiguredActionRows";

type Props = {
    work: StageWorkTemplateV1;
    stageKey: string;
    stageOutcomes: StageCompletionOutcomeV1[];
    actionCatalog: StageActionCatalogV1 | null;
    configuredActions: LifecycleConfiguredActionRow[];
    processStages: Array<{ key: string; label: string }>;
    onChange: (work: StageWorkTemplateV1) => void;
};

function optionByRef(options: WorkTemplateActionOption[], ref: string): WorkTemplateActionOption | null {
    return options.find((row) => row.ref === ref) ?? null;
}

function SelectRow({
    label,
    value,
    onChange,
    options,
    testId,
    allowEmpty = true,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: WorkTemplateActionOption[];
    testId: string;
    allowEmpty?: boolean;
}) {
    return (
        <label className="block space-y-1">
            <span className="text-[10px] font-semibold text-alloy-midnight/70">{label}</span>
            <select
                className="w-full rounded border border-alloy-forge/15 bg-white px-2 py-1 text-xs"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                data-testid={testId}
            >
                {allowEmpty ?
                    <option value="">— None —</option>
                :   null}
                {options.map((row) => (
                    <option key={row.ref} value={row.ref} disabled={!row.supported}>
                        {row.label}
                        {!row.supported && row.disabledReason ? ` (${row.disabledReason})` : ""}
                        {row.supported ? ` · ${row.category}` : ""}
                    </option>
                ))}
            </select>
        </label>
    );
}

function OrderedRefList({
    title,
    refs,
    resolveLabel,
    resolveInvalid,
    onRemove,
    onMoveUp,
    onMoveDown,
    testIdPrefix,
}: {
    title: string;
    refs: string[];
    resolveLabel: (ref: string) => string;
    resolveInvalid: (ref: string) => string | null;
    onRemove: (ref: string) => void;
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
    testIdPrefix: string;
}) {
    if (!refs.length) {
        return (
            <p className="text-[10px] text-alloy-midnight/45" data-testid={`${testIdPrefix}-empty`}>
                No {title.toLowerCase()} configured.
            </p>
        );
    }

    return (
        <ul className="space-y-1" data-testid={`${testIdPrefix}-list`}>
            {refs.map((ref, index) => {
                const invalid = resolveInvalid(ref);
                return (
                    <li
                        key={`${ref}-${index}`}
                        className="flex items-center gap-2 rounded border border-alloy-forge/10 bg-white/80 px-2 py-1"
                        data-testid={`${testIdPrefix}-${ref}`}
                    >
                        <span className="min-w-0 flex-1 truncate text-xs text-alloy-midnight">
                            {resolveLabel(ref)}
                            {invalid ?
                                <span className="ml-1 text-[10px] text-amber-800">({invalid})</span>
                            :   null}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                            <button
                                type="button"
                                className="text-[10px] text-alloy-midnight/50 disabled:opacity-30"
                                disabled={index === 0}
                                onClick={() => onMoveUp(index)}
                                aria-label="Move up"
                            >
                                ↑
                            </button>
                            <button
                                type="button"
                                className="text-[10px] text-alloy-midnight/50 disabled:opacity-30"
                                disabled={index >= refs.length - 1}
                                onClick={() => onMoveDown(index)}
                                aria-label="Move down"
                            >
                                ↓
                            </button>
                            <button
                                type="button"
                                className="text-[10px] text-red-700/80"
                                onClick={() => onRemove(ref)}
                            >
                                Remove
                            </button>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

export default function LifecycleStageWorkTemplateActionsEditor({
    work,
    stageKey,
    stageOutcomes,
    actionCatalog,
    configuredActions,
    processStages,
    onChange,
}: Props) {
    const options = resolveWorkTemplateActionOptions({
        actionRegistry: configuredActions,
        stageActionCatalog: actionCatalog,
        processTransitions: processStages,
        stageKey,
        stageOutcomes,
        workTemplateKey: work.template_key,
    });

    const primaryRef = workTemplatePrimaryActionRef(work) ?? "";
    const helpfulRefs = workTemplateHelpfulActionRefs(work);
    const alternateDraftRefs = workTemplateAlternatePathDraftRefs(work);
    const outcomeRefsList = workTemplateOutcomeRefs(work);

    const helpfulAddOptions = options.helpfulActionOptions.filter(
        (row) => row.supported && !helpfulRefs.includes(row.ref) && row.ref !== primaryRef,
    );

    const alternateAddOptions = options.alternatePathOptions.filter(
        (row) =>
            row.supported
            && !alternateDraftRefs.some((existing) => existing.ref === row.ref),
    );

    const outcomeAddOptions = options.outcomeOptions.filter(
        (row) => !outcomeRefsList.includes(row.ref),
    );

    function updateAlternateRefs(next: StageWorkTemplateAlternatePathDraftRef[]) {
        onChange(setWorkTemplateAlternatePathDraftRefs(work, next));
    }

    return (
        <div className="mt-3 space-y-3 border-t border-alloy-forge/10 pt-3" data-testid={`work-template-actions-${work.template_key}`}>
            <SelectRow
                label="Primary Action"
                value={primaryRef}
                onChange={(value) => onChange(setWorkTemplatePrimaryActionRef(work, value || null))}
                options={options.primaryActionOptions}
                testId={`work-template-primary-action-${work.template_key}`}
            />
            {primaryRef ?
                <p className="text-[10px] text-alloy-midnight/50">
                    {optionByRef(options.primaryActionOptions, primaryRef)?.description
                        ?? "Primary execution affordance for this work item."}
                </p>
            :   null}

            <div data-testid={`work-template-helpful-actions-${work.template_key}`}>
                <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-alloy-midnight/70">Helpful Actions</span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="text-[10px] text-alloy-midnight/50"
                            onClick={() => onChange(markWorkTemplateHelpfulActionsEmpty(work))}
                        >
                            Clear all
                        </button>
                        <select
                            className="rounded border border-alloy-forge/15 px-1 py-0.5 text-[10px]"
                            value=""
                            onChange={(e) => {
                                const ref = e.target.value;
                                if (!ref) return;
                                onChange(addWorkTemplateHelpfulAction(work, ref));
                            }}
                            data-testid={`work-template-helpful-add-${work.template_key}`}
                        >
                            <option value="">+ Add</option>
                            {helpfulAddOptions.map((row) => (
                                <option key={row.ref} value={row.ref}>
                                    {row.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <OrderedRefList
                    title="Helpful Actions"
                    refs={helpfulRefs}
                    resolveLabel={(ref) => optionByRef(options.helpfulActionOptions, ref)?.label ?? ref}
                    resolveInvalid={(ref) => {
                        const row = optionByRef(options.helpfulActionOptions, ref);
                        if (!row) return "Unknown action";
                        if (!row.supported) return row.disabledReason ?? "Unsupported";
                        return null;
                    }}
                    onRemove={(ref) => onChange(removeWorkTemplateHelpfulAction(work, ref))}
                    onMoveUp={(index) => {
                        const next = [...helpfulRefs];
                        if (index <= 0) return;
                        [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                        onChange(reorderWorkTemplateHelpfulActions(work, next));
                    }}
                    onMoveDown={(index) => {
                        const next = [...helpfulRefs];
                        if (index >= next.length - 1) return;
                        [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
                        onChange(reorderWorkTemplateHelpfulActions(work, next));
                    }}
                    testIdPrefix={`work-template-helpful-${work.template_key}`}
                />
            </div>

            <div data-testid={`work-template-alternate-paths-${work.template_key}`}>
                <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-alloy-midnight/70">Alternate Paths</span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="text-[10px] text-alloy-midnight/50"
                            onClick={() => onChange(markWorkTemplateAlternatePathsEmpty(work))}
                        >
                            Clear all
                        </button>
                        <select
                            className="rounded border border-alloy-forge/15 px-1 py-0.5 text-[10px]"
                            value=""
                            onChange={(e) => {
                                const ref = e.target.value;
                                if (!ref) return;
                                const isTransition = ref.startsWith("move_to_stage:");
                                const next: StageWorkTemplateAlternatePathDraftRef = {
                                    kind: isTransition ? "transition" : "action",
                                    ref,
                                };
                                updateAlternateRefs([...alternateDraftRefs, next]);
                            }}
                            data-testid={`work-template-alternate-add-${work.template_key}`}
                        >
                            <option value="">+ Add</option>
                            {alternateAddOptions.map((row) => (
                                <option key={row.ref} value={row.ref}>
                                    {row.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <OrderedRefList
                    title="Alternate Paths"
                    refs={alternateDraftRefs.map((row) => row.ref)}
                    resolveLabel={(ref) => {
                        const transition = options.transitionOptions.find((row) => row.ref === ref);
                        if (transition) return transition.label;
                        return optionByRef(options.alternatePathOptions, ref)?.label ?? ref;
                    }}
                    resolveInvalid={(ref) => {
                        if (ref.startsWith("move_to_stage:")) {
                            const row = options.transitionOptions.find((item) => item.ref === ref);
                            if (!row) return "Unknown transition";
                            if (!row.supported) return row.disabledReason ?? "Unsupported";
                            return null;
                        }
                        const row = optionByRef(options.alternatePathOptions, ref);
                        if (!row) return "Unknown action";
                        if (!row.supported) return row.disabledReason ?? "Unsupported";
                        return null;
                    }}
                    onRemove={(ref) =>
                        updateAlternateRefs(alternateDraftRefs.filter((row) => row.ref !== ref))
                    }
                    onMoveUp={(index) => {
                        const next = [...alternateDraftRefs];
                        if (index <= 0) return;
                        [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                        updateAlternateRefs(next);
                    }}
                    onMoveDown={(index) => {
                        const next = [...alternateDraftRefs];
                        if (index >= next.length - 1) return;
                        [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
                        updateAlternateRefs(next);
                    }}
                    testIdPrefix={`work-template-alternate-${work.template_key}`}
                />
            </div>

            <div data-testid={`work-template-outcome-refs-${work.template_key}`}>
                <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-alloy-midnight/70">Completion Outcomes</span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="text-[10px] text-alloy-midnight/50"
                            onClick={() => onChange(markWorkTemplateOutcomeRefsEmpty(work))}
                        >
                            Clear all
                        </button>
                        <select
                            className="rounded border border-alloy-forge/15 px-1 py-0.5 text-[10px]"
                            value=""
                            onChange={(e) => {
                                const ref = e.target.value;
                                if (!ref) return;
                                onChange(setWorkTemplateOutcomeRefs(work, [...outcomeRefsList, ref]));
                            }}
                            data-testid={`work-template-outcome-ref-add-${work.template_key}`}
                        >
                            <option value="">+ Add</option>
                            {outcomeAddOptions.map((row) => (
                                <option key={row.ref} value={row.ref}>
                                    {row.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <p className="mb-1 text-[10px] text-alloy-midnight/45">
                    References canonical stage outcomes — definitions remain stage-owned.
                </p>
                <OrderedRefList
                    title="Completion Outcomes"
                    refs={outcomeRefsList}
                    resolveLabel={(ref) => options.outcomeOptions.find((row) => row.ref === ref)?.label ?? ref}
                    resolveInvalid={(ref) =>
                        options.outcomeOptions.some((row) => row.ref === ref) ? null : "Unknown outcome"
                    }
                    onRemove={(ref) =>
                        onChange(setWorkTemplateOutcomeRefs(work, outcomeRefsList.filter((row) => row !== ref)))
                    }
                    onMoveUp={(index) => {
                        const next = [...outcomeRefsList];
                        if (index <= 0) return;
                        [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                        onChange(reorderWorkTemplateOutcomeRefs(work, next));
                    }}
                    onMoveDown={(index) => {
                        const next = [...outcomeRefsList];
                        if (index >= next.length - 1) return;
                        [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
                        onChange(reorderWorkTemplateOutcomeRefs(work, next));
                    }}
                    testIdPrefix={`work-template-outcome-ref-${work.template_key}`}
                />
            </div>
        </div>
    );
}
