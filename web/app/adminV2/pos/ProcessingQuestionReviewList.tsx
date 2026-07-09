"use client";

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
    PROCESSING_BODY,
    PROCESSING_FIELD_LABEL,
    PROCESSING_METADATA,
    PROCESSING_PANEL_EYEBROW,
    PROCESSING_ROW_TITLE,
} from "@/lib/pos/processingPresentationTokens";

function resolvedStorageSummary(question: ReviewQuestionInput): string {
    if (question.ignored || question.questionSubject === "processing_only") {
        return storageSummaryLabel(null);
    }
    const intent = inferQuestionIntent(question.evidenceLabel || question.displayLabel);
    const subject = question.questionSubject ?? defaultSubjectForIntent(intent);
    const fieldSource =
        question.field_source ??
        deriveFieldSources({
            subject,
            nameRepresentation: question.nameRepresentation,
            intent,
            displayLabel: question.displayLabel,
            type: question.type,
        });
    return storageSummaryLabel(fieldSource);
}

const STATUS_LABEL: Record<string, string> = {
    high: "High confidence",
    medium: "Medium",
    low: "Low",
    needs_review: "Needs review",
    processing_only: "Processing only",
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
}: Props) {
    const activeCount = questions.filter((q) => !q.ignored).length;
    const sections = questions.reduce<Array<{ title: string; questions: ReviewQuestionInput[] }>>((acc, q) => {
        const title = q.section?.trim() || "Questions";
        const existing = acc.find((s) => s.title === title);
        if (existing) existing.questions.push(q);
        else acc.push({ title, questions: [q] });
        return acc;
    }, []);

    return (
        <>
            <p className={`mb-2 ${PROCESSING_METADATA}`}>
                {activeCount} active question{activeCount === 1 ? "" : "s"}
                {questions.length > activeCount ? ` · ${questions.length - activeCount} ignored` : ""}
            </p>
            <div className="space-y-1">
                {sections.map((section) => (
                    <section key={section.title} className="py-3 first:pt-0 last:pb-0">
                        <div className="mb-2 flex items-baseline justify-between gap-2">
                            <h3 className={PROCESSING_PANEL_EYEBROW}>{section.title}</h3>
                            <span className={`tabular-nums ${PROCESSING_METADATA}`}>
                                {section.questions.filter((q) => !q.ignored).length}
                            </span>
                        </div>
                        <ol className="space-y-1">
                            {section.questions.map((q) => {
                                const sel = selectedId === q.id;
                                const isEditing = editingId === q.id;
                                const mapped = typeof q.page === "number" && Array.isArray(q.bbox);
                                const intent = inferQuestionIntent(q.evidenceLabel || q.displayLabel);
                                const resolvedSubject = q.questionSubject ?? defaultSubjectForIntent(intent);
                                const status = deriveResolutionStatus(q);
                                const showNameRep =
                                    supportsNameRepresentation(intent) && resolvedSubject !== "processing_only";
                                const highConfidence = status === "high";

                                return (
                                    <li
                                        key={q.id}
                                        data-testid={`review-question-${q.id}`}
                                        data-question-ignored={q.ignored ? "true" : undefined}
                                        className={`rounded-lg px-2 py-2 transition-colors ${sel ? "bg-alloy-bend-pine/[0.04]" : "hover:bg-alloy-stone/[0.03]"} ${q.ignored ? "opacity-55" : ""}`}
                                    >
                                        <div className="flex items-start gap-2">
                                            <button
                                                type="button"
                                                onClick={() => onSelect(sel ? null : q.id)}
                                                className="flex min-w-0 flex-1 flex-col gap-1 text-left"
                                            >
                                                <span className={PROCESSING_METADATA}>
                                                    {q.evidenceLabel || "Untitled source field"}
                                                </span>
                                                <span className={`${PROCESSING_ROW_TITLE} leading-snug`}>
                                                    {q.displayLabel || (
                                                        <span className="font-normal text-alloy-midnight/40">Untitled question</span>
                                                    )}
                                                </span>
                                                <span className={`flex flex-wrap items-center gap-1.5 ${PROCESSING_BODY}`}>
                                                    <span>{TYPE_LABEL[q.type] ?? q.type}</span>
                                                    <span className="text-alloy-midnight/25" aria-hidden>
                                                        ·
                                                    </span>
                                                    <span>{mapped ? "Mapped" : "Not mapped"}</span>
                                                    <span className="text-alloy-midnight/25" aria-hidden>
                                                        ·
                                                    </span>
                                                    <span className={highConfidence ? "text-alloy-bend-pine" : "text-alloy-midnight/45"}>
                                                        {STATUS_LABEL[status] ?? status}
                                                    </span>
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
                                                    aria-label="Edit question"
                                                    onClick={() => onEdit(isEditing ? null : q.id)}
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
                                            <div className="mt-3 space-y-2 border-t border-alloy-stone/10 pt-3">
                                                <div>
                                                    <label className={`mb-1 block ${PROCESSING_FIELD_LABEL}`}>
                                                        Destination
                                                    </label>
                                                    <select
                                                        value={q.questionSubject ?? "processing_only"}
                                                        data-testid={`review-subject-${q.id}`}
                                                        onChange={(e) =>
                                                            onUpdate(q.id, {
                                                                questionSubject: e.target.value as ReviewQuestionInput["questionSubject"],
                                                                field_source: undefined,
                                                            })
                                                        }
                                                        className="w-full rounded border border-alloy-stone/20 bg-white px-2 py-1 text-[10px] text-alloy-midnight focus:border-alloy-bend-pine/40 focus:outline-none"
                                                    >
                                                        {QUESTION_SUBJECT_OPTIONS.map((o) => (
                                                            <option key={o.value} value={o.value}>
                                                                {o.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                {showNameRep ? (
                                                    <div>
                                                        <label className={`mb-1 block ${PROCESSING_FIELD_LABEL}`}>
                                                            Name format
                                                        </label>
                                                        <div className="flex flex-wrap gap-1">
                                                            {NAME_REPRESENTATION_OPTIONS.map((o) => {
                                                                const active = (q.nameRepresentation ?? "full_name") === o.value;
                                                                return (
                                                                    <button
                                                                        key={o.value}
                                                                        type="button"
                                                                        data-testid={`review-name-rep-${q.id}-${o.value}`}
                                                                        onClick={() =>
                                                                            onUpdate(q.id, {
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
                                                    </div>
                                                ) : null}
                                                <div className={`flex items-center gap-1 ${PROCESSING_METADATA} text-alloy-bend-pine`}>
                                                    <Check className="h-3 w-3 shrink-0" strokeWidth={3} aria-hidden />
                                                    <span>{resolvedStorageSummary(q)}</span>
                                                </div>
                                            </div>
                                        ) : null}

                                        {isEditing && !q.ignored ? (
                                            <div className="mt-3 space-y-2 border-t border-alloy-stone/10 pt-3">
                                                <input
                                                    value={q.displayLabel}
                                                    onChange={(e) => onUpdate(q.id, { displayLabel: e.target.value })}
                                                    placeholder="Display label"
                                                    className="w-full rounded border border-alloy-stone/20 bg-white px-2 py-1 text-[10px] focus:border-alloy-bend-pine/40 focus:outline-none"
                                                />
                                                <input
                                                    value={q.section}
                                                    onChange={(e) => onUpdate(q.id, { section: e.target.value })}
                                                    placeholder="Section"
                                                    className="w-full rounded border border-alloy-stone/20 bg-white px-2 py-1 text-[9px] focus:border-alloy-bend-pine/40 focus:outline-none"
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
        </>
    );
}
