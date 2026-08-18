/**
 * Parent Guided Intake — schema-driven, MINIMAL question plan.
 *
 * Goal: make enrollment faster, not longer. "Review what we know → answer only what's
 * missing → sign → done." NOT one screen per field.
 *
 * The plan collapses to at most THREE phases, each a single screen that batches related
 * fields (grouped by the form's own sections, rendered with the existing engine so every
 * field keeps its real control):
 *   1. confirm  — everything Alloy already has, in one quick review (skip if nothing known)
 *   2. provide  — only the genuinely missing/required fields (skip if nothing missing)
 *   3. uploads  — files + signatures (skip if none)
 * Submit happens on the last present phase — no extra welcome or end-review screens.
 *
 * Canonical de-dup: fields sharing a `shared_value_key` (or `entity_type:field_key`) are
 * asked ONCE (a representative renders); `canonicalGroups` lets the shell mirror the answer
 * to siblings. Pure, deterministic, no I/O.
 */

import { formFieldCollectsValue } from "@/lib/forms/formFieldCollectsValue";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

export type GuidedStepKind = "confirm" | "provide" | "uploads";

export interface GuidedStep {
    key: string;
    kind: GuidedStepKind;
    title: string;
    subtitle?: string;
    /** Representative field ids to render in this phase (rendered grouped by section). */
    fieldIds: string[];
}

export interface GuidedQuestionPlan {
    steps: GuidedStep[];
    /** canonicalKey → all field ids sharing it (collect-once write fan-out). */
    canonicalGroups: Record<string, string[]>;
    counts: { known: number; missing: number; uploads: number; requiredMissing: number };
}

const UPLOAD_TYPES = new Set<FormField["type"]>(["file_ref", "signature"]);

function isPresent(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

function canonicalKeyFor(field: FormField): string {
    const src = field.field_source;
    const shared = src?.shared_value_key?.trim();
    if (shared) return `shared:${shared}`;
    const et = src?.entity_type?.trim();
    const fk = src?.field_key?.trim();
    if (et && fk) return `canon:${et}:${fk}`;
    return `field:${field.id}`;
}

export function buildGuidedQuestionPlan(schema: FormSchemaV1, values: Record<string, unknown>): GuidedQuestionPlan {
    // Canonical grouping (collect once).
    const canonicalGroups: Record<string, string[]> = {};
    const representativeOf = new Map<string, string>();
    for (const field of schema.fields) {
        if (field.type === "group") continue;
        // Display content is not work. A `text_block` was being counted as something to add, which
        // is how a parent was told there were seven things left on a form with three questions.
        if (!formFieldCollectsValue(field)) continue;
        const ck = canonicalKeyFor(field);
        (canonicalGroups[ck] ??= []).push(field.id);
        if (!representativeOf.has(ck)) representativeOf.set(ck, field.id);
    }

    const knownIds: string[] = [];
    const missingIds: string[] = [];
    const uploadIds: string[] = [];
    let requiredMissing = 0;

    for (const field of schema.fields) {
        if (field.type === "group") {
            missingIds.push(field.id); // structural; always shown in "provide"
            continue;
        }
        if (!formFieldCollectsValue(field)) continue;
        const ck = canonicalKeyFor(field);
        if (representativeOf.get(ck) !== field.id) continue; // collapse duplicates

        if (UPLOAD_TYPES.has(field.type)) {
            uploadIds.push(field.id);
        } else if (canonicalGroups[ck].some((fid) => isPresent(values[fid]))) {
            knownIds.push(field.id);
        } else {
            missingIds.push(field.id);
            if (field.required) requiredMissing += 1;
        }
    }

    const steps: GuidedStep[] = [];
    if (knownIds.length > 0) {
        steps.push({ key: "confirm", kind: "confirm", title: "Confirm what we already have", subtitle: "Quick check — edit anything that has changed.", fieldIds: knownIds });
    }
    if (missingIds.length > 0) {
        steps.push({ key: "provide", kind: "provide", title: "A few details we still need", subtitle: "Only what's missing.", fieldIds: missingIds });
    }
    if (uploadIds.length > 0) {
        steps.push({ key: "uploads", kind: "uploads", title: "Sign & upload", subtitle: "Add required documents and signatures.", fieldIds: uploadIds });
    }

    return {
        steps,
        canonicalGroups,
        counts: { known: knownIds.length, missing: missingIds.length, uploads: uploadIds.length, requiredMissing },
    };
}

/**
 * Mirror each canonical group's representative value to its sibling field ids (collect
 * once, write everywhere). Returns a new values map only when a mirror is needed.
 */
export function mirrorCanonicalValues(
    values: Record<string, unknown>,
    canonicalGroups: Record<string, string[]>
): Record<string, unknown> {
    let next: Record<string, unknown> | null = null;
    for (const ids of Object.values(canonicalGroups)) {
        if (ids.length < 2) continue;
        const rep = ids.find((id) => values[id] !== undefined && values[id] !== "" && values[id] !== null) ?? ids[0];
        const v = values[rep];
        for (const id of ids) {
            if (id === rep) continue;
            if (values[id] !== v) {
                next ??= { ...values };
                next[id] = v;
            }
        }
    }
    return next ?? values;
}
