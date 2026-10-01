"use client";

import { useMemo, useState } from "react";

import { buildOperatorFormView, type FormViewItem, type FormViewQuestion, type MappingState } from "@/lib/pos/formDraft/buildOperatorFormView";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

/**
 * The imported document, as the form it became.
 *
 * This replaces the decision queue as the FIRST thing an operator sees after importing their
 * paperwork. The queue counted the engine's work — "84 concepts from 104 questions", "26 decisions only
 * you can make" — which is true and is not a form. An operator importing an admissions packet wants to
 * see the form, understand what Alloy already knows, and fix what is wrong. The queue is still there,
 * one link away, for when that is genuinely what you want.
 *
 * Every sentence here comes from `buildOperatorFormView`, which is pure and tested; this file only
 * decides what it looks like.
 */

const BADGE: Record<MappingState, { readonly text: string; readonly className: string }> = {
    known: { text: "✓ Already known", className: "bg-alloy-bend-pine/10 text-alloy-bend-pine" },
    suggested: { text: "✨ Suggested", className: "bg-alloy-midnight/[0.07] text-alloy-midnight/70" },
    needs_review: { text: "⚠ Needs your decision", className: "bg-alloy-ember/12 text-alloy-ember" },
    form_only: { text: "○ Kept with the form", className: "bg-alloy-midnight/[0.05] text-alloy-midnight/55" },
    derived: { text: "↗ Alloy fills this in", className: "bg-alloy-midnight/[0.05] text-alloy-midnight/55" },
};

function SourceContext({ question }: { question: FormViewQuestion }) {
    const [open, setOpen] = useState(false);
    const { excerpt, page, sourceFieldName } = question.source;
    if (!excerpt && page == null && !sourceFieldName) return null;
    return (
        <div className="mt-1.5">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="text-[11px] text-alloy-midnight/45 underline underline-offset-2"
            >
                {open ? "Hide where this came from" : "Why is this here?"}
            </button>
            {open ? (
                <p className="mt-1 rounded-lg bg-alloy-midnight/[0.04] px-2.5 py-1.5 text-[12px] leading-relaxed text-alloy-midnight/70">
                    {excerpt ? <span>&ldquo;{excerpt}&rdquo;</span> : <span>Taken from your document.</span>}
                    {page != null ? <span className="text-alloy-midnight/45"> · page {page}</span> : null}
                </p>
            ) : null}
        </div>
    );
}

function Question({ question, nested = false }: { question: FormViewQuestion; nested?: boolean }) {
    const badge = BADGE[question.mapping];
    const redLined = question.mapping === "needs_review";
    return (
        <div
            data-qa-form-question={question.id}
            data-qa-mapping={question.mapping}
            className={`rounded-xl border px-3.5 py-3 ${
                redLined ? "border-alloy-ember/40 bg-alloy-ember/[0.04]" : "border-alloy-midnight/12 bg-white"
            } ${nested ? "ml-5 border-l-2 border-l-alloy-midnight/15" : ""}`}
        >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-[14px] font-medium text-alloy-midnight">{question.label}</span>
                <span className="text-[11px] text-alloy-midnight/45">{question.answerShape}</span>
                {question.required ? <span className="text-[11px] text-alloy-midnight/40">required</span> : null}
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
                    {badge.text}
                </span>
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-alloy-midnight/65">{question.mappingText}</p>
            {question.options.length ? (
                <p className="mt-1 text-[12px] text-alloy-midnight/50">Choices: {question.options.join(" · ")}</p>
            ) : null}
            {redLined && question.decisionPrompt ? (
                <p className="mt-2 text-[13px] font-medium text-alloy-ember">{question.decisionPrompt}</p>
            ) : null}
            <SourceContext question={question} />

            {question.dependents.length ? (
                <div className="mt-3 space-y-2">
                    <p className="text-[12px] font-medium text-alloy-midnight/60">
                        {question.conditionConfidence === "detected"
                            ? `✓ Only asked when the answer is ${question.conditionTriggerLabel}`
                            : `⚠ Looks like it is only asked when the answer is ${question.conditionTriggerLabel} — worth checking`}
                    </p>
                    {question.dependents.map((d) => (
                        <Question key={d.id} question={d} nested />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function Item({ item }: { item: FormViewItem }) {
    if (item.kind === "prose") {
        return (
            <p className="rounded-xl bg-alloy-midnight/[0.03] px-3.5 py-3 text-[13px] leading-relaxed text-alloy-midnight/70">
                {item.text}
            </p>
        );
    }
    if (item.kind === "repeat_group") {
        return (
            <div data-qa-form-group={item.id} className="rounded-xl border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.03] px-3.5 py-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[14px] font-medium text-alloy-midnight">{item.label}</span>
                    {item.observedInSource ? (
                        <span className="text-[11px] text-alloy-midnight/45">
                            your document had room for {item.observedInSource}
                        </span>
                    ) : null}
                </div>
                {item.reuseText ? (
                    <p className="mt-1 text-[12.5px] leading-relaxed text-alloy-bend-pine">{item.reuseText}</p>
                ) : null}
                <div className="mt-2 space-y-2">
                    {item.questions.map((q) => (
                        <Question key={q.id} question={q} nested />
                    ))}
                </div>
                <p className="mt-2 text-[12px] text-alloy-midnight/50">+ {item.addLabel}</p>
            </div>
        );
    }
    return <Question question={item} />;
}

export default function ProcessingFormMappingReview({
    draft,
    sourceDocumentName,
    onOpenAdvanced,
}: {
    draft: StoredFormDraftPreview;
    sourceDocumentName?: string | null;
    onOpenAdvanced: () => void;
}) {
    const view = useMemo(() => buildOperatorFormView(draft, sourceDocumentName ?? null), [draft, sourceDocumentName]);

    return (
        <div data-qa-form-mapping-review="true" className="space-y-5">
            <header>
                <h2 className="text-[20px] font-semibold leading-tight text-alloy-midnight">{view.title}</h2>
                <p className="mt-0.5 text-[12px] text-alloy-midnight/50">
                    From document{view.sourceDocumentName ? ` · ${view.sourceDocumentName}` : ""}
                </p>
                <p className="mt-3 text-[13.5px] leading-relaxed text-alloy-midnight/75">
                    {view.knownCount > 0 ? (
                        <>
                            Alloy already knows where <strong>{view.knownCount}</strong> of {view.questionCount} answers
                            belong, so families will not be asked to type them again.
                        </>
                    ) : (
                        <>This is the form Alloy built from your document.</>
                    )}{" "}
                    {view.needsReview.length > 0 ? (
                        <span className="text-alloy-ember">
                            {view.needsReview.length} {view.needsReview.length === 1 ? "question needs" : "questions need"} your
                            decision &mdash; they are marked below.
                        </span>
                    ) : (
                        <span>Nothing is waiting on you.</span>
                    )}
                </p>
            </header>

            {view.sections.map((section) => (
                <section key={section.id} data-qa-form-section={section.id}>
                    <h3 className="text-[12px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                        {section.title}
                    </h3>
                    <div className="mt-2 space-y-2">
                        {section.items.map((item, i) => (
                            <Item key={`${section.id}-${i}`} item={item} />
                        ))}
                    </div>
                </section>
            ))}

            <footer className="border-t border-alloy-midnight/10 pt-4">
                <button
                    type="button"
                    onClick={onOpenAdvanced}
                    data-testid="open-advanced-extraction"
                    className="text-[12px] text-alloy-midnight/50 underline underline-offset-2"
                >
                    Advanced extraction details
                </button>
                <p className="mt-1 text-[11px] leading-relaxed text-alloy-midnight/40">
                    Concept ownership, per-question confidence and the configuration proposals. You should not need
                    this to review the form.
                </p>
            </footer>
        </div>
    );
}
