"use client";

import { useEffect, useMemo, useState } from "react";

import { ActionWorkspaceGatherFields } from "@/components/admin/actions/ActionWorkspaceGatherFields";
import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";
import type { CreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import type { BosCommandDraft } from "@/lib/bos/commandSession/types";
import {
    CREATE_LEAD_FIELD_PAIRS,
    buildCreateLeadSectionModels,
    defaultOpenSectionKeys,
    sectionAffordanceLabel,
    type CreateLeadSectionModel,
} from "@/lib/bos/commandSession/createLeadSectionPresentation";
import {
    summarizeCommitChildren,
    summarizeCommitParents,
} from "@/lib/bos/commandSession/createLeadRepeaterDraft";
import { CreateLeadBosRepeaterCards } from "@/app/adminV2/components/aiCommandSurface/commandSession/CreateLeadBosRepeaterCards";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import WorkspaceCard from "@/components/workspace/WorkspaceCard";
import { WS_ACTION_SECONDARY, WS_EYEBROW } from "@/components/workspace/workspaceTokens";

type Props = {
    compact: boolean;
    draft: BosCommandDraft;
    sections: Array<{ key: string; label: string; fields: ActionWorkspaceGatherField[] }>;
    formValues: Record<string, string>;
    onFieldChange: (key: string, value: string) => void;
    platformRequiredKeys: readonly string[];
    fieldConfidence: Record<string, "high" | "medium" | "low" | "manual">;
    optionLabels?: ReadonlyMap<string, string>;
    unsupportedHints: ReadonlyArray<{ label: string }>;
    commitSelection: CreateLeadCommitSelection;
    onCommitSelectionChange: (next: CreateLeadCommitSelection) => void;
    intakeSpec: ActionIntakeSpec | null;
};

const PAIR_KEYS = new Set(CREATE_LEAD_FIELD_PAIRS.flatMap(([a, b]) => [a, b]));

/**
 * Progressive Create Lead Form — summary cards on stone; one section edits at a time when pinned.
 */
export function CreateLeadProgressiveForm(props: Props) {
    const models = useMemo(
        () =>
            buildCreateLeadSectionModels({
                sections: props.sections,
                draft: props.draft,
                requiredPayloadKeys: props.platformRequiredKeys,
                optionLabels: props.optionLabels,
                parentSummaries: summarizeCommitParents(props.commitSelection),
                childSummaries: summarizeCommitChildren(props.commitSelection),
                childRowCount: props.commitSelection.children.length,
            }),
        [props.commitSelection, props.draft, props.optionLabels, props.platformRequiredKeys, props.sections]
    );

    const [openKeys, setOpenKeys] = useState<string[]>(() => defaultOpenSectionKeys(models));

    useEffect(() => {
        // When draft gains Family readiness, collapse Family if it was auto-opened and operator
        // hasn't forced another section — keep calm; only auto-open when still incomplete.
        setOpenKeys((prev) => {
            const defaults = defaultOpenSectionKeys(models);
            if (props.compact) {
                // Pinned: keep at most one; prefer existing open if still valid
                const still = prev.find((k) => models.some((m) => m.key === k));
                if (still) return [still];
                return defaults.slice(0, 1);
            }
            if (prev.length === 0 && defaults.length) return defaults;
            return prev.filter((k) => models.some((m) => m.key === k));
        });
    }, [models, props.compact]);

    const toggle = (key: string) => {
        setOpenKeys((prev) => {
            if (prev.includes(key)) return prev.filter((k) => k !== key);
            if (props.compact) return [key];
            return [key]; // expanded also one-at-a-time for calm Form
        });
    };

    return (
        <div
            data-bos-command-session-mode-body="form"
            data-bos-command-session-form-grid={props.compact ? "single" : "responsive"}
            className={`mx-auto w-full space-y-3 ${props.compact ? "max-w-none" : "max-w-xl"}`}
        >
            <p className="text-[12px] text-alloy-midnight/55">
                Lead details — same command as Conversation. Open a section to edit.
            </p>
            {props.unsupportedHints.length > 0 ? (
                <p
                    className="text-[12px] text-alloy-midnight/55"
                    data-bos-command-session-form-guidance="true"
                >
                    Some details are clearer here
                    {props.unsupportedHints.length === 1
                        ? ` — especially ${props.unsupportedHints[0]!.label}.`
                        : "."}
                </p>
            ) : null}

            {models.map((model) => {
                const open = openKeys.includes(model.key);
                return (
                    <SectionCard
                        key={model.key}
                        model={model}
                        open={open}
                        compact={props.compact}
                        onToggle={() => toggle(model.key)}
                        onDone={() => setOpenKeys((prev) => prev.filter((k) => k !== model.key))}
                        formValues={props.formValues}
                        onFieldChange={props.onFieldChange}
                        platformRequiredKeys={props.platformRequiredKeys}
                        fieldConfidence={props.fieldConfidence}
                        commitSelection={props.commitSelection}
                        onCommitSelectionChange={props.onCommitSelectionChange}
                        intakeSpec={props.intakeSpec}
                    />
                );
            })}
        </div>
    );
}

function SectionCard(props: {
    model: CreateLeadSectionModel;
    open: boolean;
    compact: boolean;
    onToggle: () => void;
    onDone: () => void;
    formValues: Record<string, string>;
    onFieldChange: (key: string, value: string) => void;
    platformRequiredKeys: readonly string[];
    fieldConfidence: Record<string, "high" | "medium" | "low" | "manual">;
    commitSelection: CreateLeadCommitSelection;
    onCommitSelectionChange: (next: CreateLeadCommitSelection) => void;
    intakeSpec: ActionIntakeSpec | null;
}) {
    const { model } = props;
    return (
        <WorkspaceCard
            padded={!props.compact}
            data-bos-command-section={model.key}
            data-bos-command-section-open={props.open ? "true" : "false"}
            data-bos-command-section-completion={model.completion}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[13px] font-semibold tracking-tight text-alloy-midnight">
                        {model.title}
                    </p>
                    {!props.open ? (
                        <>
                            <p
                                className={`mt-0.5 text-[11px] ${
                                    model.isRequiredSection && model.completion !== "ready"
                                        ? "font-medium text-alloy-midnight/65"
                                        : "text-alloy-midnight/45"
                                }`}
                            >
                                {model.statusLabel}
                            </p>
                            {model.summaryLines.length > 0 ? (
                                <div className="mt-2 space-y-0.5">
                                    {model.summaryLines.map((line) => (
                                        <p
                                            key={line}
                                            className="truncate text-[12.5px] text-alloy-midnight"
                                        >
                                            {line}
                                        </p>
                                    ))}
                                </div>
                            ) : model.isRequiredSection ? (
                                <p className="mt-2 text-[12px] text-alloy-midnight/50">{model.helper}</p>
                            ) : null}
                        </>
                    ) : (
                        <p className="mt-0.5 text-[12px] text-alloy-midnight/50">{model.helper}</p>
                    )}
                </div>
                <button
                    type="button"
                    className={`${WS_ACTION_SECONDARY} shrink-0 ${props.compact ? "min-h-[36px]" : ""}`}
                    data-bos-command-section-toggle={model.key}
                    onClick={props.open ? props.onDone : props.onToggle}
                >
                    {props.open ? "Done" : sectionAffordanceLabel(model)}
                </button>
            </div>

            {props.open ? (
                <div className="mt-3 border-t border-alloy-stone/15 pt-3 space-y-4">
                    {model.missingRequiredKeys.length > 0 || model.statusLabel.includes("phone") ? (
                        <p className={`${WS_EYEBROW}`}>{model.statusLabel}</p>
                    ) : null}
                    {model.key === "person" || model.key === "child" ? (
                        <div className="space-y-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/55">
                                Required to create this lead
                            </p>
                            <CreateLeadBosRepeaterCards
                                kind={model.key === "person" ? "parent" : "child"}
                                selection={props.commitSelection}
                                onSelectionChange={props.onCommitSelectionChange}
                                intakeSpec={props.intakeSpec}
                                contextValues={props.formValues}
                                compact={props.compact}
                            />
                            {model.fields.filter((f) => !props.platformRequiredKeys.includes(f.payload_key) && f.tier !== "required").length >
                            0 ? (
                                <AdditionalFieldsBlock
                                    fields={model.fields.filter(
                                        (f) =>
                                            !props.platformRequiredKeys.includes(f.payload_key) &&
                                            f.tier !== "required"
                                    )}
                                    formValues={props.formValues}
                                    onFieldChange={props.onFieldChange}
                                    platformRequiredKeys={props.platformRequiredKeys}
                                    fieldConfidence={props.fieldConfidence}
                                    compact={props.compact}
                                    sectionKey={model.key}
                                />
                            ) : null}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {model.fields.filter(
                                (f) =>
                                    f.tier === "required" ||
                                    props.platformRequiredKeys.includes(f.payload_key)
                            ).length > 0 ? (
                                <>
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/55">
                                        Required to create this lead
                                    </p>
                                    <ActionWorkspaceGatherFields
                                        sections={[
                                            {
                                                key: model.key,
                                                label: model.title,
                                                fields: model.fields.filter(
                                                    (f) =>
                                                        f.tier === "required" ||
                                                        props.platformRequiredKeys.includes(
                                                            f.payload_key
                                                        )
                                                ),
                                            },
                                        ]}
                                        values={props.formValues}
                                        onChange={props.onFieldChange}
                                        platformRequiredKeys={props.platformRequiredKeys}
                                        fieldConfidence={props.fieldConfidence}
                                        layout="sections"
                                        fieldColumns={props.compact ? 1 : 2}
                                        chrome="quiet"
                                        hideSectionHeaders
                                        pairAwareColumns={!props.compact}
                                        pairFieldKeys={PAIR_KEYS}
                                        dataTestIdPrefix={`bos-create-lead-form-${model.key}-required`}
                                    />
                                </>
                            ) : null}
                            {model.fields.filter(
                                (f) =>
                                    f.tier !== "required" &&
                                    !props.platformRequiredKeys.includes(f.payload_key)
                            ).length > 0 ? (
                                <AdditionalFieldsBlock
                                    fields={model.fields.filter(
                                        (f) =>
                                            f.tier !== "required" &&
                                            !props.platformRequiredKeys.includes(f.payload_key)
                                    )}
                                    formValues={props.formValues}
                                    onFieldChange={props.onFieldChange}
                                    platformRequiredKeys={props.platformRequiredKeys}
                                    fieldConfidence={props.fieldConfidence}
                                    compact={props.compact}
                                    sectionKey={model.key}
                                />
                            ) : null}
                        </div>
                    )}
                </div>
            ) : null}
        </WorkspaceCard>
    );
}

function AdditionalFieldsBlock(props: {
    fields: ActionWorkspaceGatherField[];
    formValues: Record<string, string>;
    onFieldChange: (key: string, value: string) => void;
    platformRequiredKeys: readonly string[];
    fieldConfidence: Record<string, "high" | "medium" | "low" | "manual">;
    compact: boolean;
    sectionKey: string;
}) {
    const [open, setOpen] = useState(false);
    if (props.fields.length === 0) return null;
    return (
        <div data-bos-command-section-additional={props.sectionKey}>
            <button
                type="button"
                className={`${WS_ACTION_SECONDARY} w-full ${props.compact ? "min-h-[36px]" : ""}`}
                onClick={() => setOpen((v) => !v)}
            >
                {open ? "Hide additional fields" : "Additional fields"}
            </button>
            {open ? (
                <div className="mt-2">
                    <ActionWorkspaceGatherFields
                        sections={[
                            {
                                key: `${props.sectionKey}-additional`,
                                label: "Additional fields",
                                fields: props.fields,
                            },
                        ]}
                        values={props.formValues}
                        onChange={props.onFieldChange}
                        platformRequiredKeys={props.platformRequiredKeys}
                        fieldConfidence={props.fieldConfidence}
                        layout="sections"
                        fieldColumns={props.compact ? 1 : 2}
                        chrome="quiet"
                        hideSectionHeaders
                        pairAwareColumns={!props.compact}
                        pairFieldKeys={PAIR_KEYS}
                        dataTestIdPrefix={`bos-create-lead-form-${props.sectionKey}-additional`}
                    />
                </div>
            ) : null}
        </div>
    );
}