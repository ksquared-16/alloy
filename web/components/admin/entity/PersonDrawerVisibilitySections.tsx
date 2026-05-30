"use client";

import type { ReactNode } from "react";
import { buildPersonDrawerRelationshipGroups } from "@/lib/admin/person/buildPersonDrawerRelationshipGroups";
import { personDrawerRelationshipInputFromRecord } from "@/lib/admin/person/personDrawerRelationshipInput";
import {
    personDrawerRelationshipSectionHasContent,
    resolvePersonDrawerRelationshipSectionModel,
} from "@/lib/admin/person/personDrawerRelationshipSection";
import { resolvePersonDrawerProfileFromRecord } from "@/components/admin/entity/PersonDrawerProfileBadges";
import {
    oppInqEyebrow,
    oppInqInnerCardCompact,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";

type OpenDrawer = (type: string, id: string) => void;

function RelationshipLinkRow({
    row,
    onOpenPerson,
    onOpenMember,
}: {
    row: {
        person_id: string | null;
        customer_member_id?: string | null;
        display_name: string | null;
        relationship_label: string | null;
    };
    onOpenPerson: (id: string) => void;
    onOpenMember?: (id: string) => void;
}) {
    const label = row.display_name?.trim() || "Unnamed";
    return (
        <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px] leading-snug">
            {row.person_id ? (
                <button
                    type="button"
                    onClick={() => onOpenPerson(row.person_id!)}
                    className="font-semibold text-alloy-blue hover:underline text-left"
                >
                    {label}
                </button>
            ) : row.customer_member_id && onOpenMember ? (
                <button
                    type="button"
                    onClick={() => onOpenMember(row.customer_member_id!)}
                    className="font-semibold text-alloy-blue hover:underline text-left"
                >
                    {label}
                </button>
            ) : (
                <span className="font-medium text-alloy-midnight/85">{label}</span>
            )}
            {row.relationship_label ? (
                <span className="text-[11px] text-alloy-midnight/45">{row.relationship_label}</span>
            ) : null}
        </li>
    );
}

function GroupBlock({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className={oppInqInnerCardCompact}>
            <h4 className={oppInqEyebrow}>{title}</h4>
            <ul className="mt-2 space-y-2">{children}</ul>
        </div>
    );
}

/** Profile-aware family/children relationship section for person drawer overview. */
export function PersonDrawerRelationshipsOverview({
    record,
    onOpenDrawer,
}: {
    record: Record<string, unknown>;
    onOpenDrawer: OpenDrawer;
}) {
    const profile = resolvePersonDrawerProfileFromRecord(record);
    const groups = buildPersonDrawerRelationshipGroups(personDrawerRelationshipInputFromRecord(record));
    const model = resolvePersonDrawerRelationshipSectionModel(profile, groups);

    if (!personDrawerRelationshipSectionHasContent(model, groups)) {
        return null;
    }

    const openPerson = (id: string) => onOpenDrawer("persons", id);
    const openMember = (id: string) => onOpenDrawer("customer_members", id);

    return (
        <div className="space-y-2" data-person-drawer-relationships-grouped="true">
            {model.showParents && groups.parents.length > 0 ? (
                <GroupBlock title="Parents">
                    {groups.parents.map((row) => (
                        <RelationshipLinkRow
                            key={row.person_id ?? row.display_name ?? "parent"}
                            row={row}
                            onOpenPerson={openPerson}
                        />
                    ))}
                </GroupBlock>
            ) : null}
            {model.showGuardians && groups.guardians.length > 0 ? (
                <GroupBlock title="Guardians">
                    {groups.guardians.map((row) => (
                        <RelationshipLinkRow
                            key={row.person_id ?? row.display_name ?? "guardian"}
                            row={row}
                            onOpenPerson={openPerson}
                        />
                    ))}
                </GroupBlock>
            ) : null}
            {model.showEmergency && groups.emergency_contacts.length > 0 ? (
                <GroupBlock title="Emergency contacts">
                    {groups.emergency_contacts.map((row) => (
                        <RelationshipLinkRow
                            key={row.person_id ?? row.display_name ?? "emergency"}
                            row={row}
                            onOpenPerson={openPerson}
                        />
                    ))}
                </GroupBlock>
            ) : null}
            {model.showChildren && groups.children.length > 0 ? (
                <GroupBlock title="Children">
                    {groups.children.map((row) => (
                        <RelationshipLinkRow
                            key={row.person_id ?? row.customer_member_id ?? row.display_name ?? "child"}
                            row={row}
                            onOpenPerson={openPerson}
                            onOpenMember={openMember}
                        />
                    ))}
                </GroupBlock>
            ) : null}
            {model.showSiblings && groups.siblings.length > 0 ? (
                <GroupBlock title={model.siblingsTitle}>
                    {groups.siblings.map((row) => (
                        <RelationshipLinkRow
                            key={row.person_id ?? row.customer_member_id ?? row.display_name ?? "sibling"}
                            row={row}
                            onOpenPerson={openPerson}
                            onOpenMember={openMember}
                        />
                    ))}
                </GroupBlock>
            ) : null}
        </div>
    );
}
