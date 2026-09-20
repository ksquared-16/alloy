/**
 * Hub entity → status domain mapping for the Entity-centric Data Model workspace.
 *
 * The Entity workspace hosts statuses in place (no navigate-away to the Statuses
 * page), so it needs to know which `status_definitions.entity_type` a hub entity
 * owns. Ownership itself is not redefined here — it is read from
 * `statusCategoryRegistry.ts`, the authoritative owner registry, so the Entity
 * Status tab and Settings → Statuses can never disagree about who owns a domain.
 */

import {
    statusCategoryRegistryEntry,
    type StatusCategoryRegistryEntry,
} from "@/lib/admin/statusCategoryRegistry";
import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";

/**
 * `status_definitions.entity_type` whose rows are authoritative for each hub entity.
 *
 * PARTIAL ON PURPOSE. Not every entity in the Data Model has a CONFIGURABLE status
 * vocabulary, and an entity without one must not be handed a fabricated domain for
 * structural symmetry. Employment is the case that made this explicit: its status
 * (`pending_start | active | ending | ended | canceled`) is a CHECK-constrained
 * platform enum on `employments`, not tenant-authored `status_definitions`, so
 * listing it here would invent a second, editable Employment status truth beside
 * the real one.
 *
 * The resolver already returns null and every caller already handles null — only
 * this map's exhaustiveness was forcing parity. Making it Partial is the whole
 * repair, and it is reusable by the next entity in the same position.
 */
const STATUS_ENTITY_TYPE_BY_HUB: Readonly<Partial<Record<SettingsHubEntityKey, string>>> = {
    person: "persons",
    customer: "customers",
    inquiry_child: "opportunity_customer_members",
    opportunity: "opportunities",
    location: "locations",
};

export type EntityStatusDomainDefinition = {
    /** `status_definitions.entity_type` to load. */
    statusEntityType: string;
    /** Operator-facing domain name from the status category registry. */
    label: string;
    /** Persisted column that this domain's values are written to. */
    authoritativeTable: string;
    authoritativeColumn: string;
    usageSummary: string;
    /** True when stage/status assignment also flows through Business Processes. */
    processLinked: boolean;
};

export function statusDomainForHubEntity(
    hubKey: SettingsHubEntityKey | string,
): EntityStatusDomainDefinition | null {
    const entityType = STATUS_ENTITY_TYPE_BY_HUB[hubKey as SettingsHubEntityKey];
    if (!entityType) return null;
    const registry: StatusCategoryRegistryEntry | undefined = statusCategoryRegistryEntry(entityType);
    if (!registry) return null;
    return {
        statusEntityType: entityType,
        label: registry.operatorLabel,
        authoritativeTable: registry.authoritative.table,
        authoritativeColumn: registry.authoritative.column,
        usageSummary: registry.usageSummary,
        processLinked: registry.processLinked === true,
    };
}

/** Distinct status entity types the Entity workspace needs, for one batched server load. */
export function statusEntityTypesForHubEntities(
    hubKeys: readonly (SettingsHubEntityKey | string)[],
): string[] {
    const out = new Set<string>();
    for (const hubKey of hubKeys) {
        const domain = statusDomainForHubEntity(hubKey);
        if (domain) out.add(domain.statusEntityType);
    }
    return [...out];
}
