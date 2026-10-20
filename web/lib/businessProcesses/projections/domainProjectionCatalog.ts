/**
 * The closed catalog of domain projection KEYS — pure data, safe for client bundles and for publication
 * validation. The server-only registry (`domainProjectionRegistry.ts`) binds each key to its loader and
 * asserts, in tests, that the two lists are the same.
 */

import type { ProcessProjectionDomain } from "@/lib/lifecycle/processModelV1";
import type { DomainProjectionSubjectType } from "@/lib/businessProcesses/projections/domainProjectionTypes";

export type DomainProjectionCatalogEntry = {
    key: string;
    label: string;
    subjectTypes: readonly DomainProjectionSubjectType[];
};

export const DOMAIN_PROJECTION_CATALOG: Readonly<Record<ProcessProjectionDomain, readonly DomainProjectionCatalogEntry[]>> = {
    assignments: [{ key: "current_assignments", label: "Current assignments", subjectTypes: ["child", "person"] }],
    billing: [{ key: "charges_needing_review", label: "Charges needing review", subjectTypes: ["household"] }],
};

export function domainProjectionKeys(domain: ProcessProjectionDomain): string[] {
    return (DOMAIN_PROJECTION_CATALOG[domain] ?? []).map((p) => p.key);
}

export function isRegisteredDomainProjectionKey(domain: ProcessProjectionDomain, key: string | null | undefined): boolean {
    const k = (key ?? "").trim();
    return Boolean(k) && domainProjectionKeys(domain).includes(k);
}
