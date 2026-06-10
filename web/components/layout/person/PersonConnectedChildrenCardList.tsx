"use client";

import type { LayoutCollectionColumn, LayoutItem } from "@/lib/layout/layoutV2";
import LayoutRuntimeChildLinkSurface from "@/components/layout/LayoutRuntimeChildLinkSurface";
import LayoutRuntimeEnrollmentLeadLink from "@/components/layout/LayoutRuntimeEnrollmentLeadLink";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import {
    formatLayoutRuntimeRepeaterColumnDisplay,
    formatPersonConnectedChildMetaLine,
} from "@/lib/layout/runtime/formatLayoutRuntimeRepeaterColumnDisplay";
import { layoutRuntimeRepeaterRowReactKey } from "@/lib/layout/runtime/layoutRuntimeRepeaterRowKey";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    item: LayoutItem;
    columns: LayoutCollectionColumn[];
    rows: ProofRuntimeRecord[];
    anchorRecord: ProofRuntimeRecord;
    overflowFooter?: React.ReactNode;
    onAdornmentAction?: AdornmentActionHandler;
};

/**
 * Compact connected-children card list — read-first operational rows (not an editable table).
 */
export default function PersonConnectedChildrenCardList({
    item,
    columns,
    rows,
    anchorRecord,
    overflowFooter,
    onAdornmentAction,
}: Props) {
    const nameColumn =
        columns.find((c) => c.refKey === "child.name" || c.adornment?.action?.entity === "child") ?? columns[0];
    const metaColumns = columns.filter((c) => c !== nameColumn);

    return (
        <div
            className="min-w-0"
            data-person-connected-children-card-list="true"
            data-layout-runtime-connected-children-read-mode="card-list"
        >
            {rows.length === 0 ?
                <div className="px-4 py-5 text-[12px] leading-snug text-alloy-midnight/40">No children linked yet.</div>
            :   <ul className="flex flex-col gap-2 p-2">
                    {rows.map((row, index) => {
                        const rowKey = layoutRuntimeRepeaterRowReactKey(row, index, item.source ?? item.refKey);
                        const nameCol = nameColumn!;
                        const nameSynthetic: LayoutItem = {
                            id: nameCol.refKey,
                            kind: "field",
                            refKey: nameCol.refKey,
                            adornment: nameCol.adornment,
                        };
                        const metaLine = formatPersonConnectedChildMetaLine(row, metaColumns);
                        const opportunityId = String(row["child.opportunity_id"] ?? "").trim();
                        const opportunityName = String(row["child.opportunity_name"] ?? "").trim();
                        const enrollmentStatus = String(row["child.enrollment_status"] ?? "").trim();

                        return (
                            <li
                                key={rowKey}
                                className="rounded-lg border border-alloy-stone/12 bg-white px-3 py-2 shadow-[0_1px_2px_rgba(24,39,58,0.03)] transition-shadow hover:shadow-[0_2px_6px_rgba(24,39,58,0.06)]"
                                data-person-connected-child-card-row="true"
                            >
                                <div className="min-w-0">
                                    <LayoutRuntimeChildLinkSurface
                                        componentName="PersonConnectedChildrenCardList"
                                        surface="drawer"
                                        item={nameSynthetic}
                                        rowRecord={row}
                                        anchorRecord={anchorRecord}
                                        adornment={nameCol.adornment}
                                        display={formatLayoutRuntimeRepeaterColumnDisplay(row, nameCol)}
                                        onAction={onAdornmentAction}
                                        className="block truncate text-[13px] font-semibold leading-snug text-alloy-midnight hover:text-[#0d9488]"
                                    />
                                    {metaColumns.length > 0 && metaLine ?
                                        <p
                                            className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-alloy-midnight/50"
                                            data-person-connected-child-meta-line="true"
                                        >
                                            {metaLine}
                                        </p>
                                    :   null}
                                    {enrollmentStatus && !metaLine.includes(enrollmentStatus) ?
                                        <p className="mt-0.5 text-[11px] text-alloy-midnight/45">{enrollmentStatus}</p>
                                    :   null}
                                    {opportunityId ?
                                        <div className="mt-1.5">
                                            <LayoutRuntimeEnrollmentLeadLink
                                                opportunityId={opportunityId}
                                                label="Open Family Lead"
                                                detail={opportunityName || null}
                                            />
                                        </div>
                                    :   null}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            }
            {overflowFooter}
        </div>
    );
}
