/**
 * Shared helpers for relationship proof LayoutDocs (runtime convergence).
 *
 * Proof-only — not wired to production drawers.
 */

import {
    LAYOUT_GRID_COLUMNS,
    type LayoutDoc,
    type LayoutItem,
    type LayoutRenderHint,
    type LayoutSection,
} from "../layoutV2";
import { withItemBinding } from "./classifyLayoutItemBinding";
import type { LayoutItemBindingMetadata } from "./valueBinding";

export function proofId(...parts: string[]): string {
    return parts.join("-");
}

export function bindingField(
    base: string,
    refKey: string,
    label: string,
    binding: LayoutItemBindingMetadata,
    renderHint: LayoutRenderHint = "text",
): LayoutItem {
    return withItemBinding(
        {
            id: proofId(base, "f", refKey.replace(/\./g, "_")),
            kind: "field",
            refKey,
            label,
            renderHint,
            editable: false,
            sourceEntity: binding.sourceEntity,
        },
        binding,
    );
}

export function col(base: string, idx: number, width: number, items: LayoutItem[]) {
    return { id: proofId(base, `c${idx}`), width, items };
}

export function row(base: string, columns: ReturnType<typeof col>[]) {
    return { id: base, columns };
}

export function proofSection(
    entityType: string,
    prefix: string,
    sKey: string,
    title: string,
    rows: ReturnType<typeof row>[],
    defaultExpanded = false,
): LayoutSection {
    return {
        id: proofId(entityType, prefix, sKey),
        key: sKey,
        title,
        collapsible: true,
        defaultExpanded,
        rows,
    };
}

export const FUTURE_MODULE_METADATA_KEY = "futureModule" as const;

/** Widget placeholder for a module not yet implemented (fail-closed, diagnostic only). */
export function futureModuleWidget(
    entityType: string,
    base: string,
    moduleKey: string,
    label: string,
): LayoutItem {
    return {
        id: proofId(base, "future", moduleKey),
        kind: "widget_placeholder",
        refKey: moduleKey,
        label,
        widget: {
            widgetKey: `${entityType}.future.${moduleKey}`,
            displayMode: "placeholder",
            note: `Future module — ${label} (not implemented)`,
        },
        metadata: {
            [FUTURE_MODULE_METADATA_KEY]: true,
        },
    };
}

export function futureModuleSection(
    entityType: string,
    prefix: string,
    modules: Array<{ key: string; label: string }>,
    defaultExpanded = false,
): LayoutSection {
    const base = proofId(entityType, prefix, "future_modules");
    const half = LAYOUT_GRID_COLUMNS / 2;
    const items = modules.map((m) => futureModuleWidget(entityType, base, m.key, m.label));
    const rows = [];
    for (let i = 0; i < items.length; i += 2) {
        const pair = items.slice(i, i + 2);
        const rBase = proofId(base, "r", String(i));
        rows.push(
            row(rBase, [
                col(rBase, 0, half, [pair[0]!]),
                ...(pair[1] ? [col(rBase, 1, half, [pair[1]])] : []),
            ]),
        );
    }
    return proofSection(entityType, prefix, "future_modules", "Future modules (placeholders)", rows, defaultExpanded);
}

export function appendFutureModuleSection(doc: LayoutDoc, section: LayoutSection): LayoutDoc {
    return { ...doc, sections: [...doc.sections, section] };
}
