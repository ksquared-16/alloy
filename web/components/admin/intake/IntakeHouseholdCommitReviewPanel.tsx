"use client";

import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
    patchCreateLeadCommitRecord,
    toggleCreateLeadCommitInclusion,
    type CreateLeadCommitRecord,
    type CreateLeadCommitSelection,
    type CreateLeadCommitSelectionPatch,
} from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import {
    buildIntakeReviewPresentation,
    formatDobForDisplay,
} from "@/lib/intake/review/buildIntakeReviewPresentation";
import { buildCreateLeadRecordCardHints } from "@/lib/admin/actions/createLead/review/createLeadCommitCardHints";
import {
    commitRecordToPayloadDraft,
    payloadDraftToCommitPatch,
} from "@/lib/admin/actions/createLead/household/commitRecordFieldMapping";
import {
    resolveCreateLeadHouseholdCardEditFields,
    type CreateLeadHouseholdCardEditFieldGroups,
} from "@/lib/admin/actions/createLead/household/resolveCreateLeadHouseholdCardEditFields";
import { CreateLeadHouseholdCardEditFields } from "@/components/admin/intake/CreateLeadHouseholdCardEditFields";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import type { IntakeReviewWarning } from "@/lib/intake/review/intakeReviewWarnings";
import type { IntakeHouseholdCandidate } from "@/lib/intake/types";

type Props = {
    household: IntakeHouseholdCandidate;
    selection: CreateLeadCommitSelection;
    onSelectionChange: (next: CreateLeadCommitSelection) => void;
    className?: string;
    addressWarnings?: readonly IntakeReviewWarning[];
    intakeSpec?: ActionIntakeSpec | null;
    contextValues?: Record<string, string>;
};

function EditablePersonCard({
    record,
    entityLabel,
    recordHints,
    allowPrimaryControls,
    editFieldGroups,
    contextValues,
    onPatch,
    onToggleInclude,
    onSetPrimary,
}: {
    record: CreateLeadCommitRecord;
    entityLabel: string;
    recordHints: string[];
    allowPrimaryControls: boolean;
    editFieldGroups: CreateLeadHouseholdCardEditFieldGroups;
    contextValues: Record<string, string>;
    onPatch: (patch: CreateLeadCommitSelectionPatch) => void;
    onToggleInclude: (include: boolean) => void;
    onSetPrimary?: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<Record<string, string>>(() =>
        commitRecordToPayloadDraft(record, record.entity_type),
    );

    useEffect(() => {
        if (!editing) {
            setDraft(commitRecordToPayloadDraft(record, record.entity_type));
        }
    }, [editing, record]);

    const displayName = [record.first_name, record.last_name].filter(Boolean).join(" ") || entityLabel;
    const canInclude = record.validation_state === "valid";

    const saveEdit = () => {
        onPatch(payloadDraftToCommitPatch(record.entity_type, draft));
        setEditing(false);
    };

    const cancelEdit = () => {
        setDraft(commitRecordToPayloadDraft(record, record.entity_type));
        setEditing(false);
    };

    return (
        <div
            className={`group rounded-lg border px-2.5 py-2 ${
                record.commit_blockers.length ?
                    "border-amber-200/80 bg-amber-50/40"
                :   "border-alloy-stone/10 bg-white"
            }`}
            data-intake-commit-card={record.candidate_id}
        >
            <div className="flex items-start gap-2">
                <input
                    type="checkbox"
                    checked={record.include_in_commit}
                    disabled={!canInclude && !record.include_in_commit}
                    onChange={(e) => onToggleInclude(e.target.checked)}
                    className="mt-1"
                    data-testid={`commit-include-${record.candidate_id}`}
                    aria-label={`Include ${displayName} in commit`}
                />
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <p className="text-[13px] font-semibold text-alloy-midnight">{displayName}</p>
                            <p className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">{entityLabel}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                            {allowPrimaryControls ?
                                record.primary ?
                                    <span
                                        className="rounded-full bg-[#00A283]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[#007A63]"
                                        data-testid={`commit-primary-badge-${record.candidate_id}`}
                                    >
                                        Primary
                                    </span>
                                :   onSetPrimary ?
                                    <button
                                        type="button"
                                        onClick={onSetPrimary}
                                        className="rounded-md border border-alloy-stone/15 px-1.5 py-0.5 text-[9px] font-medium text-alloy-midnight/60 hover:bg-alloy-stone/8"
                                        data-testid={`commit-set-primary-${record.candidate_id}`}
                                    >
                                        Set primary
                                    </button>
                                :   null
                            :   null}
                            {!editing ?
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDraft(commitRecordToPayloadDraft(record, record.entity_type));
                                        setEditing(true);
                                    }}
                                    className="rounded-md p-1 text-alloy-midnight/55 hover:bg-alloy-stone/8"
                                    aria-label={`Edit ${displayName}`}
                                    data-testid={`commit-edit-${record.candidate_id}`}
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                </button>
                            :   null}
                        </div>
                    </div>

                    {!editing ?
                        <>
                            {record.entity_type === "parent" && (record.email || record.phone) ?
                                <p className="mt-1 text-[11px] text-alloy-midnight/55">
                                    {[record.email, record.phone].filter(Boolean).join(" · ")}
                                </p>
                            :   null}
                            {record.entity_type === "child" && (record.dob || record.age_display || record.program_interest) ?
                                <p
                                    className="mt-1 text-[11px] text-alloy-midnight/55"
                                    data-testid={`commit-age-display-${record.candidate_id}`}
                                >
                                    {[
                                        record.dob ? `DOB ${formatDobForDisplay(record.dob)}` : null,
                                        record.age_display ? `Age ${record.age_display}` : null,
                                        record.program_interest ? `Program ${record.program_interest}` : null,
                                    ]
                                        .filter(Boolean)
                                        .join(" — ")}
                                </p>
                            :   null}
                            {record.commit_blockers.length ?
                                <p
                                    className="mt-1 text-[11px] text-amber-900"
                                    data-testid={`commit-record-blockers-${record.candidate_id}`}
                                >
                                    {record.commit_blockers.join(" ")}
                                </p>
                            :   null}
                            {recordHints.length ?
                                <ul
                                    className="mt-1 space-y-0.5"
                                    data-testid={`commit-record-hints-${record.candidate_id}`}
                                >
                                    {recordHints.map((hint) => (
                                        <li
                                            key={hint}
                                            className="text-[10px] font-medium text-alloy-midnight/55"
                                            data-commit-record-hint={hint}
                                        >
                                            {hint}
                                        </li>
                                    ))}
                                </ul>
                            :   null}
                        </>
                    :   <div className="mt-2 space-y-1.5" data-testid={`commit-edit-form-${record.candidate_id}`}>
                            <CreateLeadHouseholdCardEditFields
                                entityType={record.entity_type}
                                record={record}
                                requiredFields={editFieldGroups.required}
                                additionalFields={editFieldGroups.additional}
                                draft={draft}
                                onDraftChange={setDraft}
                                contextValues={contextValues}
                                dataTestIdPrefix={`commit-edit-${record.candidate_id}`}
                            />
                            <div className="flex gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={saveEdit}
                                    className="rounded-md bg-[#00A283]/10 px-2 py-1 text-[11px] font-semibold text-[#007A63]"
                                    data-testid={`commit-edit-save-${record.candidate_id}`}
                                >
                                    Save
                                </button>
                                <button
                                    type="button"
                                    onClick={cancelEdit}
                                    className="rounded-md px-2 py-1 text-[11px] text-alloy-midnight/50"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    }
                </div>
            </div>
        </div>
    );
}

function ReviewSection({
    title,
    defaultOpen = true,
    children,
    testId,
}: {
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
    testId: string;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div data-testid={testId}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50"
            >
                {open ?
                    <ChevronDown className="h-3.5 w-3.5" />
                :   <ChevronRight className="h-3.5 w-3.5" />}
                {title}
            </button>
            {open ?
                <div className="mt-2 space-y-1.5">{children}</div>
            :   null}
        </div>
    );
}

/** Editable household review with per-record commit selection for Create Lead. */
export function IntakeHouseholdCommitReviewPanel({
    household,
    selection,
    onSelectionChange,
    className = "",
    addressWarnings = [],
    intakeSpec = null,
    contextValues = {},
}: Props) {
    const review = buildIntakeReviewPresentation(household);
    const parentEditFieldGroups = useMemo(
        () =>
            resolveCreateLeadHouseholdCardEditFields({
                entityType: "parent",
                intakeSpec,
            }),
        [intakeSpec],
    );
    const childEditFieldGroups = useMemo(
        () =>
            resolveCreateLeadHouseholdCardEditFields({
                entityType: "child",
                intakeSpec,
            }),
        [intakeSpec],
    );

    if (!review) return null;

    const patchRecord = (candidateId: string, patch: CreateLeadCommitSelectionPatch) => {
        onSelectionChange(patchCreateLeadCommitRecord(selection, candidateId, patch));
    };

    const toggleInclude = (candidateId: string, include: boolean) => {
        onSelectionChange(toggleCreateLeadCommitInclusion(selection, candidateId, include));
    };

    return (
        <section
            className={`rounded-xl border border-alloy-stone/10 bg-[#FAFBFC] p-2.5 ${className}`}
            data-testid="intake-household-commit-review-panel"
        >
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-alloy-midnight/45">
                Household detected
            </p>
            <p className="mt-0.5 text-[11px] text-alloy-midnight/45">
                Review each person, edit details, and choose who to include in this lead.
            </p>
            <div className="mt-2 space-y-3">
                {selection.parents.length > 0 ?
                    <ReviewSection title="Parents / Guardians" testId="intake-household-review-parents">
                        {selection.parents.map((record) => (
                            <EditablePersonCard
                                key={record.candidate_id}
                                record={record}
                                entityLabel={record.role}
                                allowPrimaryControls
                                editFieldGroups={parentEditFieldGroups}
                                contextValues={contextValues}
                                recordHints={buildCreateLeadRecordCardHints({ record, household })}
                                onPatch={(patch) => patchRecord(record.candidate_id, patch)}
                                onToggleInclude={(include) => toggleInclude(record.candidate_id, include)}
                                onSetPrimary={() => patchRecord(record.candidate_id, { primary: true })}
                            />
                        ))}
                    </ReviewSection>
                :   null}

                {selection.children.length > 0 ?
                    <ReviewSection title="Children" testId="intake-household-review-children">
                        {selection.children.map((record) => (
                            <EditablePersonCard
                                key={record.candidate_id}
                                record={record}
                                entityLabel="child"
                                allowPrimaryControls={false}
                                editFieldGroups={childEditFieldGroups}
                                contextValues={contextValues}
                                recordHints={buildCreateLeadRecordCardHints({ record, household })}
                                onPatch={(patch) => patchRecord(record.candidate_id, patch)}
                                onToggleInclude={(include) => toggleInclude(record.candidate_id, include)}
                            />
                        ))}
                    </ReviewSection>
                :   null}

                {review.address_lines.length > 0 ?
                    <ReviewSection title="Address" defaultOpen={false} testId="intake-household-review-address">
                        {review.address_lines.map((line) => (
                            <p key={line} className="text-[12px] text-alloy-midnight/70">
                                {line}
                            </p>
                        ))}
                        {addressWarnings.map((warning) => (
                            <p
                                key={warning.code}
                                className="text-[11px] text-amber-900/90"
                                data-intake-review-warning={warning.code}
                            >
                                {warning.message}
                            </p>
                        ))}
                    </ReviewSection>
                :   null}
            </div>
        </section>
    );
}
