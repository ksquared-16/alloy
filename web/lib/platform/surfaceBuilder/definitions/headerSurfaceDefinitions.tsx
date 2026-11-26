/**
 * Header surfaces — Workspace Header and Work Unit Header — as Surface Definitions for
 * the ONE platform SurfaceBuilder. No cloned header builder: they reuse the metric card
 * renderer, content source, renderers, and inspector; they only differ by being compact,
 * single-canvas (sections: "none"), with their own starter cards.
 */

import { IMPLICIT_SECTION_ID } from "@/lib/platform/surfaceBuilder/surfaceBuilderModel";
import type { SurfaceDefinition, SurfacePersistenceAdapter, SurfaceDoc, InspectorSchema, CardDefinition, RendererDefinition } from "@/lib/platform/surfaceBuilder/surfaceDefinition";
import {
    OPERATIONAL_INTELLIGENCE_CARD_TYPES,
    OPERATIONAL_INTELLIGENCE_RENDERERS,
    operationalIntelligenceContentSource,
    operationalMetricRuntimeRenderer,
} from "@/lib/platform/surfaceBuilder/definitions/operationalIntelligenceSurfaceDefinition";

const ACCENT_OPTIONS = [
    { value: "auto", label: "Auto (from status)" },
    { value: "juniper", label: "Green" },
    { value: "amber", label: "Amber" },
    { value: "ember", label: "Red" },
    { value: "blue", label: "Blue" },
    { value: "pine", label: "Pine" },
    { value: "neutral", label: "Neutral" },
];

/** Headers are a compact metric strip — only KPI and Trend tiles fit and render in runtime. */
const HEADER_CARD_TYPES: readonly CardDefinition[] = OPERATIONAL_INTELLIGENCE_CARD_TYPES.filter(
    (c) => c.key === "kpi" || c.key === "trend",
);
const HEADER_RENDERERS: readonly RendererDefinition[] = OPERATIONAL_INTELLIGENCE_RENDERERS.filter(
    (r) => r.key === "kpi_card" || r.key === "trend_card",
);

/**
 * Header inspector — explicit, header-appropriate controls. No Placement (the surface IS
 * the destination) and no Size (a header strip is a uniform row of tiles). Accent color
 * and a health-chip toggle make display treatment explicit; health chips are OFF by
 * default so headers never show unexplained status labels.
 */
const HEADER_INSPECTOR: InspectorSchema = {
    tabs: [
        {
            key: "card",
            label: "Card",
            fields: [
                { key: "title", label: "Title", kind: "text" },
                { key: "visibility", label: "Visible on the surface", kind: "toggle", defaultOn: true },
            ],
        },
        { key: "content", label: "Content", fields: [{ key: "contentId", label: "Metric", kind: "content" }] },
        {
            key: "display",
            label: "Display",
            fields: [
                { key: "rendererKey", label: "Renderer (KPI or Trend)", kind: "renderer" },
                { key: "accent", label: "Accent color", kind: "select", options: ACCENT_OPTIONS },
            ],
        },
        {
            key: "behavior",
            label: "Behavior",
            fields: [
                { key: "showHealthChip", label: "Show health chip", kind: "toggle", defaultOn: false, help: "Health comes from the metric's thresholds; off by default for a clean header." },
                {
                    key: "comparison",
                    label: "Comparison",
                    kind: "select",
                    options: [
                        { value: "off", label: "Off" },
                        { value: "prior", label: "Prior period" },
                    ],
                },
            ],
        },
    ],
};

const kpi = (instanceId: string, contentId: string) => ({ instanceId, cardTypeKey: "kpi", contentId, config: { rendererKey: "kpi_card", visibility: "on" } });

function headerDoc(cards: { instanceId: string; contentId: string }[]): SurfaceDoc {
    return { sections: [{ sectionId: IMPLICIT_SECTION_ID, title: "", cards: cards.map((c) => kpi(c.instanceId, c.contentId)) }] };
}

export const WORKSPACE_HEADER_TEMPLATE = headerDoc([
    { instanceId: "wh-leads", contentId: "enrollment.lead_count" },
    { instanceId: "wh-attn", contentId: "ops.needs_attention_count" },
    { instanceId: "wh-tours", contentId: "enrollment.tour_completed_count" },
    { instanceId: "wh-overdue", contentId: "ops.work_overdue_count" },
]);

function headerDefinition(opts: {
    surfaceType: string;
    title: string;
    appearsIn: string;
    runtimeHref: string;
    template: SurfaceDoc;
    persistence: SurfacePersistenceAdapter;
}): SurfaceDefinition {
    return {
        surfaceType: opts.surfaceType,
        title: opts.title,
        sections: "none",
        density: "compact",
        cardTypes: HEADER_CARD_TYPES,
        renderers: HEADER_RENDERERS,
        contentSource: operationalIntelligenceContentSource(),
        inspectorSchema: HEADER_INSPECTOR,
        runtimeRenderer: operationalMetricRuntimeRenderer,
        persistence: opts.persistence,
        appearsIn: opts.appearsIn,
        runtimeHref: opts.runtimeHref,
        template: opts.template,
    };
}

export function workspaceHeaderSurfaceDefinition(persistence: SurfacePersistenceAdapter): SurfaceDefinition {
    return headerDefinition({
        surfaceType: "workspace_header",
        title: "Workspace Header",
        appearsIn: "Top of /workspace",
        runtimeHref: "/workspace",
        template: WORKSPACE_HEADER_TEMPLATE,
        persistence,
    });
}

