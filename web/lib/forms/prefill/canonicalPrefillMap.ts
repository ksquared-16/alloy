/**
 * Canonical (field_source-driven) prefill mapping.
 *
 * The legacy prefill path keys off `prefill_field_map` (form-field id → "root.col"), which
 * only fires for forms whose field IDs match hardcoded keys (e.g. `child_first_name`). That
 * misses generated/manual forms whose fields carry a `field_source` canonical binding but a
 * different id — so a selected child's Name/DOB never prefilled.
 *
 * This builds an equivalent map from each scalar field's `field_source` (entity_type +
 * field_key, with an explicit `crm_mapping_key` override), so any canonically-bound field
 * prefills from the right record column regardless of its id. Pure, no I/O. The resolver
 * loads rows + normalizes types; unknown columns resolve to undefined and are skipped, so
 * emitting a best-effort path is safe.
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import { walkScalarFormFields } from "@/lib/forms/formSchemaFieldWalk";

/** Prefill roots the resolver can read. */
type PrefillRoot = "person" | "customer" | "customer_member" | "opportunity" | "contact";

/** entity_type (from field_source) → prefill root. */
const ENTITY_TO_ROOT: Record<string, PrefillRoot> = {
    person: "person",
    parent: "person",
    guardian: "person",
    contact: "contact",
    customer: "customer",
    household: "customer",
    customer_member: "customer_member",
    child: "customer_member",
    inquiry_child: "customer_member",
    student: "customer_member",
    opportunity: "opportunity",
    lead: "opportunity",
};

/**
 * Curated field_key → column aliases per root. Only canonical, known-safe columns are
 * emitted; field_keys not listed fall through to `field_key` as the column (the resolver
 * skips it if the column doesn't exist).
 */
const COLUMN_ALIASES: Record<PrefillRoot, Record<string, string>> = {
    customer_member: {
        child_name: "display_name",
        name: "display_name",
        full_name: "display_name",
        display_name: "display_name",
        first_name: "first_name",
        last_name: "last_name",
        // Registered system-field keys (systemFieldRegistry) — without these the split name fields
        // fall through to a `child_first_name` column that does not exist and silently never prefill.
        child_first_name: "first_name",
        child_last_name: "last_name",
        dob: "dob",
        date_of_birth: "dob",
        birthdate: "dob",
        birth_date: "dob",
    },
    person: {
        name: "full_name",
        full_name: "full_name",
        parent_name: "full_name",
        first_name: "first_name",
        last_name: "last_name",
        // Registered system-field keys for a guardian / emergency contact.
        guardian_first_name: "first_name",
        guardian_last_name: "last_name",
        email: "email",
        parent_email: "email",
        phone: "phone",
        parent_phone: "phone",
    },
    customer: { household_name: "family_notes", family_notes: "family_notes" },
    opportunity: { status: "status_key", status_key: "status_key" },
    contact: { email: "email", phone: "phone", first_name: "first_name", last_name: "last_name" },
};

const PATH_RE = /^([a-z_]+)\.([a-z_0-9]+)$/i;

/** Resolve a field's canonical "root.col" prefill path, or null when unbound/unsupported. */
export function canonicalPrefillPathForField(field: FormField): string | null {
    const src = field.field_source;
    if (!src) return null;

    // Explicit override wins when it is a valid "root.col" path with a known root.
    const override = src.crm_mapping_key?.trim();
    if (override && PATH_RE.test(override)) {
        const root = override.split(".")[0].toLowerCase();
        if ((["person", "customer", "customer_member", "opportunity", "contact"] as string[]).includes(root)) return override.toLowerCase();
    }

    const entity = src.entity_type?.trim().toLowerCase() ?? "";
    const fieldKey = src.field_key?.trim().toLowerCase() ?? "";
    return canonicalPrefillPathForBinding(entity, fieldKey);
}

/**
 * The same answer, for a binding that is not yet a field.
 *
 * Realization needs to know whether a canonical owner can actually fill a destination BEFORE the
 * field exists — a required box bound to a path nothing resolves is a blank box with a confident
 * label on it. Asking the prefill map itself keeps one owner for that answer.
 *
 * `aliasOnly` is the stricter question: is this key one the map genuinely KNOWS, rather than one it
 * would pass through unchanged? A pass-through means "there might be a column of that name", which
 * is not evidence that a value will arrive.
 */
export function canonicalPrefillPathForBinding(entityType: string, fieldKey: string, opts?: { aliasOnly?: boolean }): string | null {
    const entity = entityType.trim().toLowerCase();
    const key = fieldKey.trim().toLowerCase();
    const root = ENTITY_TO_ROOT[entity];
    if (!root || !key) return null;
    const alias = COLUMN_ALIASES[root][key];
    if (opts?.aliasOnly && !alias) return null;
    return `${root}.${alias ?? key}`;
}

/** Build a prefill_field_map (fieldId → "root.col") from every scalar field's field_source. */
export function buildCanonicalPrefillFieldMap(schema: FormSchemaV1): Record<string, string> {
    const map: Record<string, string> = {};
    walkScalarFormFields(schema, (field) => {
        // Uploads/signatures/multiselect are not value-prefilled.
        if (field.type === "file_ref" || field.type === "signature" || field.type === "multiselect") return;
        const path = canonicalPrefillPathForField(field);
        if (path) map[field.id] = path;
    });
    return map;
}
