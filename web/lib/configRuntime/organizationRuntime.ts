/**
 * Organization Configuration Runtime
 *
 * Domain-agnostic contracts for configuration owned by an organization and
 * consumed by one or more locations. Domains register their ownership and
 * distribution behavior here; they keep their own authoritative storage.
 */

import {
    CANONICAL_ORGANIZATION_FINANCIALS_HREF,
    CANONICAL_ORGANIZATION_PROGRAMS_HREF,
    CANONICAL_ORGANIZATION_PROGRAMS_LOCATIONS_HREF,
} from "@/lib/admin/canonicalAdminRoutes";
import { ORGANIZATION_LOCATIONS_PATH } from "@/lib/admin/canonicalLocationSettingsRoutes";

export type ConfigurationAuthority = "platform" | "organization" | "location";
export type ConfigurationInheritanceKind = "value" | "availability" | "none";
export type ConfigurationPublicationMode = "immediate" | "explicit";
export type ConfigurationPublicationStatus =
    | "live_on_save"
    | "publish_required"
    | "published"
    | "draft"
    | "not_assessed";
export type ConfigurationDistributionMode = "inherit" | "apply" | "assignment" | "none";
export type ConfigurationOverrideState = "available" | "not_allowed" | "not_assessed";
export type ConfigurationHealthState = "ready" | "attention" | "not_assessed";
export type OrganizationConfigurationDomainIcon =
    | "locations"
    | "programs"
    | "programs-locations"
    | "financials"
    | "access"
    | "communications"
    | "data-model"
    | "business-processes"
    | "surfaces"
    | "automation"
    | "intelligence";

export type OrganizationConfigurationDomain = {
    key: string;
    /** Compatibility runtime/route noun when operator language has moved forward. */
    internalRuntimeKey?: string;
    label: string;
    description: string;
    href: string;
    icon: OrganizationConfigurationDomainIcon;
    publisherLabel: string;
    configurationOwner: string;
    runtimeOwner: string;
    consumers: readonly string[];
    inheritance: {
        kind: ConfigurationInheritanceKind;
        path: readonly ConfigurationAuthority[];
        label: string;
    };
    publication: {
        mode: ConfigurationPublicationMode;
        status: ConfigurationPublicationStatus;
        label: string;
    };
    override: {
        state: ConfigurationOverrideState;
        label: string;
    };
    health: {
        state: ConfigurationHealthState;
        label: string;
        detail: string;
    };
    distributionMode: ConfigurationDistributionMode;
    ownedConfiguration?: readonly string[];
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
    status: "applied" | "unchanged" | "failed";
    errorCode?: string;
    errorMessage?: string;
};

export type OrganizationDistributionResult = {
    auditId: string;
    authoritativeRevision: string;
    targets: OrganizationDistributionTargetResult[];
    status?: "completed" | "partial_failure" | "failed";
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
        key: "programs-locations",
        label: "Programs & Locations",
        description:
            "Two perspectives on one operational system — reusable Organization services, and the places that deliver them.",
        href: CANONICAL_ORGANIZATION_PROGRAMS_LOCATIONS_HREF,
        icon: "programs-locations",
        publisherLabel: "Organization",
        configurationOwner: "Programs & Locations",
        runtimeOwner: "Programs and Location runtimes",
        consumers: ["Locations", "Enrollment", "Financials", "Operational Runtime"],
        inheritance: {
            kind: "availability",
            path: ["organization", "location"],
            label: "Programs are authored once; Locations consume and deliver them",
        },
        publication: { mode: "immediate", status: "live_on_save", label: "Collections remain authoritative" },
        override: {
            state: "available",
            label: "Locations own local delivery; Programs own reusable definition",
        },
        health: {
            state: "not_assessed",
            label: "Not assessed",
            detail: "Readiness remains owned by Programs and Locations collections.",
        },
        distributionMode: "assignment",
        ownedConfiguration: [
            "Organization Program definitions",
            "Location delivery of Programs",
            "Rooms, schedules, and local capacity",
            "Program ↔ Location assignment",
        ],
    },
    {
        key: "financials",
        label: "Financials",
        description:
            "Configure tuition, billable items, funding, financial rules, and accounting relationships.",
        href: CANONICAL_ORGANIZATION_FINANCIALS_HREF,
        icon: "financials",
        publisherLabel: "Organization",
        configurationOwner: "Financials",
        runtimeOwner: "Commercial and billing runtimes",
        consumers: ["Enrollment", "Billing", "Locations", "Processing"],
        inheritance: {
            kind: "value",
            path: ["organization", "location"],
            label: "Organization defaults inherit; Locations may override tuition cells",
        },
        publication: { mode: "immediate", status: "live_on_save", label: "Live after confirmed save" },
        override: { state: "available", label: "Location tuition overrides are supported" },
        health: {
            state: "not_assessed",
            label: "Not assessed",
            detail: "Financials health remains owned by rate, catalog, and policy surfaces.",
        },
        distributionMode: "inherit",
        ownedConfiguration: [
            "Tuition rates and cadence",
            "Fees, add-ons, and catalog",
            "Discount policies",
            "Accounting mappings",
        ],
    },
    {
        key: "access",
        label: "Access",
        description: "Organization roles, permissions, and assignments to operational contexts.",
        href: "/organization/access",
        icon: "access",
        publisherLabel: "Organization",
        configurationOwner: "Access",
        runtimeOwner: "Authorization",
        consumers: ["Locations", "Departments", "All operator runtimes"],
        inheritance: {
            kind: "availability",
            path: ["organization", "location"],
            label: "Roles are shared; assignments choose where they apply",
        },
        publication: { mode: "immediate", status: "live_on_save", label: "Live after confirmed save" },
        override: { state: "available", label: "Assignments vary by location or department" },
        health: {
            state: "not_assessed",
            label: "Not assessed",
            detail: "Access health remains owned by the Access domain.",
        },
        distributionMode: "assignment",
        ownedConfiguration: ["Roles and permissions", "Location assignments", "Department assignments"],
    },
    {
        key: "communications",
        label: "Communications",
        description: "Shared channels, templates, sender identity, and delivery rules.",
        href: "/settings/communications",
        icon: "communications",
        publisherLabel: "Organization",
        configurationOwner: "Communications",
        runtimeOwner: "Communications Runtime",
        consumers: ["Locations", "Business Processes", "Operators"],
        inheritance: {
            kind: "value",
            path: ["platform", "organization", "location"],
            label: "Organization values flow to Locations unless an override is allowed",
        },
        publication: { mode: "immediate", status: "live_on_save", label: "Live after confirmed save" },
        override: { state: "available", label: "Local differences are domain-controlled" },
        health: {
            state: "not_assessed",
            label: "Not assessed",
            detail: "Sender and delivery health remains owned by Communications.",
        },
        distributionMode: "inherit",
        ownedConfiguration: ["Channels and sender identity", "Templates", "Send rules"],
    },
    {
        key: "data-model",
        label: "Data Model",
        description: "Organization vocabulary shared by records, processes, and configured surfaces.",
        href: "/organization/data-model",
        icon: "data-model",
        publisherLabel: "Organization",
        configurationOwner: "Data Model",
        runtimeOwner: "Record and Entity Runtimes",
        consumers: ["Records", "Business Processes", "Surfaces"],
        inheritance: {
            kind: "value",
            path: ["platform", "organization"],
            label: "Platform definitions may be specialized by the organization",
        },
        publication: { mode: "immediate", status: "live_on_save", label: "Live after confirmed save" },
        override: { state: "not_allowed", label: "Shared organization vocabulary" },
        health: {
            state: "not_assessed",
            label: "Not assessed",
            detail: "Definition health remains owned by Data Model.",
        },
        distributionMode: "inherit",
        ownedConfiguration: ["Entities", "Fields", "Statuses", "Option sets and relationships"],
    },
    {
        key: "automation",
        label: "Automation",
        description: "Reusable workflows, triggers, and registered actions.",
        href: "/admin/workflows",
        icon: "automation",
        publisherLabel: "Organization",
        configurationOwner: "Automation",
        runtimeOwner: "Workflow Runtime",
        consumers: ["Business Processes", "Records", "Communications"],
        inheritance: {
            kind: "availability",
            path: ["platform", "organization", "location"],
            label: "Organization automation is enabled where it should run",
        },
        publication: { mode: "immediate", status: "live_on_save", label: "Live after confirmed save" },
        override: { state: "available", label: "Enablement and parameters may vary by context" },
        health: {
            state: "not_assessed",
            label: "Not assessed",
            detail: "Execution health remains owned by Automation.",
        },
        distributionMode: "assignment",
        ownedConfiguration: ["Workflow definitions", "Triggers", "Registered actions"],
    },
    {
        key: "business-processes",
        label: "Business Processes",
        description: "Reusable stages, Work Views, operating plans, outcomes, and process actions.",
        href: "/organization/processes",
        icon: "business-processes",
        publisherLabel: "Organization",
        configurationOwner: "Business Processes",
        runtimeOwner: "Business Process Runtime",
        consumers: ["Locations", "Workspaces", "Operational Records"],
        inheritance: {
            kind: "availability",
            path: ["platform", "organization", "location"],
            label: "Organization defines processes; operational contexts choose availability",
        },
        // Business Process configuration is no longer live-on-save. Every ordinary editor writes a
        // draft; the runtime projection moves only when someone publishes. Saying `live_on_save`
        // here would be the card telling operators the opposite of what the product now does.
        publication: {
            mode: "explicit",
            status: "publish_required",
            label: "Draft saved — live after publish",
        },
        override: { state: "available", label: "Availability may vary by operational context" },
        health: {
            state: "not_assessed",
            label: "Not assessed",
            detail: "Process readiness remains owned by Business Processes.",
        },
        distributionMode: "assignment",
        ownedConfiguration: ["Stages & Work Views", "Operating plans", "Outcomes & requirements"],
    },
    {
        key: "surfaces",
        label: "Surfaces",
        description: "Published presentation for queues, rows, cards, and Focus Panel.",
        href: "/organization/surfaces",
        icon: "surfaces",
        publisherLabel: "Organization",
        configurationOwner: "Surfaces",
        runtimeOwner: "Presentation Runtime",
        consumers: ["Workspaces", "Queues", "Focus Panel"],
        inheritance: {
            kind: "value",
            path: ["platform", "organization"],
            label: "Published organization surfaces drive presentation",
        },
        publication: { mode: "explicit", status: "publish_required", label: "Publish required" },
        override: { state: "not_allowed", label: "Assignments select a published surface" },
        health: {
            state: "not_assessed",
            label: "Not assessed",
            detail: "Surface validity remains owned by Experience Builder.",
        },
        distributionMode: "inherit",
        ownedConfiguration: ["Queue and row presentation", "Cards and Focus Panel", "Published surfaces"],
    },
    {
        key: "operational-intelligence",
        label: "Operational Intelligence",
        description: "What the organization measures — goals, health, lifecycle, and history.",
        href: "/organization/operational-intelligence",
        icon: "intelligence",
        publisherLabel: "Organization",
        configurationOwner: "Operational Intelligence",
        runtimeOwner: "Metrics Runtime",
        consumers: ["Workspaces", "Business Processes", "Analytics"],
        inheritance: {
            kind: "value",
            path: ["platform", "organization", "location"],
            label: "Definitions are shared; targets may vary by context",
        },
        publication: { mode: "immediate", status: "live_on_save", label: "Live after confirmed save" },
        override: { state: "available", label: "Targets may vary by operational context" },
        health: {
            state: "not_assessed",
            label: "Not assessed",
            detail: "Calculation health remains owned by Operational Intelligence.",
        },
        distributionMode: "inherit",
        ownedConfiguration: ["Measurements", "Goals", "Health", "Lifecycle", "History"],
    },
] as const;

/**
 * Calculation library — advanced reusable definitions inside Operational Intelligence.
 * Not an Organization landing peer; `/organization/calculations` redirects into OI.
 */
export const ORGANIZATION_CALCULATIONS_CONFIGURATION_DOMAIN: OrganizationConfigurationDomain = {
    key: "organization-calculations",
    label: "Calculation library",
    description: "Advanced reusable definitions used by measurements.",
    href: "/organization/operational-intelligence?view=calculations",
    icon: "intelligence",
    publisherLabel: "Organization",
    configurationOwner: "Operational Intelligence",
    runtimeOwner: "Calculations runtime",
    consumers: ["Operational Intelligence measurements"],
    inheritance: {
        kind: "value",
        path: ["platform", "organization", "location"],
        label: "Organization owns reusable definitions",
    },
    publication: { mode: "explicit", status: "publish_required", label: "Publish required before reuse" },
    override: { state: "not_allowed", label: "Published versions cannot be edited" },
    health: {
        state: "not_assessed",
        label: "Not assessed",
        detail: "Managed from Operational Intelligence → Advanced.",
    },
    distributionMode: "none",
    ownedConfiguration: ["Reusable definitions", "Published versions", "Where used"],
};

/**
 * Programs remains a configuration domain for runtime/publication lookups and
 * `/organization/programs` compatibility — it is not an Organization landing peer.
 * Peer entry is Programs & Locations.
 */
export const PROGRAMS_CONFIGURATION_DOMAIN: OrganizationConfigurationDomain = {
    key: "programs",
    internalRuntimeKey: "commercial",
    label: "Programs",
    description: "Reusable service catalog published by the organization for every business vertical.",
    href: CANONICAL_ORGANIZATION_PROGRAMS_HREF,
    icon: "programs",
    publisherLabel: "Organization",
    configurationOwner: "Programs",
    runtimeOwner: "Programs and Commercial Runtime",
    consumers: ["Locations", "Enrollment", "Commercial", "Billing"],
    inheritance: {
        kind: "availability",
        path: ["organization", "location"],
        label: "Organization publishes; Locations choose what they offer",
    },
    publication: { mode: "explicit", status: "publish_required", label: "Publish required" },
    override: { state: "available", label: "Locations control availability, not Program identity" },
    health: {
        state: "not_assessed",
        label: "Not assessed",
        detail: "Programs will report health from its authoritative catalog.",
    },
    distributionMode: "assignment",
    ownedConfiguration: [
        "Catalog & categories",
        "Eligibility & licensing",
        "Required resource types",
        "Delivery Options and Location assignment",
    ],
};

/**
 * Locations collection remains available for lookups and Continuity — not a landing peer.
 * Peer entry is Programs & Locations.
 */
export const LOCATIONS_CONFIGURATION_DOMAIN: OrganizationConfigurationDomain = {
    key: "locations",
    label: "Locations",
    description: "Consumers of organization configuration and owners of local delivery resources.",
    href: ORGANIZATION_LOCATIONS_PATH,
    icon: "locations",
    publisherLabel: "Organization",
    configurationOwner: "Locations",
    runtimeOwner: "Location and operational runtimes",
    consumers: ["Location Runtime", "Operational Runtime"],
    inheritance: {
        kind: "none",
        path: ["organization", "location"],
        label: "Locations own local delivery configuration",
    },
    publication: { mode: "immediate", status: "live_on_save", label: "Live after confirmed save" },
    override: { state: "not_allowed", label: "Local objects are authoritative" },
    health: {
        state: "not_assessed",
        label: "Not assessed",
        detail: "Location readiness remains authoritative in Locations.",
    },
    distributionMode: "none",
    ownedConfiguration: ["Sites", "Programs offered", "Rooms & delivery resources", "Local schedules"],
};

/** Peer domains shown on `/organization` — Programs and Locations are not separate peers. */
export function organizationConfigurationDomains(): readonly OrganizationConfigurationDomain[] {
    return CONFIGURATION_DOMAINS;
}

export function organizationConfigurationDomain(
    domainKey: string,
): OrganizationConfigurationDomain | null {
    if (
        domainKey === PROGRAMS_CONFIGURATION_DOMAIN.key
        || domainKey === PROGRAMS_CONFIGURATION_DOMAIN.internalRuntimeKey
    ) {
        return PROGRAMS_CONFIGURATION_DOMAIN;
    }
    if (domainKey === LOCATIONS_CONFIGURATION_DOMAIN.key) {
        return LOCATIONS_CONFIGURATION_DOMAIN;
    }
    if (domainKey === ORGANIZATION_CALCULATIONS_CONFIGURATION_DOMAIN.key) {
        return ORGANIZATION_CALCULATIONS_CONFIGURATION_DOMAIN;
    }
    return (
        CONFIGURATION_DOMAINS.find(
            (domain) => domain.key === domainKey || domain.internalRuntimeKey === domainKey,
        ) ?? null
    );
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
