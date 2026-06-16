"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { LayoutEditorInspectInfo } from "@/lib/layout/layoutEditorInspectModel";

export type LayoutEditorRuntimeTraceContextValue = {
    enabled: boolean;
    inspectMode: boolean;
    byItemId: Map<string, LayoutEditorInspectInfo>;
    byRefKey: Map<string, LayoutEditorInspectInfo>;
    selectedPath: string | null;
    onSelectPath: (path: string | null) => void;
};

const LayoutEditorRuntimeTraceContext = createContext<LayoutEditorRuntimeTraceContextValue | null>(null);

export function LayoutEditorRuntimeTraceProvider({
    value,
    children,
}: {
    value: LayoutEditorRuntimeTraceContextValue;
    children: ReactNode;
}) {
    return <LayoutEditorRuntimeTraceContext.Provider value={value}>{children}</LayoutEditorRuntimeTraceContext.Provider>;
}

export function useLayoutEditorRuntimeTrace(): LayoutEditorRuntimeTraceContextValue | null {
    return useContext(LayoutEditorRuntimeTraceContext);
}

function resolveTraceInfo(
    trace: LayoutEditorRuntimeTraceContextValue,
    itemId?: string,
    refKey?: string,
): LayoutEditorInspectInfo | null {
    if (itemId && trace.byItemId.has(itemId)) return trace.byItemId.get(itemId)!;
    if (refKey && trace.byRefKey.has(refKey)) return trace.byRefKey.get(refKey)!;
    return null;
}

export function layoutEditorTraceProps(
    trace: LayoutEditorRuntimeTraceContextValue | null,
    opts: { itemId?: string; refKey?: string },
): {
    attrs: Record<string, string | undefined>;
    onClick?: () => void;
    className?: string;
} {
    if (!trace?.enabled) return { attrs: {} };
    const info = resolveTraceInfo(trace, opts.itemId, opts.refKey);
    if (!info) return { attrs: { "data-layout-editor-unmapped": "true" } };
    const selected = trace.selectedPath === info.serializedPath;
    return {
        attrs: {
            "data-layout-editor-trace": "true",
            "data-layout-editor-item-id": opts.itemId,
            "data-layout-editor-ref-key": opts.refKey,
            "data-layout-editor-path": info.serializedPath,
            "data-layout-editor-block": info.blockTitle,
            "data-layout-editor-field": info.fieldTitle,
            "data-layout-editor-selected": selected ? "true" : undefined,
            title: trace.inspectMode ?
                `${info.blockTitle}\nField: ${info.fieldTitle}\nDisplay: ${info.displayType}\nVisibility: ${info.visibilityLabel}\nSource: ${info.sourceLabel}`
            :   undefined,
        },
        onClick: () => trace.onSelectPath(info.serializedPath),
        className: trace.inspectMode ?
            "cursor-pointer ring-0 hover:ring-2 hover:ring-alloy-pine/25 rounded-sm"
        : selected ?
            "ring-2 ring-alloy-pine/30 rounded-sm"
        :   undefined,
    };
}
