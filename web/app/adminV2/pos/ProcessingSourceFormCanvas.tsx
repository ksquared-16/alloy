"use client";

import { useMemo, useState } from "react";

import {
    buildOperatorFormView,
    suggestedFieldTypeFor,
    type ControlKind,
    type FormViewAddress,
    type FormViewQuestion,
    type MappingState,
} from "@/lib/pos/formDraft/buildOperatorFormView";
import { mappingChoicesFor, type MappingChoice } from "@/lib/pos/formDraft/buildMappingChangePayload";
import {
    canvasFilterCounts,
    CANVAS_FILTERS,
    matchesCanvasFilter,
    type CanvasFilter,
} from "@/lib/pos/formDraft/sourceCanvasFilters";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";
import { FormEngineRenderer } from "@/components/forms/engine/FormEngineRenderer";
import { emptyPayload } from "@/components/forms/engine/formEnginePayload";
import { safeParseFormSchema } from "@/lib/forms/schema";

/**
 * THE FORM THE OPERATOR UPLOADED, WITH ALLOY'S UNDERSTANDING DRAWN ON IT.
 *
 * Twice now the answer to "turn my paperwork into a form" has been a list of questions, and twice it
 * was rejected for the same reason: a list makes the operator rebuild their own document in their head
 * to check it. So the page is laid out as the form — section headings, the labels in their original
 * order, and a control shaped like the one the source declared — and the mapping state sits under each
 * control rather than in a column beside it. The test of this surface is that someone can look at it
 * and say "that's my form".
 *
 * ## Why it is rebuilt from the parsed structure rather than from the uploaded bytes
 *
 * The uploaded HTML is untrusted. Overlaying badges on it would mean injecting it into the operator's
 * own document, where a sanitiser bug is an XSS in an admin session. The importer already parsed what
 * matters — sections, order, labels, control types, choices, requiredness — so the canvas is drawn
 * from that, and nothing untrusted is ever in this DOM. The real file stays one click away in the
 * Source view, still inside the sandboxed frame that serves it.
 *
 * That trade is deliberate and it has a cost: this is faithful to STRUCTURE, not to the source's
 * typography and spacing. Pixel fidelity would need the untrusted markup in here.
 */

/**
 * `source`   the uploaded form, redrawn from what the importer read, with mapping on it. The default.
 * `original` the uploaded bytes themselves, sandboxed — the evidence the canvas is checked against.
 * `form`     the participant's form, rendered by the real form engine.
 */
type ViewMode = "source" | "original" | "form";

const VIEW_MODES: ReadonlyArray<{ readonly id: ViewMode; readonly label: string }> = [
    { id: "source", label: "Source" },
    { id: "original", label: "Original" },
    { id: "form", label: "Form" },
];

const BADGE: Record<MappingState, { readonly text: string; readonly className: string }> = {
    // Bend Pine is Alloy's "settled" colour; the ember token is its error/attention colour.
    known: { text: "✓ Mapped", className: "bg-alloy-bend-pine/12 text-alloy-bend-pine" },
    suggested: { text: "Suggested", className: "bg-alloy-midnight/[0.07] text-alloy-midnight/70" },
    needs_review: { text: "⚠ Needs mapping", className: "bg-alloy-ember/12 text-alloy-ember" },
    form_only: { text: "Kept with the form", className: "bg-alloy-midnight/[0.05] text-alloy-midnight/55" },
    derived: { text: "Filled in by Alloy", className: "bg-alloy-midnight/[0.05] text-alloy-midnight/55" },
};

/** A control shaped like the one on the page. Inert: this is a canvas, not a form to fill in. */
function Control({ control, options }: { control: ControlKind; options: readonly string[] }) {
    const box = "mt-1 rounded-md border border-alloy-midnight/20 bg-alloy-midnight/[0.02]";
    switch (control) {
        case "textarea":
            return <div className={`${box} h-16 w-full`} aria-hidden />;
        case "date":
            return <div className={`${box} h-8 w-40`} aria-hidden />;
        case "number":
            return <div className={`${box} h-8 w-28`} aria-hidden />;
        case "upload":
            return (
                <div className="mt-1 inline-flex items-center gap-2 rounded-md border border-dashed border-alloy-midnight/25 px-3 py-1.5 text-[12px] text-alloy-midnight/50">
                    Attach a file
                </div>
            );
        case "signature":
            return (
                <div className="mt-1 w-64 border-b-2 border-alloy-midnight/30 pb-5 text-[11px] italic text-alloy-midnight/35">
                    signature
                </div>
            );
        case "boolean":
            return (
                <div className="mt-1 flex gap-4 text-[13px] text-alloy-midnight/70">
                    {["Yes", "No"].map((o) => (
                        <span key={o} className="inline-flex items-center gap-1.5">
                            <span className="h-3 w-3 rounded-full border border-alloy-midnight/35" />
                            {o}
                        </span>
                    ))}
                </div>
            );
        case "choice":
        case "multichoice":
            return (
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-alloy-midnight/70">
                    {(options.length ? options : ["…"]).slice(0, 8).map((o, i) => (
                        <span key={`${o}-${i}`} className="inline-flex items-center gap-1.5">
                            <span
                                className={`h-3 w-3 border border-alloy-midnight/35 ${
                                    control === "choice" ? "rounded-full" : "rounded-[3px]"
                                }`}
                            />
                            {o}
                        </span>
                    ))}
                </div>
            );
        default:
            return <div className={`${box} h-8 w-full max-w-sm`} aria-hidden />;
    }
}

function Badge({ state, detail }: { state: MappingState; detail: string }) {
    const b = BADGE[state];
    return (
        <span
            title={detail}
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${b.className}`}
        >
            {b.text}
        </span>
    );
}

/** The contextual inspector: map it, or make the field it needs, without leaving the page. */
function MappingInspector({
    label,
    control,
    answerShape,
    onChoose,
    onCreateField,
    onClose,
}: {
    label: string;
    control: ControlKind;
    answerShape: string;
    onChoose: (choice: MappingChoice) => Promise<void> | void;
    onCreateField: (name: string, entity: string, fieldType: string) => Promise<void> | void;
    onClose: () => void;
}) {
    const [mode, setMode] = useState<"pick" | "create">("pick");
    const [name, setName] = useState(label);
    const [entity, setEntity] = useState("customer_member");
    const [busy, setBusy] = useState(false);
    const fieldType = suggestedFieldTypeFor(control);

    return (
        <div data-qa-mapping-inspector="true" className="mt-2 rounded-xl border border-alloy-ember/35 bg-white p-3">
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-[13px] font-semibold text-alloy-midnight">What should Alloy do with this answer?</p>
                <button type="button" onClick={onClose} className="text-[12px] text-alloy-midnight/50 underline">
                    Close
                </button>
            </div>

            {mode === "pick" ? (
                <>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {mappingChoicesFor(answerShape).map((choice) => (
                            <button
                                key={choice.id}
                                type="button"
                                disabled={busy}
                                onClick={async () => {
                                    setBusy(true);
                                    try {
                                        await onChoose(choice);
                                    } finally {
                                        setBusy(false);
                                    }
                                }}
                                className="min-h-[32px] rounded-full border border-alloy-midnight/20 bg-white px-3 text-[12px] font-medium text-alloy-midnight/80 disabled:opacity-50"
                            >
                                {choice.label}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => setMode("create")}
                        data-qa-create-field="open"
                        className="mt-2 text-[12px] font-medium text-alloy-bend-pine underline underline-offset-2"
                    >
                        + Create field
                    </button>
                    <p className="mt-1 text-[11px] text-alloy-midnight/45">
                        Use this when Alloy has nowhere to keep this answer yet.
                    </p>
                </>
            ) : (
                <div className="mt-2 space-y-2">
                    <label className="block text-[12px] text-alloy-midnight/70">
                        Call it
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            data-qa-create-field-name="true"
                            className="mt-1 w-full rounded-md border border-alloy-midnight/20 px-2 py-1.5 text-[13px]"
                        />
                    </label>
                    <label className="block text-[12px] text-alloy-midnight/70">
                        Keep it on
                        <select
                            value={entity}
                            onChange={(e) => setEntity(e.target.value)}
                            data-qa-create-field-entity="true"
                            className="mt-1 w-full rounded-md border border-alloy-midnight/20 px-2 py-1.5 text-[13px]"
                        >
                            <option value="customer_member">The child</option>
                            <option value="person">A parent or guardian</option>
                            <option value="customer">The household</option>
                        </select>
                    </label>
                    <p className="text-[11px] text-alloy-midnight/45">
                        Alloy will store this as {fieldType === "text" ? "text" : fieldType}, taken from the control on
                        your form.
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={busy || !name.trim()}
                            onClick={async () => {
                                setBusy(true);
                                try {
                                    await onCreateField(name.trim(), entity, fieldType);
                                } finally {
                                    setBusy(false);
                                }
                            }}
                            data-qa-create-field="submit"
                            className="min-h-[34px] rounded-lg bg-alloy-bend-pine px-3 text-[13px] font-medium text-white disabled:opacity-50"
                        >
                            {busy ? "Creating…" : "Create and map"}
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode("pick")}
                            className="min-h-[34px] rounded-lg border border-alloy-midnight/20 px-3 text-[13px] text-alloy-midnight/70"
                        >
                            Back
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

type Handlers = {
    readonly onChangeMapping?: (fieldId: string, choice: MappingChoice) => Promise<void> | void;
    readonly onCreateFieldAndMap?: (fieldId: string, name: string, entity: string, fieldType: string) => Promise<void> | void;
};

function QuestionRow({
    question,
    filter,
    nested,
    handlers,
}: {
    question: FormViewQuestion;
    filter: CanvasFilter;
    nested?: boolean;
    handlers: Handlers;
}) {
    const [open, setOpen] = useState(false);
    const [why, setWhy] = useState(false);
    const dimmed = !matchesCanvasFilter(question.mapping, filter);
    const editable = Boolean(handlers.onChangeMapping);

    return (
        <div
            data-qa-canvas-field={question.id}
            data-qa-mapping={question.mapping}
            data-qa-dimmed={dimmed ? "true" : "false"}
            className={`${nested ? "ml-6 border-l-2 border-alloy-midnight/12 pl-4" : ""} ${
                dimmed ? "opacity-35" : ""
            } py-2`}
        >
            <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13.5px] font-medium text-alloy-midnight">{question.label}</span>
                <span className="text-[11px] text-alloy-midnight/45">{question.requirednessText}</span>
            </div>
            <Control control={question.control} options={question.options} />
            <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge state={question.mapping} detail={question.mappingText} />
                {editable && question.mapping !== "derived" ? (
                    /*
                     * Reachable on every field, not only the red ones. A destination Alloy was confident
                     * about can still be the wrong one, and an operator who can see that but not change
                     * it has been shown a problem instead of given a fix.
                     */
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        data-qa-map-it={question.id}
                        className={`text-[11px] font-medium underline underline-offset-2 ${
                            question.mapping === "needs_review" ? "text-alloy-ember" : "text-alloy-midnight/50"
                        }`}
                    >
                        {open ? "Cancel" : question.mapping === "needs_review" ? "Map it" : "Change"}
                    </button>
                ) : null}
                {question.source.excerpt || question.source.page != null ? (
                    <button
                        type="button"
                        onClick={() => setWhy((v) => !v)}
                        className="text-[11px] text-alloy-midnight/45 underline underline-offset-2"
                    >
                        Why is this here?
                    </button>
                ) : null}
            </div>
            {question.absenceText ? (
                <p className="mt-0.5 text-[11.5px] text-alloy-bend-pine">{question.absenceText}</p>
            ) : null}
            {why ? (
                <p className="mt-1 rounded-md bg-alloy-midnight/[0.04] px-2.5 py-1.5 text-[12px] leading-relaxed text-alloy-midnight/70">
                    {question.source.excerpt ? `“${question.source.excerpt}”` : "Taken from your document."}
                    {question.source.page != null ? ` · page ${question.source.page}` : ""}
                    {question.mappingText ? ` · ${question.mappingText}` : ""}
                </p>
            ) : null}

            {open && editable ? (
                <MappingInspector
                    label={question.label}
                    control={question.control}
                    answerShape={question.answerShape}
                    onChoose={async (choice) => {
                        await handlers.onChangeMapping?.(question.id, choice);
                        setOpen(false);
                    }}
                    onCreateField={async (name, entity, fieldType) => {
                        await handlers.onCreateFieldAndMap?.(question.id, name, entity, fieldType);
                        setOpen(false);
                    }}
                    onClose={() => setOpen(false)}
                />
            ) : null}

            {question.dependents.length ? (
                <div className="mt-2">
                    <p
                        className={`text-[11.5px] font-medium ${
                            question.conditionConfidence === "accepted" ? "text-alloy-bend-pine" : "text-alloy-ember"
                        }`}
                    >
                        {question.conditionConfidence === "accepted"
                            ? `✓ Conditional — only asked when the answer is ${question.conditionTriggerLabel}`
                            : `Suggested conditional relationship — looks like it is only asked when the answer is ${question.conditionTriggerLabel}. Families are asked this either way until you accept it.`}
                    </p>
                    {question.dependents.map((d) => (
                        <QuestionRow key={d.id} question={d} filter={filter} nested handlers={handlers} />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function AddressRow({ address, filter }: { address: FormViewAddress; filter: CanvasFilter }) {
    const dimmed = !matchesCanvasFilter(address.mapping, filter);
    return (
        <div
            data-qa-canvas-address={address.id}
            data-qa-mapping={address.mapping}
            data-qa-dimmed={dimmed ? "true" : "false"}
            className={`py-2 ${dimmed ? "opacity-35" : ""}`}
        >
            <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13.5px] font-medium text-alloy-midnight">{address.label}</span>
                <span className="text-[11px] text-alloy-midnight/45">{address.required ? "Required" : "Optional"}</span>
            </div>
            {/* One address: the lines are stacked as they are written, under one mapping state. */}
            <div className="mt-1 space-y-1">
                {address.lines.map((l) => (
                    <div key={l.id}>
                        <span className="text-[11.5px] text-alloy-midnight/50">{l.label}</span>
                        <div className="mt-0.5 h-7 w-full max-w-sm rounded-md border border-alloy-midnight/20 bg-alloy-midnight/[0.02]" />
                    </div>
                ))}
            </div>
            <div className="mt-1">
                <Badge state={address.mapping} detail={address.mappingText} />
            </div>
        </div>
    );
}

export default function ProcessingSourceFormCanvas({
    draft,
    sourceDocumentName,
    sourcePreviewUrl,
    onOpenAdvanced,
    onChangeMapping,
    onCreateFieldAndMap,
}: {
    draft: StoredFormDraftPreview;
    sourceDocumentName?: string | null;
    /** The uploaded file itself, served sandboxed. Absent for sources with no text preview. */
    sourcePreviewUrl?: string | null;
    onOpenAdvanced: () => void;
    onChangeMapping?: (fieldId: string, choice: MappingChoice) => Promise<void> | void;
    onCreateFieldAndMap?: (fieldId: string, name: string, entity: string, fieldType: string) => Promise<void> | void;
}) {
    const view = useMemo(() => buildOperatorFormView(draft, sourceDocumentName ?? null), [draft, sourceDocumentName]);
    const [filter, setFilter] = useState<CanvasFilter>("all");
    /*
     * Default is the source-fidelity canvas, because that is the surface the operator came here for.
     * `original` is the uploaded bytes, still sandboxed, kept reachable so the canvas can be checked
     * against the real thing. `form` is the participant's form rendered by the real form engine — a
     * preview, not a second description of the same questions.
     */
    const [mode, setMode] = useState<ViewMode>("source");
    const handlers: Handlers = { onChangeMapping, onCreateFieldAndMap };
    /*
     * Built only when the Form tab is open: converting the draft is real work, and an operator who
     * never leaves the canvas should not pay for it. A draft that cannot satisfy the published-form
     * schema yet renders as a plain sentence rather than a broken preview.
     */
    const previewSchema = useMemo(() => {
        if (mode !== "form") return null;
        const parsed = safeParseFormSchema(draftFormToFormSchemaV1(draft));
        return parsed.success ? parsed.data : null;
    }, [draft, mode]);

    const counts = useMemo(() => canvasFilterCounts(view.sections), [view]);

    return (
        <div data-qa-source-canvas="true" className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <header className="shrink-0 border-b border-alloy-midnight/10 px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="text-[17px] font-semibold text-alloy-midnight">{view.title}</h2>
                    <span className="rounded-full bg-alloy-midnight/[0.06] px-2 py-0.5 text-[11px] text-alloy-midnight/60">
                        From document
                    </span>
                    {view.sourceDocumentName ? (
                        <span className="text-[11.5px] text-alloy-midnight/45">{view.sourceDocumentName}</span>
                    ) : null}
                    <div className="ml-auto inline-flex rounded-lg border border-alloy-midnight/15 p-0.5">
                        {VIEW_MODES.map((m) => (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => setMode(m.id)}
                                disabled={m.id === "original" && !sourcePreviewUrl}
                                data-qa-canvas-mode={m.id}
                                aria-pressed={mode === m.id}
                                className={`rounded-md px-2.5 py-1 text-[12px] font-medium disabled:opacity-40 ${
                                    mode === m.id ? "bg-alloy-midnight text-white" : "text-alloy-midnight/65"
                                }`}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className={`mt-2 flex flex-wrap items-center gap-1.5 ${mode === "source" ? "" : "hidden"}`}>
                    {CANVAS_FILTERS.map((f) => {
                        const n =
                            f.id === "all"
                                ? counts.all
                                : f.id === "mapped"
                                  ? counts.mapped
                                  : f.id === "needs"
                                    ? counts.needs
                                    : f.id === "suggested"
                                      ? counts.suggested
                                      : counts.form_only;
                        return (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => setFilter(f.id)}
                                data-qa-canvas-filter={f.id}
                                aria-pressed={filter === f.id}
                                className={`min-h-[28px] rounded-full px-2.5 text-[12px] font-medium ${
                                    filter === f.id
                                        ? "bg-alloy-midnight text-white"
                                        : "border border-alloy-midnight/15 text-alloy-midnight/70"
                                }`}
                            >
                                {f.label}
                                <span className="ml-1 tabular-nums opacity-60">{n}</span>
                            </button>
                        );
                    })}
                </div>
            </header>

            {mode === "original" && sourcePreviewUrl ? (
                /* The file itself, still sandboxed: no scripts, no forms, no navigation out. */
                <iframe
                    src={sourcePreviewUrl}
                    sandbox=""
                    referrerPolicy="no-referrer"
                    title="Uploaded source"
                    data-qa-canvas-source-frame="true"
                    className="min-h-0 flex-1 border-0 bg-white"
                />
            ) : mode === "form" ? (
                <div data-qa-canvas-form-preview="true" className="min-h-0 flex-1 overflow-y-auto bg-alloy-midnight/[0.02] px-4 py-4">
                    {previewSchema ? (
                        <div className="mx-auto max-w-2xl rounded-xl border border-alloy-midnight/10 bg-white p-4">
                            {/* The real engine, in readonly mode: what the family will actually be shown. */}
                            <FormEngineRenderer
                                schema={previewSchema}
                                payload={emptyPayload()}
                                onChange={() => {}}
                                mode="readonly"
                            />
                        </div>
                    ) : (
                        <p className="text-[13px] text-alloy-midnight/55">
                            This draft cannot be previewed as a form yet. Fix the items marked{" "}
                            <span className="font-medium text-alloy-ember">Needs mapping</span> and try again.
                        </p>
                    )}
                </div>
            ) : (
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    {/* Laid out as the page it came from: headings, prose, then the fields in order. */}
                    {view.sections.map((section) => (
                        <section key={section.id} data-qa-canvas-section={section.id} className="mb-6">
                            <h3 className="border-b border-alloy-midnight/10 pb-1 text-[12px] font-semibold uppercase tracking-wide text-alloy-midnight/55">
                                {section.title}
                            </h3>
                            {section.tableWarning ? (
                                <p
                                    data-qa-canvas-table-warning={section.id}
                                    className="mt-1 rounded-md bg-alloy-ember/10 px-2.5 py-1.5 text-[12px] text-alloy-ember"
                                >
                                    ⚠ {section.tableWarning}
                                </p>
                            ) : null}
                            <div className="mt-1 divide-y divide-alloy-midnight/[0.07]">
                                {section.items.map((item) => {
                                    if (item.kind === "prose") {
                                        return (
                                            <p
                                                key={item.id}
                                                className="py-2 text-[12.5px] leading-relaxed text-alloy-midnight/70"
                                            >
                                                {item.text}
                                            </p>
                                        );
                                    }
                                    if (item.kind === "address") {
                                        return <AddressRow key={item.id} address={item} filter={filter} />;
                                    }
                                    if (item.kind === "repeat_group") {
                                        return (
                                            <div key={item.id} data-qa-canvas-group={item.id} className="py-2">
                                                <div className="flex flex-wrap items-baseline gap-x-2">
                                                    <span className="text-[13.5px] font-medium text-alloy-midnight">
                                                        {item.label}
                                                    </span>
                                                    {item.observedInSource ? (
                                                        <span className="text-[11px] text-alloy-midnight/45">
                                                            your form had room for {item.observedInSource}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                {item.reuseText ? (
                                                    <p className="mt-0.5 text-[11.5px] text-alloy-bend-pine">
                                                        ✓ {item.reuseText}
                                                    </p>
                                                ) : null}
                                                <div className="mt-1 rounded-lg border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.03] px-3">
                                                    {item.questions.map((q) => (
                                                        <QuestionRow
                                                            key={q.id}
                                                            question={q}
                                                            filter={filter}
                                                            handlers={handlers}
                                                        />
                                                    ))}
                                                </div>
                                                <p className="mt-1 text-[12px] text-alloy-midnight/55">+ Add another</p>
                                            </div>
                                        );
                                    }
                                    return (
                                        <QuestionRow key={item.id} question={item} filter={filter} handlers={handlers} />
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                    {view.sections.length === 0 ? (
                        <p className="text-[13px] text-alloy-midnight/55">
                            Alloy found nothing to review in this document yet.
                        </p>
                    ) : null}
                </div>
            )}

            <footer className="shrink-0 border-t border-alloy-midnight/10 px-4 py-2">
                <button
                    type="button"
                    onClick={onOpenAdvanced}
                    data-testid="open-advanced-extraction"
                    className="text-[11.5px] text-alloy-midnight/45 underline underline-offset-2"
                >
                    Advanced extraction details
                </button>
            </footer>
        </div>
    );
}
