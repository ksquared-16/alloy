"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import { describeCondition, removeField, updateField } from "@/lib/forms/formBuilderSchema";
import { studioSchemaForDraft } from "@/lib/pos/processingCase/formDraft/studioSchemaForDraft";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";
import type { ProcessingLibraryGroupOffer } from "@/lib/forms/processingFormFieldLibrary";
import {
    canvasMappingStates,
    filterSchemaForAttention,
    MAPPING_ATTENTION_FILTERS,
    mappingCounts,
    resolveImportedFormMappings,
    type MappingAttention,
} from "@/lib/pos/formDraft/importedFormMappingView";
import { absenceTextFor, suggestedConditionsFor } from "@/lib/pos/formDraft/importedFormAnnotations";
import { tableReviewNoticesFor } from "@/lib/pos/formDraft/tabularSourceSections";
import { plumbingFieldsOnDraft } from "@/lib/pos/formDraft/documentPlumbingFields";
import ProcessingFormCanvas, { MAPPING_STATE_CHIP, type CanvasMappingState } from "./ProcessingFormCanvas";
import ProcessingFormQuestionInspector from "./ProcessingFormQuestionInspector";
import { useFormStudioAuthoring } from "./useFormStudioAuthoring";

/**
 * AN IMPORTED DOCUMENT, OPEN IN FORMS STUDIO.
 *
 * The previous surfaces answered "what did extraction find?" — first as a queue of concept decisions,
 * then as a list of question cards, then as a redrawn page beside the source. Each was a better
 * description of the document than the last, and all three shared the same flaw: the operator was
 * reading a report about their form instead of working on their form. The Director's words for what it
 * should feel like were "Alloy took my existing form and opened it in Forms Studio, with the fields it
 * understands already mapped for me."
 *
 * So this is not a new editor. It is the Studio editor — the SAME `ProcessingFormCanvas` and
 * `ProcessingFormQuestionInspector` a hand-built form uses — pointed at a schema derived from the
 * imported draft, with one thing added that a hand-built form has no need for: Alloy's own
 * understanding of where each answer belongs, drawn as an overlay that can be switched off.
 *
 * What is deliberately NOT here:
 *   - no second canvas, inspector or field-properties panel (@see §25 — the convergence rule);
 *   - no Source tab competing with the form; the original is a secondary `View original`;
 *   - no Advanced extraction details sending the operator back to the concept queue.
 *
 * The mapping intelligence is not here either. It lives in `resolveFieldMapping`, is applied at import,
 * and this surface only reads it.
 */
export default function ProcessingImportedFormStudio({
    draft,
    sourceDocumentName,
    sourcePreviewUrl,
    onSaveStudioSchema,
}: {
    draft: StoredFormDraftPreview;
    sourceDocumentName?: string | null;
    /** The uploaded file, served sandboxed. Absent for a source with no safe text preview. */
    sourcePreviewUrl?: string | null;
    /**
     * Persist the form exactly as Forms Studio has it — the whole `FormSchemaV1`, the same save a
     * hand-built form makes. The draft's imported metadata (provenance, confidence, evidence) is never
     * rebuilt from it and never written into it.
     */
    onSaveStudioSchema?: (schema: FormSchemaV1) => Promise<void>;
}) {
    /*
     * The form as Forms Studio has it: its own saved schema once the operator has edited it, otherwise the
     * importer's initial form derived from the draft. @see studioSchemaForDraft
     */
    const derived = useMemo(() => {
        const resolved = studioSchemaForDraft(draft);
        return resolved.ok ? resolved.schema : null;
    }, [draft]);
    const [schema, setSchema] = useState<FormSchemaV1 | null>(derived);

    /*
     * Seeded once per GENERATION of the draft, never from a save's echo.
     *
     * A Studio save returns the stored draft, and its schema is the one this editor sent — but saves are
     * asynchronous, so the echo of save N can arrive after the operator has already made edit N+1.
     * Re-seeding from it would quietly undo N+1. The editor's own state is the authority while it is open;
     * only a new generation (a re-import) replaces it.
     */
    const seededGeneration = useRef<string | null>(null);
    useEffect(() => {
        if (!derived) return;
        const generation = `${draft.source_document_id ?? ""}|${draft.generated_at}`;
        if (seededGeneration.current === generation) return;
        seededGeneration.current = generation;
        setSchema(derived);
    }, [derived, draft.source_document_id, draft.generated_at]);

    /*
     * Saves are serialized: each waits for the one before, so the server always ends on the operator's
     * latest form, never on an earlier request that happened to land last.
     */
    const saveChain = useRef<Promise<void>>(Promise.resolve());

    const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
    const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
    const [showMapping, setShowMapping] = useState(true);
    const [attention, setAttention] = useState<MappingAttention>("all");
    const [originalOpen, setOriginalOpen] = useState(false);
    const [saveErr, setSaveErr] = useState<string | null>(null);
    /*
     * The canonical destination catalog. The shared inspector falls back to a 17-entry curated list when
     * it has none, which is why "Child → Gender" was missing on an imported form: the form-scoped
     * lifecycle-coverage route needs a form id, and an imported draft has none until it is created. The
     * org-scoped route serves the SAME library, so both surfaces read one authority.
     */
    const [fieldLibrary, setFieldLibrary] = useState<ProcessingLibraryGroupOffer[] | null>(null);
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch("/api/admin/forms/field-library", { credentials: "include" });
                if (!res.ok || cancelled) return;
                const json = (await res.json()) as { data?: { field_library?: ProcessingLibraryGroupOffer[] } };
                if (!cancelled) setFieldLibrary(json.data?.field_library ?? null);
            } catch {
                /* The inspector still offers the curated list; it says less, it does not break. */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const mappings = useMemo(() => (schema ? resolveImportedFormMappings(schema, draft) : new Map()), [schema, draft]);
    const counts = useMemo(() => (schema ? mappingCounts(schema, mappings) : null), [schema, mappings]);
    const states = useMemo(() => canvasMappingStates(mappings), [mappings]);
    /*
     * What the operator currently sees. The complete form stays in `schema` and in the stored draft, so
     * returning to All restores it exactly — there is nothing to restore, because nothing was removed.
     */
    const visibleSchema = useMemo(
        () => (schema ? filterSchemaForAttention(schema, mappings, attention) : null),
        [schema, mappings, attention],
    );
    /*
     * Where the source had a grid Alloy could not represent. Computed from the draft's own kept text, so
     * it is independent of the mapping overlay and of the attention filter — an operator who switches
     * mapping off is asking "how does my form look?", and the answer still has to include "there is a
     * table here I have not handled".
     */
    const sectionNotices = useMemo(() => tableReviewNoticesFor(draft), [draft]);
    /*
     * Plumbing a pre-fix import left behind. The importer no longer drafts these, but the rule cannot
     * reach a draft that already exists — so the surface names what it found and offers removal rather
     * than hiding it on the canvas or rewriting the draft without being asked.
     */
    const plumbing = useMemo(() => {
        const present = new Set<string>();
        const walk = (fields: readonly FormField[]) => {
            for (const f of fields) {
                present.add(f.id);
                if (f.type === "group") walk((f as { fields: FormField[] }).fields);
            }
        };
        if (schema) walk(schema.fields);
        // Only what is still on the form: once removed, it is gone from the Studio schema for good.
        return plumbingFieldsOnDraft(draft.fields ?? []).filter((f) => present.has(f.id));
    }, [draft.fields, schema]);

    const selectedField: FormField | null = useMemo(
        () => schema?.fields.find((f) => f.id === selectedFieldId) ?? null,
        [schema, selectedFieldId],
    );
    const selectedMapping = selectedFieldId ? mappings.get(selectedFieldId) ?? null : null;
    const selectedDraftField = useMemo(
        () => (selectedFieldId ? (draft.fields ?? []).find((f) => f.id === selectedFieldId) ?? null : null),
        [draft, selectedFieldId],
    );
    /*
     * The importer's unaccepted reads. A suggestion is shown, never applied: until an operator agrees,
     * families are asked the follow-up either way, which is the safe direction to be wrong in.
     */
    const suggestedConditions = useMemo(() => suggestedConditionsFor(draft.fields ?? []), [draft.fields]);

    // `mutate` closes over the current schema and is defined below the early return; the hook reaches
    // it through this ref so every add/remove/arrange goes through the same save.
    const mutateRef = useRef<(fn: (s: FormSchemaV1) => FormSchemaV1) => void>(() => {});
    // The SAME Forms Studio authoring a hand-built form uses. @see useFormStudioAuthoring
    const authoring = useFormStudioAuthoring({
        schema,
        mutate: (fn) => mutateRef.current(fn),
        editable: true,
        fieldLibrary,
        onSelectField: setSelectedFieldId,
        onSelectSection: setSelectedSectionId,
    });

    if (!schema) {
        return (
            <div data-qa-imported-form-studio="unavailable" className="p-4 text-[13px] text-alloy-midnight/60">
                Alloy could not open this document as a form yet.
            </div>
        );
    }

    /**
     * Every Studio edit goes through here — inspector, canvas, library, sections, drag and drop.
     *
     * The schema moves first so the canvas responds immediately, then the whole form is saved, exactly
     * as Forms Studio has it.
     */
    const mutate = (fn: (s: FormSchemaV1) => FormSchemaV1): void => {
        const next = fn(schema);
        if (next === schema) return;
        setSchema(next);
        if (!onSaveStudioSchema) return;
        setSaveErr(null);
        saveChain.current = saveChain.current
            .catch(() => undefined)
            .then(() => onSaveStudioSchema(next))
            .catch((e: unknown) => setSaveErr(e instanceof Error ? e.message : "Couldn't save that change."));
    };

    mutateRef.current = mutate;

    const selectedSection = selectedSectionId ? schema.sections.find((x) => x.id === selectedSectionId) ?? null : null;
    const needsMapping = selectedMapping?.state === "needs_mapping";

    return (
        <div data-qa-imported-form-studio="true" className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <header className="shrink-0 border-b border-alloy-midnight/10 px-4 py-2.5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="text-[15px] font-semibold text-alloy-midnight">{schema.title}</h2>
                    <span className="rounded-full bg-alloy-midnight/[0.06] px-2 py-0.5 text-[10px] text-alloy-midnight/60">
                        From your document
                    </span>
                    {sourceDocumentName ? (
                        <span className="text-[11px] text-alloy-midnight/45">{sourceDocumentName}</span>
                    ) : null}
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                        {/* The form is the artifact; the upload is reference material one click away. */}
                        <button
                            type="button"
                            onClick={() => setOriginalOpen(true)}
                            disabled={!sourcePreviewUrl}
                            data-qa-view-original="true"
                            className="min-h-[28px] rounded-lg border border-alloy-midnight/15 px-2.5 text-[12px] font-medium text-alloy-midnight/70 disabled:opacity-40"
                        >
                            View original
                        </button>
                        <label className="inline-flex items-center gap-1.5 text-[12px] font-medium text-alloy-midnight/70">
                            <input
                                type="checkbox"
                                checked={showMapping}
                                onChange={(e) => setShowMapping(e.target.checked)}
                                data-qa-show-mapping="true"
                                className="h-3.5 w-3.5 accent-alloy-bend-pine"
                            />
                            Show mapping
                        </label>
                    </div>
                </div>
                {showMapping ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5" data-qa-mapping-attention="true">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                            Mapping attention
                        </span>
                        {MAPPING_ATTENTION_FILTERS.map((f) => (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => setAttention(f.id)}
                                aria-pressed={attention === f.id}
                                data-qa-attention-filter={f.id}
                                className={`min-h-[26px] rounded-full px-2.5 text-[11.5px] font-medium ${
                                    attention === f.id
                                        ? /*
                                           * A selected filter wears the colour of the state it selects, so the row
                                           * says "these are the ones that need you" rather than merely "this button
                                           * is pressed". All is the only one with no state of its own, so it takes
                                           * the ordinary primary control treatment.
                                           */
                                          f.id === "all"
                                            ? "bg-alloy-bend-pine text-white"
                                            : MAPPING_STATE_CHIP[f.id as CanvasMappingState]
                                        : "border border-alloy-midnight/15 text-alloy-midnight/70"
                                }`}
                            >
                                {f.label}
                                <span className="ml-1 tabular-nums opacity-70">{counts?.[f.id] ?? 0}</span>
                            </button>
                        ))}
                    </div>
                ) : null}
                {attention !== "all" && visibleSchema && schema ? (
                    <p className="mt-1.5 text-[11px] text-alloy-midnight/50" data-qa-filter-note="true">
                        Showing {visibleSchema.fields.length} of {schema.fields.length} — the rest of the form is
                        still there.{" "}
                        <button
                            type="button"
                            onClick={() => setAttention("all")}
                            className="font-medium text-alloy-bend-pine underline underline-offset-2"
                            data-qa-filter-clear="true"
                        >
                            Show the whole form
                        </button>
                    </p>
                ) : null}
                {plumbing.length ? (
                    <p
                        className="mt-1.5 rounded-md bg-alloy-gold/[0.12] px-2.5 py-1.5 text-[11.5px] text-alloy-midnight/75"
                        data-qa-plumbing-notice="true"
                    >
                        {plumbing.map((f) => f.label).join(", ")}{" "}
                        {plumbing.length === 1 ? "is" : "are"} how the page handles itself, not{" "}
                        {plumbing.length === 1 ? "a question" : "questions"} for a family. This form was imported before
                        Alloy learned to leave {plumbing.length === 1 ? "it" : "them"} out.{" "}
                        <button
                            type="button"
                            onClick={() =>
                                // An explicit removal the operator asked for, through the same Studio save.
                                mutate((s) => plumbing.reduce((acc, f) => removeField(acc, f.id), s))
                            }
                            data-qa-plumbing-remove="true"
                            className="font-medium text-alloy-bend-pine underline underline-offset-2"
                        >
                            Remove {plumbing.length === 1 ? "it" : "them"} from the form
                        </button>
                    </p>
                ) : null}
                {saveErr ? <p className="mt-1.5 text-[11.5px] text-alloy-ember">{saveErr}</p> : null}
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
                <div className="min-h-0 overflow-y-auto px-3 py-3">
                    {/* The Studio canvas. Not a copy of it — the component manual forms render. */}
                    <ProcessingFormCanvas
                        schema={visibleSchema ?? schema}
                        selectedFieldId={selectedFieldId}
                        selectedSectionId={selectedSectionId}
                        editable
                        onSelectField={(id) => {
                            setSelectedFieldId(id);
                            setSelectedSectionId(null);
                        }}
                        onSelectSection={(id) => {
                            setSelectedSectionId(id);
                            setSelectedFieldId(null);
                        }}
                        {...authoring.canvasProps}
                        mapping={{ byFieldId: states, show: showMapping }}
                        sectionNotices={sectionNotices}
                    />
                </div>

                <aside className="min-h-0 overflow-y-auto border-t border-alloy-midnight/10 px-3 py-3 lg:border-l lg:border-t-0">
                    {selectedField ? (
                        <>
                            {/*
                              * The imported-only part of the inspector, above the Studio inspector rather
                              * than instead of it: what Alloy understood, why the question is here, and
                              * somewhere to put an answer that has no home yet.
                              */}
                            {selectedMapping ? (
                                <section data-qa-inspector-mapping={selectedMapping.state} className="mb-3 rounded-lg border border-alloy-midnight/10 bg-white p-2.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/40">
                                        What Alloy understood
                                    </p>
                                    <p
                                        className={`mt-1 text-[12px] font-medium ${
                                            selectedMapping.state === "mapped"
                                                ? "text-alloy-bend-pine"
                                                : selectedMapping.state === "needs_mapping"
                                                  ? "text-alloy-ember"
                                                  : "text-alloy-midnight/70"
                                        }`}
                                    >
                                        {selectedMapping.explanation}
                                    </p>
                                    <p className="mt-1 text-[11px] text-alloy-midnight/50">
                                        {needsMapping
                                            ? "Choose where to store it under “Store answer in” below."
                                            : "Change it under “Store answer in” below."}
                                    </p>
                                    {selectedMapping.state === "suggested" && selectedMapping.proposed ? (
                                        /*
                                         * Accepting a suggestion is a deliberate act, and this is the only way the
                                         * Studio turns one into a stored destination. Nothing else — no unrelated
                                         * edit, no save of another question — promotes it.
                                         */
                                        <button
                                            type="button"
                                            className="mt-1.5 rounded-md border border-alloy-bend-pine/35 px-2 py-1 text-[11px] font-semibold text-alloy-bend-pine hover:bg-alloy-bend-pine/[0.06]"
                                            data-qa-accept-suggestion="true"
                                            onClick={() => {
                                                const proposed = selectedMapping.proposed;
                                                if (!proposed) return;
                                                mutate((s) => updateField(s, selectedField.id, { field_source: proposed }));
                                            }}
                                        >
                                            Use {selectedMapping.destinationLabel ?? "this destination"}
                                        </button>
                                    ) : null}
                                    {selectedDraftField?.evidence || typeof selectedDraftField?.page === "number" ? (
                                        <details className="mt-1.5">
                                            <summary className="cursor-pointer text-[11px] text-alloy-midnight/45 underline underline-offset-2">
                                                Why is this here?
                                            </summary>
                                            <p className="mt-1 text-[11.5px] leading-relaxed text-alloy-midnight/65" data-qa-source-context="true">
                                                {selectedDraftField?.evidence ? `“${selectedDraftField.evidence}”` : "Taken from your document."}
                                                {typeof selectedDraftField?.page === "number" ? ` · page ${selectedDraftField.page}` : ""}
                                                {selectedDraftField?.pdf_field_name ? ` · ${selectedDraftField.pdf_field_name}` : ""}
                                            </p>
                                        </details>
                                    ) : null}
                                    {(() => {
                                        const absence = selectedDraftField ? absenceTextFor(selectedDraftField) : null;
                                        const accepted = selectedField.visibility?.all?.[0] ?? null;
                                        const suggestion = suggestedConditions.get(selectedField.id) ?? null;
                                        if (!absence && !accepted && !suggestion) return null;
                                        return (
                                            <div className="mt-1.5 space-y-1 border-t border-alloy-midnight/[0.07] pt-1.5">
                                                {accepted ? (
                                                    <p className="text-[11.5px] text-alloy-bend-pine" data-qa-condition="accepted">
                                                        ✓ {describeCondition(schema, selectedField)}
                                                    </p>
                                                ) : null}
                                                {suggestion ? (
                                                    <p className="text-[11.5px] text-alloy-midnight/65" data-qa-condition="suggested">
                                                        Looks like a follow-up to “{suggestion.triggerLabel}”. Families are asked
                                                        it either way until you accept that.
                                                    </p>
                                                ) : null}
                                                {absence ? (
                                                    <p className="text-[11.5px] text-alloy-midnight/65" data-qa-absence="true">
                                                        {absence}
                                                    </p>
                                                ) : null}
                                            </div>
                                        );
                                    })()}
                                </section>
                            ) : null}

                            {/* The Studio inspector: label, requiredness, answer, Store answer in, layout. */}
                            <ProcessingFormQuestionInspector
                                field={selectedField}
                                schema={schema}
                                editable
                                mutate={mutate}
                                onRemove={() => authoring.removeQuestion(selectedField.id)}
                                fieldLibrary={fieldLibrary}
                            />
                        </>
                    ) : selectedSection ? (
                        authoring.renderSectionInspector(selectedSection)
                    ) : (
                        <p className="text-[12px] text-alloy-midnight/55">
                            Select a question on the form to review or change it.
                        </p>
                    )}
                </aside>
            </div>

            {authoring.overlays}

            {originalOpen && sourcePreviewUrl ? (
                /*
                 * A CENTRED OVERLAY, NOT A RIGHT-HAND RAIL.
                 *
                 * The rail was 576px wide and the uploaded page is laid out for a desktop viewport, so the
                 * document arrived clipped on the right and pushed off-centre — the operator was fighting
                 * the drawer to read their own form. This fills the viewport with a comfortable gutter and
                 * centres the frame, and the sandboxed frame keeps its own scrolling so a long or wide
                 * document stays reachable at its natural proportions rather than being squeezed.
                 *
                 * It is an overlay, so the form underneath keeps its scroll position, its selected field
                 * and every unsaved mapping decision; closing restores exactly what was there.
                 */
                <div
                    className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-alloy-midnight/45 p-4 sm:p-8"
                    role="dialog"
                    aria-label="Original document"
                    data-qa-original-drawer="true"
                >
                    <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
                        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-alloy-midnight/10 px-4 py-2.5">
                            <div className="min-w-0">
                                <p className="truncate text-[13px] font-semibold text-alloy-midnight">
                                    {sourceDocumentName || "Original document"}
                                </p>
                                <p className="text-[11px] text-alloy-midnight/45">
                                    Your uploaded file, for reference. The form is where you make changes.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setOriginalOpen(false)}
                                data-qa-original-close="true"
                                className="shrink-0 rounded-lg border border-alloy-midnight/15 px-2.5 py-1 text-[12px] font-medium text-alloy-midnight/70"
                            >
                                Close
                            </button>
                        </header>
                        {/* The same sandboxed route as before: unique origin, no scripts, no forms. */}
                        <iframe
                            src={sourcePreviewUrl}
                            sandbox=""
                            referrerPolicy="no-referrer"
                            title="Original document"
                            data-qa-original-frame="true"
                            className="min-h-0 w-full flex-1 border-0 bg-white"
                        />
                    </div>
                    {/* Clicking outside closes, and sits BELOW the panel so it never covers the document. */}
                    <button
                        type="button"
                        aria-label="Close original"
                        onClick={() => setOriginalOpen(false)}
                        className="absolute inset-0 -z-10 cursor-default"
                    />
                </div>
            ) : null}
        </div>
    );
}
