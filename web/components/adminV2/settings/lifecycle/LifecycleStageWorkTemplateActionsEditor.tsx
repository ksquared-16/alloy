"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import AlloyConfigPicker, { type AlloyConfigPickerOption } from "@/components/adminV2/settings/shared/AlloyConfigPicker";
import LifecycleStageOutcomeDefinitionsEditor from "@/components/adminV2/settings/lifecycle/LifecycleStageOutcomeDefinitionsEditor";
import type { ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";
import type { StageCompletionOutcomeV1, StageOperatingPlanV1, StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageOperatingPlanEditorDraft } from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import type { StageOutcomeTransitionOption } from "@/lib/lifecycle/resolveStageOutcomeTransitionOptions";
import type { OutcomeStatusConfiguredRow } from "@/lib/lifecycle/resolveOutcomeStatusOptions";
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
import { workTemplateActionAppliesToLabel } from "@/lib/lifecycle/workTemplateActionAppliesToLabel";
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
    processStages: Array<{ key: string; label: string; grain?: string }>;
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
    /** Case-status catalog + grain, so a terminal outcome can resolve its closed status. */
    configuredStatuses?: ReadonlyArray<OutcomeStatusConfiguredRow>;
    entityType?: string;
    onStageDraftChange?: (draft: StageOperatingPlanEditorDraft) => void;
};

function optionByRef(options: WorkTemplateActionOption[], ref: string): WorkTemplateActionOption | null {
    return options.find((row) => row.ref === ref) ?? null;
}

function toPickerOptions(options: WorkTemplateActionOption[]): AlloyConfigPickerOption[] {
    return options.map((row) => {
        const appliesTo = workTemplateActionAppliesToLabel(row.ref);
        return {
            value: row.ref,
            label: row.label,
            description: appliesTo
                ? [appliesTo, row.description].filter(Boolean).join(" · ")
                : row.description,
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
        };
    });
}

function ConfigSourceBadge({ source, fallbackHint }: { source: ReturnType<typeof helpfulActionsConfigSource>; fallbackHint?: string }) {
    return (
        <p className="text-[0.6875rem] text-alloy-midnight/50" data-work-template-config-source={source}>
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
            <p className="text-[0.6875rem] text-alloy-midnight/45" data-testid={`${testIdPrefix}-empty`}>
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
                        className="flex items-center gap-2 rounded-md border border-alloy-forge/10 bg-white/80 px-2 py-1.5"
                        data-testid={`${testIdPrefix}-${ref}`}
                    >
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-alloy-midnight">
                                {resolveLabel(ref)}
                            </span>
                            {description ?
                                <span className="block truncate text-[0.6875rem] text-alloy-midnight/50">{description}</span>
                            :   null}
                            {invalid ?
                                <span className="block text-[0.6875rem] text-amber-800">{invalid}</span>
                            :   null}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                            <button
                                type="button"
                                className="rounded-md p-1 text-alloy-midnight/50 hover:bg-alloy-bend-pine/[0.06] disabled:opacity-30"
                                disabled={index === 0}
                                onClick={() => onMoveUp(index)}
                                aria-label="Move up"
                            >
                                <ArrowUp className="h-3 w-3" aria-hidden />
                            </button>
                            <button
                                type="button"
                                className="rounded-md p-1 text-alloy-midnight/50 hover:bg-alloy-bend-pine/[0.06] disabled:opacity-30"
                                disabled={index >= refs.length - 1}
                                onClick={() => onMoveDown(index)}
                                aria-label="Move down"
                            >
                                <ArrowDown className="h-3 w-3" aria-hidden />
                            </button>
                            <button
                                type="button"
                                className="rounded-md p-1 text-red-700/80 hover:bg-red-50"
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
    configuredStatuses,
    entityType,
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
        <div
            className="mt-3 space-y-4 border-t border-alloy-forge/10 pt-3"
            data-testid={`work-template-actions-${work.template_key}`}
            data-stage-actions-results="true"
        >
            <div className="mb-1">
                <h3 className="stage-section-label">Actions &amp; Results</h3>
                <p className="stage-field__hint mt-0.5">
                    What can happen here, which action is emphasized, who it applies to, and what result it produces.
                </p>
            </div>
            <section data-testid={`work-template-primary-action-${work.template_key}`}>
                <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <h4 className="stage-section-label">How operators start this work</h4>
                    <ConfigSourceBadge source={primaryActionConfigSource(work)} />
                    <span
                        className="stage-field__hint"
                        data-testid={`work-template-execution-mode-${work.template_key}`}
                    >
                        {workTemplateExecutionModeSourceLabel(work)}
                    </span>
                </div>

                <fieldset className="space-y-2" data-testid={`work-template-primary-mode-${work.template_key}`}>
                    <legend className="sr-only">Execution Mode</legend>
                    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-alloy-forge/12 bg-white px-2.5 py-2">
                        <input
                            type="radio"
                            name={radioName}
                            className="mt-0.5"
                            checked={executionMode === "direct_action"}
                            onChange={() => onChange(setWorkTemplateSelectDirectAction(work, primaryRef || null))}
                            data-testid={`work-template-primary-select-${work.template_key}`}
                        />
                        <span className="min-w-0 flex-1">
                            <span className="block text-[0.8125rem] font-medium text-alloy-midnight">Direct Command</span>
                            <span className="stage-field__hint mb-1.5 block">
                                Operators launch this command first, then may record an outcome.
                            </span>
                            {executionMode === "direct_action" ?
                                <AlloyConfigPicker
                                    label="Primary Command"
                                    value={primaryRef}
                                    options={primaryOptions}
                                    onChange={(value) => onChange(setWorkTemplatePrimaryActionRef(work, value || null))}
                                    testId={`work-template-primary-picker-${work.template_key}`}
                                />
                            :   null}
                        </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-alloy-forge/12 bg-white px-2.5 py-2">
                        <input
                            type="radio"
                            name={radioName}
                            className="mt-0.5"
                            checked={executionMode === "outcome_led"}
                            onChange={() => onChange(setWorkTemplateNoDirectAction(work))}
                            data-testid={`work-template-primary-none-${work.template_key}`}
                        />
                        <span>
                            <span className="block text-[0.8125rem] font-medium text-alloy-midnight">Outcome Led</span>
                            <span className="stage-field__hint block">
                                No Primary Command. Record Outcome is the main operator command.
                            </span>
                        </span>
                    </label>
                </fieldset>
            </section>

            <section data-testid={`work-template-helpful-actions-${work.template_key}`}>
                {/* Helpful Commands support this work. Stage transitions live under Ways out. */}
                <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <h4 className="stage-section-label">Helpful Commands</h4>
                    <ConfigSourceBadge
                        source={helpfulActionsConfigSource(work)}
                        fallbackHint="Configure this section to take explicit control."
                    />
                </div>
                <div className="mb-2 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        className="text-[0.6875rem] text-alloy-midnight/50 hover:text-alloy-bend-pine"
                        onClick={() => onChange(markWorkTemplateHelpfulActionsEmpty(work))}
                    >
                        Clear all
                    </button>
                    <div className="w-44">
                        <AlloyConfigPicker
                            label="Add helpful command"
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
                    title="Helpful Commands"
                    refs={helpfulRefs}
                    resolveLabel={(ref) => optionByRef(options.helpfulActionOptions, ref)?.label ?? ref.replace(/_/g, " ")}
                    resolveDescription={(ref) => {
                        const appliesTo = workTemplateActionAppliesToLabel(ref);
                        const description =
                            optionByRef(options.helpfulActionOptions, ref)?.description ?? null;
                        if (appliesTo && description && !description.includes(appliesTo)) {
                            return `${appliesTo} · ${description}`;
                        }
                        return appliesTo ?? description;
                    }}
                    resolveInvalid={(ref) => {
                        const row = optionByRef(options.helpfulActionOptions, ref);
                        if (!row) return "Unknown command";
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

            {/* Two sentences of schema language ("Outgoing transitions… never by destination text
                alone") became one operator-language pointer. The mechanism they described is now
                visible: "Ways out" names every path and the outcomes that trigger it. The pointer
                stays because the paths are configured in a sibling panel, and it keeps guarding
                against per-work-item "alternate paths" returning. */}
            <p
                className="stage-field__hint"
                data-testid={`work-template-transitions-note-${work.template_key}`}
            >
                Ways out of the stage are configured below, on the stage — not per work item.
            </p>

            <section data-testid={`work-template-outcome-refs-${work.template_key}`}>
                {/* "Available Outcomes", not "What can happen". Three unit tests pin this word,
                    and they are right to: "Outcomes" is the product's own vocabulary — the
                    Overview headline counts them, the summary module names them, and the certified
                    Lead model is written in them. A cleverer heading here would make the page use
                    two words for one concept, which is the noise this sprint is removing. */}
                <h4 className="stage-section-label mb-1.5">Available Outcomes</h4>
                {stageDraft && onStageDraftChange ?
                    <LifecycleStageOutcomeDefinitionsEditor
                        draft={stageDraft}
                        transitionOptions={transitionOptions}
                        stageLabel={stageLabel}
                        // Lets an outcome author the exit path it needs, instead of sending the
                        // operator to another section to satisfy its own dependency.
                        stageKey={stageKey}
                        processStages={processStages}
                        configuredStatuses={configuredStatuses}
                        entityType={entityType}
                        workTemplateKey={work.template_key}
                        onChange={onStageDraftChange}
                    />
                :   <p className="text-[0.6875rem] text-alloy-midnight/45">
                        Outcome authoring requires the stage operating plan editor draft.
                    </p>
                }
            </section>
        </div>
    );
}
