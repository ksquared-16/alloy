"use client";

import PersonDrawerIdentityAvatar from "@/components/admin/entity/PersonDrawerIdentityAvatar";
import LayoutRuntimeChildLinkSurface from "@/components/layout/LayoutRuntimeChildLinkSurface";
import LayoutRuntimePersonLinkSurface from "@/components/layout/LayoutRuntimePersonLinkSurface";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import type { LayoutCollectionColumn, LayoutItem } from "@/lib/layout/layoutV2";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    item: LayoutItem;
    columns: LayoutCollectionColumn[];
    rows: ProofRuntimeRecord[];
    anchorRecord: ProofRuntimeRecord;
    overflowFooter?: React.ReactNode;
    onAdornmentAction?: AdornmentActionHandler;
};

const PERSON_LINK_ITEM: LayoutItem = {
    id: "child-family-person-link",
    kind: "field",
    refKey: "person.primary_contact_name",
    adornment: { position: "left", icon: "person", action: { type: "open_drawer", entity: "person", idPath: "person.id" } },
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
                <PersonDrawerIdentityAvatar displayName={displayName} size="sm" />
                <div className="min-w-0 flex-1">
                    {sibling && childId ?
                        <LayoutRuntimeChildLinkSurface
                            componentName="ChildFamilyMembersCardList"
                            surface="drawer"
                            item={CHILD_LINK_ITEM}
                            childPersonId={childId}
                            rowRecord={row}
                            anchorRecord={anchorRecord}
                            adornment={CHILD_LINK_ITEM.adornment}
                            display={displayName}
                            onAction={onAdornmentAction}
                            className="block truncate text-[13px] font-semibold leading-snug text-alloy-midnight hover:text-[#0d9488]"
                        />
                    : personId ?
                        <LayoutRuntimePersonLinkSurface
                            componentName="ChildFamilyMembersCardList"
                            surface="drawer"
                            item={PERSON_LINK_ITEM}
                            personId={personId}
                            rowRecord={row}
                            anchorRecord={anchorRecord}
                            adornment={PERSON_LINK_ITEM.adornment}
                            display={displayName}
                            onAction={onAdornmentAction}
                            className="block truncate text-[13px] font-semibold leading-snug text-alloy-midnight hover:text-[#0d9488]"
                        />
                    :   <p className="truncate text-[13px] font-semibold leading-snug text-alloy-midnight/90">{displayName}</p>}
                    {metaLine ?
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-alloy-midnight/50">{metaLine}</p>
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
                className="px-4 py-5 text-[12px] leading-relaxed text-alloy-midnight/50"
                data-child-family-empty="true"
            >
                <p>No linked family members yet.</p>
                <p className="mt-1 text-[11px] text-alloy-midnight/40">
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
                            <h4 className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/45">
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
