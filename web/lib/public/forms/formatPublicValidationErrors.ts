import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import type { NormalizedValidationError } from "@/lib/forms/validateSubmission";

/**
 * What a PARENT is told when a submission is refused.
 *
 * This used to render the validator's own output verbatim:
 *
 *     values › field_9: Expected boolean
 *
 * A schema path, an internal field id and a Zod message, shown to somebody enrolling their child.
 * It names nothing they can act on — field_9 appears nowhere on their screen — and it reads as a
 * fault in them rather than in us. The technical detail is not lost: `validation_errors` still
 * travels in the response body for logs and operator diagnosis. It simply stops being the copy.
 */

/**
 * Coerce a stored `schema_json` into something label lookup can walk. Never throws.
 *
 * Routes hold the schema as raw JSON, and a refusal path is the worst possible place to introduce a
 * second way to fail — a schema that cannot be read should cost the parent a specific label, not
 * their submission's error message.
 */
export function safeParticipantSchema(schemaJson: unknown): FormSchemaV1 | null {
    if (!schemaJson || typeof schemaJson !== "object") return null;
    const fields = (schemaJson as { fields?: unknown }).fields;
    return Array.isArray(fields) ? (schemaJson as FormSchemaV1) : null;
}

/** Recursively index a schema's fields by id, so a validator path can be given a human name. */
export function fieldLabelsById(schema: FormSchemaV1 | null | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    const walk = (fields: readonly FormField[]) => {
        for (const f of fields) {
            const label = typeof f.label === "string" ? f.label.trim() : "";
            if (label) out[f.id] = label;
            if (f.type === "group") walk(f.fields as readonly FormField[]);
        }
    };
    walk((schema?.fields ?? []) as readonly FormField[]);
    return out;
}

/** The last path segment that looks like a field id — validator paths are `values › <id>`. */
function fieldIdFromPath(path: readonly (string | number)[]): string | null {
    for (let i = path.length - 1; i >= 0; i -= 1) {
        const seg = path[i];
        if (typeof seg === "string" && seg !== "values" && seg !== "meta" && seg !== "groups") return seg;
    }
    return null;
}

export type PublicValidationCopy = {
    /** One sentence for the parent, safe to render anywhere. */
    readonly summary: string;
    /** Named answers to look at, in the operator's own labels. Empty when none could be named. */
    readonly fieldLabels: readonly string[];
};

/**
 * Participant-safe copy for a refused submission.
 *
 * Names the answers in the words the school configured, and asks for one recoverable action.
 * Never emits a field id, a schema path, a validator string or a runtime enum.
 */
export function participantValidationCopy(
    errors: readonly NormalizedValidationError[],
    schema?: FormSchemaV1 | null,
): PublicValidationCopy {
    const labels = fieldLabelsById(schema);
    const named: string[] = [];
    for (const e of errors) {
        const id = fieldIdFromPath(e.path);
        const label = id ? labels[id] : undefined;
        if (label && !named.includes(label)) named.push(label);
    }

    if (named.length === 0) {
        // Nothing nameable — most often a field the parent was never shown. Say what to do, and do
        // not invent a culprit.
        return {
            summary: "Something in this form could not be saved. Please try again, or contact the school if it keeps happening.",
            fieldLabels: [],
        };
    }
    const list =
        named.length === 1
            ? named[0]
            : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
    return {
        summary:
            named.length === 1
                ? `Please review your answer for ${list} and try again.`
                : `Please review your answers for ${list} and try again.`,
        fieldLabels: named,
    };
}

/**
 * Single-line messages for lightweight embed / API UX.
 *
 * @deprecated for participant-facing surfaces — use {@link participantValidationCopy}. Retained for
 * operator/diagnostic callers that legitimately want the validator's own path and message.
 */
export function formatPublicValidationErrors(errors: NormalizedValidationError[]): string[] {
    return errors.map((e) => {
        const loc = e.path.length ? e.path.join(" › ") : "Form";
        return `${loc}: ${e.message}`;
    });
}
