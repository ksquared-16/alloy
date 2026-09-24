/**
 * A COMPILED participant artifact — the paperwork Alloy filled out, as something to read.
 *
 * ## The abstraction gap this closes
 *
 * `FormEngineRenderer` takes a schema, a payload and `mode: "edit" | "readonly"`. That mode is the
 * whole vocabulary, and it is per-FORM: every control is editable, or none is. So the only thing the
 * runtime could hand a parent after the conversation was the entire form as inputs — including the
 * two facts they had just settled, rendered as empty-looking boxes to fill in again.
 *
 * The missing piece was never a document model. It is a CLASSIFICATION: for each control, what does
 * the runtime already know about it? Answer that and the review writes itself — resolved facts read
 * as facts, artifact-specific work reads as work, and the legal actions stay where they belong.
 *
 * ## Not a second Forms authority
 *
 * Nothing here validates, submits, signs, or stores. Every input is already owned elsewhere:
 *
 *   schema            the pinned `form_definition_version` (D-94)
 *   values            canonical record + session shared values, in that precedence
 *   binding identity  `canonicalKeyFor` — the SAME derivation that keys an information need
 *   what collects     `formFieldCollectsValue` — shared with the packet plan and needs projection
 *
 * It is a view model derived from those, and it holds no truth of its own. Delete it and the
 * artifact still submits; you just lose the ability to show a parent what was filled in for them.
 *
 * ## Why this survives the document renderer
 *
 * The future target is an uploaded original document, filled and shown in its own format. That
 * renderer needs exactly this classification and nothing more — which control carries a resolved
 * value, which still needs the participant, which is a signature. The HTML review below is one
 * renderer OF this model, not the model itself.
 *
 * Pure. No I/O.
 */

import { canonicalKeyFor } from "@/lib/pos/packet/packetFieldPlan";
import {
    participantFacingLabel,
    sourceFieldNamesByFieldId,
    type SourceFieldMapping,
} from "@/lib/enrollment/participantRuntime/sourceLabelIdentity";
import { fieldIsAcknowledgement } from "@/lib/enrollment/informationNeeds/participantCollectionMode";
import { formFieldCollectsValue } from "@/lib/forms/formFieldCollectsValue";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import { authoredChoices, choiceLabels, type ParticipantChoice } from "@/lib/enrollment/informationNeeds/participantChoices";

export type CompiledControlKind =
    /** A shared fact the conversation settled. Shown as a fact, editable on request. */
    | "resolved_shared_value"
    /** Belongs to this artifact alone and still needs the participant. */
    | "unresolved_artifact_specific"
    | "acknowledgment"
    | "signature"
    /** Authored prose and headings — the document's own content. */
    | "display_content";

export type CompiledArtifactControl = {
    readonly field_id: string;
    readonly label: string;
    /**
     * The words Alloy may print for this control — null when the authored label is the source
     * document's own widget name and therefore says nothing to a parent.
     *
     * A caller that prints `label` instead of this one has reintroduced the source-label leak.
     */
    readonly participant_label: string | null;
    readonly kind: CompiledControlKind;
    /** The authored control type, so an edit uses the same semantics the Form would. */
    readonly input_type: string;
    /** A label beside a value — `display_value` is what a person reads. */
    readonly options: readonly ParticipantChoice[];
    readonly required: boolean;
    readonly value: unknown;
    /**
     * The value as a PERSON reads it — the chosen option's label, where the control has options.
     *
     * The canonical `value` is what the Form stores and what every consumer writes; this is what is
     * printed. Separating them is the whole point: an artifact that printed `value` for a closed
     * question showed a family `option_1` on the document they were about to sign.
     */
    readonly display_value: string;
    /** Authored prose, for `display_content`. */
    readonly content: string | null;
    /**
     * The canonical binding identity, when the control has one.
     *
     * This is what makes an EDIT a shared-value write rather than a form patch: every control
     * carrying the same key is the same fact, so a correction applied to one must show on all of
     * them. Null for the artifact's own controls — they have no shared identity to write to.
     */
    readonly shared_key: string | null;
};

export type CompiledArtifactSection = {
    readonly title: string | null;
    readonly controls: readonly CompiledArtifactControl[];
};

export type CompiledArtifact = {
    readonly sections: readonly CompiledArtifactSection[];
    /** Everything the participant still has to do, in document order. */
    readonly outstanding: readonly CompiledArtifactControl[];
    readonly acknowledgments: readonly CompiledArtifactControl[];
    readonly signatures: readonly CompiledArtifactControl[];
    /** Facts filled in for the participant — what "I filled this out for you" refers to. */
    readonly resolved: readonly CompiledArtifactControl[];
};

function hasValue(value: unknown): boolean {
    if (value == null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "boolean") return value;
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

/**
 * The choices a control offers, label and value both.
 *
 * One reader, shared with the conversation. This used to collapse each choice to its value, so an
 * artifact printed `option_1` where the parent had chosen "Yes" — the same loss the conversation
 * had, in the document a family signs.
 */
/**
 * What is printed for one control's value.
 *
 * A closed question prints the chosen option's words; a multi-select prints each of them. Anything
 * else prints itself. An answer with no matching choice still prints, because it is the answer that
 * was given and hiding it would be worse than showing a key.
 */
function displayForControl(options: readonly ParticipantChoice[], value: unknown): string {
    if (!options.length) return value == null ? "" : Array.isArray(value) ? value.map(String).join(", ") : String(value);
    return choiceLabels(options, value).join(", ");
}

function readOptions(field: unknown): readonly ParticipantChoice[] {
    return authoredChoices(field);
}

/**
 * Classify one control.
 *
 * Signature and acknowledgment are recognised STRUCTURALLY, not by reading their labels: a signature
 * is the authored signature type, and an acknowledgment is a REQUIRED boolean with no canonical
 * binding — an affirmation the participant must make before the document is complete. A
 * label-matching rule would break the moment a tenant wrote "I agree" instead.
 *
 * `required` is load-bearing, not decoration. Without it every optional tickbox on an imported
 * document became an acknowledgment: the Oregon CIS's "check if the child had chickenpox" and all
 * fourteen of the Exemption's vaccine and reason boxes were gathered under "please confirm you have
 * reviewed the information above" — a legal affirmation manufactured out of a status question a
 * parent is free to leave blank. An optional unbound boolean is this artifact's own work, and it is
 * classified as exactly that.
 */
function classify(
    field: FormField,
    sharedKey: string | null,
    value: unknown,
    participantLabel: string | null,
): CompiledControlKind {
    if (!formFieldCollectsValue(field)) return "display_content";
    if (field.type === "signature") return "signature";

    /*
     * A control Alloy has no words for is not work Alloy can present.
     *
     * The source document named this box, so any caption here would be invented and any input would
     * be forty-one boxes all labelled the same thing. It belongs to the artifact, where the school's
     * own sentence sits beside it, and the same rule already keeps it out of the conversation.
     */
    /*
     * A CANONICAL FACT IS STILL A FACT WHEN THE PDF NAMED THE BOX.
     *
     * The rule below is right about PRINTING: a label that is the source widget's own name carries
     * no authored meaning and Alloy must not caption a control with it. But it ran before the
     * binding check, so on a source-fidelity Form — every real enrolment Form — every control
     * became `display_content`, `resolved` came back empty, and "Make a change" offered a parent
     * nothing to correct beside a document that clearly printed their child's name.
     *
     * A control that is canonically bound AND has a value is a semantic fact whatever the PDF
     * called the box, and Alloy has words for it from the binding rather than from the document:
     * `captionFor` already reads `naturalFieldLabel(participant_label, shared_key)`. So the
     * provenance rule keeps doing its job — `participant_label` stays null and nothing prints the
     * widget name — while the fact itself remains correctable.
     */
    if (sharedKey != null && hasValue(value)) return "resolved_shared_value";

    if (participantLabel == null) return "display_content";

    /*
     * A READ-ONLY destination is placed, not asked.
     *
     * Four of them on the Admissions packet — the derived "Student Age Upon Enrolling" among them —
     * were offered on the change surface as editable inputs, and the platform then restored the
     * baseline over whatever the parent typed. An input whose value is discarded on write is worse
     * than no input at all.
     */
    if (field.read_only === true) {
        return sharedKey != null && hasValue(value) ? "resolved_shared_value" : "display_content";
    }

    /*
     * ONE definition of an acknowledgment, shared with the need projection.
     *
     * This rule used to live only here, so the conversation could — and did — classify the same
     * field as an ordinary question and ask it before the document existed.
     */
    const bound = sharedKey != null;
    if (!bound && field.type === "boolean") {
        return fieldIsAcknowledgement(field, { bound }) ? "acknowledgment" : "unresolved_artifact_specific";
    }
    if (bound && hasValue(value)) return "resolved_shared_value";
    return "unresolved_artifact_specific";
}

/** The binding identity an edit writes to — the same derivation that keys an information need. */
function sharedKeyOf(field: FormField): string | null {
    const resolved = canonicalKeyFor(field);
    if (resolved.basis === "unbound") return null;
    return resolved.shared_value_key ?? resolved.key;
}

/**
 * Compile the artifact for review.
 *
 * `values` is the merged view the participant surface already holds — canonical record beneath the
 * session's own settled answers. Passing it in rather than resolving it here keeps this pure and
 * keeps precedence owned in one place.
 */
export function compileParticipantArtifact(
    schema: Pick<FormSchemaV1, "fields"> & { sections?: unknown },
    values: Readonly<Record<string, unknown>>,
    /**
     * The version's `pdf_mapping_json`, when this artifact is source-fidelity.
     *
     * It is the record of which widget each control was imported from, which is the only reliable
     * way to tell an authored question from the PDF's internal name for a box. Absent (a generated
     * document) every label is authored by definition, so nothing is suppressed.
     */
    sourceMapping?: SourceFieldMapping,
): CompiledArtifact {
    const controls: CompiledArtifactControl[] = [];
    const sourceNames = sourceFieldNamesByFieldId(sourceMapping);

    const walk = (fields: readonly FormField[]) => {
        for (const field of fields) {
            if (field.type === "group") {
                walk((field as { fields: FormField[] }).fields);
                continue;
            }
            const value = values[field.id];
            const sharedKey = sharedKeyOf(field);
            const participantLabel = participantFacingLabel(field.label, sourceNames[field.id]);
            controls.push({
                field_id: field.id,
                label: field.label ?? "",
                participant_label: participantLabel,
                kind: classify(field, sharedKey, value, participantLabel),
                input_type: field.type,
                options: readOptions(field),
                required: field.required === true,
                value: value ?? null,
                display_value: displayForControl(readOptions(field), value ?? null),
                content: (field as { content?: string }).content ?? null,
                shared_key: sharedKey,
            });
        }
    };
    walk(schema.fields);

    /**
     * One section for now, in document order.
     *
     * The authored `sections` array is deliberately NOT read yet: on the certification form it
     * carries OCR page markers ("Page 1", "Page 2") rather than meaningful document structure, and
     * promoting those to headings would present scan artifacts to a parent as if they were the
     * document's own organisation. When a tenant authors real sections this is where they belong.
     */
    const sections: CompiledArtifactSection[] = [{ title: null, controls }];

    return {
        sections,
        resolved: controls.filter((c) => c.kind === "resolved_shared_value"),
        outstanding: controls.filter((c) => c.kind === "unresolved_artifact_specific"),
        acknowledgments: controls.filter((c) => c.kind === "acknowledgment"),
        signatures: controls.filter((c) => c.kind === "signature"),
    };
}
