/**
 * Canonical field registry reference matrix (Configuration Convergence F1).
 *
 * Maps legacy field identifiers (BP rule_id, Forms system id, layout refKey)
 * to canonical `field_definitions` refs: { entity_type, field_key }.
 *
 * Consumers must not scatter ad-hoc mapping logic — use these helpers.
 */

import { LIFECYCLE_FIELD_RULE_BINDINGS } from "@/lib/lifecycle/lifecycleFieldRuleBindings";
import type { LifecycleRequirementEntityKey } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import { normalizeRefKeyOnRead, parseLayoutRefKey } from "@/lib/layout/layoutRefKeyAliases";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";

/** Canonical registry ref — matches `field_definitions` grain. */
export type CanonicalRegistryRef = {
    entity_type: string;
    field_key: string;
};

export type LegacyFieldIdKind = "lifecycle_rule_id" | "forms_system_id" | "layout_ref_key";

/** Lifecycle palette entity key → field_definitions entity_type. */
export function fieldDefinitionEntityTypeFromLifecycleEntity(
    entity: LifecycleRequirementEntityKey
): string {
    if (entity === "child") return "inquiry_child";
    return entity;
}

export function lifecycleEntityFromFieldDefinitionEntityType(entityType: string): LifecycleRequirementEntityKey | null {
    const t = entityType.trim().toLowerCase();
    if (t === "person" || t === "persons") return "person";
    if (t === "inquiry_child") return "child";
    if (t === "opportunity" || t === "opportunities") return "opportunity";
    if (t === "customer" || t === "customers") return "customer";
    return null;
}

export function canonicalRefKey(ref: CanonicalRegistryRef): string {
    return `${ref.entity_type.trim().toLowerCase()}:${ref.field_key.trim()}`;
}

/** Forms picker entity_type → field_definitions entity_type. */
export function fieldDefinitionEntityTypeFromFormsEntity(entityType: string): string | null {
    const t = entityType.trim().toLowerCase();
    if (t === "guardian") return "person";
    if (t === "child" || t === "enrollment") return "inquiry_child";
    if (t === "opportunity") return "opportunity";
    if (t === "customer") return "customer";
    return null;
}

/** field_definitions entity_type → Forms picker entity_type for grouping. */
export function formsEntityTypeFromFieldDefinitionEntity(entityType: string): string {
    const t = entityType.trim().toLowerCase();
    if (t === "person") return "guardian";
    if (t === "inquiry_child") return "child";
    if (t === "opportunity") return "opportunity";
    if (t === "customer") return "customer";
    return "custom";
}

/**
 * Explicit Forms system field id → canonical ref overrides.
 * Used when schema field_key differs from field_definitions.field_key.
 */
const FORMS_SYSTEM_ID_CANONICAL_OVERRIDES: Readonly<Record<string, CanonicalRegistryRef>> = {
    child_first_name: { entity_type: "inquiry_child", field_key: "first_name" },
    child_last_name: { entity_type: "inquiry_child", field_key: "last_name" },
    child_date_of_birth: { entity_type: "inquiry_child", field_key: "date_of_birth" },
    guardian_first_name: { entity_type: "person", field_key: "first_name" },
    guardian_last_name: { entity_type: "person", field_key: "last_name" },
    guardian_email: { entity_type: "person", field_key: "email" },
    guardian_phone: { entity_type: "person", field_key: "phone" },
    desired_start_date: { entity_type: "inquiry_child", field_key: "desired_start_date" },
    desired_program_type: { entity_type: "inquiry_child", field_key: "desired_program_type" },
    desired_program_category_id: { entity_type: "inquiry_child", field_key: "desired_program_category_id" },
    desired_schedule_type: { entity_type: "inquiry_child", field_key: "desired_schedule_type" },
    program_room_preference: { entity_type: "inquiry_child", field_key: "program_room_cohort_key" },
    child_room_cohort: { entity_type: "inquiry_child", field_key: "program_room_cohort_key" },
    child_site: { entity_type: "inquiry_child", field_key: "location_id" },
    lead_site: { entity_type: "opportunity", field_key: "location_id" },
    lead_location_id: { entity_type: "opportunity", field_key: "location_id" },
    opportunity_interest_notes: { entity_type: "opportunity", field_key: "interest_notes" },
    customer_account_name: { entity_type: "customer", field_key: "display_name" },
};

/** Layout namespace → field_definitions entity_type (non-1:1 namespaces). */
const LAYOUT_NAMESPACE_TO_ENTITY_TYPE: Readonly<Record<string, string>> = {
    person: "person",
    opportunity: "opportunity",
    customer: "customer",
    inquiry_child: "inquiry_child",
    child: "inquiry_child",
    location: "location",
};

// --- Build indexes at module load ---

const CANONICAL_TO_RULE_ID = new Map<string, string>();
const RULE_ID_TO_CANONICAL = new Map<string, CanonicalRegistryRef>();
const FORMS_ID_TO_CANONICAL = new Map<string, CanonicalRegistryRef>();
const CANONICAL_TO_FORMS_ID = new Map<string, string>();

for (const binding of LIFECYCLE_FIELD_RULE_BINDINGS) {
    if (!binding.field_key) continue;
    const entityType = fieldDefinitionEntityTypeFromLifecycleEntity(binding.entity);
    const ref: CanonicalRegistryRef = { entity_type: entityType, field_key: binding.field_key };
    const key = canonicalRefKey(ref);
    CANONICAL_TO_RULE_ID.set(key, binding.rule_id);
    RULE_ID_TO_CANONICAL.set(binding.rule_id, ref);
    for (const captureKey of binding.form_capture_keys) {
        const trimmed = captureKey.trim();
        if (!trimmed || trimmed.includes(" ")) continue;
        if (!FORMS_ID_TO_CANONICAL.has(trimmed)) {
            FORMS_ID_TO_CANONICAL.set(trimmed, ref);
        }
    }
}

for (const entry of OPERATIONAL_FORM_SYSTEM_FIELDS) {
    const override = FORMS_SYSTEM_ID_CANONICAL_OVERRIDES[entry.id];
    const ref: CanonicalRegistryRef =
        override ??
        (() => {
            const entityType = fieldDefinitionEntityTypeFromFormsEntity(entry.entity_type);
            if (!entityType) return null;
            return { entity_type: entityType, field_key: entry.field_key };
        })();
    if (!ref) continue;
    const key = canonicalRefKey(ref);
    FORMS_ID_TO_CANONICAL.set(entry.id, ref);
    if (!CANONICAL_TO_FORMS_ID.has(key)) {
        CANONICAL_TO_FORMS_ID.set(key, entry.id);
    }
}

export function ruleIdToCanonicalRef(ruleId: string): CanonicalRegistryRef | null {
    const direct = RULE_ID_TO_CANONICAL.get(ruleId.trim());
    if (direct) return direct;
    const custom = /^custom:(person|child|opportunity|customer):(.+)$/.exec(ruleId.trim());
    if (!custom) return null;
    const entityType = fieldDefinitionEntityTypeFromLifecycleEntity(custom[1] as LifecycleRequirementEntityKey);
    return { entity_type: entityType, field_key: custom[2]! };
}

export function canonicalRefToRuleId(ref: CanonicalRegistryRef): string | null {
    return CANONICAL_TO_RULE_ID.get(canonicalRefKey(ref)) ?? null;
}

export function systemFieldIdToCanonicalRef(systemFieldId: string): CanonicalRegistryRef | null {
    return FORMS_ID_TO_CANONICAL.get(systemFieldId.trim()) ?? null;
}

export function canonicalRefToSystemFieldId(ref: CanonicalRegistryRef): string | null {
    return CANONICAL_TO_FORMS_ID.get(canonicalRefKey(ref)) ?? null;
}

export function layoutRefKeyToCanonicalRef(refKey: string): CanonicalRegistryRef | null {
    const normalized = normalizeRefKeyOnRead(refKey.trim());
    const parsed = parseLayoutRefKey(normalized);
    if (!parsed) return null;
    const entityType = LAYOUT_NAMESPACE_TO_ENTITY_TYPE[parsed.entityKey];
    if (!entityType) return null;
    return { entity_type: entityType, field_key: parsed.fieldKey };
}

/** Stable picker / persistence rule_id for a registry row in Business Processes. */
export function resolveRuleIdForCanonicalRef(ref: CanonicalRegistryRef): string {
    const catalogRule = canonicalRefToRuleId(ref);
    if (catalogRule) return catalogRule;
    const entity = lifecycleEntityFromFieldDefinitionEntityType(ref.entity_type);
    if (!entity) return `custom:unknown:${ref.field_key}`;
    return `custom:${entity}:${ref.field_key}`;
}

/** Forms schema field id — legacy alias when mapped, else registry field_key. */
export function formsFieldKeyForCanonicalRef(ref: CanonicalRegistryRef): string {
    const legacyId = canonicalRefToSystemFieldId(ref);
    if (legacyId) {
        const entry = OPERATIONAL_FORM_SYSTEM_FIELDS.find((e) => e.id === legacyId);
        if (entry) return entry.field_key;
    }
    return ref.field_key;
}

export function formsRegistryEntryIdForCanonicalRef(ref: CanonicalRegistryRef): string {
    return canonicalRefToSystemFieldId(ref) ?? `reg_${ref.entity_type}_${ref.field_key}`;
}

/** Whether two legacy ids refer to the same canonical field. */
export function legacyIdsShareCanonicalRef(a: string, b: string, kindA: LegacyFieldIdKind, kindB: LegacyFieldIdKind): boolean {
    const refA = legacyIdToCanonicalRef(a, kindA);
    const refB = legacyIdToCanonicalRef(b, kindB);
    if (!refA || !refB) return false;
    return canonicalRefKey(refA) === canonicalRefKey(refB);
}

export function legacyIdToCanonicalRef(legacyId: string, kind: LegacyFieldIdKind): CanonicalRegistryRef | null {
    const id = legacyId.trim();
    if (!id) return null;
    switch (kind) {
        case "lifecycle_rule_id":
            return ruleIdToCanonicalRef(id);
        case "forms_system_id":
            return systemFieldIdToCanonicalRef(id);
        case "layout_ref_key":
            return layoutRefKeyToCanonicalRef(id);
        default:
            return null;
    }
}
