/**
 * Zone bucket extraction for layout V2 queue cards — shared by proof and operational row renderers.
 */

import type { LayoutDoc, LayoutItem, LayoutQueueZone } from "@/lib/layout/layoutV2";

export type QueueCardBuckets = {
    fields: Record<string, LayoutItem[]>;
    widgets: Record<string, LayoutItem[]>;
    actions?: LayoutItem;
    actionLabels: string[];
};

/** Legacy queue card action stack labels — operational rows use lifecycle rowActions instead. */
const DEFAULT_ACTIONS: string[] = [];

function flattenItems(doc: LayoutDoc): LayoutItem[] {
    const out: LayoutItem[] = [];
    const walk = (items: LayoutItem[]) => {
        for (const it of items) {
            out.push(it);
            if (it.items) walk(it.items);
            if (it.rows) it.rows.forEach((r) => r.columns.forEach((c) => walk(c.items)));
        }
    };
    doc.sections.forEach((s) => s.rows.forEach((r) => r.columns.forEach((c) => walk(c.items))));
    return out;
}

function inferZone(item: LayoutItem): LayoutQueueZone | null {
    const ref = item.refKey;
    if (item.kind === "widget_placeholder" && ref === "actions") return "actions.stack";
    if (ref.startsWith("child.") || ref.startsWith("inquiry_child.")) return "body.children";
    if (item.kind === "related_list") return "body.children";
    if (typeof item.template === "string" && /household/i.test(item.template)) return "header.title";
    if (item.renderHint === "status" || ref === "opportunity.status_key") return "header.status";
    if (ref.includes("attention") || (typeof item.template === "string" && item.template.includes("_attention"))) {
        return "header.attention";
    }
    if (ref === "opportunity.location" || item.adornment?.icon === "location") return "header.location";
    if (ref.includes("tour")) return "body.tour";
    if (ref.startsWith("person.") || ["phone", "mail", "person"].includes(item.adornment?.icon ?? "")) {
        return "body.contact";
    }
    if (typeof item.template === "string") return "header.title";
    return null;
}

export function bucketizeQueueCardLayout(doc: LayoutDoc): QueueCardBuckets {
    const fields: Record<string, LayoutItem[]> = {};
    const widgets: Record<string, LayoutItem[]> = {};
    let actions: LayoutItem | undefined;
    let actionLabels = DEFAULT_ACTIONS;
    for (const item of flattenItems(doc)) {
        const explicit = (item.metadata as { zone?: string } | undefined)?.zone as string | undefined;
        const zone = explicit ?? inferZone(item) ?? "";
        if (item.kind === "widget_placeholder") {
            if (item.refKey === "actions") {
                actions = item;
                const labels = (item.metadata as { actions?: unknown } | undefined)?.actions;
                if (Array.isArray(labels) && labels.length) actionLabels = labels.map((a) => String(a));
                continue;
            }
            if (zone) (widgets[zone] ??= []).push(item);
        } else if (zone) {
            (fields[zone] ??= []).push(item);
        }
    }
    return { fields, widgets, actions, actionLabels };
}

export function queueCardFirst(b: QueueCardBuckets, zone: string): LayoutItem | undefined {
    return b.fields[zone]?.[0];
}

export function queueCardAll(b: QueueCardBuckets, ...zones: string[]): LayoutItem[] {
    return zones.flatMap((z) => b.fields[z] ?? []);
}
