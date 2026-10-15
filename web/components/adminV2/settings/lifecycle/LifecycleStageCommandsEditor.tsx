"use client";

import AlloyConfigPicker from "@/components/adminV2/settings/shared/AlloyConfigPicker";
import {
    OrderedActionRows,
    optionByRef,
    toPickerOptions,
} from "@/components/adminV2/settings/lifecycle/LifecycleStageWorkTemplateActionsEditor";
import { stageCatalogSupportingCommands } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkTemplateFromPublishedPlan";
import type { ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";
import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { LifecycleConfiguredActionRow } from "@/lib/lifecycle/lifecycleConfiguredActionRows";
import { resolveWorkTemplateActionOptions } from "@/lib/lifecycle/resolveWorkTemplateActionOptions";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import { resolveStageCommands, stageCommandIdentity } from "@/lib/lifecycle/stageCommands";
import type { StageOperatingPlanEditorDraft } from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import type { StageOperatingPlanV1, StageWorkTemplateActionRefV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { workTemplateActionAppliesToLabel } from "@/lib/lifecycle/workTemplateActionAppliesToLabel";

type Props = {
    draft: StageOperatingPlanEditorDraft;
    stageKey: string;
    stageLabel?: string;
    stageOperatingPlan: StageOperatingPlanV1;
    actionCatalog: StageActionCatalogV1 | null;
    configuredActions: LifecycleConfiguredActionRow[];
    processStages: Array<{ key: string; label: string; grain?: string }>;
    processTracks?: ProcessTracksV1 | null;
    process?: LifecycleBuilderProcessRecord | null;
    onChange: (stageCommands: StageWorkTemplateActionRefV1[]) => void;
};

/**
 * Stage commands — the Process Card's command row for this stage.
 *
 * One ordered list per stage, picked from the commands enabled in the process Commands tab. The
 * Process Card shows exactly this list (after publish), whichever work item is open. Manage is a
 * different model: it lists every enabled command, and is configured on the Commands tab.
 */
export default function LifecycleStageCommandsEditor({
    draft,
    stageKey,
    stageLabel,
    stageOperatingPlan,
    actionCatalog,
    configuredActions,
    processStages,
    processTracks,
    process,
    onChange,
}: Props) {
    const options = resolveWorkTemplateActionOptions({
        actionRegistry: configuredActions,
        stageActionCatalog: actionCatalog,
        stageOperatingPlan,
        processTracks: processTracks ?? null,
        processStages,
        stageKey,
        stageLabel,
        stageOutcomes: draft.outcomes,
        stageDefinition: { journey_segment: draft.journey_segment },
        process: process ?? null,
    });

    // Same derivation the card uses, so a legacy stage shows here exactly what operators see.
    const resolved = resolveStageCommands(draft, {
        legacyCatalogCommands: stageCatalogSupportingCommands(actionCatalog).legacyCommands,
    });
    const commands = resolved.commands;
    const refs = commands.map((row) => row.action_ref);
    const identities = new Set(commands.map(stageCommandIdentity));
    const addOptions = toPickerOptions(
        options.helpfulActionOptions.filter(
            (row) => row.supported && !identities.has(stageCommandIdentity({ action_ref: row.ref })),
        ),
    );

    const commit = (next: StageWorkTemplateActionRefV1[]) => onChange(next.map((row) => ({ ...row })));
    const move = (from: number, to: number) => {
        if (to < 0 || to >= commands.length) return;
        const next = [...commands];
        [next[from], next[to]] = [next[to]!, next[from]!];
        commit(next);
    };

    return (
        <section className="stage-panel p-3" data-testid="stage-commands-editor" data-stage-commands-source={resolved.source}>
            <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h3 className="stage-section-label">Stage commands</h3>
                <span className="stage-count">{commands.length}</span>
            </div>
            <p className="stage-field__hint mb-2">
                The main things operators do at this stage. The Process Card shows exactly these, in this
                order, once the process is published. Pick from commands enabled on the Commands tab —
                Manage lists every enabled command.
            </p>
            {resolved.source === "derived_from_work_items" && commands.length ?
                <p className="mb-2 text-[0.6875rem] text-alloy-midnight/50" data-testid="stage-commands-derived-note">
                    Carried over from this stage&apos;s work items. Any change here saves them as the stage&apos;s own list.
                </p>
            :   null}
            <div className="mb-2 flex items-center justify-end">
                <div className="w-44">
                    <AlloyConfigPicker
                        label="Add stage command"
                        value=""
                        options={addOptions}
                        onChange={(ref) => {
                            if (!ref) return;
                            commit([...commands, { action_ref: ref }]);
                        }}
                        compact
                        clearable={false}
                        searchable={addOptions.length > 6}
                        testId="stage-commands-add"
                        placeholder="+ Add"
                    />
                </div>
            </div>
            <OrderedActionRows
                title="Stage commands"
                refs={refs}
                resolveLabel={(ref) => {
                    const authored = commands.find((row) => row.action_ref === ref)?.override_label?.trim();
                    return authored || optionByRef(options.helpfulActionOptions, ref)?.label || ref.replace(/_/g, " ");
                }}
                resolveDescription={(ref) => {
                    const appliesTo = workTemplateActionAppliesToLabel(ref);
                    const description = optionByRef(options.helpfulActionOptions, ref)?.description ?? null;
                    if (appliesTo && description && !description.includes(appliesTo)) {
                        return `${appliesTo} · ${description}`;
                    }
                    return appliesTo ?? description;
                }}
                resolveInvalid={(ref) => {
                    // Said here, at authoring, because the card cannot say it: a command that cannot
                    // run is withheld from operators rather than rendered broken.
                    const row = optionByRef(options.helpfulActionOptions, ref);
                    if (!row) return "Not enabled on the Commands tab — it will not appear on the Process Card.";
                    if (!row.supported) {
                        return `${row.disabledReason ?? "Not runnable"} — it will not appear on the Process Card.`;
                    }
                    return null;
                }}
                onRemove={(ref) => commit(commands.filter((row) => row.action_ref !== ref))}
                onMoveUp={(index) => move(index, index - 1)}
                onMoveDown={(index) => move(index, index + 1)}
                testIdPrefix="stage-commands"
            />
        </section>
    );
}
