"use client";

import { useEffect, useMemo, useState } from "react";

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import { safeParseFormSchema } from "@/lib/forms/schema";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";
import {
    canvasMappingStates,
    dimmedFieldIds,
    editFromSchemaField,
    MAPPING_ATTENTION_FILTERS,
    mappingCounts,
    resolveImportedFormMappings,
    type MappingAttention,
} from "@/lib/pos/formDraft/importedFormMappingView";
import { suggestedFieldTypeForFormField } from "@/lib/pos/formDraft/createFieldFromSource";
import { absenceTextFor, suggestedConditionsFor } from "@/lib/pos/formDraft/importedFormAnnotations";
import ProcessingFormCanvas from "./ProcessingFormCanvas";
import ProcessingFormQuestionInspector from "./ProcessingFormQuestionInspector";

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
    onSaveFieldEdits,
    onCreateFieldAndMap,
}: {
    draft: StoredFormDraftPreview;
    sourceDocumentName?: string | null;
    /** The uploaded file, served sandboxed. Absent for a source with no safe text preview. */
    sourcePreviewUrl?: string | null;
    /**
     * Persist through the WHOLE-DRAFT contract. The surface hands over every edited field, because the
     * save route rebuilds the draft from what it is given and a partial post deletes the rest.
     */
    onSaveFieldEdits?: (edits: ReadonlyMap<string, { label: string; required: boolean; field_source: { entity_type: string; field_key: string } | null }>) => Promise<void> | void;
    onCreateFieldAndMap?: (fieldId: string, name: string, entity: string, fieldType: string) => Promise<void> | void;
}) {
    /*
     * The draft is the stored truth; the schema is what Studio edits. Re-deriving on every draft change
     * is what makes a saved mapping come back from the server rather than from an optimistic guess.
     */
    const derived = useMemo(() => {
        const parsed = safeParseFormSchema(draftFormToFormSchemaV1(draft));
        return parsed.success ? parsed.data : null;
    }, [draft]);
    const [schema, setSchema] = useState<FormSchemaV1 | null>(derived);
    useEffect(() => setSchema(derived), [derived]);

    const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
    const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
    const [showMapping, setShowMapping] = useState(true);
    const [attention, setAttention] = useState<MappingAttention>("all");
    const [originalOpen, setOriginalOpen] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [saveErr, setSaveErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const mappings = useMemo(() => (schema ? resolveImportedFormMappings(schema, draft) : new Map()), [schema, draft]);
    const counts = useMemo(() => mappingCounts(mappings), [mappings]);
    const dimmed = useMemo(() => (schema ? dimmedFieldIds(schema, mappings, attention) : new Set<string>()), [schema, mappings, attention]);
    const states = useMemo(() => canvasMappingStates(mappings), [mappings]);

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

    if (!schema) {
        return (
            <div data-qa-imported-form-studio="unavailable" className="p-4 text-[13px] text-alloy-midnight/60">
                Alloy could not open this document as a form yet.
            </div>
        );
    }

    /**
     * Every inspector edit goes through here.
     *
     * The schema moves first so the canvas responds immediately, then the WHOLE field set is persisted.
     * Posting only the changed field would delete the others — sections, conditions, choices and all.
     */
    const mutate = (fn: (s: FormSchemaV1) => FormSchemaV1): void => {
        const next = fn(schema);
        setSchema(next);
        if (!onSaveFieldEdits) return;
        const edits = new Map<string, ReturnType<typeof editFromSchemaField>>();
        for (const field of next.fields) {
            if (field.type === "group" || field.type === "text_block") continue;
            if (!(draft.fields ?? []).some((f) => f.id === field.id)) continue;
            edits.set(field.id, editFromSchemaField(field));
        }
        setSaveErr(null);
        void Promise.resolve(onSaveFieldEdits(edits)).catch((e: unknown) =>
            setSaveErr(e instanceof Error ? e.message : "Couldn't save that change."),
        );
    };

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
                                        ? "bg-alloy-midnight text-white"
                                        : "border border-alloy-midnight/15 text-alloy-midnight/70"
                                }`}
                            >
                                {f.label}
                                <span className="ml-1 tabular-nums opacity-60">{counts[f.id]}</span>
                            </button>
                        ))}
                    </div>
                ) : null}
                {saveErr ? <p className="mt-1.5 text-[11.5px] text-alloy-ember">{saveErr}</p> : null}
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
                <div className="min-h-0 overflow-y-auto px-3 py-3">
                    {/* The Studio canvas. Not a copy of it — the component manual forms render. */}
                    <ProcessingFormCanvas
                        schema={schema}
                        selectedFieldId={selectedFieldId}
                        selectedSectionId={selectedSectionId}
                        editable
                        onSelectField={(id) => {
                            setSelectedFieldId(id);
                            setCreateOpen(false);
                        }}
                        onSelectSection={setSelectedSectionId}
                        onAddQuestion={() => {}}
                        onAddSection={() => {}}
                        mapping={{ byFieldId: states, show: showMapping, dimFieldIds: dimmed }}
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
                                                        ✓ Only asked when “
                                                        {schema.fields.find((f) => f.id === accepted.field_id)?.label ?? "another question"}
                                                        ” is {accepted.value === true ? "Yes" : accepted.value === false ? "No" : String(accepted.value)}
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
                                    {onCreateFieldAndMap && selectedMapping.state !== "mapped" ? (
                                        <CreateFieldPanel
                                            open={createOpen}
                                            onOpen={() => setCreateOpen(true)}
                                            onCancel={() => setCreateOpen(false)}
                                            defaultName={selectedField.label}
                                            field={selectedField}
                                            busy={busy}
                                            onSubmit={async (name, entity, fieldType) => {
                                                setBusy(true);
                                                try {
                                                    await onCreateFieldAndMap(selectedField.id, name, entity, fieldType);
                                                    setCreateOpen(false);
                                                } finally {
                                                    setBusy(false);
                                                }
                                            }}
                                        />
                                    ) : null}
                                </section>
                            ) : null}

                            {/* The Studio inspector: label, requiredness, answer, Store answer in, layout. */}
                            <ProcessingFormQuestionInspector
                                field={selectedField}
                                schema={schema}
                                editable
                                mutate={mutate}
                                onRemove={() => setSelectedFieldId(null)}
                            />
                        </>
                    ) : (
                        <p className="text-[12px] text-alloy-midnight/55">
                            Select a question on the form to review or change it.
                        </p>
                    )}
                </aside>
            </div>

            {originalOpen && sourcePreviewUrl ? (
                <div className="fixed inset-0 z-50 flex" role="dialog" aria-label="Original document" data-qa-original-drawer="true">
                    <button
                        type="button"
                        aria-label="Close original"
                        onClick={() => setOriginalOpen(false)}
                        className="flex-1 bg-alloy-midnight/30"
                    />
                    <div className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
                        <header className="flex items-center justify-between border-b border-alloy-midnight/10 px-3 py-2">
                            <p className="text-[13px] font-semibold text-alloy-midnight">
                                {sourceDocumentName || "Original document"}
                            </p>
                            <button
                                type="button"
                                onClick={() => setOriginalOpen(false)}
                                className="text-[12px] text-alloy-midnight/55 underline"
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
                            className="min-h-0 flex-1 border-0"
                        />
                    </div>
                </div>
            ) : null}
        </div>
    );
}

/** Making a destination that does not exist yet, without leaving the field. */
function CreateFieldPanel({
    open,
    onOpen,
    onCancel,
    onSubmit,
    defaultName,
    field,
    busy,
}: {
    open: boolean;
    onOpen: () => void;
    onCancel: () => void;
    onSubmit: (name: string, entity: string, fieldType: string) => Promise<void> | void;
    defaultName: string;
    field: FormField;
    busy: boolean;
}) {
    const [name, setName] = useState(defaultName);
    const [entity, setEntity] = useState("customer_member");
    useEffect(() => setName(defaultName), [defaultName]);
    const fieldType = suggestedFieldTypeForFormField(field);

    if (!open) {
        return (
            <button
                type="button"
                onClick={onOpen}
                data-qa-create-field="open"
                className="mt-2 text-[11.5px] font-medium text-alloy-bend-pine underline underline-offset-2"
            >
                + Create field
            </button>
        );
    }
    return (
        <div className="mt-2 space-y-2 rounded-md border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.03] p-2">
            <label className="block text-[11px] text-alloy-midnight/70">
                Call it
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    data-qa-create-field-name="true"
                    className="mt-0.5 w-full rounded-md border border-alloy-midnight/15 px-2 py-1 text-[12px]"
                />
            </label>
            <label className="block text-[11px] text-alloy-midnight/70">
                Keep it on
                <select
                    value={entity}
                    onChange={(e) => setEntity(e.target.value)}
                    data-qa-create-field-entity="true"
                    className="mt-0.5 w-full rounded-md border border-alloy-midnight/15 px-2 py-1 text-[12px]"
                >
                    <option value="customer_member">The child</option>
                    <option value="person">A parent or guardian</option>
                    <option value="customer">The household</option>
                </select>
            </label>
            <div className="flex gap-2">
                <button
                    type="button"
                    disabled={busy || !name.trim()}
                    onClick={() => void onSubmit(name.trim(), entity, fieldType)}
                    data-qa-create-field="submit"
                    className="min-h-[30px] rounded-md bg-alloy-bend-pine px-2.5 text-[12px] font-medium text-white disabled:opacity-50"
                >
                    {busy ? "Creating…" : "Create and map"}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="min-h-[30px] rounded-md border border-alloy-midnight/15 px-2.5 text-[12px] text-alloy-midnight/70"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}
