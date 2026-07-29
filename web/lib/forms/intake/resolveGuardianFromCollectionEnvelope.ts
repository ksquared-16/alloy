/**
 * Resolve the intake guardian from the canonical COLLECTION ENVELOPE.
 *
 * Public lead-capture intake historically read flat `guardian_*` question values. Once Configuration
 * Discovery projects guardians into a collection those flat questions are suppressed, so intake found
 * nothing and no Processing case opened — a form could be published that silently could not capture a
 * lead. This module makes intake a CONSUMER of the same collection model Forms, Configuration
 * Discovery, Processing and (future) Participant Runtime already use.
 *
 * Recognition is by IDENTITY, never by label: a collection qualifies because its `provider_ref`
 * resolves to a Relationship Definition whose operational role is guardian/parent. Renaming a
 * document section, or a tenant writing "Caregiver" instead of "Parent", changes nothing.
 *
 * This resolver identifies the PRIMARY CONTACT for opening the case. It deliberately does not perform
 * any canonical Person write — Processing identity resolution owns create-vs-link — and it never
 * discards the other guardians.
 *
 * @see docs/platform/core/data/relationship-model.md
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import { relationshipDefinitionForRef } from "@/lib/fields/relationship/relationshipDefinitions";

/** One row of `payload.meta.collection_submission_envelope`, keyed by schema group id. */
export type CollectionEnvelopeRow = {
    provider_ref?: unknown;
    instance_key?: unknown;
    origin?: unknown;
    item_id?: unknown;
    iteration_entity_type?: unknown;
    values?: unknown;
};

export type CollectionEnvelope = Record<string, CollectionEnvelopeRow[]>;

export type EnvelopeGuardian = {
    /** Schema group the instance came from. */
    group_id: string;
    instance_key: string;
    origin: "existing" | "respondent_added";
    /** Canonical person id when the respondent chose an existing person. */
    person_id: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    /** Stable position within its group — used for deterministic selection. */
    order_index: number;
};

export type EnvelopeGuardianResolution =
    | { ok: true; primary: EnvelopeGuardian; all: EnvelopeGuardian[] }
    | { ok: false; reason_code: "no_guardian_collection" | "no_usable_contact"; reason: string; all: EnvelopeGuardian[] };

/** Operational roles that make a collection a GUARDIAN collection for intake purposes. */
const GUARDIAN_ROLES = new Set(["guardian", "parent"]);

function trimmed(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length ? t : null;
}

function splitFullName(full: string | null): { first_name: string | null; last_name: string | null } {
    if (!full) return { first_name: null, last_name: null };
    const parts = full.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { first_name: null, last_name: null };
    if (parts.length === 1) return { first_name: parts[0]!, last_name: null };
    return { first_name: parts[0]!, last_name: parts.slice(1).join(" ") };
}

/** Nested field id → canonical field key, taken from the schema's own bindings (never from labels). */
function nestedFieldKeyMap(group: FormField): Map<string, string> {
    const out = new Map<string, string>();
    if (group.type !== "group") return out;
    for (const f of group.fields ?? []) {
        const key = f.field_source?.field_key?.trim().toLowerCase();
        if (key) out.set(f.id, key);
    }
    return out;
}

function collectGroups(fields: FormField[]): FormField[] {
    const out: FormField[] = [];
    for (const f of fields) {
        if (f.type === "group") {
            out.push(f);
            out.push(...collectGroups(f.fields ?? []));
        }
    }
    return out;
}

/** A guardian instance is usable for intake when it can be contacted. */
function hasUsableContact(g: EnvelopeGuardian): boolean {
    return Boolean(g.email || g.phone);
}

/**
 * Extract every guardian instance the envelope contains, in stable order.
 *
 * `values` are keyed by nested FIELD ID, so canonical meaning comes from the schema's `field_source`
 * bindings — the projection's id naming is an implementation detail and is never parsed.
 */
export function extractEnvelopeGuardians(
    envelope: CollectionEnvelope | null | undefined,
    schema: FormSchemaV1 | null | undefined,
): EnvelopeGuardian[] {
    if (!envelope || typeof envelope !== "object" || !schema) return [];

    const groupsById = new Map(collectGroups(schema.fields ?? []).map((g) => [g.id, g]));
    const out: EnvelopeGuardian[] = [];

    // Iterate schema group order, not object key order, so instance ordering is deterministic.
    for (const group of collectGroups(schema.fields ?? [])) {
        const rows = envelope[group.id];
        if (!Array.isArray(rows)) continue;

        const providerRef = trimmed(group.collection_binding?.collection_provider_ref);
        if (!providerRef) continue;

        // IDENTITY-based recognition — the definition decides, not the label.
        const definition = relationshipDefinitionForRef(providerRef);
        if (!definition) continue;
        if (!GUARDIAN_ROLES.has(definition.operational_role_key.trim().toLowerCase())) continue;

        const keyById = nestedFieldKeyMap(groupsById.get(group.id) ?? group);

        rows.forEach((row, index) => {
            if (!row || typeof row !== "object") return;
            if (trimmed(row.provider_ref) !== providerRef) return;

            const values = (row.values && typeof row.values === "object" ? row.values : {}) as Record<string, unknown>;
            const facts = new Map<string, string>();
            for (const [fieldId, raw] of Object.entries(values)) {
                const key = keyById.get(fieldId);
                const value = trimmed(raw);
                if (key && value) facts.set(key, value);
            }

            const explicitFirst = facts.get("first_name") ?? null;
            const explicitLast = facts.get("last_name") ?? null;
            const split = explicitFirst || explicitLast
                ? { first_name: explicitFirst, last_name: explicitLast }
                : splitFullName(facts.get("full_name") ?? facts.get("display_name") ?? null);

            const origin = trimmed(row.origin) === "existing" ? "existing" : "respondent_added";

            out.push({
                group_id: group.id,
                instance_key: trimmed(row.instance_key) ?? `${group.id}#${index}`,
                origin,
                person_id: origin === "existing" ? trimmed(row.item_id) : null,
                first_name: split.first_name,
                last_name: split.last_name,
                email: facts.get("email") ?? null,
                phone: facts.get("phone") ?? facts.get("mobile") ?? facts.get("cell_phone") ?? null,
                order_index: index,
            });
        });
    }

    return out;
}

/**
 * Choose the intake PRIMARY contact deterministically.
 *
 * Order: an existing canonical guardian with usable contact, then the first usable guardian by stable
 * collection order (which covers respondent-added). Every guardian is returned regardless — selecting
 * a lead contact must never drop the others.
 */
export function resolveGuardianFromCollectionEnvelope(
    envelope: CollectionEnvelope | null | undefined,
    schema: FormSchemaV1 | null | undefined,
): EnvelopeGuardianResolution {
    const all = extractEnvelopeGuardians(envelope, schema);

    if (all.length === 0) {
        return {
            ok: false,
            reason_code: "no_guardian_collection",
            reason: "No guardian collection was present in the submission envelope.",
            all,
        };
    }

    const usable = all.filter(hasUsableContact);
    if (usable.length === 0) {
        return {
            ok: false,
            reason_code: "no_usable_contact",
            reason:
                "No parent/guardian in the submitted collection has an email or phone number — intake needs a way to contact the family.",
            all,
        };
    }

    // 1) existing canonical guardian with usable contact; 2) first usable by stable order.
    const primary = usable.find((g) => g.origin === "existing" && g.person_id) ?? usable[0]!;
    return { ok: true, primary, all };
}
