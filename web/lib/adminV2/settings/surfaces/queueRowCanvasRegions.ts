/**
 * Queue Row Builder — generic canvas placement regions (layout only, not content).
 *
 * The canvas defines WHERE on the row — never WHAT (family, child, status, etc.).
 * Operator-assigned `canvasSlot` / persisted `builderSlot` owns placement; row focus
 * and variant stage rules do not remap regions.
 */

import { QUEUE_RECORD_LAYOUT_ZONES } from "@/lib/layout/surfaceLayoutRegistry";
import type { CompactRowSlots } from "@/lib/presentation/runtime/queueRowSurfaceConfig";

export type QueueRowCanvasZoneKey = (typeof QUEUE_RECORD_LAYOUT_ZONES)[number];

/** Anatomy region keys persisted as `builderSlot` on columns. */
export type CanvasAnatomyRegion = "identity" | "groupCount" | "attention" | "status" | "work";

export type CanvasPlacementRegion = {
    region: CanvasAnatomyRegion;
    label: string;
    hint: string;
};

/** Operator-facing placement slots on the condensed row shell. */
export const CANVAS_PLACEMENT_REGIONS: readonly CanvasPlacementRegion[] = [
    { region: "identity", label: "Primary", hint: "Top left — main identity" },
    { region: "groupCount", label: "Secondary", hint: "Below primary" },
    { region: "attention", label: "Supporting", hint: "Middle row" },
    { region: "status", label: "Right", hint: "Top right" },
    { region: "work", label: "Bottom", hint: "Footer" },
] as const;

const DEFAULT_ZONE_SLOT: Record<QueueRowCanvasZoneKey, CanvasAnatomyRegion | null> = {
    household: "identity",
    children: "groupCount",
    status: "status",
    attention: "attention",
    date_event: "work",
    actions: null,
};

export function canvasAffordanceLabel(region: CanvasAnatomyRegion): string {
    const match = CANVAS_PLACEMENT_REGIONS.find((r) => r.region === region);
    return match ? `+ ${match.label}` : "+ Add";
}

export function canvasRegionLabel(region: CanvasAnatomyRegion): string {
    return CANVAS_PLACEMENT_REGIONS.find((r) => r.region === region)?.label ?? region;
}

/** Map builder anatomy region → compact CondensedQueueRow slot key. */
export function compactSlotForCanvasRegion(region: CanvasAnatomyRegion): keyof CompactRowSlots {
    switch (region) {
        case "identity":
            return "subject";
        case "groupCount":
            return "groupCount";
        case "attention":
            return "attention";
        case "status":
            return "status";
        case "work":
            return "work";
    }
}

export type ZoneCanvasState = {
    key: QueueRowCanvasZoneKey;
    inRow: boolean;
    canvasSlot: CanvasAnatomyRegion | null;
};

/**
 * Resolve overlay region for a zone from operator-assigned slot only.
 * Legacy configs without `builderSlot` fall back to default zone→region mapping when in-row.
 */
export function regionForZoneState(zone: ZoneCanvasState): CanvasAnatomyRegion | null {
    if (zone.key === "actions") return null;
    if (!zone.inRow) return null;
    if (zone.canvasSlot) return zone.canvasSlot;
    return DEFAULT_ZONE_SLOT[zone.key];
}

export function occupiedCanvasRegions(zones: readonly ZoneCanvasState[]): Set<CanvasAnatomyRegion> {
    const occupied = new Set<CanvasAnatomyRegion>();
    for (const zone of zones) {
        const region = regionForZoneState(zone);
        if (region) occupied.add(region);
    }
    return occupied;
}

/** Inverse of {@link compactSlotForCanvasRegion} — maps compact slot → canvas region. */
export function canvasRegionForCompactSlot(slot: keyof CompactRowSlots): CanvasAnatomyRegion | null {
    switch (slot) {
        case "subject":
            return "identity";
        case "groupCount":
            return "groupCount";
        case "attention":
            return "attention";
        case "status":
            return "status";
        case "work":
            return "work";
        default:
            return null;
    }
}

export function defaultCanvasSlotForZone(zoneKey: QueueRowCanvasZoneKey): CanvasAnatomyRegion | null {
    return DEFAULT_ZONE_SLOT[zoneKey];
}
