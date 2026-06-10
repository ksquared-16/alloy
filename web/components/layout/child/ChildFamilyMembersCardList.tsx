"use client";

import DrawerHouseholdChildLinkAvatar from "@/components/layout/DrawerHouseholdChildLinkAvatar";
import DrawerHouseholdPersonLinkAvatar, {
    DRAWER_HOUSEHOLD_PERSON_LINK_ITEM,
} from "@/components/layout/DrawerHouseholdPersonLinkAvatar";
import LayoutRuntimeChildLinkSurface from "@/components/layout/LayoutRuntimeChildLinkSurface";
import LayoutRuntimePersonLinkSurface from "@/components/layout/LayoutRuntimePersonLinkSurface";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import type { LayoutCollectionColumn, LayoutItem } from "@/lib/layout/layoutV2";
import { personDrawerHouseholdInitials } from "@/lib/admin/person/personDrawerHouseholdDisplay";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    PRESENTATION_DATA_VALUE_COMPACT,
    PRESENTATION_EMPTY_STATE,
    PRESENTATION_EMPTY_STATE_SOFT,
    PRESENTATION_LABEL,
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

const CHILD_LINK_ITEM: LayoutItem = {
    id: "child-family-sibling-link",
    kind: "field",
    refKey: "child.name",
    adornment: { position: "left", icon: "child", action: { type: "open_drawer", entity: "child", idPath: "child.id" } },
};

function memberKind(row: ProofRuntimeRecord): string {
    return String(row._layout_runtime_family_member_kind ?? "guardian");
}

function isSiblingRow(row: ProofRuntimeRecord): boolean {
    return (
        row._layout_runtime_family_member_type === "child"
        || memberKind(row) === "sibling"
    );
}

function groupLabel(kind: string): string {
    switch (kind) {
        case "guardian":
            return "Parents / guardians";
        case "emergency":
            return "Emergency contacts";
        case "pickup":
            return "Authorized pickup";
        case "sibling":
            return "Siblings";
        case "other_adult":
            return "Other household adults";
        default:
            return "Family members";
    }
}

function FamilyMemberCard({
    row,
    anchorRecord,
    onAdornmentAction,
}: {
    row: ProofRuntimeRecord;
    anchorRecord: ProofRuntimeRecord;
    onAdornmentAction?: AdornmentActionHandler;
}) {
    const sibling = isSiblingRow(row);
    const displayName = String(
        sibling ? row["child.name"] ?? row["person.primary_contact_name"] : row["person.primary_contact_name"] ?? "—",
    ).trim();
    const role = String(row["person.household_role"] ?? "").trim();
    const meta = String(row._layout_runtime_family_meta ?? "").trim();
    const phone = String(row["person.primary_phone"] ?? "").trim();
    const email = String(row["person.primary_email"] ?? "").trim();
    const personId = String(row["person.id"] ?? row.person_id ?? "").trim();
    const childId = String(row["child.id"] ?? row.person_id ?? "").trim();
    const metaLine = [role, meta, phone, email].filter(Boolean).join(" · ");

    return (
        <li
            className="rounded-lg border border-alloy-stone/12 bg-white px-3 py-2 shadow-[0_1px_2px_rgba(24,39,58,0.03)]"
            data-child-family-member-card="true"
            data-child-family-member-kind={memberKind(row)}
        >
            <div className="flex items-start gap-2.5">
                {sibling ?
                    <DrawerHouseholdChildLinkAvatar
                        childId={childId}
                        displayName={displayName}
                        initials={personDrawerHouseholdInitials(displayName)}
                        rowRecord={row}
                        onAdornmentAction={onAdornmentAction}
                        componentName="ChildFamilyMembersCardList"
                    />
                :   <DrawerHouseholdPersonLinkAvatar
                        personId={personId}
                        displayName={displayName}
                        initials={personDrawerHouseholdInitials(displayName)}
                        rowRecord={row}
                        onAdornmentAction={onAdornmentAction}
                        componentName="ChildFamilyMembersCardList"
                    />
                }
                <div className="min-w-0 flex-1">
                    {sibling && childId ?
                        <LayoutRuntimeChildLinkSurface
                            componentName="ChildFamilyMembersCardList"
                            surface="drawer"
                            item={CHILD_LINK_ITEM}
                            rowRecord={row}
                            anchorRecord={anchorRecord}
                            adornment={CHILD_LINK_ITEM.adornment}
                            display={displayName}
                            onAction={onAdornmentAction}
                            className={`block truncate hover:text-alloy-juniper ${PRESENTATION_DATA_VALUE_COMPACT}`}
                        />
                    : personId ?
                        <LayoutRuntimePersonLinkSurface
                            componentName="ChildFamilyMembersCardList"
                            surface="drawer"
                            item={DRAWER_HOUSEHOLD_PERSON_LINK_ITEM}
                            personId={personId}
                            rowRecord={row}
                            anchorRecord={anchorRecord}
                            adornment={DRAWER_HOUSEHOLD_PERSON_LINK_ITEM.adornment}
                            display={displayName}
                            onAction={onAdornmentAction}
                            className={`block truncate hover:text-alloy-juniper ${PRESENTATION_DATA_VALUE_COMPACT}`}
                        />
                    :   <p className={`truncate ${PRESENTATION_DATA_VALUE_COMPACT}`}>{displayName}</p>}
                    {metaLine ?
                        <p className={`mt-0.5 line-clamp-2 ${PRESENTATION_SUPPORTING}`}>{metaLine}</p>
                    :   null}
                </div>
            </div>
        </li>
    );
}

/** Child family section — grouped card list (guardians, emergency, siblings). */
export default function ChildFamilyMembersCardList({
    rows,
    anchorRecord,
    overflowFooter,
    onAdornmentAction,
}: Props) {
    if (rows.length === 0) {
        return (
            <div
                className={`px-4 py-5 ${PRESENTATION_EMPTY_STATE}`}
                data-child-family-empty="true"
            >
                <p>No linked family members yet.</p>
                <p className={`mt-1 ${PRESENTATION_EMPTY_STATE_SOFT}`}>
                    Add parents, guardians, and emergency contacts on the household record, or open the Family Lead to
                    manage enrollment contacts.
                </p>
            </div>
        );
    }

    const order = ["guardian", "emergency", "pickup", "other_adult", "sibling"];
    const grouped = new Map<string, ProofRuntimeRecord[]>();
    for (const row of rows) {
        const kind = isSiblingRow(row) ? "sibling" : memberKind(row);
        const bucket = grouped.get(kind) ?? [];
        bucket.push(row);
        grouped.set(kind, bucket);
    }

    return (
        <div className="min-w-0" data-child-family-card-list="true">
            <div className="flex flex-col gap-3 p-2">
                {order.map((kind) => {
                    const members = grouped.get(kind);
                    if (!members?.length) return null;
                    return (
                        <section key={kind} data-child-family-group={kind}>
                            <h4 className={`mb-1.5 px-1 ${PRESENTATION_LABEL}`}>
                                {groupLabel(kind)}
                            </h4>
                            <ul className="flex flex-col gap-2">
                                {members.map((row, index) => (
                                    <FamilyMemberCard
                                        key={String(row.id ?? `${kind}-${index}`)}
                                        row={row}
                                        anchorRecord={anchorRecord}
                                        onAdornmentAction={onAdornmentAction}
                                    />
                                ))}
                            </ul>
                        </section>
                    );
                })}
            </div>
            {overflowFooter}
        </div>
    );
}
