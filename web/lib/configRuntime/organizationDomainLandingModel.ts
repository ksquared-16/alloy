/**
 * Shared Organization domain landing tile contract (Financials / Locations pattern).
 */

export type OrganizationDomainLandingTile = {
    id: string;
    label: string;
    summary: string;
    capabilities: readonly string[];
    kind: "configuration" | "assignment" | "utility" | "boundary";
    postureLabel: string;
    href: string;
};

export type OrganizationDomainLandingModel = {
    domainKey: string;
    title: string;
    purpose: string;
    ownershipNote: string;
    summaryCards: readonly {
        id: string;
        label: string;
        value: string;
        detail: string;
    }[];
    tiles: readonly OrganizationDomainLandingTile[];
};
