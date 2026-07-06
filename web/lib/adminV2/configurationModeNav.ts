/**
 * Configuration Mode — left app rail navigation when `/settings/*` is active.
 * Settings Home and sidebar share this IA (Organization · Data Model · Operations · Business).
 * @see docs/system/configuration-ownership-doctrine.md
 */
import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";

const settings = adminSettingsSubpathHref;

export type ConfigurationPlatformSectionId = "organization" | "data_model" | "operations" | "business";

export type ConfigurationModeNavIcon =
    | "processes"
    | "layouts"
    | "fields"
    | "statuses"
    | "automation"
    | "analytics"
    | "integrations"
    | "security"
    | "locations"
    | "communications"
    | "financials"
    | "commercial"
    | "entities";

export type ConfigurationModeNavItem = {
    href: string;
    label: string;
    description: string;
    icon: ConfigurationModeNavIcon;
    testId: string;
    /** Hidden from primary operator navigation (route may still exist). */
    internal?: boolean;
};

export type ConfigurationModeNavGroup = {
    id: ConfigurationPlatformSectionId;
    label: string;
    description: string;
    items: readonly ConfigurationModeNavItem[];
};

/** Primary operator Configuration IA — Actions definitions are internal catalog only. */
export const CONFIGURATION_MODE_NAV_GROUPS: readonly ConfigurationModeNavGroup[] = [
    {
        id: "organization",
        label: "Organization",
        description: "Manage the foundation of your organization.",
        items: [
            {
                href: settings("locations"),
                label: "Locations",
                description: "Sites, rooms, programs, and schedules.",
                icon: "locations",
                testId: "config-mode-nav-locations",
            },
            {
                href: settings("users-roles"),
                label: "Access",
                description: "Users, roles, permission groups, and scopes.",
                icon: "security",
                testId: "config-mode-nav-access",
            },
            {
                href: settings("communications"),
                label: "Communications",
                description: "Channels, templates, send rules, and messaging.",
                icon: "communications",
                testId: "config-mode-nav-communications",
            },
        ],
    },
    {
        id: "data_model",
        label: "Data Model",
        description: "Define the language Alloy uses to operate.",
        items: [
            {
                href: settings("entities"),
                label: "Entities",
                description: "Configure entity names, labels, and terminology.",
                icon: "entities",
                testId: "config-mode-nav-entities",
            },
            {
                href: settings("fields"),
                label: "Fields",
                description: "Manage field definitions, types, validation, and rules.",
                icon: "fields",
                testId: "config-mode-nav-fields",
            },
            {
                href: settings("statuses"),
                label: "Statuses",
                description: "Status vocabulary and lifecycle presentation.",
                icon: "statuses",
                testId: "config-mode-nav-statuses",
            },
            {
                href: settings("calculations"),
                label: "Operational Calculations",
                description: "Metrics, formulas, targets, and derived values.",
                icon: "analytics",
                testId: "config-mode-nav-analytics",
            },
        ],
    },
    {
        id: "operations",
        label: "Operations",
        description: "Configure how work gets done.",
        items: [
            {
                href: settings("processes"),
                label: "Processes",
                description: "Stages, Work Views, and operating plans.",
                icon: "processes",
                testId: "config-mode-nav-processes",
            },
            {
                href: settings("surfaces"),
                label: "Surfaces",
                description: "Design Surfaces for queues, rows, Focus Panel, and cards.",
                icon: "layouts",
                testId: "config-mode-nav-surfaces",
            },
            {
                href: "/admin/workflows",
                label: "Automation",
                description: "Workflow triggers and platform-triggered behavior.",
                icon: "automation",
                testId: "config-mode-nav-automation",
            },
        ],
    },
    {
        id: "business",
        label: "Business",
        description: "Configure business modules and rules.",
        items: [
            {
                href: settings("commercial"),
                label: "Commercial",
                description: "Programs, tuition, pricing, catalog, and overrides.",
                icon: "commercial",
                testId: "config-mode-nav-commercial",
            },
        ],
    },
] as const;

/** Internal / developer catalog — not shown in primary operator nav. */
export const CONFIGURATION_MODE_INTERNAL_NAV_ITEMS: readonly ConfigurationModeNavItem[] = [
    {
        href: settings("actions"),
        label: "Action definitions",
        description: "Platform action definition catalog (developer metadata).",
        icon: "integrations",
        testId: "config-mode-nav-action-definitions",
        internal: true,
    },
] as const;

/** Flat list for hub and tests. */
export const CONFIGURATION_MODE_NAV_ITEMS: readonly ConfigurationModeNavItem[] =
    CONFIGURATION_MODE_NAV_GROUPS.flatMap((g) => g.items);

export const CONFIGURATION_MODE_DEFAULT_SURFACE = settings("processes");

export const CONFIGURATION_MODE_HUB_TITLE = "Platform Configuration";
export const CONFIGURATION_MODE_HUB_SUBTITLE =
    "Configure Alloy across your organization, data model, operational workflows, and business modules.";

export function configurationModeNavItemActive(href: string, path: string): boolean {
    const h = href.replace(/\/$/, "");
    const p = path.replace(/\/$/, "");
    if (h === "/admin/workflows") return p === h || p.startsWith(`${h}/`);
    if (h === settings("processes")) return p === h || p.startsWith(`${h}/`) || p.startsWith("/settings/business-processes");
    if (h === settings("surfaces")) return p === h || p.startsWith(`${h}/`) || p.startsWith("/settings/layouts");
    if (h === settings("entities")) {
        return (
            p === h
            || p.startsWith(`${h}/`)
            || p === settings("entity-labels")
            || p.startsWith(`${settings("entity-labels")}/`)
            || p === settings("label-entities")
            || p.startsWith(`${settings("label-entities")}/`)
        );
    }
    return p === h || p.startsWith(`${h}/`);
}
