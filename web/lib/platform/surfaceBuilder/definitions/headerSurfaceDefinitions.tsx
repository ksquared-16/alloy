/**
 * Header surfaces — Workspace Header and Work Unit Header — as Surface Definitions for
 * the ONE platform SurfaceBuilder. No cloned header builder: they reuse the metric card
 * renderer, content source, renderers, and inspector; they only differ by being compact,
 * single-canvas (sections: "none"), with their own starter cards.
 */

import { IMPLICIT_SECTION_ID } from "@/lib/platform/surfaceBuilder/surfaceBuilderModel";
import type { SurfaceDefinition, SurfacePersistenceAdapter, SurfaceDoc } from "@/lib/platform/surfaceBuilder/surfaceDefinition";
import {
    OPERATIONAL_INTELLIGENCE_CARD_TYPES,
    OPERATIONAL_INTELLIGENCE_RENDERERS,
    OPERATIONAL_INTELLIGENCE_INSPECTOR,
    operationalIntelligenceContentSource,
    operationalMetricRuntimeRenderer,
} from "@/lib/platform/surfaceBuilder/definitions/operationalIntelligenceSurfaceDefinition";

/**
 * Header inspector — no "Placement" tab: a header surface IS the destination, so promoting
 * the card elsewhere is meaningless. Visibility is already covered in the Card tab.
 */
const HEADER_INSPECTOR = {
    tabs: OPERATIONAL_INTELLIGENCE_INSPECTOR.tabs.filter((t) => t.key !== "placement"),
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

export const WORK_UNIT_HEADER_TEMPLATE = headerDoc([
    { instanceId: "wu-queue", contentId: "ops.needs_attention_count" },
    { instanceId: "wu-attn", contentId: "ops.readiness_gap_count" },
    { instanceId: "wu-sla", contentId: "comms.reply_rate" },
    { instanceId: "wu-overdue", contentId: "ops.work_overdue_count" },
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
        cardTypes: OPERATIONAL_INTELLIGENCE_CARD_TYPES,
        renderers: OPERATIONAL_INTELLIGENCE_RENDERERS,
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

export function workUnitHeaderSurfaceDefinition(persistence: SurfacePersistenceAdapter): SurfaceDefinition {
    return headerDefinition({
        surfaceType: "work_unit_header",
        title: "Work Unit Header",
        appearsIn: "Top of a work unit",
        runtimeHref: "/workspace",
        template: WORK_UNIT_HEADER_TEMPLATE,
        persistence,
    });
}
