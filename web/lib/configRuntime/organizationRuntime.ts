/**
 * Organization Configuration Runtime
 *
 * Domain-agnostic contracts for configuration owned by an organization and
 * consumed by one or more locations. Domains register their ownership and
 * distribution behavior here; they keep their own authoritative storage.
 */

export type ConfigurationAuthority = "platform" | "organization" | "location";
export type ConfigurationInheritanceKind = "value" | "availability" | "none";
export type ConfigurationPublicationMode = "immediate" | "explicit";
export type ConfigurationDistributionMode = "inherit" | "apply" | "assignment" | "none";

export type OrganizationConfigurationDomain = {
    key: string;
    label: string;
    description: string;
    href: string;
    configurationOwner: string;
    runtimeOwner: string;
    inheritance: {
        kind: ConfigurationInheritanceKind;
        path: readonly ConfigurationAuthority[];
    };
    publicationMode: ConfigurationPublicationMode;
    distributionMode: ConfigurationDistributionMode;
    /** Registered only after the domain has a durable, auditable apply implementation. */
    applyProviderKey?: string;
};

export type OrganizationConfigurationPublication = {
    domainKey: string;
    configurationId: string;
    revision: string;
    state: "draft" | "published";
    publishedAt?: string;
};

export type OrganizationDistributionTarget = {
    locationId: string;
    locationLabel: string;
};

export type OrganizationDistributionPlan = {
    orgId: string;
    domainKey: string;
    configurationId: string;
    revision: string;
    providerKey: string;
    targets: OrganizationDistributionTarget[];
    idempotencyKey: string;
};

export type OrganizationDistributionTargetResult = {
    locationId: string;
    status: "applied" | "unchanged";
};

export type OrganizationDistributionResult = {
    auditId: string;
    authoritativeRevision: string;
    targets: OrganizationDistributionTargetResult[];
};

export type OrganizationConfigurationApplyProvider = {
    key: string;
    domainKey: string;
    apply: (plan: OrganizationDistributionPlan) => Promise<OrganizationDistributionResult>;
};

export type OrganizationLocationGovernanceState = {
    locationId: string;
    locationLabel: string;
    domainKey: string;
    posture: "inherited" | "overridden" | "assigned" | "not_applicable" | "not_assessed";
};

export type OrganizationGovernanceSummary = {
    activeLocationCount: number;
    assessedLocationCount: number;
    inheritedCount: number;
    overriddenCount: number;
    assignedCount: number;
    notAssessedCount: number;
};

const CONFIGURATION_DOMAINS: readonly OrganizationConfigurationDomain[] = [
    {
        key: "locations",
        label: "Locations",
        description: "Sites and the operational objects each site owns.",
        href: "/settings/locations",
        configurationOwner: "Locations",
        runtimeOwner: "Location and operational runtimes",
        inheritance: { kind: "none", path: ["organization", "location"] },
        publicationMode: "immediate",
        distributionMode: "none",
    },
    {
        key: "access",
        label: "Access",
        description: "Organization roles with location and department assignments.",
        href: "/settings/users-roles",
        configurationOwner: "Access",
        runtimeOwner: "Authorization",
        inheritance: { kind: "availability", path: ["organization", "location"] },
        publicationMode: "immediate",
        distributionMode: "assignment",
    },
    {
        key: "communications",
        label: "Communications",
        description: "Shared channels, templates, and send rules with local availability.",
        href: "/settings/communications",
        configurationOwner: "Communications",
        runtimeOwner: "Communications",
        inheritance: { kind: "value", path: ["platform", "organization", "location"] },
        publicationMode: "immediate",
        distributionMode: "inherit",
    },
    {
        key: "data-model",
        label: "Data model",
        description: "Organization vocabulary shared by records and configured surfaces.",
        href: "/settings/entities",
        configurationOwner: "Data Model",
        runtimeOwner: "Record and entity runtimes",
        inheritance: { kind: "value", path: ["platform", "organization"] },
        publicationMode: "immediate",
        distributionMode: "inherit",
    },
    {
        key: "operations",
        label: "Operations",
        description: "Processes, operating plans, and automation shared by the organization.",
        href: "/settings/processes",
        configurationOwner: "Processes and Automation",
        runtimeOwner: "Business Process Runtime",
        inheritance: { kind: "availability", path: ["platform", "organization", "location"] },
        publicationMode: "immediate",
        distributionMode: "assignment",
    },
    {
        key: "surfaces",
        label: "Surfaces",
        description: "Published presentation used by queues, rows, cards, and Focus Panel.",
        href: "/settings/surfaces",
        configurationOwner: "Surfaces",
        runtimeOwner: "Presentation Runtime",
        inheritance: { kind: "value", path: ["platform", "organization"] },
        publicationMode: "explicit",
        distributionMode: "inherit",
    },
    {
        key: "commercial",
        label: "Commercial",
        description: "Organization defaults with location-specific availability and overrides.",
        href: "/settings/commercial",
        configurationOwner: "Commercial Configuration",
        runtimeOwner: "Commercial and consumption runtimes",
        inheritance: { kind: "value", path: ["organization", "location"] },
        publicationMode: "immediate",
        distributionMode: "inherit",
    },
] as const;

export function organizationConfigurationDomains(): readonly OrganizationConfigurationDomain[] {
    return CONFIGURATION_DOMAINS;
}

export function organizationConfigurationDomain(
    domainKey: string,
): OrganizationConfigurationDomain | null {
    return CONFIGURATION_DOMAINS.find((domain) => domain.key === domainKey) ?? null;
}

export function canApplyOrganizationConfiguration(
    domain: OrganizationConfigurationDomain,
    providers: readonly OrganizationConfigurationApplyProvider[],
): boolean {
    if (domain.distributionMode !== "apply" || !domain.applyProviderKey) return false;
    return providers.some(
        (provider) => provider.key === domain.applyProviderKey && provider.domainKey === domain.key,
    );
}

function normalizedTargets(
    targets: readonly OrganizationDistributionTarget[],
): OrganizationDistributionTarget[] {
    const unique = new Map<string, OrganizationDistributionTarget>();
    for (const target of targets) {
        const locationId = target.locationId.trim();
        if (!locationId || unique.has(locationId)) continue;
        unique.set(locationId, {
            locationId,
            locationLabel: target.locationLabel.trim() || "Location",
        });
    }
    return [...unique.values()].sort((a, b) => a.locationId.localeCompare(b.locationId));
}

export function buildOrganizationDistributionPlan(input: {
    orgId: string;
    domain: OrganizationConfigurationDomain;
    publication: OrganizationConfigurationPublication;
    targets: readonly OrganizationDistributionTarget[];
    providers: readonly OrganizationConfigurationApplyProvider[];
}): OrganizationDistributionPlan {
    const orgId = input.orgId.trim();
    if (!orgId) throw new Error("Organization is required.");
    if (input.publication.domainKey !== input.domain.key) {
        throw new Error("Publication does not belong to this configuration area.");
    }
    if (input.publication.state !== "published") {
        throw new Error("Publish this configuration before applying it to locations.");
    }
    if (!canApplyOrganizationConfiguration(input.domain, input.providers)) {
        throw new Error("Apply to locations is not available for this configuration area.");
    }

    const targets = normalizedTargets(input.targets);
    if (targets.length === 0) throw new Error("Choose at least one location.");

    const providerKey = input.domain.applyProviderKey!;
    const targetKey = targets.map((target) => target.locationId).join(",");
    return {
        orgId,
        domainKey: input.domain.key,
        configurationId: input.publication.configurationId,
        revision: input.publication.revision,
        providerKey,
        targets,
        idempotencyKey: [
            orgId,
            input.domain.key,
            input.publication.configurationId,
            input.publication.revision,
            targetKey,
        ].join(":"),
    };
}

export async function executeOrganizationDistributionPlan(
    plan: OrganizationDistributionPlan,
    providers: readonly OrganizationConfigurationApplyProvider[],
): Promise<OrganizationDistributionResult> {
    const provider = providers.find(
        (candidate) => candidate.key === plan.providerKey && candidate.domainKey === plan.domainKey,
    );
    if (!provider) throw new Error("The registered apply provider is unavailable.");

    const result = await provider.apply(plan);
    if (!result.auditId.trim() || result.authoritativeRevision !== plan.revision) {
        throw new Error("Apply was not confirmed by the authoritative provider.");
    }

    const expected = new Set(plan.targets.map((target) => target.locationId));
    const confirmed = new Set(result.targets.map((target) => target.locationId));
    if (
        result.targets.some((target) => !expected.has(target.locationId))
        || result.targets.length !== expected.size
        || expected.size !== confirmed.size
        || [...expected].some((locationId) => !confirmed.has(locationId))
    ) {
        throw new Error("Apply did not confirm every selected location.");
    }
    return result;
}

export function summarizeOrganizationGovernance(input: {
    activeLocationIds: readonly string[];
    states: readonly OrganizationLocationGovernanceState[];
}): OrganizationGovernanceSummary {
    const active = new Set(input.activeLocationIds);
    const assessedLocations = new Set<string>();
    let inheritedCount = 0;
    let overriddenCount = 0;
    let assignedCount = 0;
    let notAssessedCount = 0;

    for (const state of input.states) {
        if (!active.has(state.locationId)) continue;
        if (state.posture !== "not_assessed") assessedLocations.add(state.locationId);
        if (state.posture === "inherited") inheritedCount += 1;
        if (state.posture === "overridden") overriddenCount += 1;
        if (state.posture === "assigned") assignedCount += 1;
        if (state.posture === "not_assessed") notAssessedCount += 1;
    }

    return {
        activeLocationCount: active.size,
        assessedLocationCount: assessedLocations.size,
        inheritedCount,
        overriddenCount,
        assignedCount,
        notAssessedCount,
    };
}
