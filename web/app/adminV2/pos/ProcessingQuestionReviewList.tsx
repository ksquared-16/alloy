"use client";

import type { ReactNode } from "react";
import React, { useEffect, useRef } from "react";
import { Check, EyeOff, Pencil, RotateCcw, Trash2 } from "lucide-react";
import {
    NAME_REPRESENTATION_OPTIONS,
    QUESTION_SUBJECT_OPTIONS,
    defaultSubjectForIntent,
    deriveFieldSources,
    deriveResolutionStatus,
    inferQuestionIntent,
    storageSummaryLabel,
    supportsNameRepresentation,
    type ReviewQuestionInput,
} from "@/lib/pos/processingCase/formDraft/questionResolutionModel";
import {
    eligibleCanonicalFieldsForSubject,
    reviewFieldOptionById,
    suggestReviewDestinationField,
} from "@/lib/pos/processingCase/formDraft/processingReviewFieldCatalog";
import {
    detectedInputFormatLabel,
    normalizeFieldValue,
} from "@/lib/pos/processingCase/formDraft/fieldNormalization";
import { SECTION_DISPOSITIONS, type SectionDisposition } from "@/lib/pos/processingCase/formDraft/sectionDisposition";
import { AlloyFieldLabel, AlloySelect, AlloyTextInput } from "./ProcessingAlloyControls";

/** Operator-facing disposition labels (product language, not internal keys). */
const DISPOSITION_LABEL: Record<SectionDisposition, string> = {
    fields: "Digital fields",
    generated: "Generated document",
    static_reference: "Static reference (read-only)",
    acknowledgement: "Acknowledgement",
    upload: "Upload request",
    signature: "Signature",
    initials: "Initials",
};

const DISPOSITION_OPTIONS = SECTION_DISPOSITIONS.map((d) => ({ value: d, label: DISPOSITION_LABEL[d] }));

/** Translate confidence into clear operator language (numeric detail stays supporting, not primary). */
const CONFIDENCE_TONE: Record<string, { label: string; cls: string }> = {
    high: { label: "High confidence", cls: "text-alloy-bend-pine" },
    medium: { label: "Review recommended", cls: "text-amber-700" },
    low: { label: "Needs attention", cls: "text-red-700" },
};

function resolvedFieldSource(question: ReviewQuestionInput) {
    const intent = inferQuestionIntent(question.evidenceLabel || question.displayLabel);
    const subject = question.questionSubject ?? defaultSubjectForIntent(intent);
    return (
        question.field_source ??
        deriveFieldSources({
            subject,
            nameRepresentation: question.nameRepresentation,
            intent,
            displayLabel: question.displayLabel,
            type: question.type,
            destinationFieldId: question.destinationFieldId,
        })
    );
}

function fieldMatchConfidence(question: ReviewQuestionInput): { label: string; percent: number | null } {
    if (question.mappingOrigin === "operator_created") {
        return { label: "Operator mapped", percent: null };
    }
    const intent = inferQuestionIntent(question.evidenceLabel || question.displayLabel);
    const subject = question.questionSubject ?? defaultSubjectForIntent(intent);
    const suggestion = suggestReviewDestinationField({
        evidenceLabel: question.evidenceLabel,
        displayLabel: question.displayLabel,
        type: question.type,
        subject,
    });
    const selectedId = question.destinationFieldId ?? suggestion?.fieldId ?? null;
    if (!selectedId) return { label: "No match", percent: null };
    if (question.destinationFieldId && question.destinationFieldId !== suggestion?.fieldId) {
        return { label: "Operator selected", percent: null };
    }
    if (suggestion) return { label: "Field match", percent: suggestion.confidencePercent };
    return { label: "Field match", percent: 65 };
}

const STATUS_LABEL: Record<string, string> = {
    high: "High confidence",
    medium: "Medium",
    low: "Low",
    needs_review: "Needs review",
    processing_only: "Form field only",
    ignored: "Ignored",
};

const TYPE_LABEL: Record<string, string> = {
    text: "Text",
    date: "Date",
    number: "Number",
    boolean: "Checkbox",
    signature: "Signature",
    file_ref: "File upload",
};

/** Field types an operator can assign before the form is created (config-free draft types). */
const EDITABLE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "text", label: "Text" },
    { value: "date", label: "Date" },
    { value: "number", label: "Number" },
    { value: "boolean", label: "Checkbox" },
    { value: "file_ref", label: "File upload" },
    { value: "signature", label: "Signature" },
];

type SectionInfo = { disposition: SectionDisposition; recommended: SectionDisposition; confidence: "high" | "medium" | "low" };

type Props = {
    questions: ReviewQuestionInput[];
    selectedId: string | null;
    editingId: string | null;
    created: boolean;
    hasPageMaps: boolean;
    mappingFieldId: string | null;
    onSelect: (id: string | null) => void;
    onEdit: (id: string | null) => void;
    onUpdate: (id: string, patch: Partial<ReviewQuestionInput>) => void;
    onIgnore: (id: string) => void;
    onRemove: (id: string) => void;
    onStartMapping: (id: string) => void;
    /** Per-section disposition + recommendation/confidence, keyed by section title. */
    sectionInfo?: Record<string, SectionInfo>;
    /** Operator changed a section's disposition. Disabled once the form is created. */
    onSectionDisposition?: (title: string, disposition: SectionDisposition) => void;
};

export function ProcessingQuestionReviewList({
    questions,
    selectedId,
    editingId,
    created,
    hasPageMaps,
    mappingFieldId,
    onSelect,
    onEdit,
    onUpdate,
    onIgnore,
    onRemove,
    onStartMapping,
    sectionInfo,
    onSectionDisposition,
}: Props) {
    const activeCount = questions.filter((q) => !q.ignored).length;
    const sections = questions.reduce<Array<{ title: string; questions: ReviewQuestionInput[] }>>((acc, q) => {
        const title = q.section?.trim() || "Questions";
        const existing = acc.find((s) => s.title === title);
        if (existing) existing.questions.push(q);
        else acc.push({ title, questions: [q] });
        return acc;
    }, []);

    // Reading order across sections — the order the operator sees, so Up/Down match the eye.
    const orderedIds = sections.flatMap((s) => s.questions.map((q) => q.id));
    const listRef = useRef<HTMLDivElement | null>(null);

    // Keep the selection visible. Selection changes from EITHER side (this list, or clicking a
    // region in the document), so this is what makes highlight -> question sync legible.
    useEffect(() => {
        if (!selectedId || !listRef.current) return;
        const node = listRef.current.querySelector(`[data-testid="review-question-${CSS.escape(selectedId)}"]`);
        node?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [selectedId]);

    // Arrow keys walk the list; Home/End jump to the ends. Buttons already handle Enter/Space, so
    // this only adds the traversal that was missing.
    const onListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!orderedIds.length) return;
        const key = e.key;
        if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End") return;
        // Never hijack arrows while the operator is typing in an inline editor.
        const target = e.target as HTMLElement | null;
        if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

        e.preventDefault();
        const current = selectedId ? orderedIds.indexOf(selectedId) : -1;
        let next: number;
        if (key === "Home") next = 0;
        else if (key === "End") next = orderedIds.length - 1;
        else if (key === "ArrowDown") next = current < 0 ? 0 : Math.min(current + 1, orderedIds.length - 1);
        else next = current < 0 ? orderedIds.length - 1 : Math.max(current - 1, 0);

        const id = orderedIds[next];
        if (id) {
            onSelect(id);
            // Move focus with the selection so continued arrowing stays on the list.
            const el = listRef.current?.querySelector<HTMLElement>(
                `[data-testid="review-question-${CSS.escape(id)}"] button`
            );
            el?.focus({ preventScroll: true });
        }
    };

    return (
        <div
            ref={listRef}
            role="listbox"
            aria-label="Review questions"
            tabIndex={-1}
            onKeyDown={onListKeyDown}
            data-testid="review-questions-list"
        >
            <p className="mb-1.5 text-[9px] font-medium text-alloy-midnight/40">
                {activeCount} active question{activeCount === 1 ? "" : "s"}
                {questions.length > activeCount ? ` · ${questions.length - activeCount} ignored` : ""}
            </p>
            <div className="divide-y divide-alloy-stone/10">
                {sections.map((section) => (
                    <section key={section.title} className="py-2 first:pt-0 last:pb-0">
                        <div className="mb-1 flex items-baseline justify-between gap-2">
                            <h3 className="text-[9px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/35">
                                {section.title}
                            </h3>
                            <span className="text-[9px] tabular-nums text-alloy-midnight/30">
                                {section.questions.filter((q) => !q.ignored).length}
                            </span>
                        </div>
                        {(() => {
                            const info = sectionInfo?.[section.title];
                            const tone = CONFIDENCE_TONE[info?.confidence ?? "medium"];
                            const disposition = info?.disposition ?? "fields";
                            return (
                                <div
                                    className="mb-1.5 flex flex-wrap items-center gap-2 rounded-md bg-alloy-stone/[0.04] px-1.5 py-1"
                                    data-testid={`section-disposition-row-${section.title}`}
                                >
                                    <span className="text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                        This section is
                                    </span>
                                    <AlloySelect
                                        value={disposition}
                                        onChange={(value) => onSectionDisposition?.(section.title, value as SectionDisposition)}
                                        options={DISPOSITION_OPTIONS}
                                        disabled={created || !onSectionDisposition}
                                        testId={`section-disposition-${section.title}`}
                                    />
                                    {tone ? (
                                        <span className={`text-[9px] font-semibold ${tone.cls}`} data-testid={`section-confidence-${section.title}`}>
                                            {tone.label}
                                        </span>
                                    ) : null}
                                    {info && info.disposition !== info.recommended ? (
                                        <span className="text-[9px] text-alloy-midnight/35">
                                            (Alloy suggested {DISPOSITION_LABEL[info.recommended]})
                                        </span>
                                    ) : null}
                                </div>
                            );
                        })()}
                        <ol className="divide-y divide-alloy-stone/[0.08]">
                            {section.questions.map((q) => {
                                const sel = selectedId === q.id;
                                const isEditing = editingId === q.id;
                                const mapped = typeof q.page === "number" && Array.isArray(q.bbox);
                                const intent = inferQuestionIntent(q.evidenceLabel || q.displayLabel);
                                const resolvedSubject = q.questionSubject ?? defaultSubjectForIntent(intent);
                                const status = deriveResolutionStatus(q);
                                const showNameRep =
                                    supportsNameRepresentation(intent, q.type) && resolvedSubject !== "processing_only";
                                const matchConfidence = fieldMatchConfidence(q);
                                const detectionLabel = STATUS_LABEL[status] ?? status;

                                return (
                                    <li
                                        key={q.id}
                                        data-testid={`review-question-${q.id}`}
                                        data-question-ignored={q.ignored ? "true" : undefined}
                                        className={`py-1.5 transition-colors ${sel ? "bg-alloy-stone/[0.03]" : ""} ${q.ignored ? "opacity-55" : ""}`}
                                    >
                                        <div className="flex items-start gap-1">
                                            <button
                                                type="button"
                                                onClick={() => onSelect(sel ? null : q.id)}
                                                className="flex min-w-0 flex-1 flex-col gap-px text-left"
                                            >
                                                <span className="text-[9px] text-alloy-midnight/40">
                                                    {q.evidenceLabel || "Untitled source field"}
                                                </span>
                                                <span className="text-[11px] font-semibold leading-snug text-alloy-midnight">
                                                    {q.displayLabel || (
                                                        <span className="font-normal text-alloy-midnight/35">Untitled question</span>
                                                    )}
                                                </span>
                                                <span className="text-[9px] text-alloy-midnight/45">
                                                    {TYPE_LABEL[q.type] ?? q.type}
                                                    {mapped ? " · mapped" : " · not mapped"}
                                                    {q.mappingOrigin === "operator_created" ? " · Operator mapped" : ""}
                                                    <span> · {detectionLabel}</span>
                                                </span>
                                            </button>
                                            <div className="flex shrink-0 items-center gap-0.5">
                                                {!mapped && hasPageMaps && !created && !q.ignored ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => onStartMapping(q.id)}
                                                        className={`rounded px-1 py-0.5 text-[8px] font-semibold ${
                                                            mappingFieldId === q.id
                                                                ? "text-alloy-bend-pine"
                                                                : "text-alloy-midnight/40 hover:text-alloy-bend-pine"
                                                        }`}
                                                    >
                                                        {mappingFieldId === q.id ? "Mapping…" : "Map"}
                                                    </button>
                                                ) : null}
                                                {q.ignored ? (
                                                    <button
                                                        type="button"
                                                        aria-label="Restore question"
                                                        onClick={() => onIgnore(q.id)}
                                                        className="p-0.5 text-alloy-midnight/30 hover:text-alloy-bend-pine"
                                                    >
                                                        <RotateCcw className="h-3 w-3" />
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        aria-label="Ignore question"
                                                        onClick={() => onIgnore(q.id)}
                                                        className="p-0.5 text-alloy-midnight/30 hover:text-alloy-midnight/60"
                                                    >
                                                        <EyeOff className="h-3 w-3" />
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    aria-label="Edit question mapping"
                                                    data-testid={`review-pencil-${q.id}`}
                                                    onClick={() => {
                                                        onSelect(q.id);
                                                        onEdit(null);
                                                        requestAnimationFrame(() => {
                                                            document
                                                                .querySelector(`[data-testid="review-inspector-${q.id}"]`)
                                                                ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                                                        });
                                                    }}
                                                    className="p-0.5 text-alloy-midnight/30 hover:text-alloy-midnight/60"
                                                >
                                                    <Pencil className="h-3 w-3" />
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label="Delete question"
                                                    onClick={() => onRemove(q.id)}
                                                    className="p-0.5 text-alloy-midnight/30 hover:text-alloy-midnight/60"
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </button>
                                            </div>
                                        </div>

                                        {!q.ignored && sel ? (
                                            <ReviewQuestionInspector question={q} showNameRep={showNameRep} onUpdate={onUpdate} />
                                        ) : null}

                                        {isEditing && !q.ignored ? (
                                            <div className="mt-1.5 space-y-1 border-t border-alloy-stone/[0.08] pt-1.5">
                                                <AlloyTextInput
                                                    value={q.displayLabel}
                                                    onChange={(displayLabel) => onUpdate(q.id, { displayLabel })}
                                                    placeholder="Question label"
                                                />
                                                <AlloyTextInput
                                                    value={q.section}
                                                    onChange={(section) => onUpdate(q.id, { section })}
                                                    placeholder="Section"
                                                />
                                            </div>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ol>
                    </section>
                ))}
            </div>
        </div>
    );
}

function ReviewQuestionInspector({
    question,
    showNameRep,
    onUpdate,
}: {
    question: ReviewQuestionInput;
    showNameRep: boolean;
    onUpdate: (id: string, patch: Partial<ReviewQuestionInput>) => void;
}) {
    const intent = inferQuestionIntent(question.evidenceLabel || question.displayLabel);
    const subject = question.questionSubject ?? defaultSubjectForIntent(intent);
    const eligibleFields = eligibleCanonicalFieldsForSubject(subject);
    const suggestion = suggestReviewDestinationField({
        evidenceLabel: question.evidenceLabel,
        displayLabel: question.displayLabel,
        type: question.type,
        subject,
    });
    const selectedFieldId = question.destinationFieldId ?? suggestion?.fieldId ?? "";
    const selectedField = selectedFieldId ? reviewFieldOptionById(selectedFieldId) : null;
    const fieldSource = resolvedFieldSource(question);
    const matchConfidence = fieldMatchConfidence(question);
    const sampleValue = question.sampleValue ?? question.evidence ?? "";
    const normalization = selectedField
        ? normalizeFieldValue(sampleValue, selectedField.valueKind)
        : null;

    return (
        <div className="mt-1.5 space-y-2 border-t border-alloy-stone/[0.08] pt-1.5" data-testid={`review-inspector-${question.id}`}>
            <InspectorRow label="Answer type">
                <AlloySelect
                    value={EDITABLE_TYPE_OPTIONS.some((o) => o.value === question.type) ? question.type : "text"}
                    onChange={(value) => onUpdate(question.id, { type: value })}
                    options={EDITABLE_TYPE_OPTIONS}
                    testId={`review-type-${question.id}`}
                />
            </InspectorRow>

            <InspectorRow label="Store answer in">
                <AlloySelect
                    value={question.questionSubject ?? "processing_only"}
                    onChange={(value) =>
                        onUpdate(question.id, {
                            questionSubject: value as ReviewQuestionInput["questionSubject"],
                            destinationFieldId: undefined,
                            field_source: undefined,
                        })
                    }
                    options={QUESTION_SUBJECT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                    testId={`review-subject-${question.id}`}
                />
            </InspectorRow>

            {subject !== "processing_only" ? (
                <InspectorRow label="Field">
                    <AlloySelect
                        value={selectedFieldId}
                        onChange={(value) =>
                            onUpdate(question.id, {
                                destinationFieldId: value || undefined,
                                field_source: undefined,
                            })
                        }
                        placeholder="Choose a field…"
                        options={eligibleFields.map((field) => ({ value: field.id, label: field.label }))}
                        testId={`review-destination-field-${question.id}`}
                    />
                </InspectorRow>
            ) : null}

            {subject !== "processing_only" && suggestion && !question.destinationFieldId ? (
                <p className="text-[9px] text-alloy-midnight/45">
                    Suggested: <span className="font-medium text-alloy-midnight/65">{suggestion.label}</span>
                    {" · "}
                    {suggestion.confidencePercent}% confidence
                </p>
            ) : null}

            {subject !== "processing_only" && matchConfidence.percent != null ? (
                <InspectorRow label="Match confidence">
                    <span className="text-[10px] font-medium text-alloy-bend-pine">{matchConfidence.percent}%</span>
                </InspectorRow>
            ) : null}

            {showNameRep ? (
                <InspectorRow label="Name format">
                    <div className="flex flex-wrap gap-1">
                        {NAME_REPRESENTATION_OPTIONS.map((o) => {
                            const active = (question.nameRepresentation ?? "full_name") === o.value;
                            return (
                                <button
                                    key={o.value}
                                    type="button"
                                    data-testid={`review-name-rep-${question.id}-${o.value}`}
                                    onClick={() =>
                                        onUpdate(question.id, {
                                            nameRepresentation: o.value,
                                            field_source: undefined,
                                        })
                                    }
                                    className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                                        active
                                            ? "text-alloy-bend-pine underline decoration-alloy-bend-pine/40 underline-offset-2"
                                            : "text-alloy-midnight/50 hover:text-alloy-midnight/70"
                                    }`}
                                >
                                    {o.label}
                                </button>
                            );
                        })}
                    </div>
                </InspectorRow>
            ) : null}

            {selectedField && question.type === "date" ? (
                <>
                    <InspectorRow label="Input format detected">
                        <span className="text-[10px] text-alloy-midnight/65">
                            {detectedInputFormatLabel(sampleValue, selectedField.valueKind)}
                        </span>
                    </InspectorRow>
                    <InspectorRow label="Normalize">
                        {normalization?.status === "valid" ? (
                            <span className="text-[10px] text-alloy-bend-pine">
                                Parse and normalize date → {String(normalization.canonicalValue)}
                            </span>
                        ) : normalization?.status === "ambiguous" ? (
                            <span className="text-[10px] text-amber-700">{normalization.reason}</span>
                        ) : normalization?.status === "invalid" && sampleValue ? (
                            <span className="text-[10px] text-red-700">{normalization.reason}</span>
                        ) : (
                            <span className="text-[10px] text-alloy-midnight/45">Awaiting extracted value</span>
                        )}
                    </InspectorRow>
                </>
            ) : null}

            <div className="flex items-center gap-1 text-[9px] font-medium text-alloy-bend-pine">
                <Check className="h-3 w-3 shrink-0" strokeWidth={3} aria-hidden />
                <span>{storageSummaryLabel(fieldSource, selectedFieldId || null)}</span>
            </div>
        </div>
    );
}

function InspectorRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div>
            <label className="mb-0.5 block text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                {label}
            </label>
            {children}
        </div>
    );
}
