"use client";

import {
    registryEntryForOffer,
    type ProcessingLibraryFieldOffer,
    type ProcessingLibraryGroupOffer,
} from "@/lib/forms/processingFormFieldLibrary";
import type { FormField, FormFieldLayoutWidth, FormFieldSource, FormSchemaV1 } from "@/lib/forms/schema";
import { setPartyEntryFields, updateField } from "@/lib/forms/formBuilderSchema";
import { RELATIONSHIP_ACTION_SCOPES, RELATIONSHIP_ACTION_SCOPE_LABELS } from "@/lib/admin/relationship/relationshipActionContract";
import { addAnotherLabel } from "@/lib/forms/partyCollection";
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
import { CLASSIFICATION_KEY_LABELS, OPERATOR_CLASSIFIED_KEYS } from "@/lib/pos/processingCase/classification/operatorCorrection";
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

/**
 * The kinds of repeated person a form may collect, in the words an administrator uses.
 *
 * Each option carries the canonical relationship action, the subject and the default role — so
 * choosing "Emergency contacts" settles all three at once rather than asking three questions whose
 * wrong combination is silently possible. The keys are `RELATIONSHIP_ACTION_KEYS`; nothing here is
 * a Forms-local vocabulary.
 */
type PartyEntryQuestion = { type: "short_text" | "date"; label: string; required?: boolean };

/** What a family is asked about each PERSON in a related-party list. */
const PERSON_ENTRY_QUESTIONS: ReadonlyArray<PartyEntryQuestion> = [
    { type: "short_text", label: "Full name", required: true },
    { type: "short_text", label: "Phone", required: true },
    { type: "short_text", label: "Relationship to the child", required: false },
];

/**
 * What a family is asked about each CHILD in their own household.
 *
 * Not the person questions: a parent is not asked their own child's "relationship to the child",
 * and `add_child` needs an identity — a name and, where the family knows it, a date of birth.
 */
const CHILD_ENTRY_QUESTIONS: ReadonlyArray<PartyEntryQuestion> = [
    { type: "short_text", label: "Full name", required: true },
    { type: "date", label: "Date of birth", required: false },
];

const PARTY_KIND_PRESETS: Record<
    string,
    { action_key: string; subject: "person" | "child"; role?: string; scope?: string; fields: ReadonlyArray<PartyEntryQuestion> }
> = {
    add_emergency_contact: { action_key: "add_emergency_contact", subject: "person", role: "emergency_contact", scope: "this_child", fields: PERSON_ENTRY_QUESTIONS },
    add_authorized_pickup: { action_key: "add_authorized_pickup", subject: "person", role: "authorized_pickup", scope: "this_child", fields: PERSON_ENTRY_QUESTIONS },
    add_parent_guardian: { action_key: "add_parent_guardian", subject: "person", role: "guardian", scope: "household", fields: PERSON_ENTRY_QUESTIONS },
    add_billing_contact: { action_key: "add_billing_contact", subject: "person", role: "billing_contact", scope: "household", fields: PERSON_ENTRY_QUESTIONS },
    add_child: { action_key: "add_child", subject: "child", scope: "household", fields: CHILD_ENTRY_QUESTIONS },
};

const PARTY_KIND_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
    { value: "add_emergency_contact", label: "Emergency contacts" },
    { value: "add_authorized_pickup", label: "Authorized pickups" },
    { value: "add_parent_guardian", label: "Parents and guardians" },
    { value: "add_billing_contact", label: "Payers / billing contacts" },
    { value: "add_child", label: "Children in the household (siblings)" },
];

/**
 * Whose address, in the platform's own relationship vocabulary.
 *
 * Derived from the party kinds that name a PERSON role, so the two lists cannot drift: a role an
 * administrator can collect people in is a role whose address they can ask for.
 */
const PARTY_ROLE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = PARTY_KIND_OPTIONS.flatMap((kind) => {
    const role = PARTY_KIND_PRESETS[kind.value]?.role;
    return role ? [{ value: role, label: kind.label.replace(/s$/, "") }] : [];
});

/** Scope labels are the platform's own — a second wording would be a second meaning. */
const PARTY_SCOPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = RELATIONSHIP_ACTION_SCOPES.map((sc) => ({
    value: sc,
    label: RELATIONSHIP_ACTION_SCOPE_LABELS[sc],
}));

function isPartyCollection(field: FormField): boolean {
    return field.type === "group" && Boolean((field as { party_collection?: unknown }).party_collection);
}

function numberOrZero(raw: string): number {
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

function isAddress(field: FormField): boolean {
    return field.type === "group" && Boolean((field as { address_binding?: unknown }).address_binding);
}

/**
 * Patch the address statement in place.
 *
 * The same shape as `updatePartyCollection` and for the same reason: the schema's own construct is
 * edited, never a parallel copy, and a key passed empty is CLEARED — which is how "this address
 * belongs to the subject, not to a role" is said.
 */
function updateAddressBinding(schema: FormSchemaV1, fieldId: string, patch: Record<string, unknown>): FormSchemaV1 {
    return {
        ...schema,
        fields: schema.fields.map((f) => {
            if (f.id !== fieldId || f.type !== "group") return f;
            const current = ((f as { address_binding?: Record<string, unknown> }).address_binding ?? {}) as Record<string, unknown>;
            const next: Record<string, unknown> = { ...current, ...patch };
            for (const key of Object.keys(next)) {
                const cleared = next[key] === undefined || (typeof next[key] === "string" && (next[key] as string).trim() === "");
                if (cleared) delete next[key];
            }
            return { ...f, address_binding: next } as FormField;
        }),
    };
}

/** Patch the party statement in place — the schema's own construct, never a parallel copy. */
function updatePartyCollection(schema: FormSchemaV1, fieldId: string, patch: Record<string, unknown>): FormSchemaV1 {
    return {
        ...schema,
        fields: schema.fields.map((f) => {
            if (f.id !== fieldId || f.type !== "group") return f;
            const current = ((f as { party_collection?: Record<string, unknown> }).party_collection ?? {}) as Record<string, unknown>;
            const next: Record<string, unknown> = { ...current, ...patch };
            // Presence, not value: a key the caller passed as undefined is being CLEARED, which is
            // the only way to say "this kind has no role". An absent key still means "leave alone".
            for (const key of Object.keys(next)) {
                const cleared = next[key] === undefined || (typeof next[key] === "string" && (next[key] as string).trim() === "");
                if (cleared) delete next[key];
            }
            return { ...f, party_collection: next } as FormField;
        }),
    };
}

function updatePartyRepeat(schema: FormSchemaV1, fieldId: string, patch: { min?: number; max?: number | null }): FormSchemaV1 {
    return {
        ...schema,
        fields: schema.fields.map((f) => {
            if (f.id !== fieldId || f.type !== "group") return f;
            const rep = { min: f.repeat?.min ?? 0, ...(f.repeat?.max != null ? { max: f.repeat.max } : {}) } as { min: number; max?: number };
            if (patch.min !== undefined) rep.min = patch.min;
            if (patch.max !== undefined) {
                if (patch.max === null || patch.max <= 0) delete rep.max;
                else rep.max = patch.max;
            }
            // A maximum below the minimum is not a rule, it is an unsatisfiable form.
            if (rep.max !== undefined && rep.max < rep.min) rep.max = rep.min;
            return { ...f, repeat: rep } as FormField;
        }),
    };
}

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
    /**
     * The organization's own vocabularies, from `GET /api/admin/option-sets`.
     *
     * Passed in rather than fetched here so the inspector stays a pure editor, and so the list is
     * the tenant's — nothing in this file names a vocabulary.
     */
    optionSets?: ReadonlyArray<{ set_key: string; label: string; item_count?: number }> | null;
};

/**
 * The derivations Alloy can perform, in the words an administrator would use.
 *
 * The kinds are the schema's own (`formFieldDerivedSchema`); the sentences are for a person
 * choosing between them. A derivation this list does not name cannot be authored here, which is
 * correct — the calculation is owned by `lib/fields/derived/`, not by the editor.
 */
const DERIVATION_OPTIONS = [
    { value: "age_from_date_of_birth", label: "Age, from a date of birth" },
    { value: "execution_date", label: "The date this form is completed" },
] as const;

/**
 * The document classifications an operator may name, in their own words.
 *
 * Taken from the Processing operator vocabulary rather than restated: the same keys an operator can
 * correct a case to are the ones a form may ask a family for, and two lists would drift the moment
 * either changed. The blank entry is a real choice — "a document this enrolment asked for".
 */
const DOCUMENT_TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
    { value: "", label: "Any supporting document" },
    ...OPERATOR_CLASSIFIED_KEYS.map((k) => ({ value: k, label: CLASSIFICATION_KEY_LABELS[k] })),
];

/**
 * The answers a condition may compare against, taken from the SOURCE question's own type.
 *
 * A Yes/No question offers Yes and No; a choice question offers its choices. Anything else is
 * compared as the text the family typed, which is honest about what the evaluator will do rather
 * than pretending the editor understands the answer.
 */
function conditionValueOptions(schema: FormSchemaV1, sourceId: string): Array<{ value: string; label: string }> {
    const source = schema.fields.find((f) => f.id === sourceId);
    if (!source) return [{ value: "", label: "—" }];
    if (source.type === "boolean") return [{ value: "true", label: "Yes" }, { value: "false", label: "No" }];
    if (source.type === "select" || source.type === "multiselect") {
        const opts = (source as { static_options?: Array<{ value: string; label: string }> }).static_options ?? [];
        if (opts.length) return opts.map((o) => ({ value: o.value, label: o.label }));
        return [{ value: "", label: "Any answer from the organization list" }];
    }
    return [{ value: "", label: "Any answer" }];
}

/** The comparison value in the SOURCE field's own type — "true" is a boolean, not the word. */
function parseConditionValue(schema: FormSchemaV1, sourceId: string, raw: string): string | boolean | null {
    const source = schema.fields.find((f) => f.id === sourceId);
    if (source?.type === "boolean") return raw === "true";
    return raw === "" ? null : raw;
}

/** What a new condition should compare against before the administrator chooses. */
function defaultEqualsFor(schema: FormSchemaV1, sourceId: string): string | boolean | null {
    const source = schema.fields.find((f) => f.id === sourceId);
    if (source?.type === "boolean") return true;
    const opts = (source as { static_options?: Array<{ value: string }> } | undefined)?.static_options ?? [];
    return opts[0]?.value ?? null;
}

export default function ProcessingFormQuestionInspector({
    field,
    schema,
    editable,
    mutate,
    onRemove,
    onOpenDistribution,
    fieldLibrary,
    optionSets,
}: Props) {
    const party = (field as { party_collection?: { action_key?: string; subject?: "person" | "child"; role?: string; scope?: string; show_known?: boolean; allow_add?: boolean; add_another_label?: string } }).party_collection ?? null;
    const address = (field as { address_binding?: { subject?: "person" | "child"; role?: string } }).address_binding ?? null;
    const partyMin = field.type === "group" ? (field.repeat?.min ?? 0) : 0;
    const partyMax = field.type === "group" && field.repeat?.max != null ? String(field.repeat.max) : "";
    const storeSubject = storeSubjectFromField(field);
    const storeFieldOptions = destinationOptionsForSubject(storeSubject, fieldLibrary);
    const selectedCanonicalId = selectedDestinationId(field);
    const layoutWidth: FormFieldLayoutWidth =
        field.layout_width === "half" || field.layout_width === "third" || field.layout_width === "quarter"
            ? field.layout_width
            : "full";
    const needsDestination = field.description === PROCESSING_NEEDS_DESTINATION_DESCRIPTION;

    /*
     * What the three normalization controls are currently showing — read from the field itself, so
     * the inspector can never display one thing while the schema holds another.
     */
    const vocabularyKey = (field as { option_set_key?: string }).option_set_key ?? "";
    const inlineOptions = ((field as { static_options?: Array<{ value: string; label: string }> }).static_options ?? []).map((o) => ({ ...o }));
    const condition = (field as { visibility?: { all: Array<{ field_id: string; op: string; value: unknown }> } }).visibility?.all?.[0] ?? null;
    const conditionSourceId = condition?.field_id ?? "";
    const conditionValue = condition?.value ?? null;
    const derivedConfig = (field as { derived?: { kind: string; source_key?: string; as_of_key?: string } }).derived ?? null;
    const derivedKind = derivedConfig?.kind ?? "";
    const derivedSource = derivedConfig?.source_key ?? "";
    const derivedAsOf = derivedConfig?.as_of_key ?? "";

    /*
     * A question may only depend on ANOTHER question on this form, and never on itself — a field
     * whose condition names itself is unanswerable, and `evaluateFieldVisibility` guards the cycle
     * but the editor should not offer it in the first place.
     */
    const conditionCandidates = schema.fields
        .filter((f) => f.id !== field.id && f.type !== "text_block")
        .map((f) => ({ id: f.id, label: f.label }));
    const dateFields = schema.fields.filter((f) => f.type === "date").map((f) => ({ id: f.id, label: f.label }));

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
                {/*
                  * WHOSE ADDRESS IS THIS?
                  *
                  * The one thing an address declaration says that the parts cannot. Without it the
                  * answer type is authorable but not configurable, and every address silently
                  * belongs to "the person" with no role — which is the wrong answer the moment a
                  * Form asks for a guardian's address and an emergency contact's.
                  */}
                {isAddress(field) ? (
                    <div data-inspector-address>
                        <AlloyFieldLabel>Whose address?</AlloyFieldLabel>
                        <select
                            value={address?.subject ?? "person"}
                            disabled={!editable}
                            data-inspector-address-subject
                            onChange={(e) =>
                                mutate((s) => updateAddressBinding(s, field.id, { subject: e.target.value }))
                            }
                            className="mt-1 w-full rounded-md border border-alloy-stone/20 px-2 py-1.5 text-sm"
                        >
                            <option value="person">A person on the record</option>
                            <option value="child">The child</option>
                        </select>
                        {(address?.subject ?? "person") === "person" ? (
                            <div className="mt-2">
                                <AlloyFieldLabel>Which person?</AlloyFieldLabel>
                                <select
                                    value={address?.role ?? ""}
                                    disabled={!editable}
                                    data-inspector-address-role
                                    onChange={(e) =>
                                        mutate((s) => updateAddressBinding(s, field.id, { role: e.target.value }))
                                    }
                                    className="mt-1 w-full rounded-md border border-alloy-stone/20 px-2 py-1.5 text-sm"
                                >
                                    <option value="">The person this form is about</option>
                                    {PARTY_ROLE_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </div>
                        ) : null}
                        <p className="mt-1.5 text-[10px] leading-snug text-alloy-midnight/45">
                            Street, city, state and postal code are asked together as one address, and stored on that
                            person&rsquo;s own record &mdash; not copied into this form.
                        </p>
                    </div>
                ) : null}

                {/*
                  * WHAT HAPPENS IF THERE IS NONE?
                  *
                  * One of the questions the inspector exists to answer. It used to be answered by
                  * the runtime instead, and badly: the wording was chosen by testing whether the
                  * question's own words contained "allerg", so "Please list any food sensitivities"
                  * and "Allergy information" produced different paperwork for the same fact.
                  */}
                {field.type !== "text_block" && field.type !== "group" && field.type !== "signature" ? (
                    <div data-inspector-absence>
                        <AlloyCheckbox
                            checked={Boolean(field.absence?.offered)}
                            onChange={(offered) =>
                                mutate((s) => updateField(s, field.id, { absence: offered ? { offered: true } : null }))
                            }
                            label={'Let the family answer "there are none"'}
                            disabled={!editable || Boolean(field.supplied_by)}
                        />
                        {field.absence?.offered ? (
                            <div className="mt-2">
                                <AlloyFieldLabel>What the family reads</AlloyFieldLabel>
                                <AlloyTextInput
                                    value={field.absence.label ?? ""}
                                    onChange={(label) =>
                                        mutate((s) => updateField(s, field.id, { absence: { offered: true, label } }))
                                    }
                                    placeholder="None"
                                    disabled={!editable}
                                    testId="form-builder-absence-label"
                                />
                                <p className="mt-1.5 text-[10px] leading-snug text-alloy-midnight/45">
                                    For example &ldquo;No known allergies&rdquo;. This is an answer, not a way to skip
                                    the question &mdash; the completed paperwork says the family told you there are
                                    none.
                                </p>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {/*
                  * WHERE IS IT RETAINED FOR NOW?
                  *
                  * The truthful third state between "bound to a canonical field" and "unbound and
                  * forgotten". Setting it clears any canonical binding, because a question waiting
                  * for an owner cannot also claim one.
                  */}
                {field.type !== "text_block" && field.type !== "group" ? (
                    <div data-inspector-retention>
                        <AlloyCheckbox
                            checked={Boolean(field.retention)}
                            onChange={(held) =>
                                mutate((s) =>
                                    updateField(s, field.id, {
                                        retention: held ? { kind: "form_only_pending_canonical_owner" } : null,
                                    }),
                                )
                            }
                            label="Keep the answer on the form for now"
                            disabled={!editable}
                        />
                        {field.retention ? (
                            <div className="mt-2">
                                <AlloyFieldLabel>Which part of Alloy will own it eventually?</AlloyFieldLabel>
                                <AlloyTextInput
                                    value={field.retention.owner_hint ?? ""}
                                    onChange={(owner_hint) =>
                                        mutate((s) =>
                                            updateField(s, field.id, {
                                                retention: { kind: "form_only_pending_canonical_owner", owner_hint },
                                            }),
                                        )
                                    }
                                    placeholder="Health, Consent, Financials…"
                                    disabled={!editable}
                                    testId="form-builder-retention-owner"
                                />
                                <p className="mt-1.5 text-[10px] leading-snug text-alloy-midnight/45">
                                    The family answers this normally and the completed paperwork keeps it. Alloy does
                                    not yet have a record that owns this fact, so nothing is written to one &mdash;
                                    and when that owner exists it can adopt these answers deliberately.
                                </p>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {/*
                  * WHO PROVIDES IT? — the organisation, not the family.
                  *
                  * The Form holds the REFERENCE. Storing the amount here would make a second place
                  * it can be right, which is the same as a second place it can go stale.
                  */}
                {field.type !== "text_block" && field.type !== "group" ? (
                    <div data-inspector-supplied-by>
                        <AlloyCheckbox
                            checked={Boolean(field.supplied_by)}
                            onChange={(supplied) =>
                                mutate((s) =>
                                    updateField(s, field.id, {
                                        supplied_by: supplied ? { source_kind: "charge_template", source_key: "" } : null,
                                    }),
                                )
                            }
                            label="Your organization provides this value"
                            disabled={!editable || Boolean(field.absence?.offered)}
                        />
                        {field.supplied_by ? (
                            <div className="mt-2">
                                <AlloyFieldLabel>Which charge template?</AlloyFieldLabel>
                                <AlloyTextInput
                                    value={field.supplied_by.source_key}
                                    onChange={(source_key) =>
                                        mutate((s) =>
                                            updateField(s, field.id, {
                                                supplied_by: { source_kind: "charge_template", source_key },
                                            }),
                                        )
                                    }
                                    placeholder="registration_fee"
                                    disabled={!editable}
                                    testId="form-builder-supplied-source"
                                />
                                {field.supplied_by.source_key.trim() ? null : (
                                    /*
                                     * An INCOMPLETE declaration, said out loud.
                                     *
                                     * Ticking the box is one act and naming the template is the next, so there is a
                                     * moment where the Form says "we supply this" without saying which one. The
                                     * draft may hold that; a published Form may not — `formFieldSuppliedBySchema`
                                     * requires the key. Saying so here is the difference between an administrator
                                     * finishing the thought and meeting a validation error at publish.
                                     */
                                    <p
                                        className="mt-1.5 rounded-lg border border-alloy-ember/25 bg-alloy-ember/[0.06] px-2.5 py-2 text-[11px] text-alloy-ember"
                                        data-testid="form-builder-supplied-needs-key"
                                    >
                                        Name the charge template this reads from — this form cannot be published until
                                        you do.
                                    </p>
                                )}
                                <p className="mt-1.5 text-[10px] leading-snug text-alloy-midnight/45">
                                    The family is never asked for this. Each time paperwork is generated Alloy reads
                                    the amount your charge template holds today, so changing the fee changes new
                                    paperwork without anyone editing this form.
                                </p>
                            </div>
                        ) : null}
                    </div>
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

            {field.type === "file_ref" ? (
                <>
                    <AlloyInspectorDivider />
                    <AlloyInspectorGroup title="Document requested">
                        <div data-inspector-document-type>
                            <AlloyFieldLabel>What families attach here</AlloyFieldLabel>
                            {editable ? (
                                <AlloySelect
                                    value={(field as { document_type?: string }).document_type ?? ""}
                                    onChange={(document_type) => mutate((s) => updateField(s, field.id, { document_type }))}
                                    options={DOCUMENT_TYPE_OPTIONS}
                                    testId="form-builder-document-type"
                                />
                            ) : (
                                <p className="text-[12px] font-medium text-alloy-midnight">
                                    {DOCUMENT_TYPE_OPTIONS.find(
                                        (o) => o.value === ((field as { document_type?: string }).document_type ?? ""),
                                    )?.label ?? "—"}
                                </p>
                            )}
                            <p className="mt-1.5 text-[10px] leading-snug text-alloy-midnight/45">
                                Naming the document lets Alloy tell a family which paperwork they still owe. Left
                                unspecified, anything attached here is filed as an enrolment document.
                            </p>
                        </div>
                    </AlloyInspectorGroup>
                </>
            ) : null}

            {/*
              * A collection of people has no answer type and no single destination — where each
              * entry goes is the relationship stated above, and "Form field only" beside it is a
              * contradiction an administrator has to un-learn. Same for "who provides the answer":
              * Alloy does not calculate a person.
              */}
            {field.type !== "text_block" && !isPartyCollection(field) ? (
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
                        {/*
                         * WHAT THIS ACTUALLY MEANS, in the words an administrator uses.
                         *
                         * The two selects above say where an answer is filed; neither says what
                         * that decision does. This is the sentence that settles "which answers
                         * update Alloy records, and which stay only with the form" without anyone
                         * having to know what a field_source is.
                         */}
                        {field.field_source?.field_key ? (
                            <div
                                className="rounded-lg border border-alloy-blue/20 bg-alloy-blue/[0.04] px-2.5 py-2"
                                data-testid="form-builder-destination-meaning"
                            >
                                <p className="text-[11px] font-semibold text-alloy-blue">
                                    Alloy already knows this when available
                                </p>
                                <p className="mt-0.5 text-[11px] leading-snug text-alloy-midnight/65">
                                    {storeFieldOptions.find((c) => c.id === selectedCanonicalId)?.label ??
                                        STORE_SUBJECT_OPTIONS.find((o) => o.value === storeSubject)?.label ??
                                        "An Alloy record"}
                                    {" — "}the family is asked only if it is missing, can correct it, and the answer
                                    updates the record.
                                </p>
                            </div>
                        ) : (
                            <div
                                className="rounded-lg border border-alloy-midnight/10 bg-alloy-stone/[0.06] px-2.5 py-2"
                                data-testid="form-builder-destination-meaning"
                            >
                                <p className="text-[11px] font-semibold text-alloy-midnight/70">Stored with this form</p>
                                <p className="mt-0.5 text-[11px] leading-snug text-alloy-midnight/55">
                                    Not written to the child or family record. The family is always asked for it.
                                </p>
                            </div>
                        )}
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

            {/*
              * NORMALIZATION — the three questions an imported box cannot answer for itself.
              *
              * An import produces a text box and a label. Whether the answers come from the
              * organization's own vocabulary, whether the question applies at all, and whether Alloy
              * should be calculating it instead of asking are decisions a person has to make, and
              * until now they could only be made by publishing a schema through the API.
              *
              * Each control writes the schema's OWN construct — `option_set_key`, `visibility`,
              * `derived` — through `updateField`. Nothing here is a second engine, and nothing here
              * is Enrollment-specific.
              */}
            {/*
              * REPEATED PEOPLE — the five things an administrator has to settle, in one place.
              *
              * WHAT are we collecting · WHO is each entry · HOW MANY may the family add · WHERE does
              * each entry go · WHAT RELATIONSHIP does it confirm. Assembling that from ten unrelated
              * scalar questions is how an emergency contact silently becomes household-wide.
              *
              * Every value written here is the platform's own relationship vocabulary
              * (`RELATIONSHIP_ACTION_KEYS`, `RELATIONSHIP_ACTION_SCOPE_LABELS`). Forms states the
              * intent; `lib/admin/relationship/` still performs every write.
              */}
            {isPartyCollection(field) ? (
                <>
                    <AlloyInspectorDivider />
                    <AlloyInspectorGroup title="Each entry is a person">
                        <div data-inspector-party-kind>
                            <AlloyFieldLabel>What the family is listing</AlloyFieldLabel>
                            {editable ? (
                                <AlloySelect
                                    value={party?.action_key ?? ""}
                                    onChange={(action_key) =>
                                        /*
                                         * CHANGING THE KIND REPLACES THE ROLE AND SCOPE; IT DOES NOT MERGE THEM.
                                         *
                                         * A patch that only sets the keys its preset happens to have leaves the
                                         * previous kind's behind — switching Emergency contacts to Siblings kept
                                         * `role: "emergency_contact"` on a collection of children. The role and the
                                         * scope belong to the kind, so they are cleared and re-stated together.
                                         */
                                        mutate((s2) => {
                                            const preset = PARTY_KIND_PRESETS[action_key];
                                            // `fields` is the group's own shape, not part of the
                                            // declaration — it must not leak into party_collection.
                                            const { fields: entryQuestions, ...declaration } = preset ?? { action_key, fields: undefined };
                                            const withKind = updatePartyCollection(s2, field.id, {
                                                role: undefined,
                                                scope: undefined,
                                                ...declaration,
                                            });
                                            return entryQuestions
                                                ? setPartyEntryFields(withKind, field.id, entryQuestions)
                                                : withKind;
                                        })
                                    }
                                    options={PARTY_KIND_OPTIONS}
                                    testId="form-builder-party-kind"
                                />
                            ) : (
                                <p className="text-[12px] font-medium text-alloy-midnight">
                                    {PARTY_KIND_OPTIONS.find((o) => o.value === party?.action_key)?.label ?? "—"}
                                </p>
                            )}
                            <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/55">
                                {party?.subject === "child"
                                    ? "Each entry is a child on this family's household."
                                    : "Each entry is a person, related to this child in the role below."}
                            </p>
                        </div>
                        <div data-inspector-party-scope>
                            <AlloyFieldLabel>Who it applies to</AlloyFieldLabel>
                            {editable ? (
                                <AlloySelect
                                    value={party?.scope ?? ""}
                                    onChange={(scope) => mutate((s2) => updatePartyCollection(s2, field.id, { scope }))}
                                    options={PARTY_SCOPE_OPTIONS}
                                    testId="form-builder-party-scope"
                                />
                            ) : (
                                <p className="text-[12px] font-medium text-alloy-midnight">
                                    {PARTY_SCOPE_OPTIONS.find((o) => o.value === party?.scope)?.label ?? "—"}
                                </p>
                            )}
                            <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/55">
                                An authority this form collects is not widened beyond what is chosen here.
                            </p>
                        </div>
                    </AlloyInspectorGroup>

                    <AlloyInspectorDivider />
                    <AlloyInspectorGroup title="How many the family may add">
                        <div data-inspector-party-count className="flex gap-2">
                            <div className="flex-1">
                                <AlloyFieldLabel>At least</AlloyFieldLabel>
                                <AlloyTextInput
                                    value={String(partyMin)}
                                    onChange={(v) => mutate((s2) => updatePartyRepeat(s2, field.id, { min: numberOrZero(v) }))}
                                    testId="form-builder-party-min"
                                />
                            </div>
                            <div className="flex-1">
                                <AlloyFieldLabel>At most</AlloyFieldLabel>
                                <AlloyTextInput
                                    value={partyMax}
                                    onChange={(v) => mutate((s2) => updatePartyRepeat(s2, field.id, { max: v.trim() === "" ? null : numberOrZero(v) }))}
                                    testId="form-builder-party-max"
                                />
                            </div>
                        </div>
                        <p className="text-[11px] leading-snug text-alloy-midnight/55">
                            Leave &ldquo;at most&rdquo; blank for no limit. A minimum is asked for at submit — the family is
                            never shown blank entries to fill.
                        </p>
                        <AlloyCheckbox
                            checked={party?.show_known !== false}
                            onChange={(show_known) => mutate((s2) => updatePartyCollection(s2, field.id, { show_known }))}
                            label="Show people Alloy already knows, for the family to confirm"
                        />
                        <AlloyCheckbox
                            checked={party?.allow_add !== false}
                            onChange={(allow_add) => mutate((s2) => updatePartyCollection(s2, field.id, { allow_add }))}
                            label="The family may add someone new"
                        />
                        <div>
                            <AlloyFieldLabel>Button the family sees</AlloyFieldLabel>
                            <AlloyTextInput
                                value={party?.add_another_label ?? ""}
                                onChange={(add_another_label) => mutate((s2) => updatePartyCollection(s2, field.id, { add_another_label }))}
                                placeholder={addAnotherLabel(field)}
                                testId="form-builder-party-add-label"
                            />
                        </div>
                    </AlloyInspectorGroup>
                </>
            ) : null}

            {field.type === "select" || field.type === "multiselect" ? (
                <>
                    <AlloyInspectorDivider />
                    <AlloyInspectorGroup title="Answers come from">
                        <div data-inspector-vocabulary>
                            <AlloyFieldLabel>Choices</AlloyFieldLabel>
                            {editable ? (
                                <AlloySelect
                                    value={vocabularyKey}
                                    onChange={(key) =>
                                        mutate((s2) =>
                                            key
                                                ? updateField(s2, field.id, { option_set_key: key })
                                                : updateField(s2, field.id, { option_set_key: undefined, options: inlineOptions }),
                                        )
                                    }
                                    options={[
                                        { value: "", label: "This form's own list" },
                                        ...(optionSets ?? []).map((o) => ({
                                            value: o.set_key,
                                            label: o.item_count ? `${o.label} (${o.item_count})` : o.label,
                                        })),
                                    ]}
                                    testId="form-builder-vocabulary"
                                />
                            ) : (
                                <p className="text-[12px] font-medium text-alloy-midnight">
                                    {vocabularyKey
                                        ? ((optionSets ?? []).find((o) => o.set_key === vocabularyKey)?.label ?? vocabularyKey)
                                        : "This form's own list"}
                                </p>
                            )}
                            <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/55">
                                {vocabularyKey
                                    ? "The organization maintains these choices. This question follows that list wherever it changes."
                                    : "Choices belong to this form alone. Use an organization list where one already exists, so the two cannot drift apart."}
                            </p>
                        </div>
                    </AlloyInspectorGroup>
                </>
            ) : null}

            {field.type !== "text_block" ? (
                <>
                    <AlloyInspectorDivider />
                    <AlloyInspectorGroup title="When to ask">
                        <div data-inspector-condition>
                            <AlloyFieldLabel>Ask this question</AlloyFieldLabel>
                            {editable ? (
                                <AlloySelect
                                    value={conditionSourceId}
                                    onChange={(sourceId) =>
                                        mutate((s2) =>
                                            sourceId
                                                ? updateField(s2, field.id, {
                                                      visible_when: { field_id: sourceId, equals: defaultEqualsFor(schema, sourceId) },
                                                  })
                                                : updateField(s2, field.id, { visible_when: null }),
                                        )
                                    }
                                    options={[
                                        { value: "", label: "Always" },
                                        ...conditionCandidates.map((c) => ({ value: c.id, label: `Only if — ${c.label}` })),
                                    ]}
                                    testId="form-builder-condition-source"
                                />
                            ) : (
                                <p className="text-[12px] font-medium text-alloy-midnight">
                                    {conditionSourceId
                                        ? `Only if — ${conditionCandidates.find((c) => c.id === conditionSourceId)?.label ?? conditionSourceId}`
                                        : "Always"}
                                </p>
                            )}
                        </div>
                        {conditionSourceId ? (
                            <div>
                                <AlloyFieldLabel>…is answered</AlloyFieldLabel>
                                {editable ? (
                                    <AlloySelect
                                        value={String(conditionValue ?? "")}
                                        onChange={(raw) =>
                                            mutate((s2) =>
                                                updateField(s2, field.id, {
                                                    visible_when: { field_id: conditionSourceId, equals: parseConditionValue(schema, conditionSourceId, raw) },
                                                }),
                                            )
                                        }
                                        options={conditionValueOptions(schema, conditionSourceId)}
                                        testId="form-builder-condition-value"
                                    />
                                ) : (
                                    <p className="text-[12px] font-medium text-alloy-midnight">{String(conditionValue ?? "—")}</p>
                                )}
                                <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/55">
                                    Answer anything else and this question is not asked at all — not greyed out, not
                                    skipped past.
                                </p>
                            </div>
                        ) : null}
                    </AlloyInspectorGroup>

                    {/* Alloy does not calculate a person; a collection has no single answer source. */}
                    {isPartyCollection(field) ? null : (
                    <>
                    <AlloyInspectorDivider />
                    <AlloyInspectorGroup title="Who provides the answer">
                        <div data-inspector-derived>
                            <AlloyFieldLabel>Source</AlloyFieldLabel>
                            {editable ? (
                                <AlloySelect
                                    value={derivedKind}
                                    onChange={(kind) =>
                                        mutate((s2) =>
                                            kind
                                                ? updateField(s2, field.id, {
                                                      derived: {
                                                          kind: kind as "age_from_date_of_birth" | "execution_date",
                                                          ...(kind === "age_from_date_of_birth"
                                                              ? { source_key: derivedSource || dateFields[0]?.id, as_of_key: derivedAsOf || dateFields[1]?.id }
                                                              : {}),
                                                      },
                                                  })
                                                : updateField(s2, field.id, { derived: null }),
                                        )
                                    }
                                    options={[
                                        { value: "", label: "The family answers it" },
                                        ...DERIVATION_OPTIONS.map((d) => ({ value: d.value, label: `Alloy calculates it — ${d.label}` })),
                                    ]}
                                    testId="form-builder-derived-kind"
                                />
                            ) : (
                                <p className="text-[12px] font-medium text-alloy-midnight">
                                    {derivedKind
                                        ? (DERIVATION_OPTIONS.find((d) => d.value === derivedKind)?.label ?? derivedKind)
                                        : "The family answers it"}
                                </p>
                            )}
                        </div>
                        {derivedKind === "age_from_date_of_birth" ? (
                            <>
                                <div>
                                    <AlloyFieldLabel>Date of birth</AlloyFieldLabel>
                                    <AlloySelect
                                        value={derivedSource}
                                        onChange={(source_key) =>
                                            mutate((s2) => updateField(s2, field.id, { derived: { kind: "age_from_date_of_birth", source_key, as_of_key: derivedAsOf } }))
                                        }
                                        options={[{ value: "", label: "Choose a date question…" }, ...dateFields.map((d) => ({ value: d.id, label: d.label }))]}
                                        testId="form-builder-derived-source"
                                    />
                                </div>
                                <div>
                                    <AlloyFieldLabel>Age as of</AlloyFieldLabel>
                                    <AlloySelect
                                        value={derivedAsOf}
                                        onChange={(as_of_key) =>
                                            mutate((s2) => updateField(s2, field.id, { derived: { kind: "age_from_date_of_birth", source_key: derivedSource, as_of_key } }))
                                        }
                                        options={[{ value: "", label: "Choose a date question…" }, ...dateFields.map((d) => ({ value: d.id, label: d.label }))]}
                                        testId="form-builder-derived-as-of"
                                    />
                                </div>
                                {dateFields.length < 2 ? (
                                    <p className="rounded-lg border border-alloy-ember/25 bg-alloy-ember/[0.06] px-2.5 py-2 text-[11px] text-alloy-ember" data-testid="form-builder-derived-needs-dates">
                                        This calculation needs two date questions on the form — a date of birth, and the
                                        date to measure against.
                                    </p>
                                ) : null}
                            </>
                        ) : null}
                        {derivedKind ? (
                            <p className="text-[11px] leading-snug text-alloy-midnight/55">
                                The family is never asked for this. Alloy fills it when the paperwork is prepared.
                            </p>
                        ) : null}
                    </AlloyInspectorGroup>
                    </>
                    )}
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
