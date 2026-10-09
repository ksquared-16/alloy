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
    conditionComparisonOf,
    conditionTriggerOf,
    conditionTriggerOptions,
    conditionValueOf,
    describeCondition,
    nameCompositionParts,
    parseConditionAnswer,
    setFieldVisibility,
    splitFieldIntoParts,
    suggestsNameComposition,
    type ConditionComparison,
    type ConditionTrigger,
} from "@/lib/forms/formBuilderSchema";
import { useState } from "react";
import {
    addFieldOption,
    ANSWER_KIND_OPTIONS,
    answerKindOf,
    canStructureAddressAt,
    changeAnswerKind,
    removeFieldOption,
    renameFieldOption,
    setGroupRepeat,
    structureAddressAt,
    ungroupAddress,
    type AnswerKind,
} from "@/lib/forms/formBuilderSchema";
import { relationshipLabelForGroup } from "@/lib/forms/relationshipCollectionGroup";
import ProcessingCreateFieldPanel from "./ProcessingCreateFieldPanel";
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

const COMPARISON_OPTIONS: Array<{ value: ConditionComparison; label: string }> = [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
];

const TYPED_ANSWER_PLACEHOLDER: Record<"text" | "number" | "date", string> = {
    text: "Type the exact answer",
    number: "Type a number",
    date: "",
};

const TYPED_ANSWER_HINT: Record<"text" | "number" | "date", string> = {
    text: "Enter the exact answer that reveals this question.",
    number: "Enter a number.",
    date: "Enter a full date.",
};

function answerKey(value: string | number | boolean | null | undefined): string {
    return value === true ? "true" : value === false ? "false" : value === null || value === undefined ? "" : String(value);
}

/**
 * THE CONDITION, in business language: Question · Comparison · Answer.
 *
 * "Does your child have siblings?" · is · Yes — then this question is asked. An operator never sees
 * `visibility`, a field id or a clause. The comparisons are the runtime's own `eq` / `neq`, and the
 * answer is entered the way the controlling question is answered: picked for a yes/no or a dropdown,
 * typed for text, a number or a date. Nothing is written until the rule is complete — choosing a
 * question that needs a typed answer waits for that answer rather than saving a half-rule that would
 * hide the question from everyone.
 */
function ConditionEditor({
    field,
    schema,
    editable,
    mutate,
}: {
    field: FormField;
    schema: FormSchemaV1;
    editable: boolean;
    mutate: (fn: (s: FormSchemaV1) => FormSchemaV1) => void;
}) {
    const { eligible, unavailable } = conditionTriggerOptions(schema, field.id);
    const savedTrigger = conditionTriggerOf(field);
    const savedComparison = conditionComparisonOf(field);
    const savedValue = conditionValueOf(field);

    // A rule still being written: question (and comparison) chosen, typed answer not yet entered.
    const [pending, setPending] = useState<{ triggerId: string; comparison: ConditionComparison } | null>(null);
    const [typed, setTyped] = useState<string>(
        savedTrigger && typeof savedValue !== "boolean" ? answerKey(savedValue) : "",
    );

    const triggerId = pending?.triggerId ?? savedTrigger;
    const comparison = pending?.comparison ?? savedComparison;
    const trigger: ConditionTrigger | null = eligible.find((t) => t.id === triggerId) ?? null;
    const sentence = pending ? null : describeCondition(schema, field);
    const controllingCondition = trigger
        ? describeCondition(schema, schema.fields.find((f) => f.id === trigger.id) ?? field)
        : null;

    const write = (next: { triggerId: string; comparison: ConditionComparison; value: string | number | boolean }) =>
        mutate((sch) => setFieldVisibility(sch, field.id, { triggerFieldId: next.triggerId, comparison: next.comparison, value: next.value }));

    const chooseQuestion = (id: string) => {
        if (!id) {
            setPending(null);
            setTyped("");
            mutate((sch) => setFieldVisibility(sch, field.id, null));
            return;
        }
        const t = eligible.find((x) => x.id === id);
        if (!t) return;
        if (t.kind === "boolean" || t.kind === "choice") {
            setPending(null);
            const first = t.answers[0]?.value;
            if (first !== undefined) write({ triggerId: id, comparison, value: first });
            return;
        }
        setTyped("");
        setPending({ triggerId: id, comparison });
    };

    const chooseComparison = (next: ConditionComparison) => {
        if (pending) {
            setPending({ ...pending, comparison: next });
            return;
        }
        if (savedTrigger && savedValue !== undefined && savedValue !== null) {
            write({ triggerId: savedTrigger, comparison: next, value: savedValue });
        }
    };

    const typeAnswer = (raw: string) => {
        setTyped(raw);
        if (!trigger || trigger.kind === "boolean" || trigger.kind === "choice") return;
        const value = parseConditionAnswer(trigger.kind, raw);
        if (value === null) return;
        setPending(null);
        write({ triggerId: trigger.id, comparison, value });
    };

    const typedKind = trigger && (trigger.kind === "text" || trigger.kind === "number" || trigger.kind === "date") ? trigger.kind : null;
    const typedValid = typedKind ? parseConditionAnswer(typedKind, typed) !== null : true;

    const unavailableNote = unavailable.length ? (
        <details className="text-[10.5px] text-alloy-midnight/50" data-inspector-condition-unavailable>
            <summary className="cursor-pointer underline underline-offset-2">
                Why can’t I choose {unavailable.length === 1 ? "one question" : `${unavailable.length} questions`}?
            </summary>
            <ul className="mt-1 space-y-1">
                {unavailable.map((u) => (
                    <li key={u.id} data-inspector-condition-unavailable-item={u.id}>
                        <span className="font-medium text-alloy-midnight/65">{u.label}</span> — {u.reason}
                    </li>
                ))}
            </ul>
        </details>
    ) : null;

    if (eligible.length === 0 && !savedTrigger) {
        return (
            <>
                <p className="text-[11px] leading-relaxed text-alloy-midnight/50" data-inspector-condition-none>
                    No question on this form can control this one yet. A controlling question needs a single
                    answer: Yes / No, a dropdown with choices, short text, a number or a date.
                </p>
                {unavailableNote}
            </>
        );
    }

    const questionOptions = eligible.map((t) => ({ value: t.id, label: t.label }));
    if (savedTrigger && !eligible.some((t) => t.id === savedTrigger)) {
        questionOptions.push({
            value: savedTrigger,
            label: schema.fields.find((f) => f.id === savedTrigger)?.label ?? "A question that is no longer on this form",
        });
    }

    return (
        <>
            <div data-inspector-condition-question>
                <AlloyFieldLabel>Question</AlloyFieldLabel>
                <AlloySelect
                    value={triggerId ?? ""}
                    onChange={chooseQuestion}
                    placeholder="Always ask this question"
                    options={questionOptions}
                    disabled={!editable}
                    testId="form-builder-condition-question"
                />
            </div>
            {triggerId && trigger ? (
                <>
                    <div data-inspector-condition-comparison>
                        <AlloyFieldLabel>Comparison</AlloyFieldLabel>
                        <AlloySegmentControl
                            value={comparison}
                            onChange={chooseComparison}
                            options={COMPARISON_OPTIONS}
                            disabled={!editable}
                            testId="form-builder-condition-comparison"
                        />
                    </div>
                    <div data-inspector-condition-answer>
                        <AlloyFieldLabel>Answer</AlloyFieldLabel>
                        {typedKind ? (
                            <>
                                <AlloyTextInput
                                    type={typedKind}
                                    value={typed}
                                    onChange={typeAnswer}
                                    placeholder={TYPED_ANSWER_PLACEHOLDER[typedKind]}
                                    disabled={!editable}
                                    testId="form-builder-condition-answer-input"
                                />
                                {!typedValid || pending ? (
                                    <p className="mt-1 text-[10.5px] text-alloy-midnight/50" data-inspector-condition-pending>
                                        {TYPED_ANSWER_HINT[typedKind]} Nothing changes for families until you do.
                                    </p>
                                ) : null}
                            </>
                        ) : (
                            <AlloySelect
                                value={answerKey(savedValue)}
                                onChange={(raw) => {
                                    const answer = trigger.answers.find((a) => answerKey(a.value) === raw);
                                    if (answer) write({ triggerId: trigger.id, comparison, value: answer.value });
                                }}
                                options={trigger.answers.map((a) => ({ value: answerKey(a.value), label: a.label }))}
                                disabled={!editable}
                                testId="form-builder-condition-answer"
                            />
                        )}
                    </div>
                </>
            ) : null}
            {sentence ? (
                <>
                    <p
                        className="rounded-md bg-alloy-bend-pine/[0.08] px-2.5 py-1.5 text-[11.5px] font-medium text-alloy-bend-pine"
                        data-inspector-condition-sentence
                    >
                        {sentence}
                    </p>
                    <p className="text-[11px] leading-relaxed text-alloy-midnight/55">
                        Families whose answer doesn’t match are never shown this question, and it is never required of them.
                    </p>
                    {controllingCondition ? (
                        <p className="text-[11px] leading-relaxed text-alloy-midnight/55" data-inspector-condition-chain>
                            “{trigger?.label}” is itself conditional ({controllingCondition.replace(/^Only asked when /, "asked when ")}), so
                            this question is only asked when both are true.
                        </p>
                    ) : null}
                </>
            ) : null}
            {triggerId && editable ? (
                <button
                    type="button"
                    onClick={() => chooseQuestion("")}
                    data-inspector-condition-clear
                    className="text-[11px] font-medium text-alloy-midnight/55 underline underline-offset-2"
                >
                    Always ask this question
                </button>
            ) : null}
            {unavailableNote}
        </>
    );
}

/**
 * A dropdown's own choices. `updateField` always accepted options; nothing in either Studio let an
 * operator see or change them, so a choice question kept whatever the importer or the default gave it.
 * A choice's stored value survives a rename, and removing one releases any follow-up waiting for it.
 */
function ChoicesEditor({
    field,
    editable,
    mutate,
}: {
    field: FormField;
    editable: boolean;
    mutate: (fn: (s: FormSchemaV1) => FormSchemaV1) => void;
}) {
    const options = (field as { static_options?: Array<{ value: string; label: string }> }).static_options ?? [];
    return (
        <div data-inspector-choices>
            <AlloyFieldLabel>Choices</AlloyFieldLabel>
            <ul className="space-y-1">
                {options.map((o, i) => (
                    <li key={o.value} className="flex items-center gap-1.5">
                        {editable ? (
                            <AlloyTextInput
                                value={o.label}
                                onChange={(label) => mutate((s) => renameFieldOption(s, field.id, i, label))}
                                testId={`form-builder-option-${i}`}
                            />
                        ) : (
                            <span className="text-[12px] text-alloy-midnight/75">{o.label}</span>
                        )}
                        {editable && options.length > 1 ? (
                            <button
                                type="button"
                                aria-label={`Remove ${o.label}`}
                                onClick={() => mutate((s) => removeFieldOption(s, field.id, i))}
                                data-testid={`form-builder-option-remove-${i}`}
                                className="shrink-0 px-1 text-[12px] text-alloy-midnight/40 hover:text-rose-600"
                            >
                                ✕
                            </button>
                        ) : null}
                    </li>
                ))}
            </ul>
            {editable ? (
                <button
                    type="button"
                    onClick={() => mutate((s) => addFieldOption(s, field.id))}
                    data-testid="form-builder-option-add"
                    className="mt-1 text-[11px] font-medium text-alloy-bend-pine underline underline-offset-2"
                >
                    + Add choice
                </button>
            ) : null}
        </div>
    );
}

/**
 * A GROUP: repeatable people, an address, or a plain repeating set.
 *
 * Which relationship a people group collects is named from the canonical relationship definitions —
 * never a key typed here. The minimum and maximum are the schema's own `repeat` rules, which the
 * participant runtime enforces on submit, so "at least two emergency contacts" is a rule, not prose.
 */
function GroupPanel({
    field,
    schema,
    editable,
    mutate,
}: {
    field: FormField;
    schema: FormSchemaV1;
    editable: boolean;
    mutate: (fn: (s: FormSchemaV1) => FormSchemaV1) => void;
}) {
    const group = field as FormField & {
        fields: FormField[];
        repeat?: { min?: number; max?: number };
        address_binding?: { subject: string; role: string };
        collection_binding?: { collection_provider_ref: string };
    };
    const relationship = relationshipLabelForGroup(field);
    const isAddress = Boolean(group.address_binding);
    const repeats = Boolean(group.repeat) && !isAddress;
    const min = group.repeat?.min ?? 0;
    const max = group.repeat?.max ?? null;
    const [minDraft, setMinDraft] = useState(String(min));
    const [maxDraft, setMaxDraft] = useState(max == null ? "" : String(max));
    const commit = (nextMin: string, nextMax: string) => {
        const m = Number(nextMin);
        const x = nextMax.trim() === "" ? null : Number(nextMax);
        if (!Number.isInteger(m) || (x != null && !Number.isInteger(x))) return;
        mutate((s) => setGroupRepeat(s, field.id, { min: m, max: x }));
    };
    void schema;
    return (
        <AlloyInspectorGroup title={isAddress ? "Address" : relationship ? "People" : "Group"}>
            <div data-inspector-group>
                {relationship ? (
                    <p className="text-[12px] font-medium text-alloy-midnight" data-inspector-group-relationship>
                        Collects: {relationship}
                    </p>
                ) : isAddress ? (
                    <p className="text-[12px] font-medium text-alloy-midnight">One address, each line stored on its own.</p>
                ) : null}
                <p className="mt-1 text-[11px] text-alloy-midnight/55">
                    Asks: {group.fields.map((f) => f.label).join(" · ") || "—"}
                </p>
            </div>
            {repeats ? (
                <div className="grid grid-cols-2 gap-2" data-inspector-group-repeat>
                    <div>
                        <AlloyFieldLabel>Minimum</AlloyFieldLabel>
                        <AlloyTextInput
                            type="number"
                            value={minDraft}
                            disabled={!editable}
                            onChange={(v) => {
                                setMinDraft(v);
                                commit(v, maxDraft);
                            }}
                            testId="form-builder-group-min"
                        />
                    </div>
                    <div>
                        <AlloyFieldLabel>Maximum</AlloyFieldLabel>
                        <AlloyTextInput
                            type="number"
                            value={maxDraft}
                            disabled={!editable}
                            placeholder="No limit"
                            onChange={(v) => {
                                setMaxDraft(v);
                                commit(minDraft, v);
                            }}
                            testId="form-builder-group-max"
                        />
                    </div>
                    <p className="col-span-2 text-[10px] leading-snug text-alloy-midnight/45" data-inspector-group-repeat-summary>
                        {min > 0 ? `Families must add at least ${min}.` : "Families may add none."}
                        {max != null ? ` At most ${max}.` : " Families can keep adding more."}
                    </p>
                </div>
            ) : null}
            {editable && isAddress ? (
                <AlloySecondaryButton onClick={() => mutate((s) => ungroupAddress(s, field.id))} testId="form-builder-ungroup-address">
                    Separate into individual questions
                </AlloySecondaryButton>
            ) : null}
        </AlloyInspectorGroup>
    );
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

            {editable && suggestsNameComposition(field) ? (
                <>
                    <AlloyInspectorDivider />
                    {/*
                      * A page prints a person's name on one rule; the record keeps a first and a last
                      * name. Offered, never applied on the operator's behalf — the document was explicit
                      * and this is a change to what families are asked.
                      */}
                    <AlloyInspectorGroup title="This looks like one person's full name">
                        <p className="text-[11px] leading-relaxed text-alloy-midnight/60">
                            Alloy can ask for it as two questions instead, side by side, so each part can be
                            stored on its own.
                        </p>
                        <AlloySecondaryButton
                            onClick={() => mutate((sch) => splitFieldIntoParts(sch, field.id, nameCompositionParts(field)))}
                            testId="form-builder-split-field"
                        >
                            Split into first and last name
                        </AlloySecondaryButton>
                        <p className="text-[10px] leading-snug text-alloy-midnight/45">
                            This replaces the question, so families are not asked for the name twice.
                        </p>
                    </AlloyInspectorGroup>
                </>
            ) : null}

            {field.type === "group" ? (
                <>
                    <AlloyInspectorDivider />
                    <GroupPanel key={field.id} field={field} schema={schema} editable={editable} mutate={mutate} />
                </>
            ) : field.type !== "text_block" ? (
                <>
                    <AlloyInspectorDivider />
                    <AlloyInspectorGroup title="Answer">
                        <div data-inspector-answer-type>
                            <AlloyFieldLabel>Answer type</AlloyFieldLabel>
                            {editable && answerKindOf(field) ? (
                                <AlloySelect
                                    value={answerKindOf(field) ?? ""}
                                    onChange={(kind) => mutate((s) => changeAnswerKind(s, field.id, kind as AnswerKind))}
                                    options={ANSWER_KIND_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                                    allowEmpty={false}
                                    testId="form-builder-answer-type"
                                />
                            ) : (
                                <p className="text-[12px] font-medium text-alloy-midnight/75">{answerTypeLabel(field)}</p>
                            )}
                        </div>
                        {field.type === "select" || field.type === "multiselect" ? (
                            <ChoicesEditor field={field} editable={editable} mutate={mutate} />
                        ) : null}
                        {editable && canStructureAddressAt(schema, field.id) ? (
                            <div data-inspector-address-structure>
                                <AlloySecondaryButton
                                    onClick={() => mutate((s) => structureAddressAt(s, field.id))}
                                    testId="form-builder-structure-address"
                                >
                                    Group these lines as one address
                                </AlloySecondaryButton>
                                <p className="mt-1 text-[10px] leading-snug text-alloy-midnight/45">
                                    The address lines around this one become one address — each line still stored on its own.
                                </p>
                            </div>
                        ) : null}
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
                        {editable && !selectedCanonicalId ? (
                            <ProcessingCreateFieldPanel
                                field={field}
                                onCreated={(destination) => mutate((s) => updateField(s, field.id, { field_source: destination }))}
                            />
                        ) : null}
                    </AlloyInspectorGroup>
                </>
            ) : null}

            {field.type !== "text_block" ? (
                <>
                    <AlloyInspectorDivider />
                    {/*
                      * THE CONDITION, in business language.
                      *
                      * The capability persisted and the participant runtime honoured it; there was simply
                      * nowhere to see or set it while authoring. An operator needs three facts — which
                      * question controls this one, which answer reveals it, and that this question is
                      * conditional at all — and none of them is `visibility`, a field id or a clause.
                      */}
                    <AlloyInspectorGroup title="Show this question when…">
                        <ConditionEditor key={field.id} field={field} schema={schema} editable={editable} mutate={mutate} />
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
