/**
 * Field scope classification for the Family Packet model.
 *
 * Every collected datum belongs to one of three scopes:
 *   - household  — collected once, shared across all selected children (parent name/email,
 *                  address, emergency/pickup contacts)
 *   - child      — collected per child (child name, DOB, allergies, program)
 *   - recipient  — collected per recipient (signature, attestation, consent)
 *
 * Scope is config-driven (from the field's `field_source.entity_type` + type), never a
 * hardcoded enrollment/health/emergency process. Unbound fields fall back to a caller-chosen
 * default (household by default). Pure, no I/O.
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import { walkScalarFormFields } from "@/lib/forms/formSchemaFieldWalk";

export type FieldScope = "household" | "child" | "recipient";

const CHILD_ENTITIES = new Set(["customer_member", "child", "inquiry_child", "student"]);
const HOUSEHOLD_ENTITIES = new Set([
    "person",
    "parent",
    "guardian",
    "customer",
    "household",
    "contact",
    "opportunity",
    "lead",
    "address",
    "location",
]);

export interface FieldScopeOptions {
    /** Scope for unbound fields (no field_source). Default "household". */
    defaultScope?: FieldScope;
}

/** Classify a single field's scope. Signatures are always recipient-scoped. */
export function classifyFieldScope(field: FormField, opts: FieldScopeOptions = {}): FieldScope {
    if (field.type === "signature") return "recipient";
    const entity = field.field_source?.entity_type?.trim().toLowerCase() ?? "";
    if (entity && CHILD_ENTITIES.has(entity)) return "child";
    if (entity && HOUSEHOLD_ENTITIES.has(entity)) return "household";
    return opts.defaultScope ?? "household";
}

export interface ScopedFieldIds {
    household: string[];
    child: string[];
    recipient: string[];
}

/** Partition a schema's scalar fields by scope (schema order preserved within each scope). */
export function partitionFieldsByScope(schema: FormSchemaV1, opts: FieldScopeOptions = {}): ScopedFieldIds {
    const out: ScopedFieldIds = { household: [], child: [], recipient: [] };
    walkScalarFormFields(schema, (field) => {
        out[classifyFieldScope(field, opts)].push(field.id);
    });
    return out;
}
