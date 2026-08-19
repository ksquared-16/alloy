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
import { formFieldCollectsValue } from "@/lib/forms/formFieldCollectsValue";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

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
    readonly kind: CompiledControlKind;
    /** The authored control type, so an edit uses the same semantics the Form would. */
    readonly input_type: string;
    readonly options: readonly string[];
    readonly required: boolean;
    readonly value: unknown;
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

function readOptions(field: unknown): readonly string[] {
    const raw = (field as { options?: unknown })?.options;
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const item of raw) {
        if (typeof item === "string" && item.trim()) out.push(item.trim());
        else if (item && typeof item === "object") {
            const v = (item as { value?: unknown; label?: unknown }).value ?? (item as { label?: unknown }).label;
            if (typeof v === "string" && v.trim()) out.push(v.trim());
        }
    }
    return out;
}

/**
 * Classify one control.
 *
 * Signature and acknowledgment are recognised STRUCTURALLY, not by reading their labels: a signature
 * is the authored signature type, and an acknowledgment is a required boolean with no canonical
 * binding — a yes/no that belongs to this document rather than to the family's shared record. A
 * label-matching rule would break the moment a tenant wrote "I agree" instead.
 */
function classify(field: FormField, sharedKey: string | null, value: unknown): CompiledControlKind {
    if (!formFieldCollectsValue(field)) return "display_content";
    if (field.type === "signature") return "signature";

    const bound = sharedKey != null;
    if (!bound && field.type === "boolean") return "acknowledgment";
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
): CompiledArtifact {
    const controls: CompiledArtifactControl[] = [];

    const walk = (fields: readonly FormField[]) => {
        for (const field of fields) {
            if (field.type === "group") {
                walk((field as { fields: FormField[] }).fields);
                continue;
            }
            const value = values[field.id];
            const sharedKey = sharedKeyOf(field);
            controls.push({
                field_id: field.id,
                label: field.label ?? "",
                kind: classify(field, sharedKey, value),
                input_type: field.type,
                options: readOptions(field),
                required: field.required === true,
                value: value ?? null,
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
