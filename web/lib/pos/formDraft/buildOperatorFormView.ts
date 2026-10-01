/**
 * The imported document, shown as the FORM it became.
 *
 * ## Why this exists
 *
 * Extraction already works. It finds questions, answer types, sections, static prose, signatures,
 * canonical destinations, derived values and repeatable people, and it records where each came from in
 * the source. What it did not have was an operator surface: the first thing a person saw after
 * importing their paperwork was a decision queue — "84 concepts from 104 questions", "26 decisions only
 * you can make", "Owner undecided", "Ambiguous grain" — which is the engine's own bookkeeping, not a
 * form. Nobody importing a school's admissions packet is trying to resolve concept ownership. They are
 * trying to see the form they just got, and fix the bits that are wrong.
 *
 * So this is a PRESENTER. It reads `StoredFormDraftPreview` and nothing else, changes no stored data,
 * and answers one question: what does this document look like as a form, and which parts need a human?
 *
 * ## The vocabulary rule
 *
 * Nothing here emits `owner_hint`, `entity_type`, `field_key`, `collection_provider_ref`,
 * `requirement kind` or a confidence band as operator-facing text. Those are how the engine thinks. An
 * operator gets "Alloy already knows this" and "Alloy needs you to say whose address this is".
 */

import type {
    DraftCollectionGroup,
    DraftFormField,
    DraftFormSection,
    StoredFormDraftPreview,
} from "@/lib/pos/processingCase/formDraft/types";

/** How a question's destination stands, in the operator's terms. */
export type MappingState =
    /** Alloy knows where this belongs and will not ask the family to retype it. */
    | "known"
    /** Alloy has a proposal the operator should confirm. */
    | "suggested"
    /** Alloy could not decide; the operator must. This is what gets red-lined. */
    | "needs_review"
    /** Collected as evidence on the form, with no canonical destination, on purpose. */
    | "form_only"
    /** Alloy works this out itself and should not ask at all. */
    | "derived";

export type SourceContext = {
    /** The words in the document this question came from, when the engine kept them. */
    readonly excerpt: string | null;
    readonly page: number | null;
    /** The widget name on a fillable PDF, when there was one. */
    readonly sourceFieldName: string | null;
};

export type FormViewQuestion = {
    readonly kind: "question";
    readonly id: string;
    readonly label: string;
    /** "Date", "Yes / No", "Upload", "Signature" — what the family will be asked for. */
    readonly answerShape: string;
    readonly required: boolean;
    readonly mapping: MappingState;
    /** One plain sentence. Never engineering vocabulary. */
    readonly mappingText: string;
    /** Present only when the operator has something to decide. */
    readonly decisionPrompt: string | null;
    readonly options: readonly string[];
    readonly source: SourceContext;
    /** Questions shown only when this one is answered a particular way. */
    readonly dependents: readonly FormViewQuestion[];
    /** How sure the condition is, when there is one. */
    readonly conditionConfidence: "detected" | "suggested" | null;
    readonly conditionTriggerLabel: string | null;
};

export type FormViewRepeatGroup = {
    readonly kind: "repeat_group";
    readonly id: string;
    readonly label: string;
    readonly addLabel: string;
    /** "Alloy can reuse parents and guardians it already knows." */
    readonly reuseText: string | null;
    readonly questions: readonly FormViewQuestion[];
    /** How many the source document appeared to provide room for. */
    readonly observedInSource: number | null;
};

export type FormViewProse = {
    readonly kind: "prose";
    readonly id: string;
    /** Text the family reads rather than answers. */
    readonly text: string;
};

export type FormViewItem = FormViewQuestion | FormViewRepeatGroup | FormViewProse;

export type FormViewSection = {
    readonly id: string;
    readonly title: string;
    readonly items: readonly FormViewItem[];
};

export type OperatorFormView = {
    readonly title: string;
    readonly sourceDocumentName: string | null;
    readonly sections: readonly FormViewSection[];
    /** Every question the operator must decide, flattened, so the surface can lead with a count. */
    readonly needsReview: readonly { readonly id: string; readonly label: string; readonly prompt: string }[];
    /** Questions Alloy already knows the destination for — the quiet win worth stating once. */
    readonly knownCount: number;
    readonly questionCount: number;
};

/* ------------------------------------------------------------------ answer shapes */

const ANSWER_SHAPE: Record<string, string> = {
    text: "Text",
    number: "Number",
    date: "Date",
    boolean: "Yes / No",
    select: "Choice",
    multiselect: "Choose several",
    file_ref: "Upload",
    signature: "Signature",
};

function answerShapeFor(field: { type: string; options?: readonly string[] }): string {
    if (field.options?.length && (field.type === "text" || field.type === "select")) return "Choice";
    return ANSWER_SHAPE[field.type] ?? "Text";
}

/* ------------------------------------------------------------------ plain-language destinations */

/**
 * Entity names an operator recognises.
 *
 * The engine's `entity_type` is a table-shaped word. "customer_member" is a child; "customer" is the
 * household. Anything unrecognised deliberately falls back to a neutral phrase rather than leaking the
 * raw token into the page.
 */
const ENTITY_NOUN: Record<string, string> = {
    customer_member: "the child",
    child: "the child",
    person: "a parent or guardian",
    parent: "a parent or guardian",
    guardian: "a parent or guardian",
    customer: "the household",
    household: "the household",
    opportunity: "this enrolment",
    contact: "a contact",
};

function humanFieldName(fieldKey: string): string {
    const cleaned = fieldKey.replace(/_/g, " ").trim();
    return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "";
}

function destinationSentence(source: { entity_type?: string; field_key?: string } | undefined): string | null {
    const entity = ENTITY_NOUN[(source?.entity_type ?? "").toLowerCase()];
    const field = humanFieldName(source?.field_key ?? "");
    if (!entity || !field) return null;
    return `${field} for ${entity}`;
}

/* ------------------------------------------------------------------ mapping state */

function mappingFor(field: DraftFormField): { state: MappingState; text: string; prompt: string | null } {
    if (field.derived) {
        return {
            state: "derived",
            text: "Alloy works this out itself — the family is not asked.",
            prompt: null,
        };
    }
    const destination = destinationSentence(field.field_source);
    if (destination) {
        /*
         * A destination the engine was unsure of is a PROPOSAL, not knowledge. Confidence is only used
         * to tell those two apart — it is never shown as a band or a percentage.
         */
        if (field.confidence === "low") {
            return {
                state: "suggested",
                text: `Alloy thinks this is ${destination}. Worth confirming.`,
                prompt: `Is this ${destination}?`,
            };
        }
        return { state: "known", text: `Alloy already knows this — ${destination}.`, prompt: null };
    }
    if (field.confidence === "low") {
        return {
            state: "needs_review",
            text: "Alloy could not tell who this belongs to.",
            prompt: "Who does this answer belong to?",
        };
    }
    return {
        state: "form_only",
        text: "Kept with the form as the family's answer.",
        prompt: null,
    };
}

/* ------------------------------------------------------------------ conditionals */

/**
 * Does this label read as a follow-up to the question before it?
 *
 * Paper asks "Does the child have allergies?" and then "If yes, please describe". Extraction produces
 * two independent questions, because that is what the page literally contains. Leaving them
 * independent means the operator has to notice the relationship themselves and the family gets asked
 * to describe allergies they just said they do not have.
 *
 * Detected only after a yes/no question, and only from the follow-up's own wording — never invented.
 * An explicit "if yes" is treated as detected; a bare "please describe" or "if so" as suggested, so the
 * operator is told which ones to look at.
 */
const EXPLICIT_IF = /^\s*(if\s+(yes|so|true|checked|applicable)\b|if\s+the\s+answer\s+is\s+yes\b)/i;
const SOFT_FOLLOW_UP = /^\s*(please\s+(describe|explain|list|specify)|if\s+(no|not)\b|describe\b|explain\b|details?\b|which\b|list\b)/i;

function conditionFor(
    previous: DraftFormField | null,
    field: DraftFormField,
): { confidence: "detected" | "suggested"; trigger: string } | null {
    if (!previous || previous.type !== "boolean") return null;
    if (field.type === "signature" || field.type === "file_ref") return null;
    if (EXPLICIT_IF.test(field.label)) return { confidence: "detected", trigger: "Yes" };
    if (SOFT_FOLLOW_UP.test(field.label)) return { confidence: "suggested", trigger: "Yes" };
    return null;
}

/* ------------------------------------------------------------------ building */

function sourceContextFor(field: DraftFormField): SourceContext {
    return {
        excerpt: field.evidence?.trim() ? field.evidence.trim() : null,
        page: typeof field.page === "number" ? field.page : null,
        sourceFieldName: field.pdf_field_name?.trim() ? field.pdf_field_name.trim() : null,
    };
}

function toQuestion(field: DraftFormField): FormViewQuestion {
    const mapping = mappingFor(field);
    return {
        kind: "question",
        id: field.id,
        label: field.label,
        answerShape: answerShapeFor(field),
        required: Boolean(field.required),
        mapping: mapping.state,
        mappingText: mapping.text,
        decisionPrompt: mapping.prompt,
        options: field.options ?? [],
        source: sourceContextFor(field),
        dependents: [],
        conditionConfidence: null,
        conditionTriggerLabel: null,
    };
}

function repeatGroupFor(group: DraftCollectionGroup): FormViewRepeatGroup {
    const noun = (group.label ?? "").trim() || "People";
    const singular = noun.replace(/s$/i, "").toLowerCase();
    return {
        kind: "repeat_group",
        id: group.id,
        label: noun,
        addLabel: `Add ${singular}`,
        /*
         * The product value of a collection, said once: the source listed #1/#2/#3 and Alloy understood
         * that as one repeatable thing, which means a family can reuse people it already told you about.
         */
        reuseText: `Alloy can reuse ${noun.toLowerCase()} it already knows, instead of asking again.`,
        questions: (group.nested_fields ?? []).map((nested) =>
            toQuestion({
                id: nested.id,
                label: nested.label,
                type: nested.type,
                required: nested.required,
                confidence: "high",
                ...(nested.field_source ? { field_source: nested.field_source } : {}),
            } as DraftFormField),
        ),
        observedInSource:
            typeof group.observed_instance_count === "number" && group.observed_instance_count > 0
                ? group.observed_instance_count
                : null,
    };
}

export function buildOperatorFormView(
    draft: Pick<StoredFormDraftPreview, "title" | "generated_form_name" | "sections" | "fields" | "collections">,
    sourceDocumentName?: string | null,
): OperatorFormView {
    const fieldsById = new Map<string, DraftFormField>((draft.fields ?? []).map((f) => [f.id, f]));
    const collections = draft.collections ?? [];
    /*
     * A question the projection replaced is NOT shown beside the group that replaced it. It stays on
     * the draft as evidence, but showing both is how "Parent 2 First Name" ends up on screen next to the
     * repeatable Parents group — the exact confusion collections exist to remove.
     */
    const suppressed = new Set<string>(
        (draft.fields ?? []).filter((f) => f.suppressed_by_collection).map((f) => f.id),
    );
    const groupBySuppressedId = new Map<string, DraftCollectionGroup>();
    for (const group of collections) {
        for (const nested of group.nested_fields ?? []) {
            for (const sourceId of nested.source_field_ids ?? []) groupBySuppressedId.set(sourceId, group);
        }
    }

    const sections: FormViewSection[] = [];
    const needsReview: { id: string; label: string; prompt: string }[] = [];
    let knownCount = 0;
    let questionCount = 0;
    const emittedGroups = new Set<string>();

    const sectionList: DraftFormSection[] =
        draft.sections?.length
            ? [...draft.sections]
            : [{ id: "all", title: "Questions", field_ids: (draft.fields ?? []).map((f) => f.id) } as DraftFormSection];

    for (const section of sectionList) {
        const items: FormViewItem[] = [];
        const prose = (section.static_text ?? "").trim();
        if (prose) items.push({ kind: "prose", id: `${section.id}-prose`, text: prose });

        let previous: DraftFormField | null = null;
        for (const fieldId of section.field_ids ?? []) {
            const field = fieldsById.get(fieldId);
            if (!field) continue;

            if (suppressed.has(field.id)) {
                // Emit the replacing group once, in the place its first member appeared.
                const group = groupBySuppressedId.get(field.id);
                if (group && !emittedGroups.has(group.id)) {
                    emittedGroups.add(group.id);
                    const built = repeatGroupFor(group);
                    items.push(built);
                    for (const q of built.questions) {
                        questionCount += 1;
                        if (q.mapping === "known") knownCount += 1;
                    }
                }
                continue;
            }

            // Prose placed on the artifact but never asked is explanatory text, not a question.
            if (field.read_only && !field.derived) {
                items.push({ kind: "prose", id: field.id, text: field.label });
                previous = null;
                continue;
            }

            const question = toQuestion(field);
            questionCount += 1;
            if (question.mapping === "known") knownCount += 1;
            if (question.decisionPrompt && question.mapping === "needs_review") {
                needsReview.push({ id: question.id, label: question.label, prompt: question.decisionPrompt });
            }

            const condition = conditionFor(previous, field);
            const lastItem = items[items.length - 1];
            if (condition && lastItem && lastItem.kind === "question") {
                items[items.length - 1] = {
                    ...lastItem,
                    dependents: [...lastItem.dependents, question],
                    conditionConfidence: condition.confidence,
                    conditionTriggerLabel: condition.trigger,
                };
            } else {
                items.push(question);
            }
            previous = field;
        }

        if (items.length) sections.push({ id: section.id, title: section.title, items });
    }

    // A group whose members never appeared in a section still belongs on the form.
    for (const group of collections) {
        if (emittedGroups.has(group.id)) continue;
        const built = repeatGroupFor(group);
        for (const q of built.questions) {
            questionCount += 1;
            if (q.mapping === "known") knownCount += 1;
        }
        sections.push({ id: `collection-${group.id}`, title: built.label, items: [built] });
    }

    return {
        title: (draft.generated_form_name ?? "").trim() || draft.title || "Untitled form",
        sourceDocumentName: sourceDocumentName?.trim() ? sourceDocumentName.trim() : null,
        sections,
        needsReview,
        knownCount,
        questionCount,
    };
}
