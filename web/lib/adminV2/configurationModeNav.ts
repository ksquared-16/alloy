/**
 * Configuration Mode — left app rail navigation when `/settings/*` is active.
 * @see docs/sprints/06_2026/configuration_runtime_core_interaction_doctrine.md
 */
import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";

const settings = adminSettingsSubpathHref;

export type ConfigurationModeNavIcon =
    | "processes"
    | "layouts"
    | "fields"
    | "statuses"
    | "actions"
    | "automation"
    | "analytics"
    | "integrations"
    | "security";

export type ConfigurationModeNavItem = {
    href: string;
    label: string;
    description: string;
    icon: ConfigurationModeNavIcon;
    testId: string;
};

/** Primary Configuration Mode surfaces — shown in left app rail and `/settings` hub. */
export const CONFIGURATION_MODE_NAV_ITEMS: readonly ConfigurationModeNavItem[] = [
    {
        href: settings("processes"),
        label: "Processes",
        description: "Stages, Work Views, operating plan, actions, and process health.",
        icon: "processes",
        testId: "config-mode-nav-processes",
    },
    {
        href: settings("layouts"),
        label: "Layouts",
        description: "Queue rows, Focus Panel presentation, and layout assignments.",
        icon: "layouts",
        testId: "config-mode-nav-layouts",
    },
    {
        href: settings("fields"),
        label: "Fields",
        description: "Canonical field catalog, formats, and validation.",
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
    {
        href: settings("actions"),
        label: "Actions",
        description: "Action definitions and where they appear in the workspace.",
        icon: "actions",
        testId: "config-mode-nav-actions",
    },
    {
        href: "/admin/workflows",
        label: "Automation",
        description: "Workflow triggers and platform-triggered behavior.",
        icon: "automation",
        testId: "config-mode-nav-automation",
    },
    {
        href: settings("analytics"),
        label: "Operational Intelligence",
        description: "Metrics, targets, and where indicators appear.",
        icon: "analytics",
        testId: "config-mode-nav-analytics",
    },
    {
        href: settings("communications"),
        label: "Integrations",
        description: "Email, messaging, and external integrations.",
        icon: "integrations",
        testId: "config-mode-nav-integrations",
    },
    {
        href: settings("users-roles"),
        label: "Security / Roles",
        description: "Staff access, roles, and security settings.",
        icon: "security",
        testId: "config-mode-nav-security",
    },
] as const;

export const CONFIGURATION_MODE_DEFAULT_SURFACE = settings("processes");

export const CONFIGURATION_MODE_HUB_TITLE = "Configuration";
export const CONFIGURATION_MODE_HUB_SUBTITLE =
    "Configure how Alloy runs your operation — processes, presentation, data model, and access.";

export function configurationModeNavItemActive(href: string, path: string): boolean {
    const h = href.replace(/\/$/, "");
    const p = path.replace(/\/$/, "");
    if (h === "/admin/workflows") return p === h || p.startsWith(`${h}/`);
    if (h === settings("processes")) return p === h || p.startsWith(`${h}/`) || p.startsWith("/settings/business-processes");
    return p === h || p.startsWith(`${h}/`);
}
