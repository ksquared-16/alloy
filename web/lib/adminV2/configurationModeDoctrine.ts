/**
 * Configuration Mode — visual and interaction doctrine (frozen June 2026).
 * @see docs/system/configuration-mode-doctrine.md
 */

/** Copy/patterns Configuration Runtime docs and UI must NOT treat as acceptable primary styling. */
export const CONFIGURATION_MODE_FORBIDDEN_STYLING_PATTERNS = [
    "blue selected states",
    "blue-gray admin cards",
    "generic slate dashboards",
    "gray-on-gray inactive UI",
    "legacy admin table styling as primary layout",
    "mockup greens that are not Alloy tokens",
    "alloy-blue",
    "bg-blue-",
    "text-blue-",
    "slate selected",
] as const;

/** Configuration queue sections for `/settings/processes` (Presentation lives in Work View setup). */
export const CONFIGURATION_PROCESS_QUEUE_SECTIONS = [
    "stages",
    "work-views",
    "actions",
    "automation",
    "health",
] as const;

export type ConfigurationProcessQueueSection = (typeof CONFIGURATION_PROCESS_QUEUE_SECTIONS)[number];

/** Grouped process configuration queue (left rail inside Processes). */
export const CONFIGURATION_PROCESS_QUEUE_GROUPS = [
    { label: "Configure", sections: ["stages", "work-views"] as const },
    { label: "Process", sections: ["actions", "automation"] as const },
    { label: "Health", sections: ["health"] as const },
] as const;

/** Alloy brand tokens Configuration Mode must use. */
export const CONFIGURATION_MODE_BRAND_TOKENS = [
    "alloy-pine",
    "alloy-midnight",
    "alloy-forge",
    "alloy-stone",
    "rgba(0, 162, 131, 0.08)",
] as const;
