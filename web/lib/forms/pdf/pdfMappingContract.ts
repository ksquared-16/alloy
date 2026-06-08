import { z } from "zod";
import type { FormPayload } from "@/lib/forms/validateSubmission";

/**
 * Contract for `form_definition_versions.pdf_mapping_json`.
 * Maps human-readable PDF slots to dot paths into the submission `payload` (values / groups / signatures / meta).
 */
export const formPdfMappingJsonSchema = z
    .object({
        engine: z.string().optional(),
        template_key: z.string().min(1).optional(),
        slots: z.record(
            z.string().min(1),
            z
                .object({
                    path: z.string().min(1),
                })
                .strict()
        ),
    })
    .strict();

export type FormPdfMappingJson = z.infer<typeof formPdfMappingJsonSchema>;

export function parseFormPdfMappingJson(raw: unknown): FormPdfMappingJson | null {
    const p = formPdfMappingJsonSchema.safeParse(raw);
    if (!p.success) return null;
    if (!Object.keys(p.data.slots).length) return null;
    return p.data;
}

/**
 * Walk payload using dot segments; numeric segments index into arrays (repeatable groups).
 * Examples: `values.child_first_name`, `groups.medications.0.values.med_name`
 */
export function getPayloadValueAtPath(payload: FormPayload, path: string): unknown {
    const segments = path.split(".").filter(Boolean);
    let cur: unknown = payload;
    for (const seg of segments) {
        if (cur === null || cur === undefined) return undefined;
        if (/^\d+$/.test(seg)) {
            const idx = Number(seg);
            if (!Array.isArray(cur)) return undefined;
            cur = cur[idx];
        } else if (typeof cur === "object") {
            cur = (cur as Record<string, unknown>)[seg];
        } else {
            return undefined;
        }
    }
    return cur;
}

/** Resolved slot label → stringified value for stub PDF assembly. */
export function extractSlotStringsFromPayload(mapping: FormPdfMappingJson, payload: FormPayload): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [slot, spec] of Object.entries(mapping.slots)) {
        const v = getPayloadValueAtPath(payload, spec.path);
        if (v === undefined || v === null) {
            out[slot] = "";
        } else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
            out[slot] = String(v);
        } else if (Array.isArray(v)) {
            out[slot] = v.map(String).join(", ");
        } else {
            out[slot] = JSON.stringify(v);
        }
    }
    return out;
}

export function buildFormPdfIdempotencyKey(input: {
    formSubmissionId: string;
    formDefinitionVersionId: string;
    templateKey: string;
}): string {
    return `forms_generated_pdf:v1:${input.formSubmissionId}:${input.formDefinitionVersionId}:${input.templateKey}`;
}
