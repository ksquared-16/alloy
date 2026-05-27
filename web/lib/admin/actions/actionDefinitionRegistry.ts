/**
 * Executable action registry for Settings library, catalog filtering, and documentation.
 */

export type ActionDefinitionCategory =
    | "record"
    | "communication"
    | "workflow"
    | "bos_native"
    | "status_lifecycle";

export type ActionRegistryEntry = {
    key: string;
    label: string;
    category: ActionDefinitionCategory;
    settingsConfigurable: boolean;
    description: string;
    /** Suggested default surface when adding from library. */
    defaultSurface?: "queue_row" | "record_header" | "record_section";
    defaultSlot?: string;
};

export const ACTION_CATEGORY_LABELS: Record<ActionDefinitionCategory, string> = {
    record: "Record",
    communication: "Communication",
    workflow: "Workflow",
    bos_native: "BOS",
    status_lifecycle: "Status",
};

/** Operator-facing action library (Settings cards). Keys must exist in action_definitions after seed. */
export const ACTION_BUTTON_LIBRARY: ActionRegistryEntry[] = [
    {
        key: "quick_message",
        label: "Message",
        category: "communication",
        settingsConfigurable: true,
        description:
            "Open a message composer for the selected record. The user reviews and sends manually.",
        defaultSurface: "queue_row",
        defaultSlot: "row_inline",
    },
    {
        key: "ask_bos",
        label: "Ask BOS",
        category: "bos_native",
        settingsConfigurable: true,
        description:
            "Open BOS with this record's context to help draft, recommend, or prepare next steps.",
        defaultSurface: "record_header",
        defaultSlot: "secondary",
    },
    {
        key: "update_status_add_note",
        label: "Update status",
        category: "status_lifecycle",
        settingsConfigurable: true,
        description: "Change the record status and add an optional note. Required fields depend on the status you choose.",
        defaultSurface: "queue_row",
        defaultSlot: "row_inline",
    },
    {
        key: "schedule_tour",
        label: "Schedule tour",
        category: "workflow",
        settingsConfigurable: true,
        description: "Set a tour date and time for this family. Tour details are required before saving.",
        defaultSurface: "record_header",
        defaultSlot: "primary",
    },
    {
        key: "reschedule_tour",
        label: "Reschedule tour",
        category: "workflow",
        settingsConfigurable: true,
        description: "Pick a new tour date and time. You can add a short reason when helpful.",
        defaultSurface: "record_header",
        defaultSlot: "secondary",
    },
    {
        key: "send_enrollment_packet",
        label: "Send enrollment packet",
        category: "workflow",
        settingsConfigurable: true,
        description: "Start the enrollment packet workflow for this family when your org has one configured.",
        defaultSurface: "record_header",
        defaultSlot: "secondary",
    },
    {
        key: "mark_lost",
        label: "Mark lost",
        category: "status_lifecycle",
        settingsConfigurable: true,
        description: "Mark this record as lost. A reason may be required depending on your status rules.",
        defaultSurface: "record_header",
        defaultSlot: "secondary",
    },
    {
        key: "mark_won",
        label: "Mark won / enrolled",
        category: "status_lifecycle",
        settingsConfigurable: true,
        description: "Mark this family as enrolled. Confirmation fields may apply for your pipeline.",
        defaultSurface: "record_header",
        defaultSlot: "secondary",
    },
    {
        key: "open_record",
        label: "Open record",
        category: "record",
        settingsConfigurable: true,
        description: "Open the full record drawer for this record or job.",
        defaultSurface: "queue_row",
        defaultSlot: "row_inline",
    },
];

/** @deprecated use ACTION_BUTTON_LIBRARY */
export const ACTION_REGISTRY_CATALOG = ACTION_BUTTON_LIBRARY;

const REGISTRY_BY_KEY = new Map(ACTION_BUTTON_LIBRARY.map((e) => [e.key, e]));

const PLACEHOLDER_KEY_RE = /_placeholder$/;

export function isInternalOrPlaceholderActionKey(key: string): boolean {
    const k = key.trim().toLowerCase();
    if (!k) return true;
    if (PLACEHOLDER_KEY_RE.test(k)) return true;
    if (k.includes("placeholder")) return true;
    return false;
}

export function actionRegistryEntryForKey(key: string): ActionRegistryEntry | null {
    return REGISTRY_BY_KEY.get(key.trim()) ?? null;
}

export type ActionCatalogRow = {
    id: string;
    key: string;
    label: string;
    action_type: string;
    entity_type: string | null;
    org_id: string | null;
};

export function filterSettingsActionCatalogDefinitions(definitions: ActionCatalogRow[]): ActionCatalogRow[] {
    return definitions.filter((d) => {
        const key = d.key.trim();
        if (isInternalOrPlaceholderActionKey(key)) return false;
        if (d.action_type === "ui_intent" && key.includes("placeholder")) return false;

        const entry = actionRegistryEntryForKey(key);
        if (entry) return entry.settingsConfigurable;

        if (d.org_id) return true;
        return false;
    });
}

export function formatSettingsCatalogOptionLabel(def: Pick<ActionCatalogRow, "key" | "label" | "org_id">): string {
    const entry = actionRegistryEntryForKey(def.key);
    const owner = def.org_id ? "Your org" : "Built-in";
    return `${entry?.label ?? def.label} · ${owner}`;
}

export function libraryEntryForCatalogRow(def: ActionCatalogRow): ActionRegistryEntry | null {
    return actionRegistryEntryForKey(def.key);
}
