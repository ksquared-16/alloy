/**
 * POS Packet — canonical field dedupe plan (Sprint 2).
 *
 * Strategic model (see docs/sprints/archive/06_2026/pos_packet_parent_submission_foundation.md):
 * a POS Packet is generated from one or more *Alloy form templates* — NOT from a PDF.
 * When several templates ask for the same underlying datum (e.g. Child's Name), the
 * parent should be asked **once**. This module is the pure planner that computes that
 * deduped, canonical field plan from the source templates.
 *
 * It does NOT create packets, sessions, or DB rows. It produces a plan the generator
 * uses to (a) stamp `field_source.shared_value_key` on the generated form fields so the
 * EXISTING forms-packet runtime (`form_packet_sessions.shared_values` +
 * `shallowMergeSharedValues`) reuses each answer across steps, and (b) preserve each
 * source field's PDF/output mapping target (`pdf_slot`) separately, per consumer.
 *
 * Doctrine alignment:
 * - Identity of a datum is the canonical key (entity_type + field_key), mirroring
 *   `lib/pos/fieldKeyBinding.ts`. Two fields bound to the same canonical key collapse.
 * - PDF is an OUTPUT target, not the source of truth: `pdf_slot` is carried per consumer
 *   on the entry, never used as the dedupe identity.
 * - Pure, deterministic, no I/O. Group/structural fields are out of scope (mirrors
 *   `buildFieldKeyProposedValues`).
 */

import { formFieldCollectsValue } from "@/lib/forms/formFieldCollectsValue";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

/** The discriminant of the FormField union (schema.ts does not export this directly). */
export type FormFieldType = FormField["type"];

/** A generated Alloy form template that becomes a packet item. */
export interface PacketSourceForm {
    /** form_definition id (or any stable id) — provenance for the consumer. */
    form_id: string;
    /** Display name for operator-facing summaries. */
    form_name?: string;
    /** The form's published/draft schema. Only `fields` are read here. */
    schema: Pick<FormSchemaV1, "fields">;
}

/** One form field that consumes a canonical datum (provenance + output mapping). */
export interface PacketFieldConsumer {
    form_id: string;
    form_name?: string;
    form_field_id: string;
    label: string;
    type: FormFieldType;
    required: boolean;
    /** PDF/output mapping target preserved separately from the canonical identity. */
    pdf_slot?: string;
    entity_hint?: string;
}

/** How a plan entry's canonical key was resolved. */
export type PacketFieldDedupeBasis =
    /** Explicit collect-once alias from `field_source.shared_value_key`. */
    | "shared_alias"
    /** Canonical registry key `entity_type:field_key`. */
    | "canonical"
    /** Unbound field — cannot dedupe; one entry per field. */
    | "unbound";

export interface PacketFieldPlanEntry {
    /** Stable dedupe identity for this datum across all source forms. */
    canonical_key: string;
    /** The value to stamp onto each consumer's `field_source.shared_value_key` so the
     *  existing packet runtime reuses the answer. Undefined for unbound fields. */
    shared_value_key?: string;
    entity_type: string | null;
    field_key: string | null;
    basis: PacketFieldDedupeBasis;
    /** Best label across consumers (first non-empty). */
    label: string;
    /** Resolved field type (first consumer; conflicts recorded in `warnings`). */
    type: FormFieldType;
    /** Required if ANY consumer requires it (most conservative for the parent). */
    required: boolean;
    /** Every form field that maps to this datum. */
    consumers: PacketFieldConsumer[];
    /** Distinct PDF/output targets this datum feeds. */
    output_targets: Array<{ form_id: string; pdf_slot: string }>;
    warnings: string[];
}

export interface PacketFieldPlan {
    entries: PacketFieldPlanEntry[];
    /** Count of canonical data that are asked once but consumed by >1 form field. */
    collected_once_count: number;
    /** Total number of source form fields considered (across all forms). */
    total_consumer_fields: number;
    /** Number of distinct canonical data the parent will be asked for. */
    distinct_field_count: number;
    warnings: string[];
}

export function canonicalKeyFor(field: FormField): { key: string; basis: PacketFieldDedupeBasis; entity_type: string | null; field_key: string | null; shared_value_key?: string } {
    const source = field.field_source;
    const sharedAlias = source?.shared_value_key?.trim();
    const entityType = source?.entity_type?.trim() || null;
    const fieldKey = source?.field_key?.trim() || null;

    if (sharedAlias) {
        return { key: sharedAlias, basis: "shared_alias", entity_type: entityType, field_key: fieldKey, shared_value_key: sharedAlias };
    }
    if (entityType && fieldKey) {
        const key = `${entityType}:${fieldKey}`;
        return { key, basis: "canonical", entity_type: entityType, field_key: fieldKey, shared_value_key: key };
    }
    // Unbound — keyed uniquely so it is never merged with another field.
    return { key: `__unbound`, basis: "unbound", entity_type: null, field_key: null };
}

/**
 * Build the deduped canonical field plan for a packet generated from `forms`.
 *
 * Top-level scalar fields only; `group` fields are skipped (structural, out of scope —
 * mirrors `buildFieldKeyProposedValues`). Deterministic: entry order follows first
 * appearance across forms in input order.
 */
export function buildPacketFieldPlan(forms: PacketSourceForm[]): PacketFieldPlan {
    const byKey = new Map<string, PacketFieldPlanEntry>();
    const warnings: string[] = [];
    let totalConsumerFields = 0;
    let unboundCounter = 0;

    for (const form of forms) {
        for (const field of form.schema.fields) {
            if (field.type === "group") continue;
            // DISPLAY fields carry no participant information. A `text_block` is printed prose —
            // "Handbook Intro", "Page 3" — and asking a parent to supply it is meaningless. They
            // were reaching the plan, becoming artifact-specific needs, and appearing in the
            // participant's remaining work as "Page 2" and "Page 4".
            if (!formFieldCollectsValue(field)) continue;
            totalConsumerFields += 1;

            const resolved = canonicalKeyFor(field);
            // Unbound fields must never collapse together: give each a unique map key.
            const mapKey = resolved.basis === "unbound" ? `__unbound:${form.form_id}:${field.id}:${unboundCounter++}` : resolved.key;

            const consumer: PacketFieldConsumer = {
                form_id: form.form_id,
                form_name: form.form_name,
                form_field_id: field.id,
                label: field.label,
                type: field.type,
                required: Boolean(field.required),
                ...(field.pdf_slot ? { pdf_slot: field.pdf_slot } : {}),
                ...(field.entity_hint ? { entity_hint: field.entity_hint } : {}),
            };

            const existing = byKey.get(mapKey);
            if (!existing) {
                byKey.set(mapKey, {
                    canonical_key: resolved.basis === "unbound" ? mapKey : resolved.key,
                    ...(resolved.shared_value_key ? { shared_value_key: resolved.shared_value_key } : {}),
                    entity_type: resolved.entity_type,
                    field_key: resolved.field_key,
                    basis: resolved.basis,
                    label: field.label,
                    type: field.type,
                    required: Boolean(field.required),
                    consumers: [consumer],
                    output_targets: field.pdf_slot ? [{ form_id: form.form_id, pdf_slot: field.pdf_slot }] : [],
                    warnings: [],
                });
                continue;
            }

            // Merge into the existing canonical datum.
            existing.consumers.push(consumer);
            existing.required = existing.required || Boolean(field.required);
            if (!existing.label && field.label) existing.label = field.label;
            if (field.type !== existing.type) {
                const w = `Type conflict on "${existing.canonical_key}": ${existing.type} vs ${field.type} (kept ${existing.type}); reconcile in builder.`;
                existing.warnings.push(w);
            }
            if (field.pdf_slot && !existing.output_targets.some((t) => t.form_id === form.form_id && t.pdf_slot === field.pdf_slot)) {
                existing.output_targets.push({ form_id: form.form_id, pdf_slot: field.pdf_slot });
            }
        }
    }

    const entries = [...byKey.values()];
    const collectedOnce = entries.filter((e) => e.consumers.length > 1).length;
    for (const e of entries) warnings.push(...e.warnings);

    return {
        entries,
        collected_once_count: collectedOnce,
        total_consumer_fields: totalConsumerFields,
        distinct_field_count: entries.length,
        warnings,
    };
}
