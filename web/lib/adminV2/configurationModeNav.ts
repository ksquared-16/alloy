/**
 * Configuration Mode — left app rail navigation when `/settings/*` is active.
 * Settings Home and sidebar share this IA (Organization · Data Model · Operations · Business).
 * @see docs/system/configuration-ownership-doctrine.md
 */
import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";
import { dataModelSectionHref } from "@/lib/dataModel/dataModelChapterRoutes";

const settings = adminSettingsSubpathHref;

export type ConfigurationPlatformSectionId = "organization" | "data_model" | "operations" | "business";

export type ConfigurationModeNavIcon =
    | "organization"
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
                href: "/organization/programs-locations",
                label: "Programs & Locations",
                description: "Reusable services and the places that deliver them.",
                icon: "locations",
                testId: "config-mode-nav-programs-locations",
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
                href: dataModelSectionHref("entities"),
                label: "Entities",
                description: "Configure entity names, labels, and terminology.",
                icon: "entities",
                testId: "config-mode-nav-entities",
            },
            {
                href: dataModelSectionHref("fields"),
                label: "Fields",
                description: "Manage field definitions, types, validation, and rules.",
                icon: "fields",
                testId: "config-mode-nav-fields",
            },
            {
                href: dataModelSectionHref("statuses"),
                label: "Statuses",
                description: "Status vocabulary and lifecycle presentation.",
                icon: "statuses",
                testId: "config-mode-nav-statuses",
            },
            {
                href: dataModelSectionHref("option-sets"),
                label: "Option Sets",
                description: "Reusable option vocabularies for configured fields.",
                icon: "fields",
                testId: "config-mode-nav-option-sets",
            },
            {
                href: dataModelSectionHref("relationships"),
                label: "Relationships",
                description: "Canonical edges and relationship-role vocabulary.",
                icon: "entities",
                testId: "config-mode-nav-relationships",
            },
            {
                href: dataModelSectionHref("calculations"),
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
                href: "/organization/commands",
                label: "Commands",
                description: "Organization Command catalog and policy.",
                icon: "integrations",
                testId: "config-mode-nav-commands",
            },
            {
                href: "/admin/workflows",
                label: "Automation",
                description: "Workflow triggers and platform-triggered behavior.",
                icon: "automation",
                testId: "config-mode-nav-automation",
            },
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
        ],
    },
    {
        id: "business",
        label: "Business",
        description: "Configure business modules and rules.",
        items: [
            {
                href: "/organization/financials",
                label: "Financials",
                description: "Tuition, fees, catalog, policies, accounting, and commercial simulation.",
                icon: "financials",
                testId: "config-mode-nav-financials",
            },
        ],
    },
] as const;

/** Internal / developer catalog — not shown in primary operator nav. */
export const CONFIGURATION_MODE_INTERNAL_NAV_ITEMS: readonly ConfigurationModeNavItem[] = [
    {
        // Direct adminV2 path — `/settings/actions` redirects to Commands for operators.
        href: "/adminV2/settings/actions",
        label: "Action definitions (legacy)",
        description: "Transitional action definition / placement catalog (developer).",
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

export function configurationModeNavItemActive(
    href: string,
    path: string,
    search: string = "",
): boolean {
    const h = href.replace(/\/$/, "");
    const p = path.replace(/\/$/, "");
    const hrefUrl = (() => {
        try {
            return new URL(h, "http://local.invalid");
        } catch {
            return null;
        }
    })();
    const hrefPath = (hrefUrl?.pathname ?? h).replace(/\/$/, "");
    const hrefSection = hrefUrl?.searchParams.get("section") ?? "";
    const pathSection = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(
        "section",
    );

    if (h === "/admin/workflows") return p === h || p.startsWith(`${h}/`);
    // Programs & Locations domain — highlight for landing and both collections.
    if (h === "/organization/programs-locations") {
        return (
            p === h
            || p.startsWith(`${h}/`)
            || p === "/organization/programs"
            || p.startsWith("/organization/programs/")
            || p === "/organization/locations"
            || p.startsWith("/organization/locations/")
        );
    }
    // Programs is owned by `/organization/programs` only — never treat Commercial/Financials as Programs IA.
    if (h === "/organization/programs") {
        return p === h || p.startsWith(`${h}/`);
    }
    if (h === "/organization/financials") {
        return p === h || p.startsWith(`${h}/`);
    }
    if (h === "/organization/access" || h === settings("users-roles") || h === settings("access")) {
        return (
            p === "/organization/access"
            || p.startsWith("/organization/access/")
            || p === "/settings/users-roles"
            || p.startsWith("/settings/users-roles/")
        );
    }
    if (h === "/organization/commands") {
        return (
            p === h
            || p.startsWith(`${h}/`)
            || p.startsWith("/organization/commands")
            || p.startsWith("/settings/actions")
            || p.startsWith("/adminV2/settings/organization/commands")
            || p.startsWith("/configuration/commands")
        );
    }
    if (h === settings("processes")) {
        return (
            p === h
            || p.startsWith(`${h}/`)
            || p.startsWith("/settings/processes")
            || p.startsWith("/settings/business-processes")
        );
    }
    if (h === settings("surfaces")) {
        return (
            p === h
            || p.startsWith(`${h}/`)
            || p.startsWith("/settings/surfaces")
            || p.startsWith("/settings/layouts")
        );
    }
    if (hrefPath === "/organization/data-model" || hrefPath.includes("/settings/entities")) {
        const onDataModel =
            p === "/organization/data-model"
            || p.startsWith("/organization/data-model")
            || p === "/settings/entities"
            || p.startsWith("/settings/entities")
            || p === "/settings/fields"
            || p.startsWith("/settings/fields")
            || p === "/settings/statuses"
            || p.startsWith("/settings/statuses")
            || p === "/settings/option-sets"
            || p.startsWith("/settings/option-sets")
            || p === "/settings/relationships"
            || p.startsWith("/settings/relationships")
            || p === "/settings/calculations"
            || p.startsWith("/settings/calculations")
            || p === "/settings/analytics"
            || p.startsWith("/settings/analytics")
            || p === settings("entity-labels")
            || p.startsWith(`${settings("entity-labels")}/`)
            || p === settings("label-entities")
            || p.startsWith(`${settings("label-entities")}/`);
        if (!onDataModel) return false;
        if (!hrefSection) return true;
        // Default Data Model section is entities when bare.
        const effective = pathSection || (p === "/organization/data-model" ? "entities" : pathSection);
        return effective === hrefSection;
    }
    return p === h || p.startsWith(`${h}/`);
}
