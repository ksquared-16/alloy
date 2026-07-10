"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    SURFACE_FIELD_PLACEMENT_LABELS,
    type SurfaceFieldPlacementMode,
} from "@/lib/adminV2/settings/surfaces/surfaceFieldComposer";
import {
    addField,
    addRegistryField,
    addSection,
    removeField,
    removeSection,
    renameSection,
    updateField,
    type BuilderFieldType,
    type BuilderFieldSpec,
} from "@/lib/forms/formBuilderSchema";
import {
    groupFieldsIntoRows,
    moveFieldBetweenSections,
    moveFieldWithinSection,
    placementFromField,
    reorderField,
    reorderFieldAfter,
    setFieldPlacement,
    type FormRowPlacement,
} from "@/lib/forms/formRowComposition";
import type { ProcessingBuilderCanonicalField } from "@/lib/forms/processingFormBuilderLibrary";
import {
    PROCESSING_BUILDER_CANONICAL_FIELDS,
    resolveProcessingBuilderRegistryEntry,
} from "@/lib/forms/processingFormBuilderLibrary";
import type { FormField, FormFieldSource, FormSchemaV1 } from "@/lib/forms/schema";
import ProcessingFormBuilderLibraryPanel from "./ProcessingFormBuilderLibraryPanel";
import ProcessingFormBrandedHeader from "./ProcessingFormBrandedHeader";
import ProcessingFormCanvas, { type CanvasDropTarget } from "./ProcessingFormCanvas";
import ProcessingFormDistributionPanel from "./ProcessingFormDistributionPanel";
import ProcessingInspectorCard from "./ProcessingInspectorCard";
import ProcessingCollapsibleInspectorSection from "./ProcessingCollapsibleInspectorSection";
import ProcessingSectionNameDialog from "./ProcessingSectionNameDialog";
import type { ProcessingFormRow } from "./useProcessingFormApi";
import { useProcessingFormApi } from "./useProcessingFormApi";
import { DEFAULT_FORM_ACCENT, parseFormBranding, type ProcessingFormBranding } from "@/lib/forms/processingFormBranding";

const QUESTION_TYPES: Array<{ type: BuilderFieldType; label: string; meta: string; category: string }> = [
    { type: "short_text", label: "Short text", meta: "Single line answer", category: "basic" },
    { type: "long_text", label: "Long text", meta: "Paragraph answer", category: "basic" },
    { type: "text_block", label: "Text block", meta: "Authorization copy with Alloy tokens", category: "content" },
    { type: "number", label: "Number", meta: "Numeric input", category: "basic" },
    { type: "date", label: "Date", meta: "Calendar picker", category: "basic" },
    { type: "select", label: "Dropdown", meta: "Select one option", category: "choice" },
    { type: "boolean", label: "Yes / No", meta: "Boolean toggle", category: "choice" },
    { type: "signature", label: "Signature", meta: "Draw or type signature", category: "capture" },
    { type: "file_ref", label: "File upload", meta: "Attach a document", category: "capture" },
];

const CATEGORY_LABELS: Record<string, string> = {
    basic: "Basic",
    content: "Content",
    choice: "Choice",
    capture: "Capture",
};

type BuilderMode = "edit" | "preview" | "runtime";

function destinationLabel(field: FormField): string {
    const source = field.field_source;
    if (!source) return "Processing only";
    if (source.entity_type === "child" || source.entity_type === "customer_member") return "Child";
    if (source.entity_type === "guardian" || source.entity_type === "person") return "Parent / Guardian";
    if (source.entity_type === "enrollment") return "Enrollment";
    if (source.entity_type === "customer") return "Household";
    return "Record";
}

const STORE_OPTIONS = [
    { value: "processing_only", label: "Processing only" },
    { value: "child", label: "Child" },
    { value: "parent", label: "Parent / Guardian" },
    { value: "enrollment", label: "Enrollment" },
    { value: "household", label: "Household" },
] as const;

function storeValueFromField(field: FormField): string {
    const source = field.field_source;
    if (!source) return "processing_only";
    if (source.entity_type === "child" || source.entity_type === "customer_member") return "child";
    if (source.entity_type === "guardian" || source.entity_type === "person") return "parent";
    if (source.entity_type === "enrollment") return "enrollment";
    if (source.entity_type === "customer") return "household";
    return "processing_only";
}

function fieldSourceForDestination(field: FormField, value: string): FormFieldSource | undefined {
    if (value === "processing_only") return undefined;
    const entity_type =
        value === "child" ? "child" : value === "parent" ? "guardian" : value === "enrollment" ? "enrollment" : value === "household" ? "customer" : "custom";
    const existing = field.field_source;
    if (existing?.field_key && existing.field_key !== "custom" && existing.field_key !== "unmapped") {
        return {
            entity_type,
            field_key: existing.field_key,
            ...(existing.shared_value_key ? { shared_value_key: existing.shared_value_key } : {}),
            ...(existing.crm_mapping_key ? { crm_mapping_key: existing.crm_mapping_key } : {}),
        };
    }
    return { entity_type, field_key: "custom" };
}

function typeLabel(field: FormField): string {
    if (field.type === "text" && field.multiline) return "Long text";
    if (field.type === "text_block") return "Text block";
    return field.type;
}

export default function ProcessingFormBuilder({
    formId,
    formMeta,
    onBack,
}: {
    formId: string;
    formMeta: ProcessingFormRow | null;
    onBack: () => void;
}) {
    const {
        loadFormSchema,
        saveDraft: persistDraft,
        publishForm,
        loadForms,
        listPublicLinks,
        loadPublishedVersionId,
        mintProcessingPublicLink,
        unpublishProcessingPublicLinks,
    } = useProcessingFormApi();
    const [schema, setSchema] = useState<FormSchemaV1 | null>(null);
    const [editVersionId, setEditVersionId] = useState<string | null>(null);
    const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [mode, setMode] = useState<BuilderMode>("edit");
    const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
    const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
    const [librarySectionId, setLibrarySectionId] = useState<string | null>(null);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [builderErr, setBuilderErr] = useState<string | null>(null);
    const [dragFieldId, setDragFieldId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<CanvasDropTarget | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());
    const [branding, setBranding] = useState<ProcessingFormBranding>(() =>
        parseFormBranding(formMeta)
    );
    const [formMetaSnapshot, setFormMetaSnapshot] = useState<Record<string, unknown>>(formMeta?.metadata ?? {});
    const [hasPublishedVersion, setHasPublishedVersion] = useState(Boolean(formMeta?.has_published_version));
    const [publishJustSucceeded, setPublishJustSucceeded] = useState(false);

    const [inspectorSection, setInspectorSection] = useState<string>("branding");

    useEffect(() => {
        setHasPublishedVersion(Boolean(formMeta?.has_published_version));
    }, [formMeta?.has_published_version]);

    useEffect(() => {
        if (selectedFieldId) setInspectorSection("question");
    }, [selectedFieldId]);

    const editable = editVersionId !== null && mode === "edit";

    const load = useCallback(async () => {
        setLoadState("loading");
        const result = await loadFormSchema(formId);
        if (result.state === "error" || !result.schema) {
            setLoadState("error");
            return;
        }
        setSchema(result.schema);
        setEditVersionId(result.editVersionId);
        setSelectedSectionId(result.schema.sections[0]?.id ?? null);
        setBranding(parseFormBranding(result.formRow ?? formMeta));
        setFormMetaSnapshot(result.formRow?.metadata ?? formMeta?.metadata ?? {});
        setHasPublishedVersion(Boolean(result.formRow?.has_published_version ?? formMeta?.has_published_version));
        setLoadState("ready");
        setDirty(false);
    }, [loadFormSchema, formId, formMeta]);

    useEffect(() => {
        void load();
    }, [load]);

    const mutate = useCallback((fn: (s: FormSchemaV1) => FormSchemaV1) => {
        setSchema((cur) => (cur ? fn(cur) : cur));
        setDirty(true);
        setBuilderErr(null);
    }, []);

    const fieldById = useMemo(() => {
        const map = new Map<string, FormField>();
        if (schema) for (const f of schema.fields) map.set(f.id, f);
        return map;
    }, [schema]);

    const selectedField = selectedFieldId ? fieldById.get(selectedFieldId) ?? null : null;
    const selectedSection = selectedSectionId ? schema?.sections.find((s) => s.id === selectedSectionId) ?? null : null;

    const libraryQuestionTypes = useMemo(() => QUESTION_TYPES, []);

    const openLibrary = (sectionId: string) => {
        setLibrarySectionId(sectionId);
        setLibraryOpen(true);
    };

    const addQuestion = (type: BuilderFieldType) => {
        if (!schema || !editable || !librarySectionId) return;
        const label = QUESTION_TYPES.find((p) => p.type === type)?.label ?? "Question";
        const spec: BuilderFieldSpec = {
            type,
            label: `Untitled ${label.toLowerCase()}`,
            sectionId: librarySectionId,
            ...(type === "select" ? { options: [{ value: "option_1", label: "Option 1" }] } : {}),
        };
        const { schema: next, fieldId } = addField(schema, spec);
        setSchema(next);
        setSelectedFieldId(fieldId);
        setSelectedSectionId(null);
        setDirty(true);
        setLibraryOpen(false);
    };

    const addCanonicalField = (canonical: ProcessingBuilderCanonicalField) => {
        if (!schema || !editable || !librarySectionId) return;
        const entry = resolveProcessingBuilderRegistryEntry(canonical);
        if (!entry) return;
        const { schema: next, fieldId } = addRegistryField(schema, entry, librarySectionId, {
            label: canonical.pickerLabel,
        });
        setSchema(next);
        setSelectedFieldId(fieldId);
        setSelectedSectionId(null);
        setDirty(true);
        setLibraryOpen(false);
    };

    const handleDragDrop = () => {
        if (!schema || !dragFieldId || !dropTarget) return;
        let next = schema;
        if (!dropTarget.fieldId) {
            next = reorderField(schema, dragFieldId, dropTarget.sectionId, null);
        } else if (dropTarget.position === "before") {
            next = reorderField(schema, dragFieldId, dropTarget.sectionId, dropTarget.fieldId);
        } else {
            next = reorderFieldAfter(schema, dragFieldId, dropTarget.sectionId, dropTarget.fieldId);
        }
        next = setFieldPlacement(next, dragFieldId, dropTarget.rowIntent === "same-line" ? "same-line" : "new-line-below");
        setSchema(next);
        setDirty(true);
        setDragFieldId(null);
        setDropTarget(null);
    };

    const saveDraft = async () => {
        if (!editVersionId || !schema) return;
        setSaving(true);
        setBuilderErr(null);
        try {
            await persistDraft(formId, editVersionId, schema, { branding, existingMeta: formMetaSnapshot, formName: schema.title });
            setDirty(false);
        } catch (e) {
            setBuilderErr(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(false);
        }
    };

    const publish = async () => {
        if (!editVersionId || !schema) return;
        setPublishing(true);
        setBuilderErr(null);
        setPublishJustSucceeded(false);
        try {
            const patchedMeta = await publishForm(formId, editVersionId, schema, {
                branding,
                existingMeta: formMetaSnapshot,
                formName: schema.title,
                formKey: formMeta?.key ?? formId,
            });
            setFormMetaSnapshot(patchedMeta);
            setDirty(false);
            setHasPublishedVersion(true);
            setPublishJustSucceeded(true);
            const result = await loadFormSchema(formId);
            if (result.schema) {
                setSchema(result.schema);
                setEditVersionId(result.editVersionId);
                setBranding(parseFormBranding(result.formRow ?? formMeta));
                setFormMetaSnapshot(result.formRow?.metadata ?? patchedMeta);
            }
            setHasPublishedVersion(true);
            await loadForms();
        } catch (e) {
            setBuilderErr(e instanceof Error ? e.message : "Publish failed");
        } finally {
            setPublishing(false);
        }
    };

    if (loadState === "loading") {
        return <div className="flex flex-1 items-center justify-center text-[12px] text-alloy-midnight/40">Loading form…</div>;
    }
    if (loadState === "error" || !schema) {
        return <div className="flex flex-1 items-center justify-center text-[12px] text-alloy-midnight/60">Couldn&apos;t load this form.</div>;
    }

    const sectionTitle = librarySectionId ? schema.sections.find((s) => s.id === librarySectionId)?.title : null;

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-alloy-stone" data-testid="processing-form-builder">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-alloy-midnight/[0.06] bg-white px-4 py-2.5" data-testid="surface-publish-toolbar">
                <button type="button" onClick={onBack} className="text-[12px] text-alloy-midnight/50 hover:text-alloy-midnight">
                    ← Forms
                </button>
                <span className="text-[14px] font-semibold text-alloy-midnight">{formMeta?.name || schema.title}</span>
                <span className="text-[10px] font-semibold text-alloy-midnight/55" data-surface-dirty={dirty ? "true" : "false"}>
                    {editVersionId ? (dirty ? "Draft · unsaved" : "Draft saved") : "Published (read-only)"}
                </span>
                <span className="flex-1" />
                <div className="flex rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.08] p-0.5">
                    {(["edit", "preview", "runtime"] as const).map((m) => (
                        <button
                            key={m}
                            type="button"
                            data-builder-mode-btn={m}
                            onClick={() => setMode(m)}
                            className={`rounded-md px-3 py-1 text-[11px] font-semibold ${
                                mode === m ? "bg-white text-alloy-midnight shadow-sm" : "text-alloy-midnight/50"
                            }`}
                        >
                            {m === "edit" ? "✎ Edit" : m === "preview" ? "▷ Preview" : "◎ Runtime"}
                        </button>
                    ))}
                </div>
                {editable ? (
                    <>
                        <button
                            type="button"
                            disabled={saving || !dirty}
                            onClick={() => void saveDraft()}
                            className="config-secondary-btn text-[11px] disabled:opacity-40"
                            data-testid="form-builder-save-draft"
                        >
                            {saving ? "Saving…" : "Save draft"}
                        </button>
                        <button
                            type="button"
                            disabled={publishing}
                            onClick={() => void publish()}
                            className="rounded-lg bg-alloy-bend-pine px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                            data-testid="form-builder-publish"
                        >
                            {publishing ? "Publishing…" : "Publish"}
                        </button>
                    </>
                ) : null}
            </div>

            {mode === "preview" ? (
                <div className="flex shrink-0 items-center gap-2 border-b border-alloy-midnight/[0.06] bg-alloy-midnight/[0.03] px-4 py-1.5 text-[11px] font-semibold text-alloy-midnight/55">
                    Preview — what families complete
                </div>
            ) : mode === "runtime" ? (
                <div className="flex shrink-0 items-center gap-2 border-b border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.05] px-4 py-1.5 text-[11px] font-semibold text-alloy-bend-pine">
                    Runtime — published structure
                </div>
            ) : null}

            {builderErr ? (
                <div className="shrink-0 border-b border-alloy-stone/20 bg-alloy-stone/[0.04] px-3 py-2 text-[11px] text-alloy-midnight/60">{builderErr}</div>
            ) : null}

            <div className="flex min-h-0 flex-1">
                <div className={`min-w-0 flex-[8] overflow-y-auto p-4 md:p-8 ${mode !== "edit" ? "bg-alloy-stone/[0.04]" : "bg-alloy-stone"}`}>
                    {mode === "preview" || mode === "runtime" ? (
                        <FormPreview schema={schema} branding={branding} runtime={mode === "runtime"} />
                    ) : (
                        <div className="mx-auto max-w-[780px] rounded-2xl bg-white px-8 py-8 shadow-[0_8px_40px_rgba(24,39,58,0.08)]">
                            <ProcessingFormCanvas
                                schema={schema}
                                selectedFieldId={selectedFieldId}
                                selectedSectionId={selectedSectionId}
                                editable={editable}
                                collapsedSectionIds={collapsedSections}
                                onToggleSectionCollapse={(sectionId) => {
                                    setCollapsedSections((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(sectionId)) next.delete(sectionId);
                                        else next.add(sectionId);
                                        return next;
                                    });
                                }}
                                onSelectField={(id) => {
                                    setSelectedFieldId(id);
                                    setSelectedSectionId(null);
                                }}
                                onSelectSection={(id) => {
                                    setSelectedSectionId(id);
                                    setSelectedFieldId(null);
                                }}
                                onAddQuestion={openLibrary}
                                onAddSection={() => setSectionDialogOpen(true)}
                                dragFieldId={dragFieldId}
                                dropTarget={dropTarget}
                                onDragFieldStart={setDragFieldId}
                                onDragFieldOver={setDropTarget}
                                onDragFieldDrop={handleDragDrop}
                                onSectionDragOver={(sectionId) =>
                                    setDropTarget({ sectionId, fieldId: null, position: "after", rowIntent: "new-line" })
                                }
                            />
                        </div>
                    )}
                </div>

                {mode === "edit" ? (
                    <aside
                        className="flex min-w-[280px] max-w-[320px] flex-[2] shrink-0 flex-col overflow-y-auto border-l border-alloy-midnight/[0.06] bg-white px-4 py-2"
                        data-surface-inspector="true"
                    >
                        <div>
                        <BrandingInspectorCard
                            schemaTitle={schema.title}
                            branding={branding}
                            editable={editable}
                            open={inspectorSection === "branding"}
                            onOpenChange={(open) => open && setInspectorSection("branding")}
                            onTitleChange={(title) => {
                                setSchema((cur) => (cur ? { ...cur, title } : cur));
                                setDirty(true);
                            }}
                            onBrandingChange={(patch) => {
                                setBranding((b) => ({ ...b, ...patch }));
                                setDirty(true);
                            }}
                        />
                        <ProcessingFormDistributionPanel
                            formId={formId}
                            formKey={formMeta?.key ?? formId}
                            formName={formMeta?.name || schema.title}
                            hasPublishedVersion={hasPublishedVersion}
                            existingMeta={formMetaSnapshot}
                            canMutate={editable || hasPublishedVersion}
                            listPublicLinks={listPublicLinks}
                            loadPublishedVersionId={loadPublishedVersionId}
                            mintProcessingPublicLink={mintProcessingPublicLink}
                            unpublishProcessingPublicLinks={unpublishProcessingPublicLinks}
                            onPublishRepublish={editable ? () => publish() : undefined}
                            publishBusy={publishing}
                            publishJustSucceeded={publishJustSucceeded}
                        />
                        {selectedField ? (
                            <div data-surface-composer-inspector="field">
                                <ProcessingCollapsibleInspectorSection
                                    title="Question"
                                    subtitle="Label, type, and help text"
                                    open={inspectorSection === "question"}
                                    onOpenChange={(open) => open && setInspectorSection("question")}
                                    accent
                                >
                                    <div className="space-y-3">
                                <div>
                                    <p className="config-typo-sublabel mb-1">Display as</p>
                                    {editable ? (
                                        <input
                                            type="text"
                                            value={selectedField.label}
                                            onChange={(e) => mutate((s) => updateField(s, selectedField.id, { label: e.target.value }))}
                                            className="w-full rounded-md border border-alloy-stone/20 px-2 py-1.5 text-sm"
                                            data-inspector-field-label
                                            data-testid="form-builder-field-label"
                                        />
                                    ) : (
                                        <p className="text-sm font-medium">{selectedField.label}</p>
                                    )}
                                </div>
                                <div>
                                    <p className="config-typo-sublabel mb-1">Question type</p>
                                    <p className="text-[12px] text-alloy-midnight/70">{typeLabel(selectedField)}</p>
                                </div>
                                {editable && selectedField.type !== "text_block" ? (
                                    <label className="flex items-center gap-2 text-[12px]">
                                        <input
                                            type="checkbox"
                                            checked={selectedField.required}
                                            onChange={(e) => mutate((s) => updateField(s, selectedField.id, { required: e.target.checked }))}
                                        />
                                        Required
                                    </label>
                                ) : null}
                                {selectedField.type === "text_block" ? (
                                    <div data-inspector-text-block className="rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.05] p-3">
                                        <p className="config-typo-sublabel mb-1">Inline text</p>
                                        <textarea
                                            value={selectedField.content}
                                            disabled={!editable}
                                            onChange={(e) => mutate((s) => updateField(s, selectedField.id, { content: e.target.value }))}
                                            className="w-full resize-none rounded-md border border-alloy-stone/20 bg-white px-2 py-1.5 text-[12px]"
                                            rows={4}
                                            data-testid="form-builder-text-block-content"
                                        />
                                        <p className="mt-2 text-[10px] leading-snug text-alloy-midnight/45">
                                            Insert Alloy tokens into authorization language. Preview renders them as placeholders.
                                        </p>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {PROCESSING_BUILDER_CANONICAL_FIELDS.slice(0, 8).map((token) => (
                                                <button
                                                    key={token.id}
                                                    type="button"
                                                    disabled={!editable}
                                                    className="rounded-full border border-alloy-bend-pine/20 bg-white px-2 py-1 text-[10px] font-semibold text-alloy-bend-pine hover:bg-alloy-bend-pine/[0.06]"
                                                    onClick={() => {
                                                        const label = token.pickerLabel.replace(/^Child /, "Child ").replace(/^Parent \/ guardian /, "Primary contact ");
                                                        const nextContent = `${selectedField.content || ""}${selectedField.content ? " " : ""}{${label}}`;
                                                        const nextTokens = Array.from(new Set([...(selectedField.token_ids ?? []), token.id]));
                                                        mutate((s) => updateField(s, selectedField.id, { content: nextContent, token_ids: nextTokens }));
                                                    }}
                                                >
                                                    {token.pickerLabel}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                                <div>
                                    <p className="config-typo-sublabel mb-1">Help text</p>
                                    {editable ? (
                                        <textarea
                                            value={selectedField.description ?? ""}
                                            onChange={(e) => mutate((s) => updateField(s, selectedField.id, { description: e.target.value }))}
                                            className="w-full rounded-md border border-alloy-stone/20 px-2 py-1.5 text-sm"
                                            rows={2}
                                        />
                                    ) : (
                                        <p className="text-[12px] text-alloy-midnight/60">{selectedField.description || "—"}</p>
                                    )}
                                </div>
                                    </div>
                                </ProcessingCollapsibleInspectorSection>
                                <ProcessingCollapsibleInspectorSection
                                    title="Layout"
                                    subtitle="Section and row placement"
                                    open={inspectorSection === "layout"}
                                    onOpenChange={(open) => open && setInspectorSection("layout")}
                                >
                                    <div className="space-y-3">
                                <div data-inspector-section>
                                    <p className="config-typo-sublabel mb-1">Section</p>
                                    <p className="mb-2 text-[10px] leading-snug text-alloy-midnight/45">Section chooses where the field appears on the surface.</p>
                                    <div className="flex flex-wrap gap-1">
                                        {schema.sections.map((sec) => (
                                            <button
                                                key={sec.id}
                                                type="button"
                                                disabled={!editable}
                                                onClick={() => mutate((s) => moveFieldBetweenSections(s, selectedField.id, sec.id))}
                                                className={`rounded-md border px-2 py-1 text-[11px] font-medium ${
                                                    schema.sections.find((s) => s.field_ids.includes(selectedField.id))?.id === sec.id
                                                        ? "border-alloy-bend-pine/40 bg-alloy-bend-pine/[0.08] text-alloy-bend-pine"
                                                        : "border-alloy-stone/20 text-alloy-midnight/70"
                                                }`}
                                                data-inspector-section-option={sec.id}
                                            >
                                                {sec.title}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {selectedField.type !== "text_block" ? (
                                <div data-inspector-placement className="rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.06] p-3">
                                    <p className="config-typo-sublabel mb-1">How should this sit?</p>
                                    <p className="mb-2 text-[10px] leading-snug text-alloy-midnight/50">
                                        Same line places this question beside the one above. New line starts a fresh row.
                                    </p>
                                    <div className="grid gap-1.5">
                                        {(Object.keys(SURFACE_FIELD_PLACEMENT_LABELS) as SurfaceFieldPlacementMode[]).map((pm) => {
                                            const rowPlacement: FormRowPlacement = pm === "same-line" ? "same-line" : "new-line-below";
                                            const active = placementFromField(selectedField) === rowPlacement;
                                            return (
                                                <button
                                                    key={pm}
                                                    type="button"
                                                    disabled={!editable}
                                                    onClick={() => mutate((s) => setFieldPlacement(s, selectedField.id, rowPlacement))}
                                                    className={`rounded-md border px-3 py-2 text-left text-[12px] font-semibold ${
                                                        active
                                                            ? "border-alloy-bend-pine/45 bg-white text-alloy-bend-pine shadow-sm"
                                                            : "border-alloy-stone/20 bg-white text-alloy-midnight/70 hover:border-alloy-bend-pine/25"
                                                    }`}
                                                    data-inspector-placement-option={pm}
                                                    data-testid={`form-builder-placement-${pm}`}
                                                >
                                                    <span className="block">{SURFACE_FIELD_PLACEMENT_LABELS[pm]}</span>
                                                    <span className="mt-0.5 block text-[10px] font-medium text-alloy-midnight/40">
                                                        {pm === "same-line" ? "First name | Last name" : "Full width below"}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                ) : null}
                                    </div>
                                </ProcessingCollapsibleInspectorSection>
                                {selectedField.type !== "text_block" ? (
                                <ProcessingCollapsibleInspectorSection
                                    title="Destination"
                                    subtitle="Where answers are stored"
                                    open={inspectorSection === "destination"}
                                    onOpenChange={(open) => open && setInspectorSection("destination")}
                                >
                                <div data-inspector-destination>
                                    <p className="config-typo-sublabel mb-1">Where should this answer go?</p>
                                    {editable ? (
                                        <select
                                            value={storeValueFromField(selectedField)}
                                            onChange={(e) =>
                                                mutate((s) => {
                                                    const field = s.fields.find((f) => f.id === selectedField.id);
                                                    if (!field) return s;
                                                    const fs = fieldSourceForDestination(field, e.target.value);
                                                    return updateField(s, selectedField.id, { field_source: fs });
                                                })
                                            }
                                            className="w-full rounded-md border border-alloy-stone/20 px-2 py-1.5 text-sm"
                                            data-testid="form-builder-destination"
                                        >
                                            {STORE_OPTIONS.map((o) => (
                                                <option key={o.value} value={o.value}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <p className="text-[12px] font-medium">{destinationLabel(selectedField)}</p>
                                    )}
                                </div>
                                </ProcessingCollapsibleInspectorSection>
                                ) : null}
                                <ProcessingCollapsibleInspectorSection
                                    title="Advanced"
                                    subtitle="Field source and reorder"
                                    open={inspectorSection === "advanced"}
                                    onOpenChange={(open) => open && setInspectorSection("advanced")}
                                >
                                <details className="text-[11px] text-alloy-midnight/45" open={showAdvanced} onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}>
                                    <summary className="sr-only">Advanced</summary>
                                    <p className="font-mono text-[10px]">
                                        {selectedField.field_source
                                            ? `${selectedField.field_source.entity_type}.${selectedField.field_source.field_key}`
                                            : "processing_only"}
                                    </p>
                                </details>
                                <div data-inspector-field-list className="mt-3">
                                    <details className="text-[11px] text-alloy-midnight/45">
                                        <summary className="cursor-pointer font-semibold text-alloy-midnight/60">Reorder</summary>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                disabled={!editable}
                                                className="config-secondary-btn text-xs"
                                                data-inspector-move-earlier
                                                data-testid="form-builder-move-earlier"
                                                onClick={() => mutate((s) => moveFieldWithinSection(s, selectedField.id, -1))}
                                            >
                                                Earlier
                                            </button>
                                            <button
                                                type="button"
                                                disabled={!editable}
                                                className="config-secondary-btn text-xs"
                                                data-inspector-move-later
                                                data-testid="form-builder-move-later"
                                                onClick={() => mutate((s) => moveFieldWithinSection(s, selectedField.id, 1))}
                                            >
                                                Later
                                            </button>
                                        </div>
                                    </details>
                                    <button
                                        type="button"
                                        disabled={!editable}
                                        className="mt-3 text-[11px] font-semibold text-rose-600"
                                        data-inspector-remove
                                        onClick={() => {
                                            mutate((s) => removeField(s, selectedField.id));
                                            setSelectedFieldId(null);
                                        }}
                                    >
                                        Remove question
                                    </button>
                                </div>
                                </ProcessingCollapsibleInspectorSection>
                            </div>
                        ) : selectedSection ? (
                            <div className="space-y-3" data-surface-composer-inspector="section">
                                <ProcessingCollapsibleInspectorSection title="Section" subtitle="Title and questions" defaultOpen accent>
                                <div>
                                    <p className="config-typo-sublabel mb-1">Section title</p>
                                    {editable ? (
                                        <input
                                            type="text"
                                            value={selectedSection.title}
                                            onChange={(e) => mutate((s) => renameSection(s, selectedSection.id, e.target.value))}
                                            className="w-full rounded-md border border-alloy-stone/20 px-2 py-1.5 text-sm"
                                        />
                                    ) : (
                                        <p className="text-sm font-medium">{selectedSection.title}</p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    disabled={!editable}
                                    className="config-secondary-btn w-full text-xs"
                                    onClick={() => openLibrary(selectedSection.id)}
                                >
                                    + Add question to {selectedSection.title}
                                </button>
                                </ProcessingCollapsibleInspectorSection>
                                {editable ? (
                                <ProcessingCollapsibleInspectorSection title="Advanced" defaultOpen={false}>
                                    <button
                                        type="button"
                                        className="text-[11px] font-semibold text-rose-600"
                                        onClick={() => {
                                            mutate((s) => removeSection(s, selectedSection.id));
                                            setSelectedSectionId(null);
                                        }}
                                    >
                                        Remove section
                                    </button>
                                </ProcessingCollapsibleInspectorSection>
                                ) : null}
                            </div>
                        ) : (
                            <div className="space-y-3" data-surface-inspector-empty="true">
                                <ProcessingInspectorCard
                                    title="Canvas"
                                    subtitle="Select a question to edit its label, layout, and where the answer should go."
                                >
                                    <p className="text-[12px] leading-relaxed text-alloy-midnight/55">
                                        Click any question or section on the canvas. Drag questions beside each other to create a row.
                                    </p>
                                </ProcessingInspectorCard>
                            </div>
                        )}
                        </div>
                    </aside>
                ) : null}
            </div>

            {libraryOpen && editable ? (
                <ProcessingFormBuilderLibraryPanel
                    open={libraryOpen}
                    sectionLabel={`Add to ${sectionTitle ?? "section"}`}
                    questionTypes={libraryQuestionTypes}
                    questionCategoryLabels={CATEGORY_LABELS}
                    onPickQuestionType={addQuestion}
                    onPickCanonicalField={addCanonicalField}
                    onClose={() => setLibraryOpen(false)}
                />
            ) : null}
            <ProcessingSectionNameDialog
                open={sectionDialogOpen}
                onClose={() => setSectionDialogOpen(false)}
                onContinue={(title) => {
                    const r = addSection(schema, title);
                    setSchema(r.schema);
                    setSelectedSectionId(r.sectionId);
                    setSelectedFieldId(null);
                    setDirty(true);
                    setSectionDialogOpen(false);
                }}
            />
        </div>
    );
}

function FormPreview({
    schema,
    branding,
    runtime,
}: {
    schema: FormSchemaV1;
    branding: ProcessingFormBranding;
    runtime: boolean;
}) {
    const fieldById = useMemo(() => new Map(schema.fields.map((f) => [f.id, f])), [schema.fields]);
    const accent = branding.accent_color || DEFAULT_FORM_ACCENT;
    return (
        <div className="mx-auto max-w-[560px] space-y-5" data-testid="form-builder-preview">
            <ProcessingFormBrandedHeader title={schema.title} branding={branding} runtime={runtime} />
            <div className="rounded-2xl border border-alloy-stone/15 bg-white p-6 shadow-sm">
            <div className="space-y-6">
                {schema.sections.map((section) => {
                    const rows = groupFieldsIntoRows(section.field_ids, fieldById);
                    return (
                        <section key={section.id}>
                            <h3 className="text-[13px] font-bold text-alloy-midnight">{section.title}</h3>
                            <div className="mt-3 space-y-3">
                                {rows.map((row, rowIdx) => (
                                    <div key={`${section.id}-row-${rowIdx}`} className="flex flex-wrap gap-3" data-testid={`form-preview-row-${section.id}-${rowIdx}`}>
                                        {row.map((fid) => {
                                            const field = fieldById.get(fid);
                                            if (!field) return null;
                                            const half = field.layout_width === "half";
                                            return (
                                                <div
                                                    key={fid}
                                                    className={half ? "min-w-[calc(50%-0.375rem)] flex-[1_1_calc(50%-0.375rem)]" : "w-full flex-[1_1_100%]"}
                                                >
                                                    {field.type === "text_block" ? (
                                                        <div className="rounded-xl border border-alloy-stone/15 bg-alloy-stone/[0.05] px-4 py-3 text-[13px] leading-relaxed text-alloy-midnight/70">
                                                            <PreviewTokenText value={field.content} />
                                                        </div>
                                                    ) : (
                                                        <label className="block text-[12px] font-semibold">
                                                            {field.label}
                                                            {field.required ? <span className="text-rose-600"> *</span> : null}
                                                        </label>
                                                    )}
                                                    {field.type === "signature" ? (
                                                        <div className="mt-1 flex h-14 items-center justify-center rounded-lg border border-dashed border-alloy-stone/30 text-[11px] text-alloy-midnight/40">
                                                            Sign here
                                                        </div>
                                                    ) : field.type !== "text_block" ? (
                                                        <input type="text" className="mt-1 w-full rounded-lg border border-alloy-stone/20 px-3 py-2 text-[13px]" placeholder="" readOnly />
                                                    ) : null}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </section>
                    );
                })}
            </div>
            <button
                type="button"
                className="mt-8 w-full rounded-lg py-3 text-[13px] font-semibold text-white"
                style={{ backgroundColor: accent }}
            >
                Submit
            </button>
            </div>
        </div>
    );
}

function PreviewTokenText({ value }: { value: string }) {
    const parts = (value || "Authorization language").split(/(\{[^}]+\})/g).filter(Boolean);
    return (
        <>
            {parts.map((part, idx) =>
                part.startsWith("{") && part.endsWith("}") ? (
                    <span
                        key={`${part}-${idx}`}
                        className="mx-1 inline-flex rounded-full border border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.08] px-2 py-0.5 text-[11px] font-semibold text-alloy-bend-pine"
                    >
                        {part.slice(1, -1)}
                    </span>
                ) : (
                    <span key={`${part}-${idx}`}>{part}</span>
                )
            )}
        </>
    );
}

function BrandingInspectorCard({
    schemaTitle,
    branding,
    editable,
    open,
    onOpenChange,
    onTitleChange,
    onBrandingChange,
}: {
    schemaTitle: string;
    branding: ProcessingFormBranding;
    editable: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onTitleChange: (title: string) => void;
    onBrandingChange: (patch: Partial<ProcessingFormBranding>) => void;
}) {
    return (
        <ProcessingCollapsibleInspectorSection
            title="Branding"
            subtitle="Logo, colors, and parent-facing identity"
            accent
            open={open}
            onOpenChange={onOpenChange}
            testId="form-builder-branding-card"
        >
            {editable ? (
                <div className="space-y-3">
                    <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-alloy-midnight/60">Form name</span>
                        <input
                            type="text"
                            value={schemaTitle}
                            onChange={(e) => onTitleChange(e.target.value)}
                            className="w-full rounded-md border border-alloy-stone/20 px-2.5 py-1.5 text-[12px]"
                            data-testid="form-builder-form-name"
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-alloy-midnight/60">Description</span>
                        <textarea
                            value={branding.description}
                            onChange={(e) => onBrandingChange({ description: e.target.value })}
                            rows={2}
                            className="w-full resize-none rounded-md border border-alloy-stone/20 px-2.5 py-1.5 text-[12px]"
                            data-testid="form-builder-brand-description"
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-alloy-midnight/60">School / brand name</span>
                        <input
                            type="text"
                            value={branding.brand_name}
                            onChange={(e) => onBrandingChange({ brand_name: e.target.value })}
                            className="w-full rounded-md border border-alloy-stone/20 px-2.5 py-1.5 text-[12px]"
                            data-testid="form-builder-brand-name"
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-alloy-midnight/60">Accent color</span>
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                value={branding.accent_color || DEFAULT_FORM_ACCENT}
                                onChange={(e) => onBrandingChange({ accent_color: e.target.value })}
                                className="h-9 w-10 cursor-pointer rounded border border-alloy-stone/20 p-0.5"
                                data-testid="form-builder-accent-color"
                            />
                            <span className="font-mono text-[11px] uppercase text-alloy-midnight/50">
                                {branding.accent_color || DEFAULT_FORM_ACCENT}
                            </span>
                        </div>
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-alloy-midnight/60">Logo URL or placeholder</span>
                        <input
                            type="text"
                            value={branding.logo_url ?? ""}
                            onChange={(e) => onBrandingChange({ logo_url: e.target.value.trim() || null })}
                            placeholder="https://… or leave blank for initials"
                            className="w-full rounded-md border border-alloy-stone/20 px-2.5 py-1.5 text-[12px]"
                            data-testid="form-builder-logo-url"
                        />
                    </label>
                </div>
            ) : (
                <p className="text-[12px] text-alloy-midnight/60">{branding.brand_name || "No brand name set"}</p>
            )}
        </ProcessingCollapsibleInspectorSection>
    );
}
