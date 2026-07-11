"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import AlloyConfigPicker, { type AlloyConfigPickerOption } from "@/components/adminV2/settings/shared/AlloyConfigPicker";
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
import {
    alternatePathsConfigSource,
    availableResultsConfigSource,
    helpfulActionsConfigSource,
    primaryActionConfigSource,
    workTemplateConfigSourceLabel,
} from "@/lib/lifecycle/workTemplateConfigSource";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import type { LifecycleConfiguredActionRow } from "@/lib/lifecycle/lifecycleConfiguredActionRows";

type Props = {
    work: StageWorkTemplateV1;
    stageKey: string;
    stageOutcomes: StageCompletionOutcomeV1[];
    actionCatalog: StageActionCatalogV1 | null;
    configuredActions: LifecycleConfiguredActionRow[];
    processStages: Array<{ key: string; label: string }>;
    stageDefinition?: { journey_segment?: string } | null;
    processDefinition?: { primary_entity?: string } | null;
    onChange: (work: StageWorkTemplateV1) => void;
};

function optionByRef(options: WorkTemplateActionOption[], ref: string): WorkTemplateActionOption | null {
    return options.find((row) => row.ref === ref) ?? null;
}

function toPickerOptions(options: WorkTemplateActionOption[]): AlloyConfigPickerOption[] {
    return options.map((row) => ({
        value: row.ref,
        label: row.label,
        description: row.description,
        group:
            row.category === "transition" ? "Recommended"
            : row.category === "communication" ? "Communications"
            : row.category === "workflow" ? "Workflow"
            : row.category === "relationship" ? "Relationships"
            : row.category === "lifecycle" || row.category === "status_lifecycle" ? "Lifecycle"
            : row.category === "bos" || row.category === "bos_native" ? "BOS"
            : "Record actions",
        disabled: !row.supported,
        disabledReason: row.disabledReason,
    }));
}

function ConfigSourceBadge({ source, fallbackHint }: { source: ReturnType<typeof helpfulActionsConfigSource>; fallbackHint?: string }) {
    return (
        <p className="text-[10px] text-alloy-midnight/50" data-work-template-config-source={source}>
            {workTemplateConfigSourceLabel(source)}
            {source === "fallback" && fallbackHint ?
                <span className="block text-alloy-midnight/40">{fallbackHint}</span>
            :   null}
        </p>
    );
}

function OrderedActionRows({
    title,
    refs,
    resolveLabel,
    resolveDescription,
    resolveInvalid,
    onRemove,
    onMoveUp,
    onMoveDown,
    testIdPrefix,
}: {
    title: string;
    refs: string[];
    resolveLabel: (ref: string) => string;
    resolveDescription?: (ref: string) => string | null;
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
                const description = resolveDescription?.(ref);
                return (
                    <li
                        key={`${ref}-${index}`}
                        className="flex items-center gap-2 rounded border border-alloy-forge/10 bg-white/80 px-2 py-1.5"
                        data-testid={`${testIdPrefix}-${ref}`}
                    >
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-alloy-midnight">
                                {resolveLabel(ref)}
                            </span>
                            {description ?
                                <span className="block truncate text-[10px] text-alloy-midnight/50">{description}</span>
                            :   null}
                            {invalid ?
                                <span className="block text-[10px] text-amber-800">{invalid}</span>
                            :   null}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                            <button
                                type="button"
                                className="rounded p-1 text-alloy-midnight/50 hover:bg-alloy-bend-pine/[0.06] disabled:opacity-30"
                                disabled={index === 0}
                                onClick={() => onMoveUp(index)}
                                aria-label="Move up"
                            >
                                <ArrowUp className="h-3 w-3" aria-hidden />
                            </button>
                            <button
                                type="button"
                                className="rounded p-1 text-alloy-midnight/50 hover:bg-alloy-bend-pine/[0.06] disabled:opacity-30"
                                disabled={index >= refs.length - 1}
                                onClick={() => onMoveDown(index)}
                                aria-label="Move down"
                            >
                                <ArrowDown className="h-3 w-3" aria-hidden />
                            </button>
                            <button
                                type="button"
                                className="rounded p-1 text-red-700/80 hover:bg-red-50"
                                onClick={() => onRemove(ref)}
                                aria-label="Remove"
                            >
                                <Trash2 className="h-3 w-3" aria-hidden />
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
    stageDefinition,
    processDefinition,
    onChange,
}: Props) {
    const options = resolveWorkTemplateActionOptions({
        actionRegistry: configuredActions,
        stageActionCatalog: actionCatalog,
        processTransitions: processStages,
        stageKey,
        stageOutcomes,
        workTemplateKey: work.template_key,
        stageDefinition,
        processDefinition,
    });

    const primaryRef = workTemplatePrimaryActionRef(work) ?? "";
    const helpfulRefs = workTemplateHelpfulActionRefs(work);
    const alternateDraftRefs = workTemplateAlternatePathDraftRefs(work);
    const outcomeRefsList = workTemplateOutcomeRefs(work);

    const primaryOptions = toPickerOptions(options.primaryActionOptions.filter((row) => row.supported));
    const helpfulAddOptions = toPickerOptions(
        options.helpfulActionOptions.filter(
            (row) => row.supported && !helpfulRefs.includes(row.ref) && row.ref !== primaryRef,
        ),
    );
    const alternateAddOptions = toPickerOptions(
        options.alternatePathOptions.filter(
            (row) => row.supported && !alternateDraftRefs.some((existing) => existing.ref === row.ref),
        ),
    );
    const outcomeAddOptions: AlloyConfigPickerOption[] = options.outcomeOptions
        .filter((row) => !outcomeRefsList.includes(row.ref))
        .map((row) => ({ value: row.ref, label: row.label, group: "Recommended" }));

    function updateAlternateRefs(next: StageWorkTemplateAlternatePathDraftRef[]) {
        onChange(setWorkTemplateAlternatePathDraftRefs(work, next));
    }

    return (
        <div className="mt-3 space-y-4 border-t border-alloy-forge/10 pt-3" data-testid={`work-template-actions-${work.template_key}`}>
            <section data-testid={`work-template-primary-action-${work.template_key}`}>
                <div className="mb-1 space-y-0.5">
                    <h4 className="text-[11px] font-semibold text-alloy-midnight">Primary Action</h4>
                    <p className="text-[10px] text-alloy-midnight/50">The main action used to perform this work.</p>
                    <ConfigSourceBadge source={primaryActionConfigSource(work)} />
                </div>
                <AlloyConfigPicker
                    label="Primary Action"
                    value={primaryRef}
                    options={primaryOptions}
                    onChange={(value) => onChange(setWorkTemplatePrimaryActionRef(work, value || null))}
                    testId={`work-template-primary-picker-${work.template_key}`}
                />
            </section>

            <section data-testid={`work-template-helpful-actions-${work.template_key}`}>
                <div className="mb-1 space-y-0.5">
                    <h4 className="text-[11px] font-semibold text-alloy-midnight">Helpful Actions</h4>
                    <p className="text-[10px] text-alloy-midnight/50">Supporting capabilities available while doing this work.</p>
                    <ConfigSourceBadge
                        source={helpfulActionsConfigSource(work)}
                        fallbackHint="Configure this section to take explicit control."
                    />
                </div>
                <div className="mb-2 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        className="text-[10px] text-alloy-midnight/50 hover:text-alloy-bend-pine"
                        onClick={() => onChange(markWorkTemplateHelpfulActionsEmpty(work))}
                    >
                        Clear all
                    </button>
                    <div className="w-44">
                        <AlloyConfigPicker
                            label="Add helpful action"
                            value=""
                            options={helpfulAddOptions}
                            onChange={(ref) => {
                                if (!ref) return;
                                onChange(addWorkTemplateHelpfulAction(work, ref));
                            }}
                            compact
                            clearable={false}
                            searchable={helpfulAddOptions.length > 6}
                            testId={`work-template-helpful-add-${work.template_key}`}
                            placeholder="+ Add"
                        />
                    </div>
                </div>
                <OrderedActionRows
                    title="Helpful Actions"
                    refs={helpfulRefs}
                    resolveLabel={(ref) => optionByRef(options.helpfulActionOptions, ref)?.label ?? ref.replace(/_/g, " ")}
                    resolveDescription={(ref) => optionByRef(options.helpfulActionOptions, ref)?.description ?? null}
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
            </section>

            <section data-testid={`work-template-alternate-paths-${work.template_key}`}>
                <div className="mb-1 space-y-0.5">
                    <h4 className="text-[11px] font-semibold text-alloy-midnight">Alternate Paths</h4>
                    <p className="text-[10px] text-alloy-midnight/50">Intentional progression choices outside the normal result flow.</p>
                    <ConfigSourceBadge
                        source={alternatePathsConfigSource(work)}
                        fallbackHint="Configure this section to take explicit control."
                    />
                </div>
                <div className="mb-2 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        className="text-[10px] text-alloy-midnight/50 hover:text-alloy-bend-pine"
                        onClick={() => onChange(markWorkTemplateAlternatePathsEmpty(work))}
                    >
                        Clear all
                    </button>
                    <div className="w-44">
                        <AlloyConfigPicker
                            label="Add alternate path"
                            value=""
                            options={alternateAddOptions}
                            onChange={(ref) => {
                                if (!ref) return;
                                const isTransition = ref.startsWith("move_to_stage:");
                                const next: StageWorkTemplateAlternatePathDraftRef = {
                                    kind: isTransition ? "transition" : "action",
                                    ref,
                                };
                                updateAlternateRefs([...alternateDraftRefs, next]);
                            }}
                            compact
                            clearable={false}
                            searchable={alternateAddOptions.length > 6}
                            testId={`work-template-alternate-add-${work.template_key}`}
                            placeholder="+ Add"
                        />
                    </div>
                </div>
                <OrderedActionRows
                    title="Alternate Paths"
                    refs={alternateDraftRefs.map((row) => row.ref)}
                    resolveLabel={(ref) => {
                        const transition = options.transitionOptions.find((row) => row.ref === ref);
                        if (transition) return transition.label;
                        return optionByRef(options.alternatePathOptions, ref)?.label ?? ref.replace(/_/g, " ");
                    }}
                    resolveDescription={(ref) => optionByRef(options.alternatePathOptions, ref)?.description ?? null}
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
                    onRemove={(ref) => updateAlternateRefs(alternateDraftRefs.filter((row) => row.ref !== ref))}
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
            </section>

            <section data-testid={`work-template-outcome-refs-${work.template_key}`}>
                <div className="mb-1 space-y-0.5">
                    <h4 className="text-[11px] font-semibold text-alloy-midnight">Available Results</h4>
                    <p className="text-[10px] text-alloy-midnight/50">
                        Choose which stage-defined results operators can record for this work.
                    </p>
                    <ConfigSourceBadge
                        source={availableResultsConfigSource(work)}
                        fallbackHint="Configure this section to take explicit control."
                    />
                </div>
                <div className="mb-2 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        className="text-[10px] text-alloy-midnight/50 hover:text-alloy-bend-pine"
                        onClick={() => onChange(markWorkTemplateOutcomeRefsEmpty(work))}
                    >
                        Clear all
                    </button>
                    <div className="w-44">
                        <AlloyConfigPicker
                            label="Add available result"
                            value=""
                            options={outcomeAddOptions}
                            onChange={(ref) => {
                                if (!ref) return;
                                onChange(setWorkTemplateOutcomeRefs(work, [...outcomeRefsList, ref]));
                            }}
                            compact
                            clearable={false}
                            searchable={outcomeAddOptions.length > 6}
                            testId={`work-template-outcome-ref-add-${work.template_key}`}
                            placeholder="+ Add"
                        />
                    </div>
                </div>
                <OrderedActionRows
                    title="Available Results"
                    refs={outcomeRefsList}
                    resolveLabel={(ref) => options.outcomeOptions.find((row) => row.ref === ref)?.label ?? ref.replace(/_/g, " ")}
                    resolveInvalid={(ref) =>
                        options.outcomeOptions.some((row) => row.ref === ref) ? null : "Unknown result"
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
            </section>
        </div>
    );
}
