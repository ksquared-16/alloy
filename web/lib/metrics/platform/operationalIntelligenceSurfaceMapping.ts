/**
 * Operational Intelligence ⇄ SurfaceDoc mapping (pure).
 *
 * Converts real metric_placements for the operational_intelligence surface into the
 * platform SurfaceDoc the builder edits, and back into a create/update/remove plan the
 * server applies. No Supabase, no React — fully unit-testable.
 *
 * Identity for the diff is (zone, source_key): a given metric appears at most once per
 * zone. This keeps Publish idempotent regardless of client-generated instance ids
 * (re-publishing the same doc produces no duplicate placements).
 */

import type {
    MetricPlacementZone,
    MetricVisualizationType,
} from "@/lib/metrics/platform/types";
import type { SurfaceDoc, SurfaceCardInstance } from "@/lib/platform/surfaceBuilder/surfaceDefinition";

/** The four Operational Intelligence zones, in display order — these are the builder's sections. */
export const OI_ZONES: readonly MetricPlacementZone[] = ["overview", "health", "trends", "comparisons"];

export const OI_ZONE_LABEL: Record<string, string> = {
    overview: "Overview",
    health: "Health",
    trends: "Trends",
    comparisons: "Comparisons",
};

/** A flattened placement, decoupled from DB row types so the mapping stays pure. */
export type OiPlacementView = {
    id: string;
    sourceKey: string; // = OipMetricKey = Operational Calculation key
    vizType: MetricVisualizationType;
    label: string;
    zone: MetricPlacementZone;
    sortOrder: number;
};

/** What the builder wants persisted for one card. */
export type DesiredPlacement = {
    zone: MetricPlacementZone;
    sourceKey: string;
    vizType: MetricVisualizationType;
    sortOrder: number;
};

/* ---- card type ⇄ visualization type ---- */

const CARD_TYPE_TO_VIZ: Record<string, MetricVisualizationType> = {
    kpi: "kpi_card",
    trend: "trend_card",
    gauge: "gauge",
    comparison: "comparison",
    breakdown: "bar_chart",
    table: "table",
    health: "scorecard",
};

const VIZ_TO_CARD_TYPE: Record<MetricVisualizationType, string> = {
    kpi_card: "kpi",
    chip: "kpi",
    trend_card: "trend",
    sparkline: "trend",
    line_chart: "trend",
    area_chart: "trend",
    gauge: "gauge",
    comparison: "comparison",
    bar_chart: "breakdown",
    table: "table",
    scorecard: "health",
};

const VALID_VIZ = new Set<MetricVisualizationType>([
    "kpi_card", "trend_card", "sparkline", "line_chart", "area_chart",
    "bar_chart", "comparison", "gauge", "scorecard", "table", "chip",
]);

export function cardTypeToVizType(cardTypeKey: string, rendererKey?: unknown): MetricVisualizationType | null {
    if (typeof rendererKey === "string" && VALID_VIZ.has(rendererKey as MetricVisualizationType)) {
        return rendererKey as MetricVisualizationType;
    }
    return CARD_TYPE_TO_VIZ[cardTypeKey] ?? null;
}

export function vizTypeToCardType(vizType: MetricVisualizationType): string {
    return VIZ_TO_CARD_TYPE[vizType] ?? "kpi";
}

/** Map an arbitrary section id back onto a real OI zone (unknown sections collapse to overview). */
export function sectionToZone(sectionId: string): MetricPlacementZone {
    return (OI_ZONES as readonly string[]).includes(sectionId)
        ? (sectionId as MetricPlacementZone)
        : "overview";
}

/* ---- placements → SurfaceDoc ---- */

/**
 * Build the builder doc from live placements. One section per zone (in OI order); empty
 * zones still render so operators can drop cards into them.
 */
export function placementsToSurfaceDoc(views: readonly OiPlacementView[]): SurfaceDoc {
    return {
        sections: OI_ZONES.map((zone) => {
            const cards: SurfaceCardInstance[] = views
                .filter((v) => v.zone === zone)
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((v) => ({
                    instanceId: v.id,
                    cardTypeKey: vizTypeToCardType(v.vizType),
                    contentId: v.sourceKey,
                    config: { rendererKey: v.vizType },
                }));
            return { sectionId: zone, title: OI_ZONE_LABEL[zone] ?? zone, cards };
        }),
    };
}

/* ---- SurfaceDoc → desired placements ---- */

/**
 * Flatten the doc into desired placements. Cards without content, or whose card type has
 * no real visualization (e.g. the affected-work panel), are skipped — they aren't metric
 * placements.
 */
export function surfaceDocToDesiredPlacements(doc: SurfaceDoc): DesiredPlacement[] {
    const out: DesiredPlacement[] = [];
    for (const section of doc.sections) {
        const zone = sectionToZone(section.sectionId);
        section.cards.forEach((card, index) => {
            if (!card.contentId) return;
            const vizType = cardTypeToVizType(card.cardTypeKey, (card.config as Record<string, unknown>)?.rendererKey);
            if (!vizType) return;
            out.push({ zone, sourceKey: card.contentId, vizType, sortOrder: index * 10 });
        });
    }
    return out;
}

/* ---- diff (matched by zone+source_key) ---- */

export type PlacementPlan = {
    creates: DesiredPlacement[];
    updates: (DesiredPlacement & { id: string })[];
    removes: { id: string }[];
};

const keyOf = (zone: string, sourceKey: string) => `${zone}::${sourceKey}`;

export function diffPlacements(current: readonly OiPlacementView[], desired: readonly DesiredPlacement[]): PlacementPlan {
    const currentByKey = new Map<string, OiPlacementView>();
    const duplicates: OiPlacementView[] = [];
    for (const v of current) {
        const k = keyOf(v.zone, v.sourceKey);
        if (currentByKey.has(k)) duplicates.push(v); // collapse dupes (same metric twice in a zone)
        else currentByKey.set(k, v);
    }

    const desiredKeys = new Set(desired.map((d) => keyOf(d.zone, d.sourceKey)));
    const creates: DesiredPlacement[] = [];
    const updates: (DesiredPlacement & { id: string })[] = [];
    for (const d of desired) {
        const existing = currentByKey.get(keyOf(d.zone, d.sourceKey));
        if (existing) updates.push({ ...d, id: existing.id });
        else creates.push(d);
    }

    const removes: { id: string }[] = [
        ...current.filter((v) => !desiredKeys.has(keyOf(v.zone, v.sourceKey))).map((v) => ({ id: v.id })),
        ...duplicates.map((v) => ({ id: v.id })),
    ];

    return { creates, updates, removes };
}
