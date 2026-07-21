"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
    reorderField,
    reorderFieldAfter,
    setFieldLayoutWidth,
    fieldLayoutFlexClass,
} from "@/lib/forms/formRowComposition";
import {
    resolveProcessingBuilderRegistryEntry,
    type ProcessingBuilderCanonicalField,
} from "@/lib/forms/processingFormBuilderLibrary";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import ProcessingFormBuilderLibraryPanel from "./ProcessingFormBuilderLibraryPanel";
import ProcessingFormBrandedHeader from "./ProcessingFormBrandedHeader";
import ProcessingFormCanvas, { type CanvasDropTarget } from "./ProcessingFormCanvas";
import ProcessingFormDistributionPanel from "./ProcessingFormDistributionPanel";
import ProcessingFormPublishedBar from "./ProcessingFormPublishedBar";
import ProcessingFormQuestionInspector from "./ProcessingFormQuestionInspector";
import ProcessingInspectorCard from "./ProcessingInspectorCard";
import ProcessingCollapsibleInspectorSection from "./ProcessingCollapsibleInspectorSection";
import ProcessingSectionNameDialog from "./ProcessingSectionNameDialog";
import type { ProcessingFormRow, ProcessingFormPublicLinkRow } from "./useProcessingFormApi";
import { useProcessingFormApi } from "./useProcessingFormApi";
import { DEFAULT_FORM_ACCENT, parseFormBranding, type ProcessingFormBranding } from "@/lib/forms/processingFormBranding";
import { FormOperationalIntentPicker } from "@/components/forms/admin/FormOperationalIntentPicker";
import { FormOutcomeConfigPanel } from "@/components/forms/admin/FormOutcomeConfigPanel";
import { FormLifecycleUsagePanel } from "@/components/forms/admin/FormLifecycleUsagePanel";
import { FormLocationShareLinksPanel } from "@/components/forms/admin/FormLocationShareLinksPanel";
import { FormExistingRecordSendPanel } from "@/components/forms/admin/FormExistingRecordSendPanel";
import { distributionIsPreviewLink, type DistributionLinkRow } from "@/lib/forms/distributionPresentation";
import type { FormPublicLinkRow } from "@/components/forms/workspace/FormDistributionPanel";

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

export default function ProcessingFormBuilder({
    formId,
    formMeta,
    initialFormName = null,
    onBack,
}: {
    formId: string;
    formMeta: ProcessingFormRow | null;
    initialFormName?: string | null;
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
    const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());
    const [branding, setBranding] = useState<ProcessingFormBranding>(() =>
        parseFormBranding(formMeta)
    );
    const [formMetaSnapshot, setFormMetaSnapshot] = useState<Record<string, unknown>>(formMeta?.metadata ?? {});
    const [links, setLinks] = useState<ProcessingFormPublicLinkRow[]>([]);
    const [hasPublishedVersion, setHasPublishedVersion] = useState(Boolean(formMeta?.has_published_version));
    const [publishJustSucceeded, setPublishJustSucceeded] = useState(false);

    const [inspectorSection, setInspectorSection] = useState<string>(hasPublishedVersion ? "distribution" : "branding");

    const displayFormName = formMeta?.name?.trim() || initialFormName?.trim() || schema?.title || "Untitled form";

    useEffect(() => {
        setHasPublishedVersion(Boolean(formMeta?.has_published_version));
    }, [formMeta?.has_published_version]);

    useEffect(() => {
        if (publishJustSucceeded) setInspectorSection("distribution");
    }, [publishJustSucceeded]);

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

    const reloadLinks = useCallback(async () => {
        try {
            setLinks(await listPublicLinks(formId));
        } catch {
            /* non-fatal */
        }
    }, [listPublicLinks, formId]);

    useEffect(() => {
        void reloadLinks();
    }, [reloadLinks]);

    const onFormMetadataUpdated = useCallback(
        (metadata: Record<string, unknown>) => setFormMetaSnapshot(metadata),
        []
    );
    const onLinkMetadataSaved = useCallback(
        (linkId: string, metadata: Record<string, unknown>) =>
            setLinks((prev) => prev.map((l) => (l.id === linkId ? { ...l, metadata } : l))),
        []
    );
    const onCopy = useCallback((_key: string, text: string) => {
        void navigator.clipboard?.writeText(text);
    }, []);
    const onCreateLocationLink = useCallback(
        async ({ locationId, locationName }: { locationId: string; locationName: string }) => {
            const pv = await loadPublishedVersionId(formId);
            await mintProcessingPublicLink(formId, {
                formName: displayFormName,
                formKey: formMeta?.key ?? formId,
                existingMeta: formMetaSnapshot,
                publishedVersionId: pv,
                locationId,
                locationName,
            });
            await reloadLinks();
        },
        [loadPublishedVersionId, mintProcessingPublicLink, formId, displayFormName, formMeta?.key, formMetaSnapshot, reloadLinks]
    );

    const activeLink = useMemo(
        () => links.find((l) => l.is_active && !distributionIsPreviewLink(l)) ?? links[0] ?? null,
        [links]
    );
    const selectedLinkId = activeLink?.id ?? null;
    const selectedLinkMetadata = activeLink?.metadata ?? null;
    const hasOperationalLink = links.length > 0;
    const outcomeLinks = useMemo<DistributionLinkRow[]>(
        () => links.map((l) => ({ id: l.id, is_active: l.is_active, created_at: l.created_at ?? "", metadata: l.metadata })),
        [links]
    );
    const locationLinks = useMemo<FormPublicLinkRow[]>(
        () =>
            links.map((l) => ({
                id: l.id,
                is_active: l.is_active,
                created_at: l.created_at ?? "",
                metadata: l.metadata,
                token_prefix: l.token_prefix,
                pinned_form_definition_version_id: l.pinned_form_definition_version_id,
            })),
        [links]
    );

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
        next = setFieldLayoutWidth(next, dragFieldId, dropTarget.rowIntent === "same-line" ? "half" : "full");
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
            await loadForms({ force: true });
            await reloadLinks();
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
                <span className="text-[14px] font-semibold text-alloy-midnight">{displayFormName}</span>
                <span className="text-[10px] font-semibold text-alloy-midnight/55" data-surface-dirty={dirty ? "true" : "false"}>
                    {hasPublishedVersion ? (
                        <span className="text-alloy-bend-pine" data-testid="form-builder-published-badge">Published</span>
                    ) : editVersionId ? (
                        dirty ? "Draft · unsaved" : "Draft saved"
                    ) : (
                        "Published (read-only)"
                    )}
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
                        {!hasPublishedVersion ? (
                            <button
                                type="button"
                                disabled={publishing}
                                onClick={() => void publish()}
                                className="rounded-lg bg-alloy-bend-pine px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                                data-testid="form-builder-publish"
                            >
                                {publishing ? "Publishing…" : "Publish"}
                            </button>
                        ) : null}
                    </>
                ) : null}
            </div>

            {hasPublishedVersion ? (
                <ProcessingFormPublishedBar
                    formId={formId}
                    formKey={formMeta?.key ?? formId}
                    formName={displayFormName}
                    existingMeta={formMetaSnapshot}
                    listPublicLinks={listPublicLinks}
                    onManageDistribution={() => setInspectorSection("distribution")}
                    onRepublish={editable ? () => void publish() : undefined}
                    onBackToForms={onBack}
                    republishBusy={publishing}
                />
            ) : null}

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
                        <p
                            className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/40"
                            data-testid="processing-builder-inspector-header"
                        >
                            {selectedField ? "Question" : selectedSection ? "Section" : "Form settings"}
                        </p>
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
                            formName={displayFormName}
                            hasPublishedVersion={hasPublishedVersion}
                            existingMeta={formMetaSnapshot}
                            canMutate={editable || hasPublishedVersion}
                            onBackToForms={onBack}
                            listPublicLinks={listPublicLinks}
                            loadPublishedVersionId={loadPublishedVersionId}
                            mintProcessingPublicLink={mintProcessingPublicLink}
                            unpublishProcessingPublicLinks={unpublishProcessingPublicLinks}
                            onPublishRepublish={editable ? () => publish() : undefined}
                            publishBusy={publishing}
                            publishJustSucceeded={publishJustSucceeded}
                            defaultOpen={hasPublishedVersion || publishJustSucceeded}
                            open={inspectorSection === "distribution"}
                            onOpenChange={(open) => open && setInspectorSection("distribution")}
                        />
                        <ProcessingCollapsibleInspectorSection
                            title="Purpose"
                            subtitle="What this form is used for"
                            open={inspectorSection === "purpose"}
                            onOpenChange={(open) => open && setInspectorSection("purpose")}
                        >
                            <FormOperationalIntentPicker
                                formId={formId}
                                formKey={formMeta?.key ?? formId}
                                formMetadata={formMetaSnapshot}
                                selectedLinkId={selectedLinkId}
                                selectedLinkMetadata={selectedLinkMetadata}
                                canMutate={editable || hasPublishedVersion}
                                hasOperationalLink={hasOperationalLink}
                                onFormMetadataUpdated={onFormMetadataUpdated}
                                onLinkMetadataSaved={onLinkMetadataSaved}
                            />
                        </ProcessingCollapsibleInspectorSection>
                        <ProcessingCollapsibleInspectorSection
                            title="Outcome"
                            subtitle="What happens after submit"
                            open={inspectorSection === "outcome"}
                            onOpenChange={(open) => open && setInspectorSection("outcome")}
                        >
                            <FormOutcomeConfigPanel
                                formId={formId}
                                formMetadata={formMetaSnapshot}
                                links={outcomeLinks}
                                formKey={formMeta?.key ?? formId}
                                documentGenerationConfigured={false}
                                canMutate={editable || hasPublishedVersion}
                                onLinkMetadataSaved={onLinkMetadataSaved}
                            />
                        </ProcessingCollapsibleInspectorSection>
                        <ProcessingCollapsibleInspectorSection
                            title="Lifecycle usage"
                            subtitle="Which stage this form serves"
                            open={inspectorSection === "lifecycle"}
                            onOpenChange={(open) => open && setInspectorSection("lifecycle")}
                        >
                            <FormLifecycleUsagePanel
                                formId={formId}
                                formMetadata={formMetaSnapshot}
                                canMutate={editable || hasPublishedVersion}
                                hasSchema={Boolean(schema && schema.fields.length > 0)}
                                onFormMetadataUpdated={onFormMetadataUpdated}
                            />
                        </ProcessingCollapsibleInspectorSection>
                        <ProcessingCollapsibleInspectorSection
                            title="Share by location"
                            subtitle="Per-site links"
                            open={inspectorSection === "locations"}
                            onOpenChange={(open) => open && setInspectorSection("locations")}
                        >
                            <FormLocationShareLinksPanel
                                formId={formId}
                                formName={displayFormName}
                                links={locationLinks}
                                hasPublished={hasPublishedVersion}
                                canMutate={editable || hasPublishedVersion}
                                onCopy={onCopy}
                                onCreateLocationLink={onCreateLocationLink}
                            />
                        </ProcessingCollapsibleInspectorSection>
                        <ProcessingCollapsibleInspectorSection
                            title="Send to existing record"
                            subtitle="Attach to a known family"
                            open={inspectorSection === "existing"}
                            onOpenChange={(open) => open && setInspectorSection("existing")}
                        >
                            <FormExistingRecordSendPanel
                                formId={formId}
                                formName={displayFormName}
                                canMutate={editable || hasPublishedVersion}
                            />
                        </ProcessingCollapsibleInspectorSection>
                        {selectedField ? (
                            <ProcessingFormQuestionInspector
                                field={selectedField}
                                schema={schema}
                                editable={editable}
                                mutate={mutate}
                                onRemove={() => {
                                    mutate((s) => removeField(s, selectedField.id));
                                    setSelectedFieldId(null);
                                }}
                                onOpenDistribution={() => setInspectorSection("distribution")}
                            />
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
                                            const width =
                                                field.layout_width === "half" ||
                                                field.layout_width === "third" ||
                                                field.layout_width === "quarter"
                                                    ? field.layout_width
                                                    : "full";
                                            return (
                                                <div key={fid} className={fieldLayoutFlexClass(width)}>
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
