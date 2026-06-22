/**
 * Waitlist placement field keys + queue row chip presentation (v3 field blocks).
 */

import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import type { QueueRecordStatusPillTone } from "@/lib/layout/runtime/resolveQueueRecordStatusPillTone";
import type { QueueRowPlacementWaitlistCandidateVm } from "@/lib/ui-v2/workspace-types";

export const WAITLIST_PLACEMENT_FIELD_KEYS = [
    "waitlist.positionLabel",
    "waitlist.tierLabel",
    "waitlist.priorityLabel",
    "waitlist.waitSince",
    "waitlist.siblingContext",
    "overrides.flags",
    "overrides.reason",
] as const;

export const WAITLIST_ONLY_FIELD_PREFIXES = ["waitlist.", "overrides."] as const;

export type WaitlistPlacementFieldKind =
    | "position"
    | "tier"
    | "priority"
    | "override"
    | "wait_since"
    | "sibling";

export type QueueWaitlistPlacementPresentation = {
    kind: WaitlistPlacementFieldKind;
    tone: QueueRecordStatusPillTone;
    /** Optional operator prefix (e.g. "Position"). */
    prefix: string | null;
    surface: "badge" | "muted";
};

export function isWaitlistOnlyFieldKey(fieldKey: string): boolean {
    const key = fieldKey.trim();
    return WAITLIST_ONLY_FIELD_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function classifyWaitlistPlacementFieldKey(fieldKey: string): WaitlistPlacementFieldKind | null {
    const key = fieldKey.trim();
    if (key === "waitlist.positionLabel") return "position";
    if (key === "waitlist.tierLabel") return "tier";
    if (key === "waitlist.priorityLabel" || key === "waitlist.priority" || key === "waitlist_priority") return "priority";
    if (key === "overrides.flags" || key === "waitlist.pin") return "override";
    if (key === "waitlist.waitSince") return "wait_since";
    if (key === "waitlist.siblingContext") return "sibling";
    return null;
}

export function formatWaitlistOverrideFlags(
    waitlist: Pick<
        QueueRowPlacementWaitlistCandidateVm,
        "activeOverrideKinds" | "hasManualPositionAdjustment" | "hasActiveOverride"
    >,
): string {
    const flags: string[] = [];
    if (waitlist.activeOverrideKinds.includes("pin")) flags.push("Pinned");
    if (waitlist.hasManualPositionAdjustment) flags.push("Manually adjusted");
    if (waitlist.activeOverrideKinds.includes("tier_boost")) flags.push("Tier boost");
    if (waitlist.activeOverrideKinds.includes("temporary")) flags.push("Temporary");
    if (waitlist.hasActiveOverride && flags.length === 0) flags.push("Override active");
    return flags.join(" · ");
}

export function resolveQueueWaitlistPlacementPresentation(
    fieldKey: string,
): QueueWaitlistPlacementPresentation | null {
    const kind = classifyWaitlistPlacementFieldKey(fieldKey);
    if (!kind) return null;

    switch (kind) {
        case "position":
            return { kind, tone: "neutral", prefix: null, surface: "badge" };
        case "tier":
        case "priority":
            return { kind, tone: "info", prefix: null, surface: "badge" };
        case "override":
            return { kind, tone: "warning", prefix: null, surface: "badge" };
        case "wait_since":
            return { kind, tone: "neutral", prefix: "Waitlisted since", surface: "muted" };
        case "sibling":
            return { kind, tone: "neutral", prefix: null, surface: "muted" };
        default:
            return null;
    }
}

/** Resolve waitlist.pin display from anchor record when configured as a field ref. */
export function resolveWaitlistPinDisplay(record: ProofRuntimeRecord): string | null {
    const flags = String(record["overrides.flags"] ?? "").trim();
    if (flags.includes("Pinned")) return "Pinned";
    const rawKinds = record._placement_waitlist_override_kinds;
    if (Array.isArray(rawKinds) && rawKinds.map(String).includes("pin")) return "Pinned";
    return null;
}
