/**
 * Configuration Workspace V1 — operator ownership domains.
 * Maps settings surfaces to Data Model / Operations / Experience / Organization.
 *
 * Configuration Runtime (Phase 0/1+): copy and IA only — see
 * `docs/system/configuration-runtime-design-alignment.md`.
 */

import {
    adminSettingsSubpathHref,
    CANONICAL_SETTINGS_BASE,
} from "@/lib/admin/canonicalAdminRoutes";

const settings = adminSettingsSubpathHref;

/** Settings routes that must not exist — queue/Focus Panel presentation lives in Layouts. */
export const CONFIGURATION_RUNTIME_FORBIDDEN_SETTINGS_ROUTES = [
    `${CANONICAL_SETTINGS_BASE}/queue-builder`,
    `${CANONICAL_SETTINGS_BASE}/focus-panel-builder`,
] as const;

/** Doctrine strings — drift-prevention tests assert these remain in hub/nav config. */
export const CONFIGURATION_RUNTIME_OWNERSHIP_COPY = {
    businessProcessesSpine:
        "Operational spine: stages, perspectives, missions, required info, attention, and process actions.",
    layoutsPresentation:
        "Experience Builder: queue rows, Focus Panel drawer layouts, and field placement on surfaces.",
    fieldsCanonical:
        "Canonical field catalog and formats — owned by the Fields & Field Formats sprint.",
    statusesCanonical:
        "Status vocabulary and transitions — owned by the Statuses sprint; stage assignment lives in Business Processes.",
    perspectivesMetadata:
        "Perspectives are configured as Business Process stage metadata over queue lanes — not a separate builder.",
} as const;

export type ConfigurationWorkspaceDomainId =
    | "organization"
    | "data_model"
    | "operations"
    | "experience";

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
    "Business Processes is the operational spine. Layouts (Experience Builder) owns presentation. Fields and Statuses are canonical catalogs — configure them there, then assign and compose in processes and layouts.";

/** Ordered setup journey — guidance only, not a wizard. */
export const CONFIGURATION_JOURNEY_STEPS = [
    {
        step: 1,
        label: "Organization",
        summary: "Locations, access, and communications.",
        href: settings("locations"),
    },
    {
        step: 2,
        label: "Data Model",
        summary: "Fields & Field Formats (sprint) and option sets define what you track.",
        href: settings("fields"),
    },
    {
        step: 3,
        label: "Operations",
        summary:
            "Business Processes: stages, perspectives, missions, required info, attention, and process actions.",
        href: settings("business-processes"),
    },
    {
        step: 4,
        label: "Experience",
        summary: "Layouts (Experience Builder): queue rows, Focus Panel presentation, and forms.",
        href: settings("layouts"),
    },
] as const;

export const CONFIGURATION_WORKSPACE_DOMAINS: readonly ConfigurationWorkspaceDomain[] = [
    {
        id: "organization",
        label: "Organization",
        description: "Who uses the system and where.",
        items: [
            {
                href: settings("locations"),
                label: "Locations",
                description: "Sites, rooms, programs, and schedules per location.",
            },
            {
                href: settings("users-roles"),
                label: "Users & access",
                description: "Staff, roles, and data access.",
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
        description: "Canonical field catalog and formats (Fields sprint).",
        items: [
            {
                href: settings("fields"),
                label: "Fields",
                description: CONFIGURATION_RUNTIME_OWNERSHIP_COPY.fieldsCanonical,
            },
            {
                href: settings("option-sets"),
                label: "Option sets",
                description: "Static and reference-backed dropdown vocabulary for fields.",
            },
            {
                href: settings("relationships"),
                label: "Relationships",
                description: "Person and family relationship types.",
            },
            {
                href: settings("entity-labels"),
                label: "Record labels",
                description: "Singular names for record types.",
                advanced: true,
            },
        ],
    },
    {
        id: "operations",
        label: "Operations",
        description: "Business Processes is the operational spine.",
        items: [
            {
                href: settings("business-processes"),
                label: "Business Processes",
                description: CONFIGURATION_RUNTIME_OWNERSHIP_COPY.businessProcessesSpine,
                emphasis: true,
            },
            {
                href: settings("statuses"),
                label: "Statuses",
                description: CONFIGURATION_RUNTIME_OWNERSHIP_COPY.statusesCanonical,
            },
            {
                href: settings("actions"),
                label: "Action buttons",
                description: "Action definitions and placements.",
            },
            {
                href: "/admin/workflows",
                label: "Automations",
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
                href: settings("layouts"),
                label: "Layouts",
                description: CONFIGURATION_RUNTIME_OWNERSHIP_COPY.layoutsPresentation,
            },
            {
                href: "/admin/forms",
                label: "Forms & packets",
                description: "Intake forms and enrollment packets.",
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
] as const;

/** Advanced / diagnostic surfaces — not primary configuration paths. */
export const CONFIGURATION_WORKSPACE_ADVANCED_ITEMS: readonly ConfigurationWorkspaceNavItem[] = [
    {
        href: settings("attention-sla-rules"),
        label: "Attention defaults (org-wide)",
        description: "Bucket labels and SLA thresholds — stage rules live in Business Processes.",
    },
    {
        href: settings("work-units"),
        label: "Work units (runtime)",
        description: "Queue lanes derived from Business Processes — diagnostic only.",
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
    const path =
        normalized === "/admin" || normalized === "/admin/settings"
            ? CANONICAL_SETTINGS_BASE
            : normalized.startsWith("/admin/settings/")
              ? `${CANONICAL_SETTINGS_BASE}${normalized.slice("/admin/settings".length)}`
              : normalized;

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
