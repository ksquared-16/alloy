"use client";

import {
    QUESTION_SUBJECT_OPTIONS,
    defaultSubjectForIntent,
    inferQuestionIntent,
    type QuestionSubject,
} from "@/lib/pos/processingCase/formDraft/questionResolutionModel";
import {
    eligibleCanonicalFieldsForSubject,
    suggestReviewDestinationField,
} from "@/lib/pos/processingCase/formDraft/processingReviewFieldCatalog";
import type { PendingManualRegion } from "@/lib/pos/processingCase/formDraft/processingCanvasInteraction";
import { WS_ACTION_PRIMARY, WS_ACTION_SECONDARY } from "@/components/workspace/workspaceTokens";
import { AlloyFieldLabel, AlloySelect, AlloyTextInput } from "./ProcessingAlloyControls";

export default function PendingManualFieldEditor({
    pending,
    onChange,
    onSave,
    onCancel,
    saving = false,
}: {
    pending: PendingManualRegion;
    onChange: (patch: Partial<PendingManualRegion>) => void;
    onSave: () => void;
    onCancel: () => void;
    saving?: boolean;
}) {
    const intent = inferQuestionIntent(pending.evidenceLabel || pending.displayLabel);
    const subject = pending.questionSubject ?? defaultSubjectForIntent(intent);
    const eligible = eligibleCanonicalFieldsForSubject(subject);
    const suggestion = suggestReviewDestinationField({
        evidenceLabel: pending.evidenceLabel,
        displayLabel: pending.displayLabel,
        type: pending.type,
        subject,
    });
    const selectedFieldId = pending.destinationFieldId ?? suggestion?.fieldId ?? "";

    const canSave = pending.evidenceLabel.trim().length > 0 || pending.displayLabel.trim().length > 0;

    return (
        <div
            className="mb-2 rounded-lg border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.04] p-2.5"
            data-testid="pending-manual-field-editor"
        >
            <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-bend-pine">
                    Manual field — unsaved
                </p>
                <span className="text-[9px] text-alloy-midnight/40">Operator mapped · Page {pending.page}</span>
            </div>

            <div className="space-y-2">
                <div>
                    <AlloyFieldLabel>Source label</AlloyFieldLabel>
                    <AlloyTextInput
                        value={pending.evidenceLabel}
                        onChange={(evidenceLabel) => onChange({ evidenceLabel })}
                        placeholder="e.g. Birthdate"
                        testId="pending-source-label"
                    />
                </div>

                <div>
                    <AlloyFieldLabel>Question label</AlloyFieldLabel>
                    <AlloyTextInput
                        value={pending.displayLabel}
                        onChange={(displayLabel) => onChange({ displayLabel })}
                        placeholder="Label on the generated form"
                    />
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <AlloyFieldLabel>Store answer in</AlloyFieldLabel>
                        <AlloySelect
                            value={subject}
                            onChange={(value) =>
                                onChange({
                                    questionSubject: value as QuestionSubject,
                                    destinationFieldId: undefined,
                                })
                            }
                            options={QUESTION_SUBJECT_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
                            testId="pending-destination-entity"
                        />
                    </div>

                    <div>
                        <AlloyFieldLabel>Answer type</AlloyFieldLabel>
                        <AlloySelect
                            value={pending.type}
                            onChange={(type) => onChange({ type, destinationFieldId: undefined })}
                            options={[
                                { value: "text", label: "Short text" },
                                { value: "date", label: "Date" },
                                { value: "number", label: "Number" },
                                { value: "boolean", label: "Yes / No" },
                            ]}
                        />
                    </div>
                </div>

                <div>
                    <AlloyFieldLabel>Field</AlloyFieldLabel>
                    <AlloySelect
                        value={selectedFieldId}
                        onChange={(destinationFieldId) => onChange({ destinationFieldId: destinationFieldId || undefined })}
                        placeholder="Choose a field…"
                        options={eligible.map((field) => ({ value: field.id, label: field.label }))}
                        testId="pending-destination-field"
                    />
                    {suggestion && !pending.destinationFieldId ? (
                        <p className="mt-0.5 text-[9px] text-alloy-midnight/40">
                            Suggested: {suggestion.label} ({suggestion.confidencePercent}% match)
                        </p>
                    ) : null}
                </div>
            </div>

            <div className="mt-2.5 flex items-center justify-end gap-2">
                <button type="button" onClick={onCancel} className={WS_ACTION_SECONDARY} data-testid="pending-cancel">
                    Cancel
                </button>
                <button
                    type="button"
                    disabled={!canSave || saving}
                    onClick={onSave}
                    className={WS_ACTION_PRIMARY}
                    data-testid="pending-save"
                >
                    {saving ? "Saving…" : "Save field"}
                </button>
            </div>
        </div>
    );
}
