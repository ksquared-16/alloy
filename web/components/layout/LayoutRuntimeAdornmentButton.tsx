"use client";

import AdornmentIcon from "@/components/layout/AdornmentIcon";
import type { LayoutFieldAdornment, LayoutItem } from "@/lib/layout/layoutV2";
import {
    logChildLinkStep,
    logPersonLinkStep,
    summarizeLayoutRuntimeLinkRow,
} from "@/lib/layout/runtime/childLinkBrowserTrace";
import { layoutRuntimeAdornmentEntityLabel } from "@/lib/layout/runtime/resolveLayoutRuntimeLinkedEntityId";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    item: LayoutItem;
    adornment: LayoutFieldAdornment;
    rowRecord?: ProofRuntimeRecord;
    onAction?: (item: LayoutItem, adornment: LayoutFieldAdornment, rowRecord?: ProofRuntimeRecord) => void;
    iconClassName?: string;
    className?: string;
    /** Trace surface when logging child/person link clicks. */
    traceSurface?: "queue" | "opportunity_drawer";
};

function logAdornmentClick(
    adornment: LayoutFieldAdornment,
    rowRecord: ProofRuntimeRecord | undefined,
    traceSurface: Props["traceSurface"],
) {
    const action = adornment.action;
    if (!action || action.type !== "open_drawer") return;
    const rowKey = rowRecord?.id != null ? String(rowRecord.id) : null;
    const payload = {
        surface: traceSurface ?? "queue",
        rowKey,
        row: summarizeLayoutRuntimeLinkRow(rowRecord),
        targetEntityType: action.entity,
        openMethod: "LayoutRuntimeAdornmentButton",
        hasOnAction: true,
    };
    if (action.entity === "child") {
        logChildLinkStep("click", payload);
    } else if (action.entity === "person") {
        logPersonLinkStep("click", payload);
    }
}

/** Linked layout adornment icon — button when action configured, static icon otherwise. */
export default function LayoutRuntimeAdornmentButton({
    item,
    adornment,
    rowRecord,
    onAction,
    iconClassName = "h-3.5 w-3.5",
    className = "inline-flex shrink-0 items-center rounded p-0.5 text-[#00458C] hover:bg-[#eef3fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#00458C]",
    traceSurface,
}: Props) {
    if (adornment.action && onAction) {
        const entity = layoutRuntimeAdornmentEntityLabel(adornment.action.entity);
        const title = `Open ${entity} record`;
        return (
            <button
                type="button"
                onPointerDown={(e) => {
                    e.stopPropagation();
                }}
                onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    logAdornmentClick(adornment, rowRecord, traceSurface);
                    onAction(item, adornment, rowRecord);
                }}
                title={title}
                aria-label={title}
                className={className}
                data-layout-runtime-adornment-link="true"
                data-layout-runtime-adornment-entity={adornment.action.entity}
            >
                <AdornmentIcon icon={adornment.icon} className={iconClassName} />
            </button>
        );
    }
    if (adornment.action?.type === "open_drawer" && adornment.action.entity === "child") {
        logChildLinkStep("click", {
            surface: traceSurface ?? "queue",
            rowKey: rowRecord?.id != null ? String(rowRecord.id) : null,
            row: summarizeLayoutRuntimeLinkRow(rowRecord),
            targetEntityType: adornment.action.entity,
            openMethod: "LayoutRuntimeAdornmentButton",
            hasOnAction: false,
            failureReason: "missing_onAction_or_static_icon",
        });
    }
    return (
        <span className="inline-flex shrink-0 items-center text-[rgba(39,63,82,0.55)]" aria-hidden>
            <AdornmentIcon icon={adornment.icon} className={iconClassName} />
        </span>
    );
}
