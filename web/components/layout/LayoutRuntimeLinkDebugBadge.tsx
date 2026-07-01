"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
    formatLayoutRuntimeLinkClickResult,
    getLayoutRuntimeLinkDebugEntry,
    isLayoutRuntimeLinkDebugEnabled,
    subscribeLayoutRuntimeLinkDebug,
    type LayoutRuntimeLinkClickResult,
    type LayoutRuntimeLinkDebugEntry,
} from "@/lib/layout/runtime/layoutRuntimeLinkDebug";

function statusColor(result: LayoutRuntimeLinkClickResult): string {
    switch (result) {
        case "rendered":
            return "#15803d";
        case "drawer_state_updated":
            return "#c2410c";
        case "resolving":
        case "clicked":
            return "#1d4ed8";
        case "failed":
            return "#b91c1c";
        default:
            return "#64748b";
    }
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex gap-1 leading-tight">
            <span className="shrink-0 text-[#64748b]">{label}:</span>
            <span className="min-w-0 break-all font-medium text-[#0f172a]">{value}</span>
        </div>
    );
}

type Props = {
    debugKey: string;
    /** Child rows only — calls the same handler as the real link button. */
    onTestOpen?: () => void;
    showTestOpen?: boolean;
};

export default function LayoutRuntimeLinkDebugBadge({ debugKey, onTestOpen, showTestOpen = false }: Props) {
    const subscribe = useCallback((onStoreChange: () => void) => subscribeLayoutRuntimeLinkDebug(onStoreChange), []);
    const getSnapshot = useCallback((): LayoutRuntimeLinkDebugEntry | null => {
        return getLayoutRuntimeLinkDebugEntry(debugKey) ?? null;
    }, [debugKey]);
    const getServerSnapshot = useCallback((): LayoutRuntimeLinkDebugEntry | null => null, []);

    const entry = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    if (!isLayoutRuntimeLinkDebugEnabled() || !entry) return null;

    const statusText = formatLayoutRuntimeLinkClickResult(entry);

    return (
        <div
            className="mt-0.5 max-w-[18rem] rounded border border-[#cbd5e1] bg-[#f8fafc] px-1.5 py-1 font-mono text-[9px] leading-snug shadow-sm"
            data-layout-runtime-link-debug="true"
            data-layout-runtime-link-debug-key={debugKey}
        >
            <div className="mb-0.5 font-semibold uppercase tracking-wide text-[#475569]">Link debug</div>
            <Row label="surface" value={entry.surface} />
            <Row label="entity" value={entry.entityType} />
            <Row label="linkable" value={entry.linkable ? "true" : "false"} />
            <Row label="handler" value={entry.handlerAttached ? "true" : "false"} />
            <Row label="target id" value={entry.targetId?.trim() || "—"} />
            <Row label="id type" value={entry.targetIdType} />
            <Row label="route" value={entry.routeMethod} />
            {entry.entityType === "child" && entry.childRowSummary ?
                <>
                    <Row label="mapper" value={entry.childRowSummary.mapperSource?.trim() || "—"} />
                    <Row label="collection" value={entry.childRowSummary.collectionKey?.trim() || "—"} />
                    <Row label="person_id" value={entry.childRowSummary.person_id?.trim() || "—"} />
                    <Row label="customer_member_id" value={entry.childRowSummary.customer_member_id?.trim() || "—"} />
                    <Row label="ocm_id" value={entry.childRowSummary.ocm_id?.trim() || "—"} />
                    <Row label="child.id" value={entry.childRowSummary["child.id"]?.trim() || "—"} />
                    <Row label="display_name" value={entry.childRowSummary.display_name?.trim() || "—"} />
                    <div className="mt-0.5 break-all leading-tight text-[#334155]">
                        <span className="text-[#64748b]">row:</span> {entry.childRowSummary.rowJson ?? "—"}
                    </div>
                </>
            :   null}
            <div className="flex gap-1 leading-tight">
                <span className="shrink-0 text-[#64748b]">status:</span>
                <span className="font-semibold" style={{ color: statusColor(entry.lastClickResult) }}>
                    {statusText}
                </span>
            </div>
            {showTestOpen && onTestOpen ?
                <button
                    type="button"
                    className="mt-1 rounded border border-[#94a3b8] bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#0f172a] hover:bg-[#e2e8f0]"
                    data-layout-runtime-link-test-open="true"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onTestOpen();
                    }}
                >
                    Test open
                </button>
            :   null}
        </div>
    );
}
