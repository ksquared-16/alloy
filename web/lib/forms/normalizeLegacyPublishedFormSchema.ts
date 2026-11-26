/**
 * A PUBLISHED FORM OUTLIVES THE CODE THAT AUTHORED IT.
 *
 * A published form version is immutable and is meant to be — a family signed what it said. But the
 * vocabulary the authoring surface writes moves on, and when a property is renamed the artifacts
 * already in the database keep the old name forever. The canonical schema is `.strict()`, so the
 * first family to open such a form meets `Invalid published schema` and cannot enrol.
 *
 * That is exactly what happened to Admissions v12 (`ee75bbc6`): 23 of its 58 fields carry
 * `party_collection` or `retention`, the strict union rejected every one, and `/resolve` answered
 * 500 before the participant saw a single question.
 *
 * ── WHAT THIS IS, AND WHAT IT MUST NEVER BECOME ──
 *
 * It recognises NAMED historical contracts and rewrites them into the current canonical ones. It is
 * not a compatibility mode: it has no `passthrough`, it does not strip unknown keys, and a property
 * nobody has taught it stays unknown and still fails the parse. That matters more than the
 * convenience — strictness is what stops a published schema carrying meaning the runtime silently
 * drops, and a normalizer that tolerated anything would take that guarantee away permanently.
 *
 * ── WHY IT FAILS CLOSED RATHER THAN GUESSING ──
 *
 * Two rules, both deliberate:
 *
 *   A legacy property beside its own canonical replacement is only accepted when they AGREE.
 *   Conflicting values throw, because choosing either one would be this module deciding what a
 *   signed form meant.
 *
 *   `retention: form_only_pending_canonical_owner` is dropped only after proving the field has no
 *   `field_source`. The annotation says "this answer has no canonical destination yet", and the
 *   platform enforces that through the ABSENCE of a field_source — so on a field that has one, the
 *   two statements contradict each other and the schema is refused rather than quietly canonicalised.
 */

import {
    collectionItemEntityTypeForProvider,
    isRegisteredCanonicalCollectionProvider,
} from "@/lib/fields/collection/canonicalCollectionProviderRegistry";

/** Raised when a historical artifact cannot be translated without deciding what it meant. */
export class LegacyFormSchemaConflictError extends Error {
    readonly fieldId: string;
    readonly property: string;
    constructor(args: { fieldId: string; property: string; detail: string }) {
        super(`Field "${args.fieldId}": ${args.detail}`);
        this.name = "LegacyFormSchemaConflictError";
        this.fieldId = args.fieldId;
        this.property = args.property;
    }
}

/** The legacy party-collection annotation, as published forms carry it. */
type LegacyPartyCollection = {
    readonly role?: unknown;
    readonly scope?: unknown;
    readonly subject?: unknown;
};

/**
 * Legacy `party_collection` → canonical `collection_binding`.
 *
 * The legacy axis named a role and a subject; the canonical one names the registered collection
 * PROVIDER that owns those people. Every mapping below points at a provider the registry already
 * derives from a relationship definition (or a native one), so this table adds no capability — it
 * only says which existing provider a historical annotation was describing.
 *
 * `allow_add`, `action_key` and `show_known` are deliberately not carried: the provider's own
 * relationship definition already owns its add action and its known-people presentation, and a
 * second copy on the field would be a second answer to the same question.
 */
function canonicalProviderForLegacyParty(legacy: LegacyPartyCollection): string | null {
    const role = typeof legacy.role === "string" ? legacy.role.trim() : "";
    const subject = typeof legacy.subject === "string" ? legacy.subject.trim() : "";

    if (subject === "child") return "children";
    if (subject === "person") {
        if (role === "guardian" || role === "parent" || role === "parents") return "person.contact_role.parents";
        if (role === "emergency_contact") return "person.contact_role.emergency_contacts";
        if (role === "authorized_pickup") return "person.contact_role.authorized_pickups";
        if (role === "physician") return "person.contact_role.physicians";
        if (role === "dentist") return "person.contact_role.dentists";
    }
    return null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeField(raw: unknown): unknown {
    if (!isRecord(raw)) return raw;
    const field: Record<string, unknown> = { ...raw };
    const fieldId = typeof field.id === "string" ? field.id : "(unidentified)";

    // Recurse first, so a nested legacy annotation is translated wherever it sits.
    if (Array.isArray(field.fields)) {
        field.fields = field.fields.map(normalizeField);
    }

    // ── party_collection → collection_binding ──────────────────────────────────────────────────
    if (field.party_collection !== undefined) {
        const legacy = field.party_collection;
        if (!isRecord(legacy)) {
            throw new LegacyFormSchemaConflictError({
                fieldId,
                property: "party_collection",
                detail: "party_collection is not an object, so the collection it named cannot be identified.",
            });
        }
        const providerRef = canonicalProviderForLegacyParty(legacy);
        if (!providerRef) {
            // Unrecognised legacy shape: refuse rather than bind the family to a guessed collection.
            throw new LegacyFormSchemaConflictError({
                fieldId,
                property: "party_collection",
                detail:
                    `party_collection {role: ${JSON.stringify(legacy.role)}, subject: ${JSON.stringify(legacy.subject)}} `
                    + "names no registered collection provider.",
            });
        }
        if (!isRegisteredCanonicalCollectionProvider(providerRef)) {
            throw new LegacyFormSchemaConflictError({
                fieldId,
                property: "party_collection",
                detail: `collection provider "${providerRef}" is not registered for resolution.`,
            });
        }
        const itemEntityType = collectionItemEntityTypeForProvider(providerRef);
        if (!itemEntityType) {
            throw new LegacyFormSchemaConflictError({
                fieldId,
                property: "party_collection",
                detail: `collection provider "${providerRef}" declares no item entity type.`,
            });
        }
        const translated = {
            collection_provider_ref: providerRef,
            iteration_entity_type: itemEntityType,
        };

        const existing = field.collection_binding;
        if (existing !== undefined) {
            // CONFLICT LAW. Equal is fine and the canonical one wins; different is refused.
            const same =
                isRecord(existing)
                && existing.collection_provider_ref === translated.collection_provider_ref
                && existing.iteration_entity_type === translated.iteration_entity_type;
            if (!same) {
                throw new LegacyFormSchemaConflictError({
                    fieldId,
                    property: "party_collection",
                    detail:
                        "carries both a legacy party_collection and a canonical collection_binding, and they "
                        + "disagree about which collection this group binds to.",
                });
            }
        } else {
            field.collection_binding = translated;
        }
        delete field.party_collection;
    }

    // ── retention: dropped only when the platform already enforces what it claims ──────────────
    if (field.retention !== undefined) {
        const legacy = field.retention;
        const kind = isRecord(legacy) && typeof legacy.kind === "string" ? legacy.kind.trim() : "";
        if (kind !== "form_only_pending_canonical_owner") {
            throw new LegacyFormSchemaConflictError({
                fieldId,
                property: "retention",
                detail: `retention kind ${JSON.stringify(kind)} is not a known historical contract.`,
            });
        }
        if (field.field_source !== undefined) {
            /*
             * The annotation says this answer has no canonical destination; the field_source says
             * exactly where it goes. Both cannot be true, and canonical proposals are produced from
             * field_source — so dropping the annotation here would start writing an answer the
             * author marked form-only into a canonical record.
             */
            throw new LegacyFormSchemaConflictError({
                fieldId,
                property: "retention",
                detail:
                    "is marked form_only_pending_canonical_owner but also declares a field_source, so the "
                    + "annotation cannot be dropped without changing where the answer goes.",
            });
        }
        delete field.retention;
    }

    return field;
}

/**
 * Translate a historical published schema into the current canonical vocabulary.
 *
 * Pure, and a no-op for any schema already written in current terms — which is why it is safe to
 * run on every parse rather than only on the artifacts known to need it.
 */
export function normalizeLegacyPublishedFormSchema(schemaJson: unknown): unknown {
    if (!isRecord(schemaJson)) return schemaJson;
    if (!Array.isArray(schemaJson.fields)) return schemaJson;
    return { ...schemaJson, fields: schemaJson.fields.map(normalizeField) };
}
