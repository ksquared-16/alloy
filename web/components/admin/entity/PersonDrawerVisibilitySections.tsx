"use client";

import type { ReactNode } from "react";
import { buildPersonDrawerRelationshipGroups } from "@/lib/admin/person/buildPersonDrawerRelationshipGroups";
import { dedupePersonRelationshipLinks } from "@/lib/admin/person/dedupePersonRelationshipLinks";
import { resolvePersonDrawerPrimaryGuardian } from "@/lib/admin/person/personDrawerChildIdentity";
import { personDrawerRelationshipInputFromRecord } from "@/lib/admin/person/personDrawerRelationshipInput";
import {
    personDrawerRelationshipSectionHasContent,
    resolvePersonDrawerRelationshipSectionModel,
} from "@/lib/admin/person/personDrawerRelationshipSection";
import { resolvePersonDrawerPresentationEmphasis } from "@/lib/admin/person/personDrawerPresentationEmphasis";
import { primaryHouseholdLabel } from "@/lib/admin/person/personDrawerChildLifecycleSlots";
import { resolvePersonDrawerProfileFromRecord } from "@/components/admin/entity/PersonDrawerProfileBadges";
import type { PersonRelationshipLink } from "@/lib/admin/person/personDrawerVisibilityTypes";
import {
    oppInqEyebrow,
    oppInqInnerCardCompact,
    oppInqLeadSummaryShellClassName,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";

type OpenDrawer = (type: string, id: string) => void;

function guardianMatchesPrimary(
    row: PersonRelationshipLink,
    primary: ReturnType<typeof resolvePersonDrawerPrimaryGuardian>
): boolean {
    if (!primary) return false;
    if (primary.person_id && row.person_id === primary.person_id) return true;
    const rowName = row.display_name?.trim().toLowerCase();
    const primaryName = primary.display_name.trim().toLowerCase();
    return Boolean(rowName && primaryName && rowName === primaryName);
}

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
                    className="text-left font-semibold text-alloy-blue hover:underline"
                >
                    {label}
                </button>
            ) : row.customer_member_id && onOpenMember ? (
                <button
                    type="button"
                    onClick={() => onOpenMember(row.customer_member_id!)}
                    className="text-left font-semibold text-alloy-blue hover:underline"
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
        <div>
            <h5 className={`${oppInqEyebrow} mt-2.5 first:mt-0`}>{title}</h5>
            <ul className="mt-1.5 space-y-1.5">{children}</ul>
        </div>
    );
}

/** Profile-aware family section — household, guardians, siblings for child emphasis. */
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
    const childFamilyEmphasis = resolvePersonDrawerPresentationEmphasis(profile) === "child_lifecycle";
    const householdLabel = childFamilyEmphasis ? primaryHouseholdLabel(record) : null;
    const primaryGuardian = childFamilyEmphasis ? resolvePersonDrawerPrimaryGuardian(record) : null;

    if (
        !personDrawerRelationshipSectionHasContent(model, groups) &&
        !(childFamilyEmphasis && (householdLabel || primaryGuardian))
    ) {
        return null;
    }

    const openPerson = (id: string) => onOpenDrawer("persons", id);
    const openMember = (id: string) => onOpenDrawer("customer_members", id);
    const childGuardians = dedupePersonRelationshipLinks([...groups.parents, ...groups.guardians]);
    const additionalGuardians = primaryGuardian
        ? childGuardians.filter((row) => !guardianMatchesPrimary(row, primaryGuardian))
        : childGuardians.slice(1);
    const siblings = groups.siblings;

    if (childFamilyEmphasis) {
        const hasFamilyContent =
            householdLabel ||
            primaryGuardian ||
            additionalGuardians.length > 0 ||
            siblings.length > 0;

        if (!hasFamilyContent) return null;

        return (
            <div
                className={`${oppInqLeadSummaryShellClassName} mb-2`}
                data-person-drawer-relationships-grouped="true"
                data-person-drawer-family-emphasis="true"
            >
                <h4 className={`${oppInqEyebrow} px-0.5`}>Family & household</h4>
                <div className={`${oppInqInnerCardCompact} mt-2`} data-person-drawer-family-household="true">
                    {householdLabel ? (
                        <div>
                            <h5 className={oppInqEyebrow}>Household</h5>
                            <p className="mt-1 text-[14px] font-semibold text-alloy-midnight/90">{householdLabel}</p>
                        </div>
                    ) : null}
                    {primaryGuardian ? (
                        <GroupBlock title="Primary guardian">
                            <RelationshipLinkRow
                                row={{
                                    person_id: primaryGuardian.person_id,
                                    display_name: primaryGuardian.display_name,
                                    relationship_label: primaryGuardian.role_label,
                                }}
                                onOpenPerson={openPerson}
                            />
                        </GroupBlock>
                    ) : null}
                    {additionalGuardians.length > 0 ? (
                        <GroupBlock title="Other adults">
                            {additionalGuardians.map((row) => (
                                <RelationshipLinkRow
                                    key={row.person_id ?? row.display_name ?? "guardian"}
                                    row={row}
                                    onOpenPerson={openPerson}
                                />
                            ))}
                        </GroupBlock>
                    ) : null}
                    {siblings.length > 0 ? (
                        <GroupBlock title="Siblings">
                            {siblings.map((row) => (
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
            </div>
        );
    }

    return (
        <div className="space-y-2" data-person-drawer-relationships-grouped="true">
            {model.showParents && groups.parents.length > 0 ? (
                <div className={oppInqInnerCardCompact}>
                    <h4 className={oppInqEyebrow}>Parents</h4>
                    <ul className="mt-2 space-y-2">
                        {groups.parents.map((row) => (
                            <RelationshipLinkRow
                                key={row.person_id ?? row.display_name ?? "parent"}
                                row={row}
                                onOpenPerson={openPerson}
                            />
                        ))}
                    </ul>
                </div>
            ) : null}
            {model.showGuardians && groups.guardians.length > 0 ? (
                <div className={oppInqInnerCardCompact}>
                    <h4 className={oppInqEyebrow}>Guardians</h4>
                    <ul className="mt-2 space-y-2">
                        {groups.guardians.map((row) => (
                            <RelationshipLinkRow
                                key={row.person_id ?? row.display_name ?? "guardian"}
                                row={row}
                                onOpenPerson={openPerson}
                            />
                        ))}
                    </ul>
                </div>
            ) : null}
            {model.showEmergency && groups.emergency_contacts.length > 0 ? (
                <div className={oppInqInnerCardCompact}>
                    <h4 className={oppInqEyebrow}>Emergency contacts</h4>
                    <ul className="mt-2 space-y-2">
                        {groups.emergency_contacts.map((row) => (
                            <RelationshipLinkRow
                                key={row.person_id ?? row.display_name ?? "emergency"}
                                row={row}
                                onOpenPerson={openPerson}
                            />
                        ))}
                    </ul>
                </div>
            ) : null}
            {model.showChildren && groups.children.length > 0 ? (
                <div className={oppInqInnerCardCompact}>
                    <h4 className={oppInqEyebrow}>Children</h4>
                    <ul className="mt-2 space-y-2">
                        {groups.children.map((row) => (
                            <RelationshipLinkRow
                                key={row.person_id ?? row.customer_member_id ?? row.display_name ?? "child"}
                                row={row}
                                onOpenPerson={openPerson}
                                onOpenMember={openMember}
                            />
                        ))}
                    </ul>
                </div>
            ) : null}
            {model.showSiblings && siblings.length > 0 ? (
                <div className={oppInqInnerCardCompact}>
                    <h4 className={oppInqEyebrow}>{model.siblingsTitle}</h4>
                    <ul className="mt-2 space-y-2">
                        {siblings.map((row) => (
                            <RelationshipLinkRow
                                key={row.person_id ?? row.customer_member_id ?? row.display_name ?? "sibling"}
                                row={row}
                                onOpenPerson={openPerson}
                                onOpenMember={openMember}
                            />
                        ))}
                    </ul>
                </div>
            ) : null}
        </div>
    );
}
