"use client";

/**
 * Reserves the right command rail width before registry actions resolve (enrollment dept / WU).
 * Matches `ActionsBlock` rail chrome; no spinners — shimmer bars only.
 */
export function WorkspaceActionsRailPlaceholder() {
    return (
        <section
            className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-command-section--primary"
            aria-busy="true"
            aria-label="Actions loading"
        >
            <h3 className="adminv2-ws-actions-rail-title">Actions</h3>
            <div className="adminv2-ws-actions-rail-list adminv2-ws-actions-rail-list--column gap-2">
                <div className="adminv2-ws-rail-ph-btn adminv2-shimmer-bar h-9 w-full rounded-md bg-alloy-stone/18" />
                <div className="adminv2-ws-rail-ph-btn adminv2-shimmer-bar h-9 w-full rounded-md bg-alloy-stone/16" />
                <div className="adminv2-ws-rail-ph-btn adminv2-shimmer-bar h-9 w-[92%] rounded-md bg-alloy-stone/14" />
            </div>
        </section>
    );
}
