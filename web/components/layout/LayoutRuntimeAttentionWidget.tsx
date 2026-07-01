"use client";

import { DrawerHeaderAttentionBlock } from "@/components/admin/drawer/DrawerHeaderAttentionBlock";
import { isDrawerHeaderAttentionVisible } from "@/lib/admin/drawer/drawerHeaderAttentionPresentation";
import {
    LAYOUT_RUNTIME_ATTENTION_RAIL,
    LAYOUT_RUNTIME_PANEL_HEADER,
    LAYOUT_RUNTIME_PANEL_SURFACE,
} from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    record: ProofRuntimeRecord;
    title?: string;
};

function overviewFromRecord(record: ProofRuntimeRecord): Record<string, unknown> {
    if (record._overview_data && typeof record._overview_data === "object") {
        return record._overview_data as Record<string, unknown>;
    }
    const attention = String(record["opportunity.attention_reason"] ?? record._attention ?? "").trim();
    return {
        ...record,
        ...(attention ? { _attention: attention, "opportunity.attention_reason": attention } : {}),
    };
}

/** Queue/drawer attention widget — reuses drawer header attention when VM data exists. */
export default function LayoutRuntimeAttentionWidget({ record, title = "Attention" }: Props) {
    const overview = overviewFromRecord(record);
    const fallback = String(record["opportunity.attention_reason"] ?? record._attention ?? "").trim();

    if (!isDrawerHeaderAttentionVisible(overview) && !fallback) {
        return (
            <div
                className={`${LAYOUT_RUNTIME_PANEL_SURFACE} ${LAYOUT_RUNTIME_ATTENTION_RAIL}`}
                data-layout-runtime-attention-widget="true"
                data-queue-row-interactive="true"
            >
                <div className={LAYOUT_RUNTIME_PANEL_HEADER}>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-alloy-muted">{title}</span>
                </div>
                <div className="px-2.5 py-2 text-xs text-[#9aa4bf]">No attention flagged</div>
            </div>
        );
    }

    if (isDrawerHeaderAttentionVisible(overview)) {
        return (
            <div
                className={`${LAYOUT_RUNTIME_PANEL_SURFACE} ${LAYOUT_RUNTIME_ATTENTION_RAIL}`}
                data-layout-runtime-attention-widget="true"
                data-queue-row-interactive="true"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
            >
                <div className={LAYOUT_RUNTIME_PANEL_HEADER}>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-alloy-muted">{title}</span>
                </div>
                <div className="px-1 py-1">
                    <DrawerHeaderAttentionBlock overviewData={overview} />
                </div>
            </div>
        );
    }

    return (
        <div
            className={`${LAYOUT_RUNTIME_PANEL_SURFACE} ${LAYOUT_RUNTIME_ATTENTION_RAIL}`}
            data-layout-runtime-attention-widget="true"
            data-queue-row-interactive="true"
        >
            <div className={LAYOUT_RUNTIME_PANEL_HEADER}>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-alloy-muted">{title}</span>
            </div>
            <div className="px-2.5 py-2">
                <span className="operational-queue-row__attention-reason operational-queue-row__attention-widget">{fallback}</span>
            </div>
        </div>
    );
}
