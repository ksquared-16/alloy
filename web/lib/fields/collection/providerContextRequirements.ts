/**
 * Canonical provider context requirements — derived from entity ownership, not consumer field lists.
 *
 * A nested provider is available when the active iteration context satisfies every required context entry.
 *
 * @see docs/sprints/08_2026/forms-documents-collection-authoring.md
 */

import type { FormField } from "@/lib/forms/schema";
import {
    fieldDefinitionEntityTypeFromFormsEntity,
    systemFieldIdToCanonicalRef,
    type CanonicalRegistryRef,
} from "@/lib/fields/fieldRegistryReferenceMatrix";
import { formFieldSourceToCanonicalProvider } from "@/lib/fields/formsFieldSourceBinding";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";

export type ProviderContextRequirement = {
    entity_type: string;
    qualifier?: string;
    required: boolean;
};

/**
 * Default context requirement for a canonical entity grain.
 * Qualifiers express stricter runtime bindings (e.g. active enrollment) without field-key branching.
 */
const CANONICAL_ENTITY_CONTEXT_DEFAULTS: Readonly<
    Record<string, Pick<ProviderContextRequirement, "entity_type" | "qualifier">>
> = {
    customer_member: { entity_type: "customer_member" },
    person: { entity_type: "person" },
    customer: { entity_type: "customer" },
    inquiry_child: { entity_type: "inquiry_child" },
    opportunity: { entity_type: "opportunity" },
    /** Runtime enrollment projections — not implied by household child iteration alone. */
    enrollment: { entity_type: "enrollment", qualifier: "active" },
    location: { entity_type: "location" },
    invoice_line: { entity_type: "invoice_line" },
};

/** Canonical ref overrides when ownership grain differs from entity_type alone. */
const CANONICAL_REF_CONTEXT_OVERRIDES: Readonly<Record<string, ProviderContextRequirement[]>> = {
    "enrollment:current_classroom": [{ entity_type: "enrollment", qualifier: "active", required: true }],
    "opportunity:status_key": [{ entity_type: "opportunity", required: true }],
};

function canonicalRefKey(ref: CanonicalRegistryRef): string {
    return `${ref.entity_type.trim().toLowerCase()}:${ref.field_key.trim().toLowerCase()}`;
}

/** Derive required contexts from canonical registry ownership. */
export function providerContextRequirementsFromCanonicalRef(
    ref: CanonicalRegistryRef,
): ProviderContextRequirement[] {
    const override = CANONICAL_REF_CONTEXT_OVERRIDES[canonicalRefKey(ref)];
    if (override) return override;

    const entity = ref.entity_type.trim().toLowerCase();
    const defaults = CANONICAL_ENTITY_CONTEXT_DEFAULTS[entity];
    if (defaults) {
        return [{ ...defaults, required: true }];
    }

    return [{ entity_type: entity, required: true }];
}

/** Resolve canonical ref from a Forms field_source binding. */
export function canonicalRefFromFormField(field: FormField): CanonicalRegistryRef | null {
    if (field.type === "group") return null;
    const source = field.field_source;
    if (!source || source.entity_type === "custom") return null;

    try {
        const resolution = formFieldSourceToCanonicalProvider(source);
        if (resolution.canonicalRef) return resolution.canonicalRef;
    } catch {
        // fall through to legacy registry lookup
    }

    const legacyEntry = OPERATIONAL_FORM_SYSTEM_FIELDS.find(
        (e) => e.entity_type === source.entity_type && e.field_key === source.field_key,
    );
    if (legacyEntry) {
        const fromId = systemFieldIdToCanonicalRef(legacyEntry.id);
        if (fromId) return fromId;
    }

    const defEntity = fieldDefinitionEntityTypeFromFormsEntity(source.entity_type ?? "");
    if (!defEntity) return null;

    return {
        entity_type: defEntity,
        field_key: source.field_key?.trim() ?? field.id,
    };
}

/** Context requirements for a nested form field binding. */
export function providerContextRequirementsForFormField(field: FormField): ProviderContextRequirement[] {
    const ref = canonicalRefFromFormField(field);
    if (!ref) return [];
    return providerContextRequirementsFromCanonicalRef(ref);
}
