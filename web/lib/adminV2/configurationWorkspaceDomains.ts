/**
 * Configuration Workspace V1 — operator ownership domains.
 * Maps settings surfaces to Data Model / Operations / Experience / Organization.
 */

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
    "Configure what data exists, how work moves, and how staff experience the workspace — without runtime internals.";

/** Ordered setup journey — guidance only, not a wizard. */
export const CONFIGURATION_JOURNEY_STEPS = [
    {
        step: 1,
        label: "Organization",
        summary: "Locations, access, and communications.",
        href: "/admin/settings/locations",
    },
    {
        step: 2,
        label: "Data Model",
        summary: "Fields and option lists define what you track.",
        href: "/admin/settings/fields",
    },
    {
        step: 3,
        label: "Operations",
        summary: "Business Processes define how work moves and when attention is needed.",
        href: "/admin/settings/business-processes",
    },
    {
        step: 4,
        label: "Experience",
        summary: "Layouts and Forms control how information is displayed and collected.",
        href: "/admin/settings/layouts",
    },
] as const;

export const CONFIGURATION_WORKSPACE_DOMAINS: readonly ConfigurationWorkspaceDomain[] = [
    {
        id: "organization",
        label: "Organization",
        description: "Who uses the system and where.",
        items: [
            {
                href: "/admin/settings/locations",
                label: "Locations",
                description: "Sites, rooms, programs, and schedules per location.",
            },
            {
                href: "/admin/settings/users-roles",
                label: "Users & access",
                description: "Staff, roles, and data access.",
            },
            {
                href: "/admin/settings/communications",
                label: "Communications",
                description: "Email and messaging setup.",
            },
            {
                href: "/admin/settings/departments",
                label: "Departments",
                description: "Teams and organizational structure.",
                advanced: true,
            },
        ],
    },
    {
        id: "data_model",
        label: "Data Model",
        description: "What data exists.",
        items: [
            {
                href: "/admin/settings/fields",
                label: "Fields",
                description: "Field labels, visibility, and help text.",
            },
            {
                href: "/admin/settings/option-sets",
                label: "Option lists",
                description: "Dropdown values for fields.",
            },
            {
                href: "/admin/settings/relationships",
                label: "Relationships",
                description: "Person and family relationship types.",
            },
            {
                href: "/admin/settings/entity-labels",
                label: "Record labels",
                description: "Singular names for record types.",
                advanced: true,
            },
        ],
    },
    {
        id: "operations",
        label: "Operations",
        description: "How work moves.",
        items: [
            {
                href: "/admin/settings/business-processes",
                label: "Business Processes",
                description: "Stages, membership, requirements, expected work, attention, and actions.",
                emphasis: true,
            },
            {
                href: "/admin/settings/statuses",
                label: "Statuses",
                description: "Status labels and order.",
            },
            {
                href: "/admin/settings/actions",
                label: "Action buttons",
                description: "Action definitions and placements.",
            },
            {
                href: "/admin/workflows",
                label: "Automations",
                description: "Workflow triggers and automated changes.",
            },
            {
                href: "/admin/settings/placement-priority",
                label: "Waitlist ranking",
                description: "Priority factors for waitlisted children.",
                advanced: true,
            },
            {
                href: "/admin/settings/tours/availability",
                label: "Tour availability",
                description: "Bookable tour windows per location.",
                advanced: true,
            },
        ],
    },
    {
        id: "experience",
        label: "Experience",
        description: "How information is collected and displayed.",
        items: [
            {
                href: "/admin/settings/layouts",
                label: "Layouts",
                description: "Drawer sections, field placement, and queue rows.",
            },
            {
                href: "/admin/forms",
                label: "Forms & packets",
                description: "Intake forms and enrollment packets.",
            },
            {
                href: "/admin/settings/kpis",
                label: "Workspace metrics",
                description: "Dashboard KPI tiles.",
            },
            {
                href: "/admin/settings/documents/document-fields",
                label: "Document fields",
                description: "Fields on enrollment documents.",
                advanced: true,
            },
            {
                href: "/admin/settings/config-proposals",
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
        href: "/admin/settings/attention-sla-rules",
        label: "Attention defaults (org-wide)",
        description: "Bucket labels and SLA thresholds — stage rules live in Business Processes.",
    },
    {
        href: "/admin/settings/work-units",
        label: "Work units (runtime)",
        description: "Queue lanes derived from Business Processes — diagnostic only.",
    },
    {
        href: "/admin/settings/status-transition-rules",
        label: "Workflow automation rules",
        description: "Read-only reference for status side effects.",
    },
    {
        href: "/admin/settings/field-sections",
        label: "Field grouping",
        description: "Bulk catalog section names.",
    },
];

export function configurationWorkspaceDomainForPath(pathname: string): ConfigurationWorkspaceDomainId | null {
    const path = pathname.replace(/\/$/, "") || "/admin";
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
    if (path === "/admin" || path === "/admin/settings") return null;
    return null;
}
