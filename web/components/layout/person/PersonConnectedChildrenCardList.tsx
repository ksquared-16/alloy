"use client";

import type { LayoutCollectionColumn, LayoutItem } from "@/lib/layout/layoutV2";
import DrawerOverviewEmptyState from "@/components/layout/DrawerOverviewEmptyState";
import DrawerHouseholdChildLinkAvatar from "@/components/layout/DrawerHouseholdChildLinkAvatar";
import LayoutRuntimeChildLinkSurface from "@/components/layout/LayoutRuntimeChildLinkSurface";
import LayoutRuntimeEnrollmentLeadLink from "@/components/layout/LayoutRuntimeEnrollmentLeadLink";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import { personDrawerHouseholdInitials } from "@/lib/admin/person/personDrawerHouseholdDisplay";
import {
    formatLayoutRuntimeRepeaterColumnDisplay,
    formatPersonConnectedChildMetaLine,
} from "@/lib/layout/runtime/formatLayoutRuntimeRepeaterColumnDisplay";
import { layoutRuntimeRepeaterRowReactKey } from "@/lib/layout/runtime/layoutRuntimeRepeaterRowKey";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    PRESENTATION_DATA_VALUE_COMPACT,
    PRESENTATION_SUPPORTING,
} from "@/lib/presentation/presentationTypography";

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
                <div className="p-2">
                    <DrawerOverviewEmptyState message="No children linked yet." compact />
                </div>
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
                        const childDisplayName = formatLayoutRuntimeRepeaterColumnDisplay(row, nameCol);
                        const childId = String(row["child.id"] ?? row.id ?? "").trim();
                        const childPhotoUrl = String(row["child.photo_url"] ?? row.photo_url ?? row.image_url ?? "").trim() || null;

                        return (
                            <li
                                key={rowKey}
                                className="rounded-lg border border-alloy-stone/12 bg-white px-3 py-2 shadow-[0_1px_2px_rgba(24,39,58,0.03)] transition-shadow hover:shadow-[0_2px_6px_rgba(24,39,58,0.06)]"
                                data-person-connected-child-card-row="true"
                            >
                                <div className="flex items-start gap-2.5">
                                    <DrawerHouseholdChildLinkAvatar
                                        childId={childId}
                                        displayName={childDisplayName}
                                        initials={personDrawerHouseholdInitials(childDisplayName)}
                                        photoUrl={childPhotoUrl}
                                        rowRecord={row}
                                        onAdornmentAction={onAdornmentAction}
                                        componentName="PersonConnectedChildrenCardList"
                                    />
                                    <div className="min-w-0 flex-1">
                                        {childId ?
                                            <LayoutRuntimeChildLinkSurface
                                                componentName="PersonConnectedChildrenCardList"
                                                surface="drawer"
                                                item={nameSynthetic}
                                                rowRecord={row}
                                                anchorRecord={anchorRecord}
                                                adornment={null}
                                                display={childDisplayName}
                                                onAction={onAdornmentAction}
                                                className={`block truncate hover:text-alloy-juniper ${PRESENTATION_DATA_VALUE_COMPACT}`}
                                            />
                                        :   <p className={`truncate ${PRESENTATION_DATA_VALUE_COMPACT}`}>
                                                {childDisplayName}
                                            </p>
                                        }
                                        {metaColumns.length > 0 && metaLine ?
                                            <p
                                                className={`mt-0.5 line-clamp-2 ${PRESENTATION_SUPPORTING}`}
                                                data-person-connected-child-meta-line="true"
                                            >
                                                {metaLine}
                                            </p>
                                        :   null}
                                        {enrollmentStatus && !metaLine.includes(enrollmentStatus) ?
                                            <p className={`mt-0.5 ${PRESENTATION_SUPPORTING}`}>{enrollmentStatus}</p>
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
