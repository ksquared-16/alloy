"use client";

import { useState, type ReactElement } from "react";
import {
    addField,
    addRegistryField,
    addRelationshipGroup,
    addSection,
    removeField,
    removeSection,
    renameSection,
    type BuilderFieldSpec,
    type BuilderFieldType,
} from "@/lib/forms/formBuilderSchema";
import { reorderField, reorderFieldAfter, setFieldLayoutWidth } from "@/lib/forms/formRowComposition";
import {
    resolveProcessingBuilderRegistryEntry,
    type ProcessingBuilderCanonicalField,
} from "@/lib/forms/processingFormBuilderLibrary";
import {
    registryEntryForOffer,
    type ProcessingLibraryFieldOffer,
    type ProcessingLibraryGroupOffer,
} from "@/lib/forms/processingFormFieldLibrary";
import { peopleGroupOptions } from "@/lib/forms/relationshipCollectionGroup";
import type { FormSchemaV1, FormSection } from "@/lib/forms/schema";
import ProcessingCollapsibleInspectorSection from "./ProcessingCollapsibleInspectorSection";
import ProcessingFormBuilderLibraryPanel, { type QuestionTypeItem } from "./ProcessingFormBuilderLibraryPanel";
import type { CanvasDropTarget } from "./ProcessingFormCanvas";
import ProcessingSectionNameDialog from "./ProcessingSectionNameDialog";

/**
 * FORMS STUDIO AUTHORING — ONE IMPLEMENTATION FOR EVERY FORM.
 *
 * Adding a question (from the answer types, the stage's field library or a repeatable people group),
 * adding / renaming / removing a section, removing a question, and drag-and-drop arrangement used to be
 * private to `ProcessingFormBuilder`. A form generated from a document was shown on the same canvas
 * but with every one of those affordances wired to nothing — the canvas drew "+ Add question" and the
 * click went nowhere — so a document-originated form was a smaller editor that merely looked the same.
 *
 * This hook is that authoring, lifted out unchanged. Both Studio paths call it with their own schema
 * and their own `mutate`; persistence stays theirs (a form version for a hand-built form, the case
 * draft's Studio schema for a document-originated one). Nothing here knows which kind of form it is.
 */

export const STUDIO_QUESTION_TYPES: readonly QuestionTypeItem[] = [
    { type: "short_text", label: "Short text", meta: "Single line answer", category: "basic" },
    { type: "long_text", label: "Long text", meta: "Paragraph answer", category: "basic" },
    { type: "text_block", label: "Text block", meta: "Authorization copy with Alloy tokens", category: "content" },
    { type: "number", label: "Number", meta: "Numeric input", category: "basic" },
    { type: "date", label: "Date", meta: "Calendar picker", category: "basic" },
    { type: "select", label: "Dropdown", meta: "Select one option", category: "choice" },
    { type: "multiselect", label: "Multiple choice", meta: "Select several options", category: "choice" },
    { type: "boolean", label: "Yes / No", meta: "Boolean toggle", category: "choice" },
    { type: "signature", label: "Signature", meta: "Draw or type signature", category: "capture" },
    { type: "file_ref", label: "File upload", meta: "Attach a document", category: "capture" },
];

export const STUDIO_QUESTION_CATEGORY_LABELS: Record<string, string> = {
    basic: "Basic",
    content: "Content",
    choice: "Choice",
    capture: "Capture",
};

const DEFAULT_CHOICE = [{ value: "option_1", label: "Option 1" }];

export type FormStudioAuthoring = {
    /** Spread onto `ProcessingFormCanvas`. */
    readonly canvasProps: {
        collapsedSectionIds: Set<string>;
        onToggleSectionCollapse: (sectionId: string) => void;
        onAddQuestion: (sectionId: string) => void;
        onAddSection: () => void;
        dragFieldId: string | null;
        dropTarget: CanvasDropTarget | null;
        onDragFieldStart: (fieldId: string | null) => void;
        onDragFieldOver: (target: CanvasDropTarget | null) => void;
        onDragFieldDrop: () => void;
        onSectionDragOver: (sectionId: string) => void;
    };
    readonly openLibrary: (sectionId: string) => void;
    readonly removeQuestion: (fieldId: string) => void;
    /** The add-question library and the new-section dialog. Render once, anywhere in the surface. */
    readonly overlays: ReactElement;
    /** The section inspector: title, add a question to it, remove it. */
    readonly renderSectionInspector: (section: FormSection) => ReactElement;
};

export function useFormStudioAuthoring({
    schema,
    mutate,
    editable,
    fieldLibrary,
    onSelectField,
    onSelectSection,
}: {
    schema: FormSchemaV1 | null;
    mutate: (fn: (s: FormSchemaV1) => FormSchemaV1) => void;
    editable: boolean;
    fieldLibrary?: ProcessingLibraryGroupOffer[] | null;
    onSelectField: (fieldId: string | null) => void;
    onSelectSection: (sectionId: string | null) => void;
}): FormStudioAuthoring {
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [librarySectionId, setLibrarySectionId] = useState<string | null>(null);
    const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
    const [dragFieldId, setDragFieldId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<CanvasDropTarget | null>(null);
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());

    const openLibrary = (sectionId: string) => {
        setLibrarySectionId(sectionId);
        setLibraryOpen(true);
    };

    /** Apply an add, select what was added, close the library. */
    const commitAdd = (result: { schema: FormSchemaV1; fieldId: string } | null) => {
        if (!result) return;
        mutate(() => result.schema);
        onSelectField(result.fieldId);
        onSelectSection(null);
        setLibraryOpen(false);
    };

    const addQuestion = (type: BuilderFieldType) => {
        if (!schema || !editable || !librarySectionId) return;
        const label = STUDIO_QUESTION_TYPES.find((p) => p.type === type)?.label ?? "Question";
        const spec: BuilderFieldSpec = {
            type,
            label: `Untitled ${label.toLowerCase()}`,
            sectionId: librarySectionId,
            ...(type === "select" || type === "multiselect" ? { options: DEFAULT_CHOICE } : {}),
        };
        commitAdd(addField(schema, spec));
    };

    const addCanonicalField = (canonical: ProcessingBuilderCanonicalField) => {
        if (!schema || !editable || !librarySectionId) return;
        const entry = resolveProcessingBuilderRegistryEntry(canonical);
        if (!entry) return;
        commitAdd(addRegistryField(schema, entry, librarySectionId, { label: canonical.pickerLabel }));
    };

    /** Add a stage-derived library field — registry-backed where one exists, bound otherwise. */
    const addLibraryField = (offer: ProcessingLibraryFieldOffer) => {
        if (!schema || !editable || !librarySectionId || offer.captureUnsupported) return;
        const registry = registryEntryForOffer(offer);
        if (registry) {
            commitAdd(addRegistryField(schema, registry, librarySectionId, { label: offer.label }));
            return;
        }
        if (offer.add.kind !== "bound") return;
        commitAdd(
            addField(schema, {
                type: offer.add.builderType,
                label: offer.label,
                sectionId: librarySectionId,
                // Bind to the canonical entity field so coverage matches it by entity_field_key —
                // an unbound custom field would never satisfy the rule it was added for.
                field_source: { entity_type: offer.add.entityType, field_key: offer.add.fieldKey },
                ...(offer.add.builderType === "select" ? { options: DEFAULT_CHOICE } : {}),
            }),
        );
    };

    const addPeopleGroup = (definitionKey: string) => {
        if (!schema || !editable || !librarySectionId) return;
        commitAdd(addRelationshipGroup(schema, definitionKey, librarySectionId));
    };

    const handleDragDrop = () => {
        if (!schema || !dragFieldId || !dropTarget) return;
        const fieldId = dragFieldId;
        const target = dropTarget;
        mutate((s) => {
            let next = !target.fieldId
                ? reorderField(s, fieldId, target.sectionId, null)
                : target.position === "before"
                  ? reorderField(s, fieldId, target.sectionId, target.fieldId)
                  : reorderFieldAfter(s, fieldId, target.sectionId, target.fieldId);
            next = setFieldLayoutWidth(next, fieldId, target.rowIntent === "same-line" ? "half" : "full");
            return next;
        });
        setDragFieldId(null);
        setDropTarget(null);
    };

    const removeQuestion = (fieldId: string) => {
        mutate((s) => removeField(s, fieldId));
        onSelectField(null);
    };

    const sectionTitle = librarySectionId ? schema?.sections.find((s) => s.id === librarySectionId)?.title : null;

    const overlays = (
        <>
            {libraryOpen && editable ? (
                <ProcessingFormBuilderLibraryPanel
                    open={libraryOpen}
                    sectionLabel={`Add to ${sectionTitle ?? "section"}`}
                    questionTypes={STUDIO_QUESTION_TYPES}
                    questionCategoryLabels={STUDIO_QUESTION_CATEGORY_LABELS}
                    onPickQuestionType={addQuestion}
                    onPickCanonicalField={addCanonicalField}
                    onPickLibraryField={addLibraryField}
                    fieldLibrary={fieldLibrary}
                    peopleGroups={peopleGroupOptions()}
                    onPickPeopleGroup={addPeopleGroup}
                    onClose={() => setLibraryOpen(false)}
                />
            ) : null}
            <ProcessingSectionNameDialog
                open={sectionDialogOpen}
                onClose={() => setSectionDialogOpen(false)}
                onContinue={(title) => {
                    if (!schema) return;
                    const r = addSection(schema, title);
                    mutate(() => r.schema);
                    onSelectSection(r.sectionId);
                    onSelectField(null);
                    setSectionDialogOpen(false);
                }}
            />
        </>
    );

    const renderSectionInspector = (section: FormSection) => (
        <div className="space-y-3" data-surface-composer-inspector="section">
            <ProcessingCollapsibleInspectorSection title="Section" subtitle="Title and questions" defaultOpen accent>
                <div>
                    <p className="config-typo-sublabel mb-1">Section title</p>
                    {editable ? (
                        <input
                            type="text"
                            value={section.title}
                            onChange={(e) => mutate((s) => renameSection(s, section.id, e.target.value))}
                            className="w-full rounded-md border border-alloy-stone/20 px-2 py-1.5 text-sm"
                            data-testid="form-builder-section-title"
                        />
                    ) : (
                        <p className="text-sm font-medium">{section.title}</p>
                    )}
                </div>
                <button
                    type="button"
                    disabled={!editable}
                    className="config-secondary-btn w-full text-xs"
                    onClick={() => openLibrary(section.id)}
                    data-testid="form-builder-section-add-question"
                >
                    + Add question to {section.title}
                </button>
            </ProcessingCollapsibleInspectorSection>
            {editable ? (
                <ProcessingCollapsibleInspectorSection title="Advanced" defaultOpen={false}>
                    <button
                        type="button"
                        className="text-[11px] font-semibold text-rose-600"
                        onClick={() => {
                            mutate((s) => removeSection(s, section.id));
                            onSelectSection(null);
                        }}
                    >
                        Remove section
                    </button>
                </ProcessingCollapsibleInspectorSection>
            ) : null}
        </div>
    );

    return {
        canvasProps: {
            collapsedSectionIds: collapsedSections,
            onToggleSectionCollapse: (sectionId) =>
                setCollapsedSections((prev) => {
                    const next = new Set(prev);
                    if (next.has(sectionId)) next.delete(sectionId);
                    else next.add(sectionId);
                    return next;
                }),
            onAddQuestion: openLibrary,
            onAddSection: () => setSectionDialogOpen(true),
            dragFieldId,
            dropTarget,
            onDragFieldStart: setDragFieldId,
            onDragFieldOver: setDropTarget,
            onDragFieldDrop: handleDragDrop,
            onSectionDragOver: (sectionId) => setDropTarget({ sectionId, fieldId: null, position: "after", rowIntent: "new-line" }),
        },
        openLibrary,
        removeQuestion,
        overlays,
        renderSectionInspector,
    };
}
