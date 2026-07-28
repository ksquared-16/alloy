/**
 * Capability presentation helpers for internal Command diagnostics.
 * Groups raw placements, maps support states, and keeps technical keys out of UI.
 */

import type { OrganizationCommandCatalogEntry } from "@/lib/platform/commands/organizationCommandCatalog";
import {
    operatorConfigurationSurfaceLabel,
    settingsSlotLabel,
} from "@/lib/admin/actions/actionPlacementPresentation";

export type CommandProductSupportState =
    | "supported"
    | "needs_attention"
    | "not_supported";

export type CommandProductSupportPresentation = {
    state: CommandProductSupportState;
    label: string;
    /** Short guidance for administrators — never executor jargon. */
    explanation: string;
};

export type PlacementRowInput = {
    id: string;
    orgOwned: boolean;
    surface: string;
    slot: string;
    entityType: string | null;
    sectionKey: string | null;
    isActive: boolean;
    orderIndex: number;
    departmentId?: string | null;
    workUnitId?: string | null;
};

export type OperationalExposureGroup = {
    /** Stable group key for React lists / toggles. */
    key: string;
    title: string;
    description: string;
    /** True when any member placement is organization-owned. */
    orgEditable: boolean;
    /** Aggregated enabled state for the group. */
    enabled: boolean;
    /** Member placement ids (org-owned first) — toggle applies to all org-owned members. */
    orgPlacementIds: string[];
    /** Compact note when duplicates or legacy surfaces were collapsed. */
    note?: string;
    memberCount: number;
};

const PURPOSE_BY_KEY: Record<string, string> = {
    archive_lead: "Archive a lead when Alloy supports that recovery path. Not available yet.",
    delete_lead: "Permanently delete a lead record after confirmation.",
    cancel_tour: "Cancel an existing tour booking after confirmation.",
    create_lead: "Create a new enrollment lead and household from captured contact details.",
    close_lead: "Close a lead with an outcome, keeping history intact.",
    make_primary_contact: "Make a household person the primary contact for this record.",
    schedule_tour: "Schedule a tour booking for this lead.",
    complete_tour: "Mark a tour as completed.",
    confirm_tour: "Confirm an existing tour booking.",
    no_show_tour: "Record that a scheduled tour was a no-show.",
    reschedule_tour: "Move an existing tour booking to a new time.",
    add_parent_guardian: "Add or link a parent or guardian on this record.",
    waitlist_child: "Move a child onto the waitlist.",
    enroll_child: "Enroll a child into a program.",
};

export function commandPurpose(entry: OrganizationCommandCatalogEntry): string {
    return (
        PURPOSE_BY_KEY[entry.canonicalCommandKey] ??
        PURPOSE_BY_KEY[entry.capabilityKey] ??
        `Operator capability in the ${humanFamily(entry.family)} family.`
    );
}

export function humanFamily(family: string): string {
    return family.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Product support state — actionable for administrators.
 * Registry `reason` strings are engineering notes; they are not admin status.
 */
export function commandProductSupport(
    entry: OrganizationCommandCatalogEntry
): CommandProductSupportPresentation {
    if (entry.maturity === "unavailable" || entry.maturity === "placeholder") {
        return {
            state: "not_supported",
            label: "Not yet supported",
            explanation:
                "Alloy does not run this Command yet. It appears so administrators can see the gap honestly.",
        };
    }
    if (entry.maturity === "executable" || entry.maturity === "adapted") {
        return {
            state: "supported",
            label: "Supported",
            explanation:
                "Alloy can run this Command. Enablement and where it appears are organization settings below.",
        };
    }
    if (entry.maturity === "navigation_only") {
        return {
            state: "supported",
            label: "Supported",
            explanation: "This opens an operator surface. It does not mutate records by itself.",
        };
    }
    if (entry.maturity === "legacy") {
        return {
            state: "needs_attention",
            label: "Needs attention",
            explanation:
                "This Command remains available for compatibility. Prefer the primary supported Commands where possible.",
        };
    }
    return {
        state: "needs_attention",
        label: "Needs attention",
        explanation:
            "Platform support may be incomplete. Review before relying on this Command for operators.",
    };
}

export function humanOperationalSurfaceLabel(surface: string): string {
    if (surface === "department") return "Department workspace";
    if (surface === "work_unit") return "Work unit";
    if (surface === "workspace") return "Workspace home";
    if (surface === "queue_row") return "Queue row";
    if (surface === "record_header") return "Focus Panel header";
    if (surface === "record_section") return "Focus Panel card";
    if (surface === "right_rail") return "Side panel";
    return operatorConfigurationSurfaceLabel(surface);
}

function groupKey(p: PlacementRowInput): string {
    return [p.surface, p.slot, p.entityType ?? "", p.sectionKey ?? ""].join("|");
}

/**
 * Collapse raw placement rows into human operational exposures.
 * Duplicate rows with the same surface/slot/entity (common stale seed data) become one group.
 */
export function groupOperationalExposures(
    placements: readonly PlacementRowInput[]
): OperationalExposureGroup[] {
    const map = new Map<string, PlacementRowInput[]>();
    for (const p of placements) {
        const k = groupKey(p);
        const list = map.get(k) ?? [];
        list.push(p);
        map.set(k, list);
    }

    const groups: OperationalExposureGroup[] = [];
    for (const [key, members] of map) {
        const sample = members[0]!;
        const orgMembers = members.filter((m) => m.orgOwned);
        const orgEditable = orgMembers.length > 0;
        const enabled = orgEditable
            ? orgMembers.some((m) => m.isActive)
            : members.some((m) => m.isActive);

        const title = humanOperationalSurfaceLabel(sample.surface);
        const slot = settingsSlotLabel(sample.slot);
        const entity =
            sample.entityType === "opportunity"
                ? "Leads"
                : sample.entityType
                  ? sample.entityType.replace(/_/g, " ")
                  : "Any record";

        const notes: string[] = [];
        if (members.length > 1) {
            notes.push(
                `${members.length} placement rows collapsed — same context with duplicate stored records.`
            );
        }
        if (!orgEditable) {
            notes.push("Platform default — organization cannot change this row here.");
        }
        if (sample.surface === "department" || sample.surface === "work_unit") {
            notes.push("Legacy workspace surface retained for compatibility.");
        }

        groups.push({
            key,
            title: `${title} · ${slot}`,
            description: `Shown for ${entity}.`,
            orgEditable,
            enabled,
            orgPlacementIds: orgMembers.map((m) => m.id),
            ...(notes.length ? { note: notes.join(" ") } : {}),
            memberCount: members.length,
        });
    }

    groups.sort((a, b) => {
        if (a.orgEditable !== b.orgEditable) return a.orgEditable ? -1 : 1;
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.title.localeCompare(b.title);
    });
    return groups;
}

export function safetySummary(entry: OrganizationCommandCatalogEntry): {
    confirmation: string;
    preview: string;
    destructive: string;
    showExpanded: boolean;
} {
    const confirmation =
        entry.confirmationPolicy === "none"
            ? "No confirmation required"
            : entry.confirmationPolicy === "confirm"
              ? "Confirms before running"
              : entry.confirmationPolicy === "typed_confirm"
                ? "Requires typing to confirm"
                : entry.confirmationPolicy === "strong_confirm"
                  ? "Requires strong confirmation"
                  : entry.confirmationPolicy === "domain_owned"
                    ? "Uses domain confirmation"
                    : "Confirms before running";
    const preview = entry.supportsPreview
        ? "Preview available before commit"
        : "No shared preview step";
    const destructive = entry.destructiveKind
        ? `Classified as ${entry.destructiveKind.replace(/_/g, " ")}`
        : "Not a destructive Command";
    return {
        confirmation,
        preview,
        destructive,
        showExpanded: Boolean(entry.destructiveKind) || entry.confirmationPolicy !== "none",
    };
}
