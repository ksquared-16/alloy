/**
 * Layout runtime evidence collection — staging diagnostics + console dumps.
 */

import type { LayoutDoc } from "../layoutV2";
import { collectLayoutItems } from "./classifyLayoutItemBinding";
import { computeLayoutRuntimeBodyRenderStats, type LayoutRuntimeBodyRenderStats } from "./layoutRuntimeBodyRenderStats";
import type { ProofRuntimeRecord } from "./proofRecordContext";
import { buildLayoutRuntimeDrawerBodyItemEvidence, type LayoutRuntimeBodyItemEvidence } from "./buildLayoutRuntimeDrawerBodyItemEvidence";
import { readLayoutRuntimeRepeaterRows } from "./readLayoutRuntimeRepeaterRows";
import { resolveItemValue } from "../resolveItemValue";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";
import type { QueueRowLayoutRuntimeEnrichment } from "./queueRowLayoutRuntimeEnrichment";

export type LayoutRuntimeDrawerEvidence = {
    opportunityId: string;
    layoutSource: string | null;
    layoutKey: string | null;
    layoutRecordId: string | null;
    layoutVersion: number | null;
    sectionCount: number;
    itemRefKeys: string[];
    itemTemplates: string[];
    recordKeys: string[];
    recordSample: Record<string, unknown>;
    renderStats: LayoutRuntimeBodyRenderStats;
    bodyPhase: string;
    bodyReady: boolean;
    showHold: boolean;
    useVmFallback: boolean;
    lastError: string | null;
    missingLayoutKeys: string[];
    titleResolution?: { display: string | null; isPlaceholder: boolean; refKey: string; template?: string };
    sectionTitles: string[];
    itemEvidence: LayoutRuntimeBodyItemEvidence[];
    renderedItemCount: number;
    fallbackReason: string | null;
};

export type LayoutRuntimeQueueRowEvidence = {
    rowId: string;
    workUnitKey: string | null;
    layoutSource: string | null;
    layoutKey: string | null;
    queueContext: Record<string, unknown> | null;
    layoutItemRefKeys: string[];
    layoutItemTemplates: string[];
    rawPreviewKeys: string[];
    rawPreviewSample: Record<string, unknown>;
    mappedRecordKeys: string[];
    mappedRecordSample: Record<string, unknown>;
    titleResolution: {
        refKey: string;
        template?: string;
        display: string | null;
        isPlaceholder: boolean;
        fallbackReason: string | null;
    };
    contactResolution: {
        display: string | null;
        isPlaceholder: boolean;
        sourceKeysTried: string[];
    };
    childrenCount: number;
    childrenSource: string;
    tourResolution: {
        display: string | null;
        isPlaceholder: boolean;
        sourceKeysTried: string[];
    };
};

function operatorRecordSample(record: ProofRuntimeRecord | null | undefined): Record<string, unknown> {
    if (!record) return {};
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
        if (key.startsWith("_") && key !== "_status_display" && key !== "_attention") continue;
        if (Array.isArray(value)) {
            out[key] = `[array:${value.length}]`;
            continue;
        }
        if (value && typeof value === "object") {
            out[key] = "[object]";
            continue;
        }
        out[key] = value;
    }
    return out;
}

function collectDocRefKeys(doc: LayoutDoc | null | undefined): { refKeys: string[]; templates: string[] } {
    if (!doc) return { refKeys: [], templates: [] };
    const items = collectLayoutItems(doc);
    return {
        refKeys: items.map((i) => i.refKey),
        templates: items.map((i) => i.template).filter((t): t is string => typeof t === "string" && t.length > 0),
    };
}

function findMissingLayoutKeys(doc: LayoutDoc | null | undefined, record: ProofRuntimeRecord | null | undefined): string[] {
    if (!doc || !record) return [];
    const missing: string[] = [];
    for (const item of collectLayoutItems(doc)) {
        if (item.kind === "related_list") {
            const rows = readLayoutRuntimeRepeaterRows(record, item);
            if (rows.length === 0) missing.push(`repeater:${item.source ?? item.refKey}`);
            continue;
        }
        if (item.kind === "widget_placeholder") continue;
        const resolved = resolveItemValue(record, item);
        if (resolved.isPlaceholder) missing.push(item.template ? `${item.refKey}(${item.template})` : item.refKey);
    }
    return missing;
}

export function buildLayoutRuntimeDrawerEvidence(input: {
    opportunityId: string;
    doc: LayoutDoc | null;
    record: ProofRuntimeRecord | null;
    layoutSource: string | null;
    layoutKey: string | null;
    layoutRecordId?: string | null;
    layoutVersion?: number | null;
    phase: string;
    bodyReady: boolean;
    showHold: boolean;
    useVmFallback: boolean;
    lastError: string | null;
}): LayoutRuntimeDrawerEvidence {
    const { refKeys, templates } = collectDocRefKeys(input.doc);
    const renderStats = computeLayoutRuntimeBodyRenderStats(input.doc, input.record);
    const itemEvidence = buildLayoutRuntimeDrawerBodyItemEvidence(input.doc, input.record);
    const sectionTitles = (input.doc?.sections ?? []).map((s) => s.title).filter(Boolean);
    const renderedItemCount = itemEvidence.filter((i) => i.rendered).length;
    const titleItem = collectLayoutItems(input.doc ?? { sections: [] }).find(
        (i) => i.template?.includes("Household") || i.refKey === "name" || i.refKey === "_template",
    );
    const titleResolution = titleItem && input.record ?
        {
            ...resolveItemValue(input.record, titleItem),
            refKey: titleItem.refKey,
            template: titleItem.template,
        }
    :   undefined;

    return {
        opportunityId: input.opportunityId,
        layoutSource: input.layoutSource,
        layoutKey: input.layoutKey,
        layoutRecordId: input.layoutRecordId ?? null,
        layoutVersion: input.layoutVersion ?? null,
        sectionCount: input.doc?.sections?.length ?? 0,
        itemRefKeys: refKeys,
        itemTemplates: templates,
        recordKeys: input.record ? Object.keys(input.record).filter((k) => !k.startsWith("_relations") && k !== "_computed") : [],
        recordSample: operatorRecordSample(input.record ?? undefined),
        renderStats,
        bodyPhase: input.phase,
        bodyReady: input.bodyReady,
        showHold: input.showHold,
        useVmFallback: input.useVmFallback,
        lastError: input.lastError,
        missingLayoutKeys: findMissingLayoutKeys(input.doc, input.record),
        titleResolution,
        sectionTitles,
        itemEvidence,
        renderedItemCount,
        fallbackReason: renderStats.fallbackReason,
    };
}

export function buildLayoutRuntimeQueueRowEvidence(input: {
    item: QueuePreviewItemVm;
    doc: LayoutDoc | null;
    record: ProofRuntimeRecord;
    layoutSource: string | null;
    layoutKey: string | null;
    workUnitKey?: string | null;
    enrichment?: QueueRowLayoutRuntimeEnrichment | null;
}): LayoutRuntimeQueueRowEvidence {
    const { refKeys, templates } = collectDocRefKeys(input.doc);
    const titleItem =
        collectLayoutItems(input.doc ?? { sections: [] }).find(
            (i) => (i.metadata as { zone?: string } | undefined)?.zone === "header.title" || /household/i.test(i.template ?? ""),
        ) ??
        collectLayoutItems(input.doc ?? { sections: [] }).find((i) => typeof i.template === "string");
    const titleResolved = titleItem ? resolveItemValue(input.record, titleItem) : null;
    const contactItem = collectLayoutItems(input.doc ?? { sections: [] }).find((i) => i.refKey.includes("primary_contact"));
    const contactResolved = contactItem ? resolveItemValue(input.record, contactItem) : null;
    const tourItem = collectLayoutItems(input.doc ?? { sections: [] }).find((i) => i.refKey.includes("tour"));
    const tourResolved = tourItem ? resolveItemValue(input.record, tourItem) : null;

    const raw = {
        id: input.item.id,
        title: input.item.title,
        subtitle: input.item.subtitle,
        metaLines: input.item.metaLines,
        semanticCrmCompactKeys: input.item.semanticCrmCompact ? Object.keys(input.item.semanticCrmCompact) : [],
        layoutRuntimeEnrichment: input.enrichment ?? input.item.layoutRuntimeEnrichment ?? null,
    };

    const children = input.record.children ?? input.record.enrollment_children;
    const childrenCount = Array.isArray(children) ? children.length : 0;

    return {
        rowId: input.item.id,
        workUnitKey: input.workUnitKey ?? null,
        layoutSource: input.layoutSource,
        layoutKey: input.layoutKey,
        queueContext: (input.doc?.metadata?.queue_context as Record<string, unknown> | undefined) ?? null,
        layoutItemRefKeys: refKeys,
        layoutItemTemplates: templates,
        rawPreviewKeys: Object.keys(raw),
        rawPreviewSample: raw,
        mappedRecordKeys: Object.keys(input.record),
        mappedRecordSample: operatorRecordSample(input.record),
        titleResolution: {
            refKey: titleItem?.refKey ?? "—",
            template: titleItem?.template,
            display: titleResolved?.display ?? null,
            isPlaceholder: titleResolved?.isPlaceholder ?? true,
            fallbackReason:
                titleResolved?.isPlaceholder ?
                    !input.record.last_name ?
                        "missing_last_name_for_template"
                    : !input.record.name ?
                        "missing_name"
                    :   "template_resolved_empty"
                :   null,
        },
        contactResolution: {
            display: contactResolved?.display ?? null,
            isPlaceholder: contactResolved?.isPlaceholder ?? true,
            sourceKeysTried: [
                "person.primary_contact_name",
                "person.primary_phone",
                "layoutRuntimeEnrichment.contactLine",
                "semanticCrmCompact.contactDisplayName",
            ],
        },
        childrenCount,
        childrenSource: childrenCount > 0 ? "children|enrollment_children" : "empty",
        tourResolution: {
            display: tourResolved?.display ?? null,
            isPlaceholder: tourResolved?.isPlaceholder ?? true,
            sourceKeysTried: ["opportunity.tour_date", "tour_scheduled_at", "layoutRuntimeEnrichment.tourDisplay"],
        },
    };
}

export function logLayoutRuntimeDrawerEvidence(evidence: LayoutRuntimeDrawerEvidence): void {
    if (typeof console === "undefined") return;
    console.groupCollapsed(
        `[layout-runtime:drawer] ${evidence.opportunityId.slice(0, 8)}… · source=${evidence.layoutSource ?? "—"} · phase=${evidence.bodyPhase}`,
    );
    console.table({
        layoutSource: evidence.layoutSource,
        layoutKey: evidence.layoutKey,
        layoutRecordId: evidence.layoutRecordId,
        layoutVersion: evidence.layoutVersion,
        sections: evidence.sectionCount,
        renderableItems: evidence.renderStats.renderableItemCount,
        itemsWithData: evidence.renderStats.itemsWithValueCount,
        bodyReady: evidence.bodyReady,
        showHold: evidence.showHold,
        useVmFallback: evidence.useVmFallback,
        fallbackReason: evidence.renderStats.fallbackReason,
        lastError: evidence.lastError,
    });
    console.log("layout refKeys", evidence.itemRefKeys);
    console.log("section titles", evidence.sectionTitles);
    if (evidence.itemEvidence.length > 0) {
        console.table(
            evidence.itemEvidence.map((i) => ({
                section: i.sectionTitle,
                refKey: i.refKey,
                supported: i.supported,
                valueFound: i.valueFound,
                rendered: i.rendered,
                omitReason: i.omitReason,
            })),
        );
    }
    console.log("record sample", evidence.recordSample);
    console.log("missing layout keys", evidence.missingLayoutKeys);
    if (evidence.titleResolution) console.log("title resolution", evidence.titleResolution);
    console.groupEnd();
}

export function logLayoutRuntimeQueueRowEvidence(evidence: LayoutRuntimeQueueRowEvidence): void {
    if (typeof console === "undefined") return;
    console.groupCollapsed(
        `[layout-runtime:queue-row] ${evidence.rowId.slice(0, 8)}… · source=${evidence.layoutSource ?? "—"} · title=${evidence.titleResolution.display ?? "Record(fallback)"}`,
    );
    console.log("raw preview", evidence.rawPreviewSample);
    console.log("mapped record", evidence.mappedRecordSample);
    console.log("title", evidence.titleResolution);
    console.log("contact", evidence.contactResolution);
    console.log("children", { count: evidence.childrenCount, source: evidence.childrenSource });
    console.log("tour", evidence.tourResolution);
    console.groupEnd();
}

/** True when a published layout doc should fall back to platform default. */
export function shouldFallbackToDefaultLayoutDoc(doc: LayoutDoc | null | undefined): boolean {
    if (!doc?.sections?.length) return true;
    const stats = computeLayoutRuntimeBodyRenderStats(doc, { id: "probe" });
    return stats.productionSupportedCount === 0;
}
