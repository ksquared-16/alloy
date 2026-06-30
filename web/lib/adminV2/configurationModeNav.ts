/**
 * Configuration Mode — left app rail navigation when `/settings/*` is active.
 * @see docs/system/configuration-ownership-doctrine.md
 */
import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";

const settings = adminSettingsSubpathHref;

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
    | "financials";

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
    label?: string;
    items: readonly ConfigurationModeNavItem[];
};

/** Primary operator Configuration IA — Actions definitions are internal catalog only. */
export const CONFIGURATION_MODE_NAV_GROUPS: readonly ConfigurationModeNavGroup[] = [
    {
        label: "Organization",
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
                description: "Users, roles, permission groups, and location or department scope.",
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
        items: [
            {
                href: settings("fields"),
                label: "Fields",
                description: "What data exists — labels, types, formats, and validation.",
                icon: "fields",
                testId: "config-mode-nav-fields",
            },
            {
                href: settings("statuses"),
                label: "Statuses",
                description: "Status vocabulary and lifecycle presentation metadata.",
                icon: "statuses",
                testId: "config-mode-nav-statuses",
            },
        ],
    },
    {
        items: [
            {
                href: settings("processes"),
                label: "Processes",
                description: "When operators use actions — stages, Work Views, and operating plan.",
                icon: "processes",
                testId: "config-mode-nav-processes",
            },
            {
                href: settings("surfaces"),
                label: "Surfaces",
                description: "Where operators see actions — Design Surfaces for queue rows, Focus Panel, and cards.",
                icon: "layouts",
                testId: "config-mode-nav-surfaces",
            },
        ],
    },
    {
        label: "Business Operations",
        items: [
            {
                href: settings("financials"),
                label: "Financials",
                description: "Rate plans, charge preview, and GL configuration. Read-only in V1.",
                icon: "financials",
                testId: "config-mode-nav-financials",
            },
            {
                href: settings("analytics"),
                label: "Operational Calculations",
                description: "Metrics, targets, sources, and snapshots.",
                icon: "analytics",
                testId: "config-mode-nav-analytics",
            },
        ],
    },
    {
        items: [
            {
                href: "/admin/workflows",
                label: "Automation",
                description: "Workflow triggers and platform-triggered behavior.",
                icon: "automation",
                testId: "config-mode-nav-automation",
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

/** Flat list for hub tiles and tests. */
export const CONFIGURATION_MODE_NAV_ITEMS: readonly ConfigurationModeNavItem[] =
    CONFIGURATION_MODE_NAV_GROUPS.flatMap((g) => g.items);

export const CONFIGURATION_MODE_DEFAULT_SURFACE = settings("processes");

export const CONFIGURATION_MODE_HUB_TITLE = "Settings";
export const CONFIGURATION_MODE_HUB_SUBTITLE = "Configure Alloy by area.";

export function configurationModeNavItemActive(href: string, path: string): boolean {
    const h = href.replace(/\/$/, "");
    const p = path.replace(/\/$/, "");
    if (h === "/admin/workflows") return p === h || p.startsWith(`${h}/`);
    if (h === settings("processes")) return p === h || p.startsWith(`${h}/`) || p.startsWith("/settings/business-processes");
    if (h === settings("surfaces")) return p === h || p.startsWith(`${h}/`) || p.startsWith("/settings/layouts");
    return p === h || p.startsWith(`${h}/`);
}
