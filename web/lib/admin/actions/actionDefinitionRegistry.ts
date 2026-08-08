/**
 * Executable action registry for Settings library, catalog filtering, and documentation.
 */

import { getPlatformCapability } from "@/lib/platform/commands/capabilityRegistry";

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
    /**
     * Capability-declared interaction host — where the operator interacts when this capability runs
     * inside a work surface. Generic and metadata-driven: the runtime resolves the host from THIS,
     * never from the action name/label. Omit to derive the host from `category`.
     */
    interactionHost?: CapabilityInteractionHost;
    /** Optional Lucide icon name for operator action buttons (What's Next, etc.). */
    icon?: string;
};

/** Generic interaction hosts a capability may declare. Not business- or action-name specific. */
export type CapabilityInteractionHost = "inline_form" | "communications_composer" | "header_delegate" | "form_delivery";

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
        icon: "MessageSquare",
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
        key: "update_enrollment_status",
        label: "Change Enrollment Status",
        category: "status_lifecycle",
        settingsConfigurable: true,
        description:
            "Move a child enrollment track (or household record when no children) to a new stage with requirement checks.",
        defaultSurface: "queue_row",
        defaultSlot: "row_inline",
    },
    {
        key: "update_child_enrollment_status",
        label: "Update Child Enrollment Status",
        category: "status_lifecycle",
        settingsConfigurable: true,
        description:
            "Change a child's enrollment status through the Mutation Runtime. Domain-specific: operates on the Child Enrollment grain (opportunity_customer_members.outcome_status_key) only.",
        defaultSurface: "record_section",
        defaultSlot: "primary",
    },
    {
        key: "update_lead_status",
        label: "Update Lead Status",
        category: "status_lifecycle",
        settingsConfigurable: true,
        description:
            "Change the lead status through the Mutation Runtime. Domain-specific: operates on Lead Status only.",
        defaultSurface: "record_header",
        defaultSlot: "primary",
    },
    {
        key: "change_lead_location",
        label: "Change lead location",
        category: "workflow",
        settingsConfigurable: true,
        description:
            "Set the family default site (opportunities.location_id). Children keep their own sites; optional update for children still inheriting the lead default.",
        defaultSurface: "record_header",
        defaultSlot: "secondary",
        interactionHost: "inline_form",
        icon: "MapPin",
    },
    {
        key: "close_lead",
        label: "Close Lead",
        category: "status_lifecycle",
        settingsConfigurable: true,
        description:
            "Mark this lead as closed or lost through the Mutation Runtime. Semantic alias for update_lead_status with closing intent.",
        defaultSurface: "record_header",
        defaultSlot: "secondary",
    },
    {
        key: "waitlist_child",
        label: "Waitlist Child",
        category: "status_lifecycle",
        settingsConfigurable: true,
        description:
            "Move a child to a waitlist status through the Mutation Runtime. Semantic alias for update_child_enrollment_status with waitlist intent.",
        defaultSurface: "record_section",
        defaultSlot: "primary",
    },
    {
        key: "enroll_child",
        label: "Enroll Child",
        category: "status_lifecycle",
        settingsConfigurable: true,
        description:
            "Confirm a child's enrollment through the Mutation Runtime. Semantic alias for update_child_enrollment_status with enrollment intent.",
        defaultSurface: "record_section",
        defaultSlot: "primary",
    },
    {
        // Legacy: remains for backward compat with existing action_placements.
        // Do not create new placements pointing to this key.
        key: "update_status_add_note",
        label: "Change Enrollment Status (legacy key)",
        category: "status_lifecycle",
        settingsConfigurable: false,
        description:
            "Legacy placement key — routes to Change Enrollment Status (OCM-scoped). Prefer update_enrollment_status for new placements.",
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
        interactionHost: "inline_form",
        icon: "Calendar",
    },
    {
        key: "reschedule_tour",
        label: "Reschedule tour",
        category: "workflow",
        settingsConfigurable: true,
        description: "Pick a new tour date and time. You can add a short reason when helpful.",
        defaultSurface: "record_header",
        defaultSlot: "secondary",
        interactionHost: "inline_form",
        icon: "Calendar",
    },
    {
        key: "send_tour_invitation",
        label: "Send Tour Invitation",
        category: "communication",
        settingsConfigurable: true,
        description:
            "Open compose to review and send a tour invitation for this family. Appears on What's Next only when configured on the work template.",
        defaultSurface: "record_header",
        defaultSlot: "secondary",
        // Centered Current Work communications composer — prepare draft, operator edits, confirm send.
        // Do not use header_delegate: that fabricated a registry execute and silently sent.
        interactionHost: "communications_composer",
        icon: "Send",
    },
    {
        key: "send_form",
        label: "Send form",
        category: "workflow",
        settingsConfigurable: true,
        description: "Open the send-form composer to share an intake or update form with this family.",
        defaultSurface: "record_header",
        defaultSlot: "secondary",
        // Declared interaction host: the generic form-delivery surface (which form → who receives
        // it → what it relates to → how delivered), rendered inline in the centered What's Next card.
        interactionHost: "form_delivery",
        icon: "Send",
    },
    {
        key: "send_enrollment_packet",
        label: "Send enrollment packet",
        category: "workflow",
        settingsConfigurable: true,
        description: "Start the enrollment packet workflow for this family when your org has one configured.",
        defaultSurface: "record_header",
        defaultSlot: "secondary",
        icon: "Send",
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

        // P0.S1 honesty: a DB definition never implies a runnable organization Command.
        // Unknown-to-registry keys keep prior behavior (library / org_id gates below).
        const capability = getPlatformCapability(key);
        if (capability) {
            if (
                capability.maturity === "placeholder" ||
                capability.maturity === "unavailable" ||
                capability.maturity === "processing_only" ||
                capability.maturity === "workflow_only" ||
                capability.maturity === "configuration_maintenance"
            ) {
                return false;
            }
            if (capability.catalogVisibility === "hidden" || capability.catalogVisibility === "internal_only") {
                return false;
            }
        }

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
