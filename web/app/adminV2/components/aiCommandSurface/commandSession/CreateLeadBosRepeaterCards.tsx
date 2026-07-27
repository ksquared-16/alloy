"use client";

import { useEffect, useMemo, useState } from "react";
import {
    addCreateLeadCommitChild,
    addCreateLeadCommitParent,
    patchCreateLeadCommitRecord,
    removeCreateLeadCommitRecord,
    type CreateLeadCommitRecord,
    type CreateLeadCommitSelection,
} from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import {
    commitRecordToPayloadDraft,
    payloadDraftToCommitPatch,
} from "@/lib/admin/actions/createLead/household/commitRecordFieldMapping";
import { resolveCreateLeadHouseholdCardEditFields } from "@/lib/admin/actions/createLead/household/resolveCreateLeadHouseholdCardEditFields";
import { CreateLeadHouseholdCardEditFields } from "@/components/admin/intake/CreateLeadHouseholdCardEditFields";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import { WS_ACTION_SECONDARY, WS_EYEBROW } from "@/components/workspace/workspaceTokens";

type Props = {
    kind: "parent" | "child";
    selection: CreateLeadCommitSelection;
    onSelectionChange: (next: CreateLeadCommitSelection) => void;
    intakeSpec: ActionIntakeSpec | null;
    contextValues: Record<string, string>;
    compact: boolean;
};

/**
 * BOS Form repeater rows for parents/guardians or children.
 * Reuses household card edit field resolution from the Create Lead modal path.
 */
export function CreateLeadBosRepeaterCards({
    kind,
    selection,
    onSelectionChange,
    intakeSpec,
    contextValues,
    compact,
}: Props) {
    const records = kind === "parent" ? selection.parents : selection.children;
    const editGroups = useMemo(
        () => resolveCreateLeadHouseholdCardEditFields({ entityType: kind, intakeSpec }),
        [intakeSpec, kind]
    );

    return (
        <div className="space-y-3" data-bos-command-repeater={kind}>
            {records.map((record, index) => (
                <RepeaterRow
                    key={record.candidate_id}
                    kind={kind}
                    record={record}
                    index={index}
                    canRemove={kind === "parent" ? selection.parents.length > 1 : true}
                    editGroups={editGroups}
                    contextValues={contextValues}
                    compact={compact}
                    onPatch={(patch) =>
                        onSelectionChange(patchCreateLeadCommitRecord(selection, record.candidate_id, patch))
                    }
                    onRemove={() => {
                        const result = removeCreateLeadCommitRecord(selection, record.candidate_id);
                        if (result.removed) onSelectionChange(result.selection);
                    }}
                />
            ))}
            <button
                type="button"
                className={`${WS_ACTION_SECONDARY} w-full ${compact ? "min-h-[40px]" : ""}`}
                data-bos-command-repeater-add={kind}
                onClick={() =>
                    onSelectionChange(
                        kind === "parent"
                            ? addCreateLeadCommitParent(selection)
                            : addCreateLeadCommitChild(selection)
                    )
                }
            >
                {kind === "parent"
                    ? "Add another parent or guardian"
                    : records.length === 0
                      ? "Add child"
                      : "Add another child"}
            </button>
        </div>
    );
}

function RepeaterRow(props: {
    kind: "parent" | "child";
    record: CreateLeadCommitRecord;
    index: number;
    canRemove: boolean;
    editGroups: ReturnType<typeof resolveCreateLeadHouseholdCardEditFields>;
    contextValues: Record<string, string>;
    compact: boolean;
    onPatch: (patch: ReturnType<typeof payloadDraftToCommitPatch>) => void;
    onRemove: () => void;
}) {
    const { record } = props;
    const [draft, setDraft] = useState(() => commitRecordToPayloadDraft(record, props.kind));

    useEffect(() => {
        setDraft(commitRecordToPayloadDraft(record, props.kind));
    }, [record, props.kind]);

    const title =
        props.kind === "parent"
            ? `Parent / guardian ${props.index + 1}`
            : `Child ${props.index + 1}`;

    return (
        <div
            className="rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.03] p-3"
            data-bos-command-repeater-row={record.candidate_id}
        >
            <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                    <p className="text-[12px] font-semibold text-alloy-midnight">{title}</p>
                    {record.primary ? <p className={WS_EYEBROW}>Primary</p> : null}
                </div>
                {props.canRemove ? (
                    <button
                        type="button"
                        className="text-[11px] font-semibold text-alloy-midnight/50 hover:text-alloy-ember"
                        data-bos-command-repeater-remove={record.candidate_id}
                        onClick={props.onRemove}
                    >
                        Remove
                    </button>
                ) : null}
            </div>
            <CreateLeadHouseholdCardEditFields
                entityType={props.kind}
                record={record}
                requiredFields={props.editGroups.required}
                additionalFields={props.editGroups.additional}
                draft={draft}
                onDraftChange={(next) => {
                    setDraft(next);
                    props.onPatch(payloadDraftToCommitPatch(props.kind, next));
                }}
                contextValues={props.contextValues}
                dataTestIdPrefix={`bos-repeater-${record.candidate_id}`}
            />
            {record.commit_blockers.length > 0 ? (
                <p className="mt-2 text-[11px] text-amber-900">{record.commit_blockers.join(" ")}</p>
            ) : null}
        </div>
    );
}
