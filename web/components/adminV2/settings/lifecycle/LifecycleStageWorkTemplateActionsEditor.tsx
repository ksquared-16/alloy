"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import AlloyConfigPicker, { type AlloyConfigPickerOption } from "@/components/adminV2/settings/shared/AlloyConfigPicker";
import LifecycleStageOutcomeDefinitionsEditor from "@/components/adminV2/settings/lifecycle/LifecycleStageOutcomeDefinitionsEditor";
import type { ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";
import type { StageCompletionOutcomeV1, StageOperatingPlanV1, StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageOperatingPlanEditorDraft } from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import type { StageOutcomeTransitionOption } from "@/lib/lifecycle/resolveStageOutcomeTransitionOptions";
import {
    addWorkTemplateHelpfulAction,
    markWorkTemplateHelpfulActionsEmpty,
    removeWorkTemplateHelpfulAction,
    reorderWorkTemplateHelpfulActions,
    setWorkTemplateNoDirectAction,
    setWorkTemplatePrimaryActionRef,
    setWorkTemplateSelectDirectAction,
    workTemplateExecutionMode,
    workTemplateHelpfulActionRefs,
    workTemplatePrimaryActionRef,
} from "@/lib/lifecycle/stageWorkTemplateActionRefs";
import {
    resolveWorkTemplateActionOptions,
    type WorkTemplateActionOption,
} from "@/lib/lifecycle/resolveWorkTemplateActionOptions";
import {
    helpfulActionsConfigSource,
    primaryActionConfigSource,
    workTemplateConfigSourceLabel,
    workTemplateExecutionModeSourceLabel,
} from "@/lib/lifecycle/workTemplateConfigSource";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import type { LifecycleConfiguredActionRow } from "@/lib/lifecycle/lifecycleConfiguredActionRows";
import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";

type Props = {
    work: StageWorkTemplateV1;
    stageKey: string;
    stageLabel?: string;
    stageOutcomes: StageCompletionOutcomeV1[];
    actionCatalog: StageActionCatalogV1 | null;
    configuredActions: LifecycleConfiguredActionRow[];
    processStages: Array<{ key: string; label: string }>;
    stageOperatingPlan?: StageOperatingPlanV1 | null;
    processTracks?: ProcessTracksV1 | null;
    stageDefinition?: { journey_segment?: string } | null;
    processDefinition?: { primary_entity?: string } | null;
    /** P6.S3 — gates Work Template Command options to process selection. */
    process?: LifecycleBuilderProcessRecord | null;
    onChange: (work: StageWorkTemplateV1) => void;
    /** Stage draft + transitions enable Outcome Definitions in this Work Template surface. */
    stageDraft?: StageOperatingPlanEditorDraft;
    transitionOptions?: StageOutcomeTransitionOption[];
    onStageDraftChange?: (draft: StageOperatingPlanEditorDraft) => void;
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
    stageLabel,
    stageOutcomes,
    actionCatalog,
    configuredActions,
    processStages,
    stageOperatingPlan,
    processTracks,
    stageDefinition,
    processDefinition,
    process,
    onChange,
    stageDraft,
    transitionOptions = [],
    onStageDraftChange,
}: Props) {
    const options = resolveWorkTemplateActionOptions({
        actionRegistry: configuredActions,
        stageActionCatalog: actionCatalog,
        stageOperatingPlan: stageOperatingPlan ?? null,
        processTracks: processTracks ?? null,
        processStages,
        stageKey,
        stageLabel,
        stageOutcomes,
        workTemplateKey: work.template_key,
        stageDefinition,
        processDefinition,
        process: process ?? null,
    });

    const executionMode = workTemplateExecutionMode(work);
    const primaryRef = workTemplatePrimaryActionRef(work) ?? "";
    const helpfulRefs = workTemplateHelpfulActionRefs(work);
    const radioName = `work-template-primary-mode-${work.template_key}`;

    const primaryOptions = toPickerOptions(options.primaryActionOptions.filter((row) => row.supported));
    const helpfulAddOptions = toPickerOptions(
        options.helpfulActionOptions.filter(
            (row) => row.supported && !helpfulRefs.includes(row.ref) && row.ref !== primaryRef,
        ),
    );

    return (
        <div className="mt-3 space-y-4 border-t border-alloy-forge/10 pt-3" data-testid={`work-template-actions-${work.template_key}`}>
            <section data-testid={`work-template-primary-action-${work.template_key}`}>
                <div className="mb-1 space-y-0.5">
                    <h4 className="text-[11px] font-semibold text-alloy-midnight">Execution Mode</h4>
                    <p className="text-[10px] text-alloy-midnight/50">
                        Direct Action launches a tool. Outcome Led has no Primary Action — Record Outcome is primary.
                    </p>
                    <ConfigSourceBadge source={primaryActionConfigSource(work)} />
                    <p className="text-[10px] text-alloy-midnight/45" data-testid={`work-template-execution-mode-${work.template_key}`}>
                        {workTemplateExecutionModeSourceLabel(work)}
                    </p>
                </div>

                <fieldset className="space-y-2" data-testid={`work-template-primary-mode-${work.template_key}`}>
                    <legend className="sr-only">Execution Mode</legend>
                    <label className="flex cursor-pointer items-start gap-2 rounded border border-alloy-forge/10 bg-white/80 px-2 py-1.5">
                        <input
                            type="radio"
                            name={radioName}
                            className="mt-0.5"
                            checked={executionMode === "direct_action"}
                            onChange={() => onChange(setWorkTemplateSelectDirectAction(work, primaryRef || null))}
                            data-testid={`work-template-primary-select-${work.template_key}`}
                        />
                        <span className="min-w-0 flex-1">
                            <span className="block text-[11px] font-medium text-alloy-midnight">Direct Action</span>
                            <span className="mb-1.5 block text-[10px] text-alloy-midnight/50">
                                Operators launch this action first, then may record an outcome.
                            </span>
                            {executionMode === "direct_action" ?
                                <AlloyConfigPicker
                                    label="Primary Action"
                                    value={primaryRef}
                                    options={primaryOptions}
                                    onChange={(value) => onChange(setWorkTemplatePrimaryActionRef(work, value || null))}
                                    testId={`work-template-primary-picker-${work.template_key}`}
                                />
                            :   null}
                        </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 rounded border border-alloy-forge/10 bg-white/80 px-2 py-1.5">
                        <input
                            type="radio"
                            name={radioName}
                            className="mt-0.5"
                            checked={executionMode === "outcome_led"}
                            onChange={() => onChange(setWorkTemplateNoDirectAction(work))}
                            data-testid={`work-template-primary-none-${work.template_key}`}
                        />
                        <span>
                            <span className="block text-[11px] font-medium text-alloy-midnight">Outcome Led</span>
                            <span className="block text-[10px] text-alloy-midnight/50">
                                No Primary Action. Record Outcome is the main operator action.
                            </span>
                        </span>
                    </label>
                </fieldset>
            </section>

            <section data-testid={`work-template-helpful-actions-${work.template_key}`}>
                <div className="mb-1 space-y-0.5">
                    <h4 className="text-[11px] font-semibold text-alloy-midnight">Helpful Actions</h4>
                    <p className="text-[10px] text-alloy-midnight/50">
                        Helpful Actions support this work. Stage transitions are configured by the process and
                        appear automatically when valid.
                    </p>
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

            <p
                className="rounded border border-alloy-forge/10 bg-alloy-midnight/[0.02] px-2 py-1.5 text-[10px] text-alloy-midnight/55"
                data-testid={`work-template-transitions-note-${work.template_key}`}
            >
                Outgoing transitions are owned by this stage and appear on What's Next when configured.
                Outcome automation moves records through those transitions — never by destination text alone.
            </p>

            <section data-testid={`work-template-outcome-refs-${work.template_key}`}>
                <div className="mb-2 space-y-0.5">
                    <h4 className="text-[11px] font-semibold text-alloy-midnight">Available Outcomes</h4>
                    <p className="text-[10px] text-alloy-midnight/50">
                        Define outcomes for this work, then configure automation under each definition.
                    </p>
                </div>
                {stageDraft && onStageDraftChange ?
                    <LifecycleStageOutcomeDefinitionsEditor
                        draft={stageDraft}
                        transitionOptions={transitionOptions}
                        stageLabel={stageLabel}
                        workTemplateKey={work.template_key}
                        onChange={onStageDraftChange}
                    />
                :   <p className="text-[10px] text-alloy-midnight/45">
                        Outcome authoring requires the stage operating plan editor draft.
                    </p>
                }
            </section>
        </div>
    );
}
