import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import type { NormalizedValidationError } from "@/lib/forms/validateSubmission";
import { humanizeOperatorSlug } from "@/lib/forms/operatorDisplayLabels";

/**
 * A FAMILY READS QUESTIONS, NOT PATHS.
 *
 * Deployed (Lil' Sunshine, ZZQALM234600): a refused submit printed
 * "occ_other_guardians › 0 › values › occ_other_guardians__relationship_type: Required field missing" —
 * the payload address of the problem, which a parent cannot act on. Each refusal is now said in the
 * form's own words: the group's label, which member, the question's label, and what is needed.
 */

function findField(fields: readonly FormField[], id: string): FormField | null {
    for (const f of fields) {
        if (f.id === id) return f;
        if (f.type === "group") {
            const hit = findField(f.fields, id);
            if (hit) return hit;
        }
    }
    return null;
}

const labelOf = (field: FormField | null, id: string) =>
    (field?.label ?? "").trim().replace(/\s*[:?*]\s*$/, "") || humanizeOperatorSlug(id);

function phrase(message: string): string {
    if (/required field missing|^required$/i.test(message)) return "is required";
    const atLeast = /expected at least (\d+) group instance/i.exec(message);
    if (atLeast) return `needs at least ${atLeast[1]}`;
    const atMost = /expected at most (\d+) group instance/i.exec(message);
    if (atMost) return `can have at most ${atMost[1]}`;
    if (/invalid option/i.test(message)) return "has a choice that is not on the list";
    return message.replace(/^\w/, (c) => c.toLowerCase());
}

/** Single-line, family-facing messages. Never a raw payload path. */
export function formatPublicValidationErrors(errors: NormalizedValidationError[], schema?: FormSchemaV1 | null): string[] {
    const fields = schema?.fields ?? [];
    return errors.map((e) => {
        const path = e.path.map(String).filter((p) => p !== "values" && p !== "groups");
        if (path.length === 0) return `This form ${phrase(e.message)}.`;
        // [group, index, member] — a member of a repeatable group.
        if (path.length >= 3 && /^\d+$/.test(path[1]!)) {
            const group = findField(fields, path[0]!);
            const member = findField(fields, path[path.length - 1]!);
            return `${labelOf(group, path[0]!)} (${Number(path[1]) + 1}): ${labelOf(member, path[path.length - 1]!)} ${phrase(e.message)}.`;
        }
        const leaf = path[path.length - 1]!;
        return `${labelOf(findField(fields, leaf), leaf)} ${phrase(e.message)}.`;
    });
}
