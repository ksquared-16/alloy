/**
 * Content-mode scaffold for a Focus Panel card (foundation, read-only).
 *
 * Content mode does not yet edit bindings (that is the next phase). This derives
 * a believable, READ-ONLY description of what a selected card contains — its
 * title, description, slots/fields, and the business-concept data bindings each
 * slot maps to (Presentation Data doctrine: "Enrollment → Primary Contact →
 * Email", not raw DB columns). Values come from the live card model so the
 * inspector reflects real demo data. Nothing here mutates or persists.
 */

import type {
    FocusPanelCardKey,
    FocusPanelCardModel,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

export type FocusPanelContentSlotKind = "text" | "field" | "status" | "collection" | "metric";

export type FocusPanelContentSlot = {
    label: string;
    /** Business-concept data binding (read-only placeholder). */
    binding: string;
    kind: FocusPanelContentSlotKind;
    /** Resolved value from the live model (read-only). */
    value: string | null;
};

export type FocusPanelCardContent = {
    key: FocusPanelCardKey;
    title: string;
    description: string;
    /** True when the card renders a related list / collection (not a flat field set). */
    isCollection: boolean;
    slots: FocusPanelContentSlot[];
};

const CARD_DESCRIPTIONS: Partial<Record<FocusPanelCardKey, string>> = {
    attention: "Why this enrollment needs operator attention right now.",
    current_mission: "The single most important objective for this record.",
    current_work: "Active work in flight for this enrollment.",
    health: "Overall enrollment health and risk signals.",
    readiness_kpi: "Readiness score for advancing this enrollment.",
    tour_summary: "Tour scheduling status and outcome.",
    household: "Primary and secondary contacts for the household.",
    children: "Children / siblings linked to this enrollment.",
    communications: "Recent outreach and message context.",
    documents: "Required and submitted documents.",
    tasks: "Open tasks for this enrollment.",
};

/** Cards that represent related lists / collections by concept (even if profile-modeled). */
const COLLECTION_KEYS: ReadonlySet<FocusPanelCardKey> = new Set([
    "household",
    "children",
    "documents",
    "tasks",
    "communications",
]);

const COLLECTION_LABELS: Partial<Record<FocusPanelCardKey, string>> = {
    household: "Contacts",
    children: "Children",
    documents: "Documents",
    tasks: "Open Tasks",
    communications: "Messages",
};

const COLLECTION_BINDINGS: Partial<Record<FocusPanelCardKey, string>> = {
    household: "Enrollment → Household → Contacts (one-to-many)",
    children: "Enrollment → Children → Name / Age / Status (one-to-many)",
    documents: "Enrollment → Documents (one-to-many)",
    tasks: "Runtime → Tasks → Open (one-to-many)",
    communications: "Enrollment → Communications → Recent (one-to-many)",
};

function humanize(key: string): string {
    return key
        .split("_")
        .map((part) => (part.length ? part[0]!.toUpperCase() + part.slice(1) : part))
        .join(" ");
}

function profileBinding(key: FocusPanelCardKey, label: string): string {
    if (key === "household") {
        const lower = label.toLowerCase();
        if (lower.includes("primary")) return "Enrollment → Primary Contact → Name";
        if (lower.includes("secondary")) return "Enrollment → Secondary Contact → Name";
        if (lower.includes("phone")) return "Enrollment → Primary Contact → Phone";
        if (lower.includes("email")) return "Enrollment → Primary Contact → Email";
    }
    return `Enrollment → ${humanize(key)} → ${label}`;
}

/** Describe a card's content (read-only) for the Content-mode inspector. */
export function describeFocusPanelCardContent(model: FocusPanelCardModel): FocusPanelCardContent {
    const slots: FocusPanelContentSlot[] = [];
    const isMetric = model.archetype === "metric" || model.tier === "metric";

    slots.push({
        label: "Title",
        binding: "Card title (static label)",
        kind: "text",
        value: model.title,
    });

    if (model.insight) {
        slots.push({
            label: "Insight",
            binding:
                isMetric ?
                    `Operational Intelligence → Enrollment → ${humanize(model.key)}`
                :   `Enrollment → ${humanize(model.key)} → Summary`,
            kind: isMetric ? "metric" : "text",
            value: model.insight,
        });
    }

    if (model.statusChip) {
        slots.push({
            label: "Status",
            binding: `Runtime → ${humanize(model.key)} → Status`,
            kind: "status",
            value: model.statusChip,
        });
    }

    const profileFields = model.payload?.profileFields ?? [];
    profileFields.forEach((field) => {
        slots.push({
            label: field.label,
            binding: profileBinding(model.key, field.label),
            kind: "field",
            value: field.value,
        });
    });

    const collectionItems = model.payload?.collectionItems ?? [];
    const overflow = model.payload?.overflowCount ?? 0;
    const hasCollectionItems = collectionItems.length > 0 || overflow > 0;
    const isCollection =
        hasCollectionItems || model.archetype === "collection" || COLLECTION_KEYS.has(model.key);
    // Add an explicit collection slot only when items back it (e.g. children); household's
    // contacts are already enumerated as profile slots but it is still a related list.
    if (hasCollectionItems) {
        const count = collectionItems.length + overflow;
        slots.push({
            label: COLLECTION_LABELS[model.key] ?? "Items",
            binding: COLLECTION_BINDINGS[model.key] ?? `Enrollment → ${humanize(model.key)} (one-to-many)`,
            kind: "collection",
            value: `${count} linked`,
        });
    }

    return {
        key: model.key,
        title: model.title,
        description: CARD_DESCRIPTIONS[model.key] ?? model.insight ?? humanize(model.key),
        isCollection,
        slots,
    };
}
