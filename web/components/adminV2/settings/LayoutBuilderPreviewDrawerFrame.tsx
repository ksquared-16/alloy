"use client";

import type { ReactNode } from "react";
import { DRAWER_OVERVIEW_PANEL_SURFACE } from "@/lib/layout/runtime/drawerOverviewCompositionStandard";
import { resolveLeadDrawerHeaderContext } from "@/lib/layout/runtime/resolveLeadDrawerHeaderContext";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    children: ReactNode;
    record?: ProofRuntimeRecord;
};

function previewTitle(record: ProofRuntimeRecord): string {
    const household = String(record.name ?? record["opportunity.name"] ?? "").trim();
    if (household) return household;
    const ctx = resolveLeadDrawerHeaderContext(record);
    return ctx.householdLabel || ctx.primaryContactLabel || "Lead preview";
}

function previewSubtitle(record: ProofRuntimeRecord): string | null {
    const ctx = resolveLeadDrawerHeaderContext(record);
    const parts = [ctx.primaryContactLabel, ctx.contactLine, ctx.householdLabel].filter(Boolean);
    const unique = [...new Set(parts)];
    return unique.length > 0 ? unique.join(" · ") : null;
}

/**
 * Preview-only drawer chrome — mirrors live drawer header anatomy.
 */
export default function LayoutBuilderPreviewDrawerFrame({ children, record }: Props) {
    const resolved = record ?? ({} as ProofRuntimeRecord);
    const title = previewTitle(resolved);
    const subtitle = previewSubtitle(resolved);
    const status =
        String(resolved._status_display ?? resolved["opportunity.status_key"] ?? resolved.status_key ?? "").trim()
        || "Inquiry";
    const location = String(resolved["opportunity.location"] ?? "").trim();

    return (
        <div
            className="overflow-hidden rounded-xl border border-alloy-stone/15 bg-[#F4F7FB] shadow-[0_2px_12px_rgba(24,39,58,0.06)]"
            data-testid="layout-builder-preview-drawer-frame"
        >
            <div className="border-b border-alloy-stone/10 bg-white px-4 py-3" data-testid="visual-editor-preview-shell">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="truncate text-base font-semibold text-alloy-midnight" data-testid="layout-builder-preview-title">
                            {title}
                        </h3>
                        {subtitle ?
                            <p className="mt-0.5 truncate text-xs text-alloy-midnight/55">{subtitle}</p>
                        :   null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2" data-testid="layout-builder-preview-header-actions">
                        <span className="rounded-md border border-alloy-forge/15 px-2 py-1 text-[10px] font-medium text-alloy-midnight/45">
                            Actions
                        </span>
                        <span className="rounded-md border border-alloy-forge/15 px-2 py-1 text-[10px] font-medium text-alloy-midnight/45">
                            Manage
                        </span>
                    </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-alloy-pine/10 px-2.5 py-0.5 text-[10px] font-medium text-alloy-pine">
                        {status}
                    </span>
                    {location ?
                        <span className="rounded-full bg-alloy-stone/30 px-2.5 py-0.5 text-[10px] text-alloy-midnight/55">
                            {location}
                        </span>
                    :   null}
                    <span className="rounded-full border border-alloy-forge/12 px-2.5 py-0.5 text-[10px] text-alloy-midnight/45">
                        Lifecycle
                    </span>
                </div>
                <div className="mt-3 flex gap-4 border-b border-alloy-stone/10 pb-0">
                    <span className="border-b-2 border-alloy-pine px-1 pb-2 text-xs font-semibold text-alloy-midnight">
                        Overview
                    </span>
                    <span className="pb-2 text-xs text-alloy-midnight/40">Details</span>
                    <span className="pb-2 text-xs text-alloy-midnight/40">Activity</span>
                </div>
            </div>

            <div className={`${DRAWER_OVERVIEW_PANEL_SURFACE} m-3 min-h-[320px] bg-white p-1`}>{children}</div>
        </div>
    );
}
