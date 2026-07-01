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
} from "@/lib/layout/runtime/formatLayoutRuntimeRepeaterColumnDisplay";
import { layoutRuntimeRepeaterRowReactKey } from "@/lib/layout/runtime/layoutRuntimeRepeaterRowKey";
import {
    LAYOUT_RUNTIME_PROFILE_CARD_HEADER_ROW,
    LAYOUT_RUNTIME_PROFILE_CARD_LIST,
    LAYOUT_RUNTIME_PROFILE_CARD_META_DETAIL,
    LAYOUT_RUNTIME_PROFILE_CARD_META_PRIMARY,
    LAYOUT_RUNTIME_PROFILE_CARD_SURFACE,
} from "@/lib/layout/runtime/layoutRuntimeProfileCardStyles";
import { partitionLayoutRuntimeProfileCardMeta } from "@/lib/layout/runtime/partitionLayoutRuntimeProfileCardMeta";
import { resolveChildRowTemplateRowLayout } from "@/lib/layout/runtime/resolveChildRowTemplateRowLayout";
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
            :   <ul className={LAYOUT_RUNTIME_PROFILE_CARD_LIST}>
                    {rows.map((row, index) => {
                        const rowKey = layoutRuntimeRepeaterRowReactKey(row, index, item.source ?? item.refKey);
                        const nameCol = nameColumn!;
                        const nameSynthetic: LayoutItem = {
                            id: nameCol.refKey,
                            kind: "field",
                            refKey: nameCol.refKey,
                            adornment: nameCol.adornment,
                        };
                        const rowTemplate = resolveChildRowTemplateRowLayout(item);
                        const { headline, details } = partitionLayoutRuntimeProfileCardMeta(metaColumns);
                        const headlineSegments = headline
                            .map((col) => ({
                                key: col.refKey,
                                text: formatLayoutRuntimeRepeaterColumnDisplay(row, col),
                            }))
                            .filter((segment) => segment.text !== "—" && segment.text.trim().length > 0);
                        const detailSegments = details
                            .map((col) => ({
                                key: col.refKey,
                                text: formatLayoutRuntimeRepeaterColumnDisplay(row, col),
                            }))
                            .filter((segment) => segment.text !== "—" && segment.text.trim().length > 0);
                        const opportunityId = String(row["child.opportunity_id"] ?? "").trim();
                        const opportunityName = String(row["child.opportunity_name"] ?? "").trim();
                        const enrollmentStatus = String(row["child.enrollment_status"] ?? "").trim();
                        const childDisplayName = formatLayoutRuntimeRepeaterColumnDisplay(row, nameCol);
                        const childId = String(row["child.id"] ?? row.id ?? "").trim();
                        const childPhotoUrl = String(row["child.photo_url"] ?? row.photo_url ?? row.image_url ?? "").trim() || null;

                        return (
                            <li
                                key={rowKey}
                                className={LAYOUT_RUNTIME_PROFILE_CARD_SURFACE}
                                data-person-connected-child-card-row="true"
                            >
                                <div className={LAYOUT_RUNTIME_PROFILE_CARD_HEADER_ROW}>
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
                                                adornment={nameCol.adornment ?? null}
                                                suppressEntityIcon
                                                display={childDisplayName}
                                                onAction={onAdornmentAction}
                                                className={`block truncate hover:text-alloy-juniper ${PRESENTATION_DATA_VALUE_COMPACT}`}
                                            />
                                        :   <p className={`truncate ${PRESENTATION_DATA_VALUE_COMPACT}`}>
                                                {childDisplayName}
                                            </p>
                                        }
                                        {rowTemplate && rowTemplate.length > 0 ?
                                            rowTemplate.map((layoutRow, rowIndex) => {
                                                const slots = layoutRow.slots.filter(
                                                    (col): col is LayoutCollectionColumn => Boolean(col),
                                                );
                                                if (slots.length === 0) return null;
                                                const lineClass =
                                                    rowIndex === 0 ?
                                                        LAYOUT_RUNTIME_PROFILE_CARD_META_PRIMARY
                                                    :   LAYOUT_RUNTIME_PROFILE_CARD_META_DETAIL;
                                                return (
                                                    <div
                                                        key={rowIndex}
                                                        className={lineClass}
                                                        data-person-connected-child-meta-line={rowIndex}
                                                    >
                                                        {slots.map((col) => (
                                                            <span key={col.refKey} className="whitespace-nowrap">
                                                                {formatLayoutRuntimeRepeaterColumnDisplay(row, col)}
                                                            </span>
                                                        ))}
                                                    </div>
                                                );
                                            })
                                        :   <>
                                                {headlineSegments.length > 0 ?
                                                    <div
                                                        className={LAYOUT_RUNTIME_PROFILE_CARD_META_PRIMARY}
                                                        data-person-connected-child-meta-line="headline"
                                                    >
                                                        {headlineSegments.map((segment) => (
                                                            <span key={segment.key} className="whitespace-nowrap">
                                                                {segment.text}
                                                            </span>
                                                        ))}
                                                    </div>
                                                :   null}
                                                {detailSegments.length > 0 ?
                                                    <div
                                                        className={LAYOUT_RUNTIME_PROFILE_CARD_META_DETAIL}
                                                        data-person-connected-child-meta-line="details"
                                                    >
                                                        {detailSegments.map((segment) => (
                                                            <span key={segment.key}>{segment.text}</span>
                                                        ))}
                                                    </div>
                                                :   null}
                                            </>
                                        }
                                        {enrollmentStatus
                                        && !headlineSegments.some((segment) => segment.text.includes(enrollmentStatus))
                                        && !detailSegments.some((segment) => segment.text.includes(enrollmentStatus)) ?
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
