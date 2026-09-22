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
import {
    registryEntryForOffer,
    type ProcessingLibraryFieldOffer,
    type ProcessingLibraryGroupOffer,
} from "@/lib/forms/processingFormFieldLibrary";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import ProcessingFormBuilderLibraryPanel from "./ProcessingFormBuilderLibraryPanel";
import ProcessingFormBrandedHeader from "./ProcessingFormBrandedHeader";
import ProcessingFormCanvas, { type CanvasDropTarget } from "./ProcessingFormCanvas";
import ProcessingPdfCanvas from "./ProcessingPdfCanvas";
import ProcessingFormDistributionPanel from "./ProcessingFormDistributionPanel";
import ProcessingFormPublishedBar from "./ProcessingFormPublishedBar";
import ProcessingFormQuestionInspector from "./ProcessingFormQuestionInspector";
import ProcessingCollapsibleInspectorSection from "./ProcessingCollapsibleInspectorSection";
import ProcessingSectionNameDialog from "./ProcessingSectionNameDialog";
import type { ProcessingFormRow, ProcessingFormPublicLinkRow } from "./useProcessingFormApi";
import { useProcessingFormApi } from "./useProcessingFormApi";
import { DEFAULT_FORM_ACCENT, parseFormBranding, type ProcessingFormBranding } from "@/lib/forms/processingFormBranding";
import { FormOperationalIntentPicker } from "@/components/forms/admin/FormOperationalIntentPicker";
import { FormOutcomeConfigPanel } from "@/components/forms/admin/FormOutcomeConfigPanel";
import { FormLifecycleUsagePanel } from "@/components/forms/admin/FormLifecycleUsagePanel";
import { FormQueueFolderPanel } from "@/components/forms/admin/FormQueueFolderPanel";
import { FormLocationShareLinksPanel } from "@/components/forms/admin/FormLocationShareLinksPanel";
import { FormExistingRecordSendPanel } from "@/components/forms/admin/FormExistingRecordSendPanel";
import { BosExecutionLoader } from "@/components/admin/actions/BosExecutionLoader";
import {
    OPERATIONAL_INTENT_CATALOG,
    resolveEffectiveOperationalIntent,
} from "@/lib/forms/operationalIntentTemplates";
import { readFormLifecycleUsage } from "@/lib/forms/lifecycle/formLifecycleUsageMetadata";
import { LIFECYCLE_STAGE_LABELS } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { ENROLLMENT_PROCESS_DISPLAY_NAME } from "@/lib/lifecycle/businessProcessUiLabels";
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
    /*
     * Multi-select was in the builder's own type union and in the schema, and simply absent from
     * this menu — so a question the family may answer several ways could not be authored at all.
     */
    { type: "multiselect", label: "Choose multiple", meta: "Select any that apply", category: "choice" },
    { type: "signature", label: "Signature", meta: "Draw or type signature", category: "capture" },
    { type: "file_ref", label: "File upload", meta: "Attach a document", category: "capture" },
];

const CATEGORY_LABELS: Record<string, string> = {
    basic: "Basic",
    content: "Content",
    choice: "Choice",
    capture: "Capture",
};

/**
 * ONE OBJECT, ONE EDITOR.
 *
 * This bar has been wrong twice. It offered "Preview" and "Runtime", which rendered the same
 * component from the same schema and differed only in a header. Replacing them with "Structure" and
 * "Paperwork" fixed the lie but kept the deeper problem: both were REPRESENTATIONS of one Form, and
 * putting them side by side made the administrator translate between Alloy's internal boundaries to
 * do a single job. Kelly said it exactly — "Structure and Paperwork are the same thing to me. If I
 * am doing something on the form, I should be editing the one that looks like the actual form."
 *
 * So there is one editing surface. What it draws depends on what the Form actually IS:
 *
 *   a Form with a source document → the school's own paperwork, with its destinations selectable
 *   a Form with none             → its native visual layout
 *
 * Both answer a click the same way: the field is selected and the right inspector edits it. The
 * administrator never has to know which kind they have.
 *
 * Preview stays, as the other question an editor is asked — "what will this produce?" — and shows
 * whichever artifact is real for this Form.
 */
type BuilderMode = "edit" | "preview";

export default function ProcessingFormBuilder({
    formId,
    formMeta,
    initialFormName = null,
    initialMode = "edit",
    onBack,
}: {
    formId: string;
    formMeta: ProcessingFormRow | null;
    initialFormName?: string | null;
    /** A packet step's "Preview form" lands here directly, rather than on Edit. */
    initialMode?: BuilderMode;
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
    const [mode, setMode] = useState<BuilderMode>(initialMode);
    const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
    /**
     * Where this Form's questions live on its paperwork, when it has any.
     *
     * Decides which canvas the editor draws. `null` while unknown, so a source-backed Form does not
     * flash its native layout before the document arrives.
     */
    const [paperwork, setPaperwork] = useState<{
        source: boolean;
        regions: PaperworkRegionVM[];
        versionId: string | null;
    } | null>(null);

    useEffect(() => {
        let live = true;
        setPaperwork(null);
        void (async () => {
            try {
                const res = await fetch(`/api/admin/forms/${encodeURIComponent(formId)}/paperwork-regions`, {
                    credentials: "include",
                });
                const j = (await res.json().catch(() => ({}))) as {
                    data?: { source?: boolean; regions?: PaperworkRegionVM[]; usedVersionId?: string };
                };
                if (!live) return;
                setPaperwork({
                    source: j.data?.source === true,
                    regions: j.data?.regions ?? [],
                    versionId: j.data?.usedVersionId ?? null,
                });
            } catch {
                // A Form whose regions cannot be read is still edited — natively.
                if (live) setPaperwork({ source: false, regions: [], versionId: null });
            }
        })();
        return () => {
            live = false;
        };
    }, [formId]);
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
    const [fieldLibrary, setFieldLibrary] = useState<ProcessingLibraryGroupOffer[] | null>(null);
    /*
     * The organization's own vocabularies, so a closed question can join a list the tenant already
     * maintains instead of growing a private copy. Read once; nothing in the builder names one.
     */
    const [optionSets, setOptionSets] = useState<Array<{ set_key: string; label: string; item_count?: number }> | null>(null);

    const [inspectorSection, setInspectorSection] = useState<string>(hasPublishedVersion ? "distribution" : "form");

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
        // Open on the form-configuration rail (Form · Purpose · Business Process · …), not a
        // pre-selected section — the rail is the primary inspector; a section/question editor
        // only takes over when the operator clicks one on the canvas.
        setSelectedSectionId(null);
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

    // Stage-derived field library. Comes from the lifecycle-coverage payload so the picker offers
    // the same vocabulary `/process → requirements` can require — including org custom fields.
    // A failure leaves it null and the panel falls back to the curated list rather than emptying.

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch("/api/admin/option-sets", { credentials: "include" });
                if (!res.ok) return;
                /*
                 * `GET /api/admin/option-sets` answers `{ option_sets: [...] }`.
                 *
                 * This read looked for `data` and for a bare array, so it matched neither and
                 * quietly resolved to an empty list — every catch swallowed, no error anywhere. The
                 * vocabulary selector therefore offered "This form's own list" and nothing else on
                 * every form in the product, while a question already bound to a vocabulary showed
                 * its raw key (`person_gender`) because no option existed to give it a name.
                 *
                 * All three shapes are accepted now so the reader cannot be broken again by the
                 * envelope alone.
                 */
                type OptionSetRow = { set_key: string; label: string; item_count?: number };
                const body = (await res.json()) as
                    | { option_sets?: OptionSetRow[]; data?: OptionSetRow[] }
                    | OptionSetRow[];
                const rows = Array.isArray(body) ? body : (body.option_sets ?? body.data ?? []);
                if (!cancelled) setOptionSets(rows);
            } catch {
                /* A form is still fully authorable without the vocabulary list; the selector simply
                   offers "This form's own list" alone. */
            }
        })();
        return () => { cancelled = true; };
    }, []);
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch(
                    `/api/admin/forms/${encodeURIComponent(formId)}/lifecycle-coverage`,
                    { credentials: "include" }
                );
                if (!res.ok || cancelled) return;
                const json = (await res.json()) as {
                    data?: { field_library?: ProcessingLibraryGroupOffer[] };
                };
                if (!cancelled) setFieldLibrary(json.data?.field_library ?? null);
            } catch {
                /* keep the curated fallback */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [formId, formMetaSnapshot]);

    const onFormMetadataUpdated = useCallback(
        (metadata: Record<string, unknown>) => setFormMetaSnapshot(metadata),
        []
    );
    const onLinkMetadataSaved = useCallback(
        (linkId: string, metadata: Record<string, unknown>) =>
            setLinks((prev) => prev.map((l) => (l.id === linkId ? { ...l, metadata } : l))),
        []
    );
    // The panel renders "Copied" from this key. It was never tracked, so every copy button looked
    // inert even when the clipboard write succeeded.
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const onCopy = useCallback((key: string, text: string) => {
        void Promise.resolve(navigator.clipboard?.writeText(text))
            .then(() => setCopiedKey(key))
            .catch(() => setCopiedKey(null));
    }, []);
    useEffect(() => {
        if (!copiedKey) return;
        const t = setTimeout(() => setCopiedKey(null), 1600);
        return () => clearTimeout(t);
    }, [copiedKey]);
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
            ...(type === "select" || type === "multiselect" ? { options: [{ value: "option_1", label: "Option 1" }] } : {}),
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

    /** Add a stage-derived library field — registry-backed where one exists, bound otherwise. */
    const addLibraryField = (offer: ProcessingLibraryFieldOffer) => {
        if (!schema || !editable || !librarySectionId || offer.captureUnsupported) return;

        const registry = registryEntryForOffer(offer);
        if (registry) {
            const { schema: next, fieldId } = addRegistryField(schema, registry, librarySectionId, {
                label: offer.label,
            });
            setSchema(next);
            setSelectedFieldId(fieldId);
            setSelectedSectionId(null);
            setDirty(true);
            setLibraryOpen(false);
            return;
        }

        if (offer.add.kind !== "bound") return;
        const spec: BuilderFieldSpec = {
            type: offer.add.builderType,
            label: offer.label,
            sectionId: librarySectionId,
            // Bind to the canonical entity field so coverage matches it by entity_field_key —
            // an unbound custom field would never satisfy the rule it was added for.
            field_source: { entity_type: offer.add.entityType, field_key: offer.add.fieldKey },
            /*
             * A CHOICE FIELD THE ORGANIZATION ALREADY DEFINED ARRIVES WITH ITS OWN LIST.
             *
             * `person.gender` is declared a choice over the `person_gender` vocabulary. Seeding it
             * with a placeholder "Option 1" instead would hand the administrator a question that
             * contradicts the record it writes to, and leave them to rebuild — by hand, from memory
             * — a list Alloy is already maintaining. Only a choice field with NO declared
             * vocabulary needs a starter option to edit.
             */
            ...(offer.add.builderType === "select" || offer.add.builderType === "multiselect"
                ? offer.add.optionSetKey
                    ? { option_set_key: offer.add.optionSetKey }
                    : { options: [{ value: "option_1", label: "Option 1" }] }
                : {}),
        };
        const { schema: next, fieldId } = addField(schema, spec);
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
        return (
            <div className="flex flex-1 items-center justify-center">
                <BosExecutionLoader variant="inline" title="Loading form" />
            </div>
        );
    }
    if (loadState === "error" || !schema) {
        return <div className="flex flex-1 items-center justify-center text-[12px] text-alloy-midnight/60">Couldn&apos;t load this form.</div>;
    }

    const sectionTitle = librarySectionId ? schema.sections.find((s) => s.id === librarySectionId)?.title : null;

    // Live collapsed-state summaries for the six-section configuration rail.
    const purposeIntent = resolveEffectiveOperationalIntent({
        formMetadata: formMetaSnapshot,
        linkMetadata: selectedLinkMetadata,
        formKey: formMeta?.key ?? formId,
    });
    const purposeSummary =
        (purposeIntent && OPERATIONAL_INTENT_CATALOG.find((t) => t.key === purposeIntent)?.label) || "Not set";
    const lifecycleUsage = readFormLifecycleUsage(formMetaSnapshot);
    const processSummary = lifecycleUsage
        ? `${ENROLLMENT_PROCESS_DISPLAY_NAME} · ${LIFECYCLE_STAGE_LABELS[lifecycleUsage.stage_key] ?? lifecycleUsage.stage_key}`
        : "Not set";
    const distributionSummary = hasPublishedVersion
        ? `Published · ${links.length} link${links.length === 1 ? "" : "s"}`
        : "Draft — not published";
    const queueFolderRaw = (formMetaSnapshot as Record<string, unknown> | null | undefined)?.admin_category;
    const queueFolderSummary =
        typeof queueFolderRaw === "string" && queueFolderRaw.trim()
            ? queueFolderRaw.trim().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
            : "Match by keyword";

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-alloy-stone" data-testid="processing-form-builder">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-alloy-midnight/[0.06] bg-white py-2.5 pl-4 pr-14" data-testid="surface-publish-toolbar">
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
                    {(["edit", "preview"] as const).map((m) => (
                        <button
                            key={m}
                            type="button"
                            data-builder-mode-btn={m}
                            onClick={() => setMode(m)}
                            className={`rounded-md px-3 py-1 text-[11px] font-semibold ${
                                mode === m ? "bg-white text-alloy-midnight shadow-sm" : "text-alloy-midnight/50"
                            }`}
                        >
                            {m === "edit" ? "✎ Edit" : "▷ Preview"}
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
                <div className="flex shrink-0 items-center gap-2 border-b border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.05] px-4 py-1.5 text-[11px] font-semibold text-alloy-bend-pine">
                    {/*
                     * "What families complete" overclaimed. This is the Form, presented as a form —
                     * not the guided conversation Alloy actually runs a family through, which is
                     * assembled from the packet's obligations and is not previewable here.
                     */}
                    {paperwork?.source
                        ? "Form preview — the document this produces, with each mapped box named"
                        : "Form preview — how this information appears when presented as a form"}
                </div>
            ) : paperwork?.source ? (
                <div className="flex shrink-0 items-center gap-2 border-b border-alloy-midnight/[0.06] bg-alloy-midnight/[0.03] px-4 py-1.5 text-[11px] font-semibold text-alloy-midnight/55">
                    Click a highlighted box on the document to edit that question
                </div>
            ) : null}

            {builderErr ? (
                <div className="shrink-0 border-b border-alloy-stone/20 bg-alloy-stone/[0.04] px-3 py-2 text-[11px] text-alloy-midnight/60">{builderErr}</div>
            ) : null}

            <div className="flex min-h-0 flex-1">
                <div className={`min-w-0 flex-[8] overflow-y-auto p-4 md:p-8 ${mode !== "edit" ? "bg-alloy-stone/[0.04]" : "bg-alloy-stone"}`}>
                    {mode === "preview" ? (
                        paperwork?.source ? (
                            <FormPaperworkPreview formId={formId} />
                        ) : (
                            <FormPreview schema={schema} branding={branding} runtime={false} />
                        )
                    ) : paperwork?.source ? (
                        <SourcePaperworkEditorCanvas
                            formId={formId}
                            regions={paperwork.regions}
                            versionId={paperwork.versionId}
                            selectedFieldId={selectedFieldId}
                            onSelectField={(id) => {
                                setSelectedFieldId(id);
                                setSelectedSectionId(null);
                            }}
                        />
                    ) : (
                        <div className="mx-auto max-w-[960px] rounded-2xl bg-white px-8 py-8 shadow-[0_8px_40px_rgba(24,39,58,0.08)]">
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
                        className="flex min-w-[340px] max-w-[380px] flex-[2] shrink-0 flex-col overflow-y-auto border-l border-alloy-midnight/[0.06] bg-white px-4 py-2"
                        data-surface-inspector="true"
                    >
                        <div>
                        {selectedField || selectedSection ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedFieldId(null);
                                    setSelectedSectionId(null);
                                }}
                                className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/40 hover:text-alloy-midnight"
                                data-testid="processing-builder-inspector-header"
                            >
                                <span aria-hidden>←</span> {selectedField ? "Question" : "Section"} · Back to form
                            </button>
                        ) : (
                            <p
                                className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/40"
                                data-testid="processing-builder-inspector-header"
                            >
                                Form configuration
                            </p>
                        )}
                        {selectedField ? (
                            <ProcessingFormQuestionInspector
                                field={selectedField}
                                schema={schema}
                                editable={editable}
                                mutate={mutate}
                                fieldLibrary={fieldLibrary}
                                optionSets={optionSets}
                                onRemove={() => {
                                    mutate((s) => removeField(s, selectedField.id));
                                    setSelectedFieldId(null);
                                }}
                                onOpenDistribution={() => {
                                    setSelectedFieldId(null);
                                    setInspectorSection("distribution");
                                }}
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
                            <div data-surface-inspector-empty="true">
                                {/* 1 — Form */}
                                <ProcessingCollapsibleInspectorSection
                                    title="Form"
                                    subtitle="Name and description"
                                    summary={schema.title || "Untitled form"}
                                    accent
                                    open={inspectorSection === "form"}
                                    onOpenChange={(open) => setInspectorSection(open ? "form" : "")}
                                    testId="form-builder-form-section"
                                >
                                    {editable ? (
                                        <div className="space-y-3">
                                            <label className="block">
                                                <span className="mb-1 block text-[11px] font-medium text-alloy-midnight/60">Form name</span>
                                                <input
                                                    type="text"
                                                    value={schema.title}
                                                    onChange={(e) => {
                                                        setSchema((cur) => (cur ? { ...cur, title: e.target.value } : cur));
                                                        setDirty(true);
                                                    }}
                                                    className="w-full rounded-md border border-alloy-stone/20 px-2.5 py-1.5 text-[12px]"
                                                    data-testid="form-builder-form-name"
                                                />
                                            </label>
                                            <label className="block">
                                                <span className="mb-1 block text-[11px] font-medium text-alloy-midnight/60">Description</span>
                                                <textarea
                                                    value={branding.description}
                                                    onChange={(e) => {
                                                        setBranding((b) => ({ ...b, description: e.target.value }));
                                                        setDirty(true);
                                                    }}
                                                    rows={2}
                                                    className="w-full resize-none rounded-md border border-alloy-stone/20 px-2.5 py-1.5 text-[12px]"
                                                    data-testid="form-builder-brand-description"
                                                />
                                            </label>
                                        </div>
                                    ) : (
                                        <p className="text-[12px] text-alloy-midnight/60">{schema.title || "Untitled form"}</p>
                                    )}
                                </ProcessingCollapsibleInspectorSection>

                                {/* 2 — Purpose */}
                                <ProcessingCollapsibleInspectorSection
                                    title="Purpose"
                                    subtitle="What this form is used for"
                                    summary={purposeSummary}
                                    open={inspectorSection === "purpose"}
                                    onOpenChange={(open) => setInspectorSection(open ? "purpose" : "")}
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

                                {/* 3 — Business Process */}
                                <ProcessingCollapsibleInspectorSection
                                    title="Business Process"
                                    subtitle="Which process and stage this form serves"
                                    summary={processSummary}
                                    open={inspectorSection === "process"}
                                    onOpenChange={(open) => setInspectorSection(open ? "process" : "")}
                                >
                                    <FormLifecycleUsagePanel
                                        formId={formId}
                                        formMetadata={formMetaSnapshot}
                                        canMutate={editable || hasPublishedVersion}
                                        hasSchema={Boolean(schema && schema.fields.length > 0)}
                                        onFormMetadataUpdated={onFormMetadataUpdated}
                                    />
                                </ProcessingCollapsibleInspectorSection>

                                {/* 3b — Queue folder: where submissions land in Work */}
                                <ProcessingCollapsibleInspectorSection
                                    title="Queue folder"
                                    subtitle="Where submissions land in the Work queue"
                                    summary={queueFolderSummary}
                                    open={inspectorSection === "queue_folder"}
                                    onOpenChange={(open) => setInspectorSection(open ? "queue_folder" : "")}
                                    testId="form-builder-queue-folder-section"
                                >
                                    <FormQueueFolderPanel
                                        formId={formId}
                                        formMetadata={formMetaSnapshot}
                                        canMutate={editable || hasPublishedVersion}
                                        onFormMetadataUpdated={onFormMetadataUpdated}
                                    />
                                </ProcessingCollapsibleInspectorSection>

                                {/* 4 — Distribution */}
                                <ProcessingCollapsibleInspectorSection
                                    title="Distribution"
                                    subtitle="Publish, share links, and routing"
                                    summary={distributionSummary}
                                    accent
                                    open={inspectorSection === "distribution"}
                                    onOpenChange={(open) => setInspectorSection(open ? "distribution" : "")}
                                    testId="form-builder-distribution-section"
                                >
                                    <div className="space-y-4">
                                        <ProcessingFormDistributionPanel
                                            bare
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
                                        />
                                        <div className="border-t border-alloy-stone/10 pt-3">
                                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/45">
                                                Share by location
                                            </p>
                                            <FormLocationShareLinksPanel
                                                formId={formId}
                                                formName={displayFormName}
                                                links={locationLinks}
                                                hasPublished={hasPublishedVersion}
                                                canMutate={editable || hasPublishedVersion}
                                                onCopy={onCopy}
                                                copied={copiedKey}
                                                onCreateLocationLink={onCreateLocationLink}
                                            />
                                        </div>
                                        <div className="border-t border-alloy-stone/10 pt-3">
                                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/45">
                                                Send to a record
                                            </p>
                                            <FormExistingRecordSendPanel
                                                formId={formId}
                                                formName={displayFormName}
                                                canMutate={editable || hasPublishedVersion}
                                            />
                                        </div>
                                    </div>
                                </ProcessingCollapsibleInspectorSection>

                                {/* 5 — Branding */}
                                <ProcessingCollapsibleInspectorSection
                                    title="Branding"
                                    subtitle="Logo, colors, parent-facing identity"
                                    summary={branding.brand_name || "Default"}
                                    open={inspectorSection === "branding"}
                                    onOpenChange={(open) => setInspectorSection(open ? "branding" : "")}
                                    testId="form-builder-branding-card"
                                >
                                    <BrandingInspectorFields
                                        branding={branding}
                                        editable={editable}
                                        onBrandingChange={(patch) => {
                                            setBranding((b) => ({ ...b, ...patch }));
                                            setDirty(true);
                                        }}
                                    />
                                </ProcessingCollapsibleInspectorSection>

                                {/* 6 — Advanced */}
                                <ProcessingCollapsibleInspectorSection
                                    title="Advanced"
                                    subtitle="Intake behavior and routing details"
                                    summary="Intake behavior, routing"
                                    open={inspectorSection === "advanced"}
                                    onOpenChange={(open) => setInspectorSection(open ? "advanced" : "")}
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
                    onPickLibraryField={addLibraryField}
                    fieldLibrary={fieldLibrary}
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

type PaperworkRegionVM = {
    field_id: string;
    pdf_field: string;
    page: number;
    bbox: [number, number, number, number];
};

/**
 * The school's own paperwork, as the editing surface.
 *
 * The document is drawn clean — `?raw=1`, nothing written into it — and each MAPPED destination is
 * a selectable region on top of it. Clicking one selects the schema field that prints there, which
 * is the same selection the native canvas makes, so the right inspector needs no idea which canvas
 * the operator is looking at.
 *
 * What this deliberately does NOT do is offer unmapped boxes. A rectangle is not a destination, and
 * letting one be clicked into becoming a binding would make geometry the semantic authority. The
 * mapping decides what is selectable; the document only says where.
 */
function SourcePaperworkEditorCanvas({
    formId,
    regions,
    versionId,
    selectedFieldId,
    onSelectField,
}: {
    formId: string;
    regions: PaperworkRegionVM[];
    /** Draw the version the geometry came from, so overlays and page agree. */
    versionId: string | null;
    selectedFieldId: string | null;
    onSelectField: (id: string | null) => void;
}) {
    /*
     * One region per PDF widget, keyed by widget name.
     *
     * A fact can print in several boxes — the same child's name on three pages — and all of them
     * select the same field. The canvas needs unique ids, so the widget name is the id and the
     * selection resolves back through `field_id`.
     */
    const canvasRegions = useMemo(
        () => regions.map((r) => ({ id: r.pdf_field, page: r.page, bbox: r.bbox, tone: "operator" as const })),
        [regions],
    );
    const fieldByPdfField = useMemo(() => new Map(regions.map((r) => [r.pdf_field, r.field_id])), [regions]);
    // Every box that prints the selected fact highlights, not only the one that was clicked.
    const selectedRegionId = useMemo(
        () => regions.find((r) => r.field_id === selectedFieldId)?.pdf_field ?? null,
        [regions, selectedFieldId],
    );

    return (
        <div
            className="mx-auto w-full max-w-[900px]"
            data-testid="form-source-editor-canvas"
            data-region-count={regions.length}
        >
            <ProcessingPdfCanvas
                url={`/api/admin/forms/${encodeURIComponent(formId)}/paperwork-preview?raw=1${versionId ? `&version_id=${encodeURIComponent(versionId)}` : ""}`}
                regions={canvasRegions}
                selectedId={selectedRegionId}
                onSelectRegion={(id: string | null) => onSelectField(id ? (fieldByPdfField.get(id) ?? null) : null)}
                className="h-[calc(100vh-240px)] rounded-xl border border-alloy-stone/20 bg-white"
            />
        </div>
    );
}

/**
 * The document this form produces, rendered in place.
 *
 * Uses `ProcessingPdfCanvas` — the same pdf.js canvas the Processing importer already paints
 * documents with — rather than handing the bytes to the browser's PDF plugin. A first attempt did
 * the latter and fell straight through to "Your browser cannot display PDFs inline", which is the
 * kind of thing that only shows up when you actually look at the screen. Reusing the canvas also
 * keeps the promise made everywhere else in this work: no second viewer.
 *
 * A form with no source document is not an error. It is a form families complete on screen, and the
 * panel says so in those words instead of showing a dead frame.
 */
function FormPaperworkPreview({ formId }: { formId: string }) {
    const url = `/api/admin/forms/${encodeURIComponent(formId)}/paperwork-preview`;
    const [state, setState] = useState<
        { kind: "loading" } | { kind: "ready" } | { kind: "none"; message: string }
    >({ kind: "loading" });

    // Ask first, so a form with no paperwork explains itself rather than failing inside the canvas.
    useEffect(() => {
        let live = true;
        setState({ kind: "loading" });
        void (async () => {
            try {
                const res = await fetch(url, { credentials: "include" });
                if (!live) return;
                if (res.ok) {
                    setState({ kind: "ready" });
                    return;
                }
                const j = (await res.json().catch(() => ({}))) as { error?: string };
                setState({ kind: "none", message: j.error ?? "The paperwork could not be shown." });
            } catch {
                if (live) setState({ kind: "none", message: "The paperwork could not be shown." });
            }
        })();
        return () => {
            live = false;
        };
    }, [url]);

    if (state.kind === "loading") {
        return (
            <p className="mx-auto max-w-[560px] text-[13px] text-alloy-midnight/55" data-testid="form-paperwork-loading">
                Preparing the paperwork…
            </p>
        );
    }
    if (state.kind === "none") {
        return (
            <div
                className="mx-auto max-w-[560px] rounded-2xl border border-alloy-stone/20 bg-white px-6 py-6 text-[13px] text-alloy-midnight/70"
                data-testid="form-paperwork-none"
            >
                {state.message}
            </div>
        );
    }
    return (
        <div className="mx-auto w-full max-w-[900px]" data-testid="form-paperwork-document">
            <ProcessingPdfCanvas
                url={url}
                regions={[]}
                selectedId={null}
                onSelectRegion={() => {}}
                onError={(message) => setState({ kind: "none", message })}
                className="h-[calc(100vh-240px)] rounded-xl border border-alloy-stone/20 bg-white"
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

function BrandingInspectorFields({
    branding,
    editable,
    onBrandingChange,
}: {
    branding: ProcessingFormBranding;
    editable: boolean;
    onBrandingChange: (patch: Partial<ProcessingFormBranding>) => void;
}) {
    if (!editable) {
        return <p className="text-[12px] text-alloy-midnight/60">{branding.brand_name || "No brand name set"}</p>;
    }
    return (
        <div className="space-y-3">
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
    );
}
