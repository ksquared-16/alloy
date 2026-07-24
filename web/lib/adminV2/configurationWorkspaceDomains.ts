/**
 * Configuration Workspace V1 — operator ownership domains.
 * Maps settings surfaces to Data Model / Operations / Experience / Organization.
 *
 * Configuration Runtime (Phase 0/1+): copy and IA only — see
 * `docs/system/configuration-runtime-design-alignment.md`.
 */

import {
    adminSettingsSubpathHref,
    CANONICAL_ORGANIZATION_BASE,
    CANONICAL_ORGANIZATION_DATA_MODEL_HREF,
    CANONICAL_SETTINGS_BASE,
} from "@/lib/admin/canonicalAdminRoutes";
import { dataModelSectionHref } from "@/lib/dataModel/dataModelChapterRoutes";

const settings = adminSettingsSubpathHref;

/** Settings routes that must not exist — queue/Focus Panel presentation lives in Layouts. */
export const CONFIGURATION_RUNTIME_FORBIDDEN_SETTINGS_ROUTES = [
    `${CANONICAL_SETTINGS_BASE}/queue-builder`,
    `${CANONICAL_SETTINGS_BASE}/focus-panel-builder`,
] as const;

/** Doctrine strings — drift-prevention tests assert these remain in hub/nav config. */
export const CONFIGURATION_RUNTIME_OWNERSHIP_COPY = {
    businessProcessesSpine:
        "Stages, Work Views, operating plan, process actions, and process health.",
    layoutsPresentation:
        "Queue rows, Focus Panel presentation, and where actions appear on each surface.",
    fieldsCanonical:
        "Canonical data model — entities, fields, relationships, and computed signals.",
    statusesCanonical:
        "Status vocabulary and transitions — owned by the Statuses sprint; stage assignment lives in Business Processes.",
    perspectivesMetadata:
        "Perspectives are configured as Business Process stage metadata over queue lanes — not a separate builder.",
} as const;

export type ConfigurationWorkspaceDomainId =
    | "organization"
    | "data_model"
    | "operations"
    | "experience"
    | "commercial";

export type ConfigurationWorkspaceNavItem = {
    href: string;
    label: string;
    description?: string;
    emphasis?: boolean;
    /** Hidden from primary nav — advanced/diagnostic only. */
    advanced?: boolean;
};

export type ConfigurationWorkspaceDomain = {
    id: ConfigurationWorkspaceDomainId;
    label: string;
    description: string;
    items: ConfigurationWorkspaceNavItem[];
};

export const CONFIGURATION_WORKSPACE_HUB_TITLE = "Configuration";
export const CONFIGURATION_WORKSPACE_HUB_SUBTITLE =
    "Fields define data. Processes define behavior. Surfaces define presentation. Access controls who can change what.";

/** Ordered setup journey — guidance only, not a wizard. */
export const CONFIGURATION_JOURNEY_STEPS = [
    {
        step: 1,
        label: "Organization",
        summary: "Shared configuration, locations, access, and communications.",
        href: settings("organization"),
    },
    {
        step: 2,
        label: "Data Model",
        summary: "Fields and statuses define operator vocabulary.",
        href: CANONICAL_ORGANIZATION_DATA_MODEL_HREF,
    },
    {
        step: 3,
        label: "Operations",
        summary: "Processes: stages, Work Views, operating plan, and process actions.",
        href: settings("processes"),
    },
    {
        step: 4,
        label: "Experience",
        summary: "Layouts: queue rows, Focus Panel presentation, and surface placement.",
        href: settings("surfaces"),
    },
] as const;

export const CONFIGURATION_WORKSPACE_DOMAINS: readonly ConfigurationWorkspaceDomain[] = [
    {
        id: "organization",
        label: "Organization",
        description: "Who uses the system and where.",
        items: [
            {
                href: "/organization/programs-locations",
                label: "Programs & Locations",
                description: "Reusable services and the places that deliver them.",
            },
            {
                href: settings("users-roles"),
                label: "Access",
                description: "Users, roles, permission groups, and location or department scope.",
            },
            {
                href: settings("communications"),
                label: "Communications",
                description: "Email and messaging setup.",
            },
            {
                href: settings("departments"),
                label: "Departments",
                description: "Teams and organizational structure.",
                advanced: true,
            },
        ],
    },
    {
        id: "data_model",
        label: "Data Model",
        description: "Entities, fields, relationships, and runtime signals.",
        items: [
            {
                href: CANONICAL_ORGANIZATION_DATA_MODEL_HREF,
                label: "Data Model",
                description: CONFIGURATION_RUNTIME_OWNERSHIP_COPY.fieldsCanonical,
                emphasis: true,
            },
            {
                href: dataModelSectionHref("statuses"),
                label: "Statuses",
                description: CONFIGURATION_RUNTIME_OWNERSHIP_COPY.statusesCanonical,
            },
            {
                href: dataModelSectionHref("option-sets"),
                label: "Option sets",
                description: "Static and reference-backed dropdown vocabulary for fields.",
            },
            {
                href: dataModelSectionHref("relationships"),
                label: "Relationships",
                description: "Person and family relationship types.",
            },
            {
                href: dataModelSectionHref("entities"),
                label: "Record labels",
                description: "Singular names for record types.",
                advanced: true,
            },
        ],
    },
    {
        id: "operations",
        label: "Operations",
        description: "Processes owns when operators use actions.",
        items: [
            {
                href: settings("processes"),
                label: "Processes",
                description: CONFIGURATION_RUNTIME_OWNERSHIP_COPY.businessProcessesSpine,
                emphasis: true,
            },
            {
                href: "/admin/workflows",
                label: "Automation",
                description: "Workflow triggers and automated changes.",
            },
            {
                href: settings("placement-priority"),
                label: "Waitlist ranking",
                description: "Priority factors for waitlisted children.",
                advanced: true,
            },
            {
                href: settings("tours/availability"),
                label: "Tour availability",
                description: "Bookable tour windows per location.",
                advanced: true,
            },
        ],
    },
    {
        id: "experience",
        label: "Experience",
        description: "Experience Builder owns queue and Focus Panel presentation.",
        items: [
            {
                href: settings("surfaces"),
                label: "Surfaces",
                description: CONFIGURATION_RUNTIME_OWNERSHIP_COPY.layoutsPresentation,
            },
            {
                href: settings("analytics"),
                label: "Operational Intelligence",
                description: "Performance packs, targets, and where indicators appear.",
            },
            {
                href: settings("documents/document-fields"),
                label: "Document fields",
                description: "Fields on enrollment documents.",
                advanced: true,
            },
            {
                href: settings("config-proposals"),
                label: "Configuration proposals",
                description: "Review proposed layout changes.",
                advanced: true,
            },
        ],
    },
    {
        id: "commercial",
        label: "Business",
        description: "Business configuration modules.",
        items: [
            {
                href: "/organization/financials",
                label: "Financials",
                description: "Tuition, fees, catalog, policies, accounting, and commercial simulation.",
            },
        ],
    },
] as const;

/** Advanced / diagnostic surfaces — not primary configuration paths. */
export const CONFIGURATION_WORKSPACE_ADVANCED_ITEMS: readonly ConfigurationWorkspaceNavItem[] = [
    {
        href: settings("attention-sla-rules"),
        label: "Attention defaults (org-wide)",
        description: "Bucket labels and SLA thresholds — stage rules live in Processes.",
    },
    {
        href: settings("work-units"),
        label: "Work units (runtime)",
        description: "Queue lanes derived from Processes — diagnostic only.",
    },
    {
        href: settings("status-transition-rules"),
        label: "Status transition guardrails",
        description: "Read-only pre-transition validation rules — not outcome or workflow automation.",
    },
    {
        href: settings("field-sections"),
        label: "Field grouping",
        description: "Bulk catalog section names.",
    },
];

export function configurationWorkspaceDomainForPath(pathname: string): ConfigurationWorkspaceDomainId | null {
    const normalized = pathname.replace(/\/$/, "") || CANONICAL_SETTINGS_BASE;
    if (normalized === CANONICAL_ORGANIZATION_BASE) return "organization";
    const canonical =
        normalized === "/admin" || normalized === "/admin/settings"
            ? CANONICAL_SETTINGS_BASE
            : normalized.startsWith("/admin/settings/")
              ? `${CANONICAL_SETTINGS_BASE}${normalized.slice("/admin/settings".length)}`
              : normalized;
    // Surfaces rename — legacy `/settings/layouts` still resolves to the Surfaces
    // (Experience) domain so active-state highlighting survives the redirect hop.
    const path =
        canonical === `${CANONICAL_SETTINGS_BASE}/layouts` || canonical.startsWith(`${CANONICAL_SETTINGS_BASE}/layouts/`)
            ? `${CANONICAL_SETTINGS_BASE}/surfaces${canonical.slice(`${CANONICAL_SETTINGS_BASE}/layouts`.length)}`
            : canonical;

    for (const domain of CONFIGURATION_WORKSPACE_DOMAINS) {
        for (const item of domain.items) {
            const href = item.href.replace(/\/$/, "");
            if (path === href || path.startsWith(`${href}/`)) return domain.id;
        }
    }
    for (const item of CONFIGURATION_WORKSPACE_ADVANCED_ITEMS) {
        const href = item.href.replace(/\/$/, "");
        if (path === href || path.startsWith(`${href}/`)) return "operations";
    }
    if (path === CANONICAL_SETTINGS_BASE) return null;
    return null;
}
