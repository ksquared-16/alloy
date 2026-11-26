"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import { type AlloyConfigPickerOption } from "@/components/adminV2/settings/shared/AlloyConfigPicker";
import LifecycleStageOutcomeDefinitionsEditor from "@/components/adminV2/settings/lifecycle/LifecycleStageOutcomeDefinitionsEditor";
import type { ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";
import type { StageCompletionOutcomeV1, StageOperatingPlanV1, StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageOperatingPlanEditorDraft } from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import type { StageOutcomeTransitionOption } from "@/lib/lifecycle/resolveStageOutcomeTransitionOptions";
import type { OutcomeStatusConfiguredRow } from "@/lib/lifecycle/resolveOutcomeStatusOptions";
import type { WorkTemplateActionOption } from "@/lib/lifecycle/resolveWorkTemplateActionOptions";
import { workTemplateActionAppliesToLabel } from "@/lib/lifecycle/workTemplateActionAppliesToLabel";
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

export function optionByRef(options: WorkTemplateActionOption[], ref: string): WorkTemplateActionOption | null {
    return options.find((row) => row.ref === ref) ?? null;
}

export function toPickerOptions(options: WorkTemplateActionOption[]): AlloyConfigPickerOption[] {
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

export function OrderedActionRows({
    title,
    refs,
    resolveLabel,
    resolveDescription,
    resolveInvalid,
    onRemove,
    onMoveUp,
    onMoveDown,
    testIdPrefix,
    rename,
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
    /**
     * The label operators see, authored separately from the command's stable key. The key decides
     * what runs; this only decides what the button says. Empty restores the platform's own label.
     */
    rename?: {
        authored: (ref: string) => string | null;
        platformLabel: (ref: string) => string;
        onRename: (ref: string, label: string | null) => void;
    };
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
                            {rename ?
                                <label className="mt-1 flex items-center gap-1.5 text-[0.6875rem] text-alloy-midnight/55">
                                    <span className="shrink-0">Label</span>
                                    <input
                                        key={`${ref}-${rename.authored(ref) ?? ""}`}
                                        type="text"
                                        className="min-w-0 flex-1 rounded border border-alloy-forge/15 bg-white px-1.5 py-0.5 text-[0.6875rem] text-alloy-midnight"
                                        defaultValue={rename.authored(ref) ?? ""}
                                        placeholder={rename.platformLabel(ref)}
                                        maxLength={60}
                                        aria-label={`Label for ${rename.platformLabel(ref)}`}
                                        data-testid={`${testIdPrefix}-${ref}-label`}
                                        onBlur={(e) => {
                                            const next = e.currentTarget.value.trim();
                                            if (next === (rename.authored(ref) ?? "")) return;
                                            rename.onRename(ref, next || null);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") e.currentTarget.blur();
                                        }}
                                    />
                                </label>
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
    processStages,
    stageDraft,
    transitionOptions = [],
    onStageDraftChange,
    configuredStatuses,
    entityType,
}: Props) {
    return (
        <div
            className="mt-3 space-y-4 border-t border-alloy-forge/10 pt-3"
            data-testid={`work-template-actions-${work.template_key}`}
            data-stage-actions-results="true"
        >
            <div className="mb-1">
                <h3 className="stage-section-label">Actions &amp; Results</h3>
                <p className="stage-field__hint mt-0.5">
                    What results this work can produce.
                </p>
            </div>
            {/* Commands are configured once per stage, under "Stage commands" — not per work
                item. A work item's legacy Primary/Helpful commands are carried into that list. */}
            <p className="stage-field__hint" data-testid={`work-template-commands-note-${work.template_key}`}>
                Commands for this stage are set under Stage commands above — not per work item.
            </p>

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
