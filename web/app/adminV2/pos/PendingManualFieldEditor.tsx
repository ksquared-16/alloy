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
                <label className="block">
                    <span className="mb-0.5 block text-[9px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                        Source label
                    </span>
                    <input
                        value={pending.evidenceLabel}
                        onChange={(e) => onChange({ evidenceLabel: e.target.value })}
                        placeholder="e.g. Birthdate"
                        className="w-full rounded border border-alloy-stone/20 bg-white px-2 py-1 text-[10px] focus:border-alloy-bend-pine/40 focus:outline-none"
                        data-testid="pending-source-label"
                    />
                </label>

                <label className="block">
                    <span className="mb-0.5 block text-[9px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                        Question label
                    </span>
                    <input
                        value={pending.displayLabel}
                        onChange={(e) => onChange({ displayLabel: e.target.value })}
                        placeholder="Display label for generated form"
                        className="w-full rounded border border-alloy-stone/20 bg-white px-2 py-1 text-[10px] focus:border-alloy-bend-pine/40 focus:outline-none"
                    />
                </label>

                <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                        <span className="mb-0.5 block text-[9px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            Destination entity
                        </span>
                        <select
                            value={subject}
                            onChange={(e) =>
                                onChange({
                                    questionSubject: e.target.value as QuestionSubject,
                                    destinationFieldId: undefined,
                                })
                            }
                            className="w-full rounded border border-alloy-stone/20 bg-white px-2 py-1 text-[10px] focus:border-alloy-bend-pine/40 focus:outline-none"
                            data-testid="pending-destination-entity"
                        >
                            {QUESTION_SUBJECT_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="block">
                        <span className="mb-0.5 block text-[9px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            Field type
                        </span>
                        <select
                            value={pending.type}
                            onChange={(e) => onChange({ type: e.target.value, destinationFieldId: undefined })}
                            className="w-full rounded border border-alloy-stone/20 bg-white px-2 py-1 text-[10px] focus:border-alloy-bend-pine/40 focus:outline-none"
                        >
                            <option value="text">Text</option>
                            <option value="date">Date</option>
                            <option value="number">Number</option>
                            <option value="boolean">Checkbox</option>
                        </select>
                    </label>
                </div>

                <label className="block">
                    <span className="mb-0.5 block text-[9px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                        Destination field
                    </span>
                    <select
                        value={selectedFieldId}
                        onChange={(e) => onChange({ destinationFieldId: e.target.value || undefined })}
                        className="w-full rounded border border-alloy-stone/20 bg-white px-2 py-1 text-[10px] focus:border-alloy-bend-pine/40 focus:outline-none"
                        data-testid="pending-destination-field"
                    >
                        <option value="">Select canonical field…</option>
                        {eligible.map((field) => (
                            <option key={field.id} value={field.id}>
                                {field.label}
                            </option>
                        ))}
                    </select>
                    {suggestion && !pending.destinationFieldId ? (
                        <p className="mt-0.5 text-[9px] text-alloy-midnight/40">
                            Suggested: {suggestion.label} ({suggestion.confidencePercent}% match)
                        </p>
                    ) : null}
                </label>
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
