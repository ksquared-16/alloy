/**
 * Provider / field / option-set reference discovery for relationship fields.
 */

import { PERSON_CHILD_RELATIONSHIP_TYPE_OPTION_SET_KEY } from "./personChildRelationshipEntity";
import { buildPersonChildRelationshipPlatformProviders } from "./personChildRelationshipProviderCatalogIntegration";

export type PersonChildRelationshipReference = {
    kind: "provider_ref" | "field_definition" | "option_set";
    key: string;
};

export function discoverPersonChildRelationshipReferences(): PersonChildRelationshipReference[] {
    const refs: PersonChildRelationshipReference[] = [
        { kind: "option_set", key: PERSON_CHILD_RELATIONSHIP_TYPE_OPTION_SET_KEY },
    ];
    for (const provider of buildPersonChildRelationshipPlatformProviders()) {
        refs.push({ kind: "provider_ref", key: provider.refKey });
        refs.push({
            kind: "field_definition",
            key: `person_child_relationship:${provider.refKey.split(".").pop()}`,
        });
    }
    return refs;
}
