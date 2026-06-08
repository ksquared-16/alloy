/**
 * Layout runtime — render plan (Phase 0–1, non-React).
 *
 * Summarizes a LayoutDoc into a testable structure. Production React rendering
 * remains in LayoutRecordView until Phase 3+ cutover; this module is the lib-layer
 * contract for item kinds, binding classes, and section counts.
 */

import type { LayoutDoc, LayoutItem, LayoutItemKind, LayoutSection } from "../layoutV2";
import { classifyLayoutItemBinding, collectLayoutItems, type LayoutItemBindingPlan } from "./classifyLayoutItemBinding";
import type { LayoutValueBindingClass } from "./valueBinding";

export type LayoutRuntimeItemPlan = {
    id: string;
    kind: LayoutItemKind;
    refKey: string;
    binding?: LayoutItemBindingPlan;
};

export type LayoutRuntimeSectionPlan = {
    key: string;
    title: string;
    items: LayoutRuntimeItemPlan[];
};

export type LayoutRuntimePlan = {
    surface: LayoutDoc["surface"];
    entityType: string;
    sections: LayoutRuntimeSectionPlan[];
    itemKindCounts: Record<LayoutItemKind, number>;
    bindingClassCounts: Record<LayoutValueBindingClass, number>;
    bindings: LayoutItemBindingPlan[];
    layoutKey?: string;
    queueContext?: Record<string, string | undefined>;
};

function flattenItems(items: LayoutItem[], anchorEntity: string): LayoutRuntimeItemPlan[] {
    const out: LayoutRuntimeItemPlan[] = [];
    for (const item of items) {
        out.push({
            id: item.id,
            kind: item.kind,
            refKey: item.refKey,
            binding: classifyLayoutItemBinding(item, anchorEntity),
        });
        if (item.items?.length) out.push(...flattenItems(item.items, anchorEntity));
        if (item.rows?.length) {
            for (const row of item.rows) {
                for (const col of row.columns) {
                    out.push(...flattenItems(col.items, anchorEntity));
                }
            }
        }
    }
    return out;
}

function sectionPlan(section: LayoutSection, anchorEntity: string): LayoutRuntimeSectionPlan {
    const items: LayoutRuntimeItemPlan[] = [];
    for (const row of section.rows) {
        for (const col of row.columns) {
            items.push(...flattenItems(col.items, anchorEntity));
        }
    }
    return { key: section.key, title: section.title, items };
}

function emptyBindingClassCounts(): Record<LayoutValueBindingClass, number> {
    return {
        base_field: 0,
        relationship_field: 0,
        reference_field: 0,
        computed_projection: 0,
        widget: 0,
        repeater: 0,
    };
}

/** Build a render plan from a validated LayoutDoc. */
export function buildLayoutRuntimePlan(doc: LayoutDoc): LayoutRuntimePlan {
    const anchorEntity = doc.entityType;
    const sections = doc.sections.map((s) => sectionPlan(s, anchorEntity));
    const allItems = sections.flatMap((s) => s.items);
    const itemKindCounts: Record<LayoutItemKind, number> = {
        field: 0,
        field_group: 0,
        related_list: 0,
        widget_placeholder: 0,
    };
    for (const item of allItems) {
        itemKindCounts[item.kind] += 1;
    }

    const bindings = collectLayoutItems(doc).map((item) => classifyLayoutItemBinding(item, anchorEntity));
    const bindingClassCounts = emptyBindingClassCounts();
    for (const b of bindings) {
        bindingClassCounts[b.bindingClass] += 1;
    }

    const meta = doc.metadata ?? {};
    const queueContext =
        typeof meta.queue_context === "object" && meta.queue_context !== null
            ? (meta.queue_context as Record<string, string | undefined>)
            : undefined;

    return {
        surface: doc.surface,
        entityType: doc.entityType,
        sections,
        itemKindCounts,
        bindingClassCounts,
        bindings,
        layoutKey: typeof meta.template === "string" ? meta.template : undefined,
        queueContext,
    };
}

/** Sprint 1 item kinds present in doc (for acceptance checks). */
export function layoutDocSupportsAllSprint1ItemKinds(doc: LayoutDoc): boolean {
    const plan = buildLayoutRuntimePlan(doc);
    const kinds = Object.entries(plan.itemKindCounts).filter(([, n]) => n > 0).map(([k]) => k);
    return kinds.every((k) =>
        (["field", "field_group", "related_list", "widget_placeholder"] as const).includes(k as LayoutItemKind),
    );
}
