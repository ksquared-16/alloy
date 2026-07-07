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

const CONF_PILL: Record<string, string> = {
    high: "bg-emerald-50 text-emerald-700",
    medium: "bg-amber-50 text-amber-700",
    low: "bg-stone-100 text-stone-500",
    needs_review: "bg-orange-50 text-orange-700",
    processing_only: "bg-stone-100 text-stone-600",
    ignored: "bg-stone-100 text-stone-400",
};

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

    return (
        <>
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-stone-400">
                {activeCount} active question{activeCount === 1 ? "" : "s"}
                {questions.length > activeCount ? ` · ${questions.length - activeCount} ignored` : ""}
            </div>
            <ol className="space-y-1.5">
                {questions.map((q, i) => {
                    const sel = selectedId === q.id;
                    const isEditing = editingId === q.id;
                    const mapped = typeof q.page === "number" && Array.isArray(q.bbox);
                    const intent = inferQuestionIntent(q.evidenceLabel || q.displayLabel);
                    const status = deriveResolutionStatus(q);
                    const showNameRep = supportsNameRepresentation(intent) && q.questionSubject !== "processing_only";

                    return (
                        <li
                            key={q.id}
                            className={`rounded-md border ${q.ignored ? "border-stone-200 bg-stone-50 opacity-70" : sel ? "border-alloy-juniper bg-emerald-50/60" : "border-stone-200 bg-white"}`}
                        >
                            <div className="flex items-start gap-2 px-2 py-1.5">
                                <button
                                    type="button"
                                    onClick={() => onSelect(sel ? null : q.id)}
                                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                                >
                                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[9px] font-semibold text-stone-500">
                                        {i + 1}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[10px] text-stone-400">From document: {q.evidenceLabel || "—"}</span>
                                        <span className="block truncate text-[12px] font-medium text-alloy-midnight">
                                            {q.displayLabel || <span className="text-stone-400">Untitled question</span>}
                                        </span>
                                        <span className="block text-[10px] text-stone-400">
                                            {TYPE_LABEL[q.type] ?? q.type}
                                            {mapped ? " · mapped to PDF" : " · not mapped to PDF"}
                                        </span>
                                    </span>
                                </button>
                                <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-medium ${CONF_PILL[status] ?? CONF_PILL.medium}`}>
                                    {STATUS_LABEL[status] ?? status}
                                </span>
                                {!mapped && hasPageMaps && !created && !q.ignored ? (
                                    <button
                                        type="button"
                                        onClick={() => onStartMapping(q.id)}
                                        className={`shrink-0 rounded border px-1 py-0.5 text-[9px] font-medium ${
                                            mappingFieldId === q.id
                                                ? "border-alloy-juniper text-alloy-juniper"
                                                : "border-stone-200 text-stone-500 hover:border-alloy-juniper hover:text-alloy-juniper"
                                        }`}
                                    >
                                        {mappingFieldId === q.id ? "Mapping…" : "Map"}
                                    </button>
                                ) : null}
                                {q.ignored ? (
                                    <button type="button" aria-label="Restore question" onClick={() => onIgnore(q.id)} className="shrink-0 text-stone-400 hover:text-alloy-juniper">
                                        <RotateCcw className="h-3.5 w-3.5" />
                                    </button>
                                ) : (
                                    <button type="button" aria-label="Ignore question" onClick={() => onIgnore(q.id)} className="shrink-0 text-stone-400 hover:text-amber-700">
                                        <EyeOff className="h-3.5 w-3.5" />
                                    </button>
                                )}
                                <button type="button" aria-label="Edit question" onClick={() => onEdit(isEditing ? null : q.id)} className="shrink-0 text-stone-400 hover:text-alloy-juniper">
                                    <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" aria-label="Delete question" onClick={() => onRemove(q.id)} className="shrink-0 text-stone-400 hover:text-amber-700">
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>

                            {!q.ignored ? (
                                <div className="space-y-2 border-t border-stone-100 px-2 py-2">
                                    <div>
                                        <label className="mb-0.5 block text-[10px] font-medium text-stone-500">What is this question asking about?</label>
                                        <select
                                            value={q.questionSubject ?? "processing_only"}
                                            onChange={(e) =>
                                                onUpdate(q.id, {
                                                    questionSubject: e.target.value as ReviewQuestionInput["questionSubject"],
                                                    field_source: undefined,
                                                })
                                            }
                                            className="w-full rounded border border-stone-200 px-2 py-1 text-[11px] text-stone-700"
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
                                            <label className="mb-0.5 block text-[10px] font-medium text-stone-500">How should the name be collected?</label>
                                            <select
                                                value={q.nameRepresentation ?? "full_name"}
                                                onChange={(e) =>
                                                    onUpdate(q.id, {
                                                        nameRepresentation: e.target.value as ReviewQuestionInput["nameRepresentation"],
                                                        field_source: undefined,
                                                    })
                                                }
                                                className="w-full rounded border border-stone-200 px-2 py-1 text-[11px] text-stone-700"
                                            >
                                                {NAME_REPRESENTATION_OPTIONS.map((o) => (
                                                    <option key={o.value} value={o.value}>
                                                        {o.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : null}
                                    <div className="flex items-center gap-1.5 text-[10.5px] text-emerald-800">
                                        <Check className="h-3 w-3 shrink-0" strokeWidth={3} aria-hidden />
                                        <span>{resolvedStorageSummary(q)}</span>
                                    </div>
                                </div>
                            ) : null}

                            {isEditing && !q.ignored ? (
                                <div className="space-y-1.5 border-t border-stone-100 px-2 py-2">
                                    <input
                                        value={q.displayLabel}
                                        onChange={(e) => onUpdate(q.id, { displayLabel: e.target.value })}
                                        placeholder="Display label for parents/operators"
                                        className="w-full rounded-md border border-stone-300 px-2 py-1 text-[12px] text-alloy-midnight focus:border-alloy-juniper focus:outline-none"
                                    />
                                    <input
                                        value={q.section}
                                        onChange={(e) => onUpdate(q.id, { section: e.target.value })}
                                        placeholder="Section"
                                        className="w-full rounded-md border border-stone-300 px-2 py-1 text-[11.5px] text-stone-600 focus:border-alloy-juniper focus:outline-none"
                                    />
                                </div>
                            ) : null}
                        </li>
                    );
                })}
            </ol>
        </>
    );
}
