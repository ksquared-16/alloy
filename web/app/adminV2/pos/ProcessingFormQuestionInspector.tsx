"use client";

import {
    registryEntryForOffer,
    type ProcessingLibraryFieldOffer,
    type ProcessingLibraryGroupOffer,
} from "@/lib/forms/processingFormFieldLibrary";
import type { FormField, FormFieldLayoutWidth, FormFieldSource, FormSchemaV1 } from "@/lib/forms/schema";
import { updateField } from "@/lib/forms/formBuilderSchema";
import {
    moveFieldBetweenSections,
    moveFieldWithinSection,
    setFieldLayoutWidth,
} from "@/lib/forms/formRowComposition";
import {
    PROCESSING_BUILDER_CANONICAL_FIELDS,
    resolveProcessingBuilderRegistryEntry,
    type ProcessingBuilderCanonicalField,
    type ProcessingBuilderLibraryGroup,
} from "@/lib/forms/processingFormBuilderLibrary";
import { PROCESSING_NEEDS_DESTINATION_DESCRIPTION } from "@/lib/pos/processingCase/formDraft/questionResolutionModel";
import {
    AlloyCheckbox,
    AlloyFieldLabel,
    AlloyInspectorDivider,
    AlloyInspectorGroup,
    AlloySecondaryButton,
    AlloySegmentControl,
    AlloySelect,
    AlloyTextArea,
    AlloyTextInput,
} from "./ProcessingAlloyControls";

const ANSWER_TYPE_LABELS: Record<string, string> = {
    text: "Short text",
    text_block: "Text block",
    date: "Date",
    number: "Number",
    boolean: "Yes / No",
    select: "Dropdown",
    multiselect: "Multi-select",
    signature: "Signature",
    file_ref: "File upload",
};

const STORE_SUBJECT_OPTIONS = [
    { value: "processing_only", label: "Form field only" },
    { value: "child", label: "Child" },
    { value: "parent", label: "Parent / Guardian" },
    { value: "enrollment", label: "Enrollment" },
    { value: "household", label: "Household" },
] as const;

const LAYOUT_WIDTH_OPTIONS: Array<{ value: FormFieldLayoutWidth; label: string }> = [
    { value: "full", label: "Full" },
    { value: "half", label: "Half" },
    { value: "third", label: "Third" },
    { value: "quarter", label: "Quarter" },
];

const STORE_GROUP_MAP: Record<string, readonly ProcessingBuilderLibraryGroup[]> = {
    child: ["child", "medical"],
    parent: ["parent", "communication", "emergency_contacts"],
    enrollment: ["enrollment"],
    household: ["household"],
};

function answerTypeLabel(field: FormField): string {
    if (field.type === "text" && field.multiline) return "Long text";
    if (field.type === "text_block") return "Text block";
    return ANSWER_TYPE_LABELS[field.type] ?? field.type;
}

function storeSubjectFromField(field: FormField): string {
    const source = field.field_source;
    if (!source) return "processing_only";
    if (source.entity_type === "child" || source.entity_type === "customer_member") return "child";
    if (source.entity_type === "guardian" || source.entity_type === "person") return "parent";
    if (source.entity_type === "enrollment" || source.entity_type === "opportunity") return "enrollment";
    if (source.entity_type === "customer") return "household";
    return "processing_only";
}

/**
 * Destination options for "Store answer in".
 *
 * Built from the stage-derived field library when it is available, so the dropdown can map to
 * everything the process can require (including org custom fields). It used to read only
 * PROCESSING_BUILDER_CANONICAL_FIELDS — 17 curated entries — so most fields simply could not be
 * mapped, and a question added from the library resolved to no option and looked unlinked.
 */
function destinationOptionsForSubject(
    subject: string,
    fieldLibrary: ProcessingLibraryGroupOffer[] | null | undefined
): { id: string; label: string; source: FormFieldSource | undefined }[] {
    const groups = STORE_GROUP_MAP[subject];
    if (!groups) return [];
    const allowed = new Set(groups);

    if (fieldLibrary?.length) {
        const out: { id: string; label: string; source: FormFieldSource | undefined }[] = [];
        for (const group of fieldLibrary) {
            if (!allowed.has(group.group)) continue;
            for (const item of group.items) {
                if (item.captureUnsupported) continue;
                const source = fieldSourceFromOffer(item);
                if (!source) continue;
                if (out.some((o) => o.id === destinationIdForSource(source))) continue;
                out.push({ id: destinationIdForSource(source), label: item.label, source });
            }
        }
        if (out.length) return out;
    }

    return PROCESSING_BUILDER_CANONICAL_FIELDS.filter((f) => allowed.has(f.group)).map((c) => {
        const source = fieldSourceFromCanonical(c);
        return {
            id: source ? destinationIdForSource(source) : c.id,
            label: c.pickerLabel,
            source,
        };
    });
}

/** Identity of a destination is its binding, not a picker id — two labels can share one field. */
function destinationIdForSource(source: FormFieldSource): string {
    return `${source.entity_type}.${source.field_key}`;
}

function fieldSourceFromOffer(offer: ProcessingLibraryFieldOffer): FormFieldSource | undefined {
    if (offer.add.kind === "bound") {
        return { entity_type: offer.add.entityType, field_key: offer.add.fieldKey };
    }
    const entry = registryEntryForOffer(offer);
    if (!entry) return undefined;
    return entry.shared_value_key
        ? { entity_type: entry.entity_type, field_key: entry.field_key, shared_value_key: entry.shared_value_key }
        : { entity_type: entry.entity_type, field_key: entry.field_key };
}

function fieldSourceFromCanonical(canonical: ProcessingBuilderCanonicalField): FormFieldSource | undefined {
    const entry = resolveProcessingBuilderRegistryEntry(canonical);
    if (!entry) return undefined;
    return entry.shared_value_key
        ? { entity_type: entry.entity_type, field_key: entry.field_key, shared_value_key: entry.shared_value_key }
        : { entity_type: entry.entity_type, field_key: entry.field_key };
}

/**
 * A field added from the library is ALREADY bound — reflect that binding directly instead of
 * hunting for a curated picker entry that may not exist. Matching on the binding is what makes
 * "select an existing field" show as linked without a second mapping step.
 */
function selectedDestinationId(field: FormField): string {
    const source = field.field_source;
    const key = source?.field_key;
    if (!source || !key || key === "custom" || key === "unmapped") return "";
    return destinationIdForSource(source);
}

function fieldSourceForSubjectAndDestination(
    field: FormField,
    subject: string,
    destinationId: string,
    options: { id: string; source: FormFieldSource | undefined }[]
): FormFieldSource | undefined {
    if (subject === "processing_only") return undefined;
    if (!destinationId) {
        const entity_type =
            subject === "child"
                ? "child"
                : subject === "parent"
                  ? "guardian"
                  : subject === "enrollment"
                    ? "enrollment"
                    : subject === "household"
                      ? "customer"
                      : "custom";
        return { entity_type, field_key: "custom" };
    }
    return options.find((o) => o.id === destinationId)?.source;
}

type Props = {
    field: FormField;
    schema: FormSchemaV1;
    editable: boolean;
    mutate: (fn: (s: FormSchemaV1) => FormSchemaV1) => void;
    onRemove: () => void;
    onOpenDistribution?: () => void;
    /** Stage-derived library so destinations cover everything the process can require. */
    fieldLibrary?: ProcessingLibraryGroupOffer[] | null;
};

export default function ProcessingFormQuestionInspector({
    field,
    schema,
    editable,
    mutate,
    onRemove,
    onOpenDistribution,
    fieldLibrary,
}: Props) {
    const storeSubject = storeSubjectFromField(field);
    const storeFieldOptions = destinationOptionsForSubject(storeSubject, fieldLibrary);
    const selectedCanonicalId = selectedDestinationId(field);
    const layoutWidth: FormFieldLayoutWidth =
        field.layout_width === "half" || field.layout_width === "third" || field.layout_width === "quarter"
            ? field.layout_width
            : "full";
    const needsDestination = field.description === PROCESSING_NEEDS_DESTINATION_DESCRIPTION;

    return (
        <div data-surface-composer-inspector="field" className="space-y-0">
            <header className="pb-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/40">Question</p>
                <h3 className="mt-0.5 text-[15px] font-semibold leading-snug text-alloy-midnight">{field.label}</h3>
            </header>

            <AlloyInspectorDivider />

            <AlloyInspectorGroup title="Presentation">
                <div>
                    <AlloyFieldLabel>Question label</AlloyFieldLabel>
                    {editable ? (
                        <AlloyTextInput
                            value={field.label}
                            onChange={(label) => mutate((s) => updateField(s, field.id, { label }))}
                            testId="form-builder-field-label"
                        />
                    ) : (
                        <p className="text-[12px] font-medium text-alloy-midnight">{field.label}</p>
                    )}
                </div>
                {field.type !== "text_block" ? (
                    <AlloyCheckbox
                        checked={field.required}
                        onChange={(required) => mutate((s) => updateField(s, field.id, { required }))}
                        label="Required"
                        disabled={!editable}
                    />
                ) : null}
                {field.type === "text_block" ? (
                    <div data-inspector-text-block>
                        <AlloyFieldLabel>Inline text</AlloyFieldLabel>
                        <AlloyTextArea
                            value={field.content}
                            onChange={(content) => mutate((s) => updateField(s, field.id, { content }))}
                            disabled={!editable}
                            rows={4}
                            testId="form-builder-text-block-content"
                        />
                        <p className="mt-1.5 text-[10px] leading-snug text-alloy-midnight/45">
                            Insert Alloy tokens into authorization language. Preview renders them as placeholders.
                        </p>
                    </div>
                ) : (
                    <div>
                        <AlloyFieldLabel>Help text</AlloyFieldLabel>
                        {editable ? (
                            <AlloyTextArea
                                value={field.description ?? ""}
                                onChange={(description) => mutate((s) => updateField(s, field.id, { description }))}
                                rows={2}
                            />
                        ) : (
                            <p className="text-[12px] text-alloy-midnight/60">{field.description || "—"}</p>
                        )}
                    </div>
                )}
            </AlloyInspectorGroup>

            {field.type !== "text_block" ? (
                <>
                    <AlloyInspectorDivider />
                    <AlloyInspectorGroup title="Answer">
                        <div>
                            <AlloyFieldLabel>Answer type</AlloyFieldLabel>
                            <p className="text-[12px] font-medium text-alloy-midnight/75">{answerTypeLabel(field)}</p>
                        </div>
                        {needsDestination ? (
                            <p
                                className="rounded-lg border border-alloy-ember/25 bg-alloy-ember/[0.06] px-2.5 py-2 text-[11px] text-alloy-ember"
                                data-testid="form-builder-needs-destination"
                            >
                                Needs destination — answers will not write to business records until you choose where to
                                store them below.
                            </p>
                        ) : null}
                    </AlloyInspectorGroup>

                    <AlloyInspectorDivider />
                    <AlloyInspectorGroup title="Store answer in">
                        <div data-inspector-destination>
                            <AlloyFieldLabel>Record</AlloyFieldLabel>
                            {editable ? (
                                <AlloySelect
                                    value={storeSubject}
                                    onChange={(subject) =>
                                        mutate((s) => {
                                            const cur = s.fields.find((f) => f.id === field.id);
                                            if (!cur) return s;
                                            const fs = fieldSourceForSubjectAndDestination(cur, subject, "", storeFieldOptions);
                                            return updateField(s, field.id, { field_source: fs });
                                        })
                                    }
                                    options={STORE_SUBJECT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                                    testId="form-builder-destination-subject"
                                />
                            ) : (
                                <p className="text-[12px] font-medium text-alloy-midnight">
                                    {STORE_SUBJECT_OPTIONS.find((o) => o.value === storeSubject)?.label ?? "—"}
                                </p>
                            )}
                        </div>
                        {storeSubject !== "processing_only" ? (
                            <div>
                                <AlloyFieldLabel>Field</AlloyFieldLabel>
                                {editable ? (
                                    <AlloySelect
                                        value={selectedCanonicalId}
                                        onChange={(canonicalId) =>
                                            mutate((s) => {
                                                const cur = s.fields.find((f) => f.id === field.id);
                                                if (!cur) return s;
                                                const fs = fieldSourceForSubjectAndDestination(cur, storeSubject, canonicalId, storeFieldOptions);
                                                return updateField(s, field.id, { field_source: fs });
                                            })
                                        }
                                        placeholder="Choose a field…"
                                        options={storeFieldOptions.map((c) => ({ value: c.id, label: c.label }))}
                                        testId="form-builder-destination-field"
                                    />
                                ) : (
                                    <p className="text-[12px] font-medium text-alloy-midnight">
                                        {storeFieldOptions.find((c) => c.id === selectedCanonicalId)?.label ?? "—"}
                                    </p>
                                )}
                            </div>
                        ) : null}
                        {field.field_source?.field_key ? (
                            <details className="text-[10px] text-alloy-midnight/40">
                                <summary className="cursor-pointer font-medium text-alloy-midnight/45">Technical reference</summary>
                                <p className="mt-1 font-mono">
                                    {field.field_source.entity_type}.{field.field_source.field_key}
                                </p>
                            </details>
                        ) : null}
                    </AlloyInspectorGroup>
                </>
            ) : null}

            <AlloyInspectorDivider />
            <AlloyInspectorGroup title="Layout">
                {field.type !== "text_block" ? (
                    <div data-inspector-placement>
                        <AlloyFieldLabel>Width</AlloyFieldLabel>
                        <AlloySegmentControl
                            value={layoutWidth}
                            onChange={(width) => mutate((s) => setFieldLayoutWidth(s, field.id, width))}
                            options={LAYOUT_WIDTH_OPTIONS}
                            disabled={!editable}
                            testId="form-builder-layout-width"
                        />
                    </div>
                ) : null}
                <div data-inspector-section>
                    <AlloyFieldLabel>Section</AlloyFieldLabel>
                    <div className="flex flex-wrap gap-1">
                        {schema.sections.map((sec) => {
                            const active = schema.sections.find((s) => s.field_ids.includes(field.id))?.id === sec.id;
                            return (
                                <button
                                    key={sec.id}
                                    type="button"
                                    disabled={!editable}
                                    onClick={() => mutate((s) => moveFieldBetweenSections(s, field.id, sec.id))}
                                    className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                                        active
                                            ? "border-alloy-bend-pine/40 bg-alloy-bend-pine/[0.08] text-alloy-bend-pine"
                                            : "border-alloy-stone/20 text-alloy-midnight/70 hover:border-alloy-stone/30"
                                    }`}
                                    data-inspector-section-option={sec.id}
                                >
                                    {sec.title}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </AlloyInspectorGroup>

            <AlloyInspectorDivider />
            <AlloyInspectorGroup title="Publishing">
                <p className="text-[11px] leading-relaxed text-alloy-midnight/50">
                    Share links and site distribution are managed after you publish the form.
                </p>
                {onOpenDistribution ? (
                    <AlloySecondaryButton onClick={onOpenDistribution} testId="form-builder-open-distribution">
                        Manage distribution
                    </AlloySecondaryButton>
                ) : null}
            </AlloyInspectorGroup>

            {editable ? (
                <>
                    <AlloyInspectorDivider />
                    <div className="flex flex-wrap gap-2">
                        <AlloySecondaryButton
                            onClick={() => mutate((s) => moveFieldWithinSection(s, field.id, -1))}
                            testId="form-builder-move-earlier"
                        >
                            Move earlier
                        </AlloySecondaryButton>
                        <AlloySecondaryButton
                            onClick={() => mutate((s) => moveFieldWithinSection(s, field.id, 1))}
                            testId="form-builder-move-later"
                        >
                            Move later
                        </AlloySecondaryButton>
                    </div>
                    <button
                        type="button"
                        className="mt-2 text-[11px] font-semibold text-rose-600 hover:text-rose-700"
                        data-inspector-remove
                        onClick={onRemove}
                    >
                        Remove question
                    </button>
                </>
            ) : null}
        </div>
    );
}
