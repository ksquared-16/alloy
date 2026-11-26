/**
 * Canonical provider context requirements - derived from entity ownership.
 */

import type { CanonicalRegistryRef } from "@/lib/fields/fieldRegistryReferenceMatrix";

export type ProviderContextRequirement = {
    entity_type: string;
    qualifier?: string;
    required: boolean;
};

const CANONICAL_ENTITY_CONTEXT_DEFAULTS: Readonly<
    Record<string, Pick<ProviderContextRequirement, "entity_type" | "qualifier">>
> = {
    customer_member: { entity_type: "customer_member" },
    person: { entity_type: "person" },
    customer: { entity_type: "customer" },
    inquiry_child: { entity_type: "inquiry_child" },
    opportunity: { entity_type: "opportunity" },
    enrollment: { entity_type: "enrollment", qualifier: "active" },
    location: { entity_type: "location" },
    invoice_line: { entity_type: "invoice_line" },
};

const CANONICAL_REF_CONTEXT_OVERRIDES: Readonly<Record<string, ProviderContextRequirement[]>> = {
    "enrollment:current_classroom": [{ entity_type: "enrollment", qualifier: "active", required: true }],
    "opportunity:status_key": [{ entity_type: "opportunity", required: true }],
};

function canonicalRefKey(ref: CanonicalRegistryRef): string {
    return `${ref.entity_type.trim().toLowerCase()}:${ref.field_key.trim().toLowerCase()}`;
}

export function providerContextRequirementsFromCanonicalRef(
    ref: CanonicalRegistryRef,
): ProviderContextRequirement[] {
    const override = CANONICAL_REF_CONTEXT_OVERRIDES[canonicalRefKey(ref)];
    if (override) return override;
    const entity = ref.entity_type.trim().toLowerCase();
    const defaults = CANONICAL_ENTITY_CONTEXT_DEFAULTS[entity];
    if (defaults) return [{ ...defaults, required: true }];
    return [{ entity_type: entity, required: true }];
}
