"use client";

import RecordDrawerContextPanel from "@/components/admin/drawer/record/RecordDrawerContextPanel";
import {
    PersonDrawerEnrollmentMirror,
    PersonDrawerEnrollmentOpportunitiesMirror,
} from "@/components/admin/entity/PersonDrawerVisibilitySections";
import { resolvePersonDrawerProfileFromRecord } from "@/components/admin/entity/PersonDrawerProfileBadges";
import { buildPersonDrawerRelationshipGroups } from "@/lib/admin/person/buildPersonDrawerRelationshipGroups";
import { personDrawerRelationshipPresentation } from "@/lib/admin/person/personDrawerPresentationProfile";
import type {
    PersonEnrollmentMirrorRow,
    PersonEnrollmentOpportunityRow,
    PersonSiblingLinkRow,
} from "@/lib/admin/person/personDrawerVisibilityTypes";
import { oppInqEyebrow } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";

type OpenDrawer = (type: string, id: string) => void;

function personHasAssociatedPeople(record: Record<string, unknown>): boolean {
    const profile = resolvePersonDrawerProfileFromRecord(record);
    const { hideEmergency, hideSiblings } = personDrawerRelationshipPresentation(profile);
    const groups = buildPersonDrawerRelationshipGroups({
        person_id: String(record.id ?? ""),
        customer_persons:
            (record._customer_persons as Parameters<typeof buildPersonDrawerRelationshipGroups>[0]["customer_persons"]) ??
            [],
        person_relationships:
            (record._person_relationships as Parameters<typeof buildPersonDrawerRelationshipGroups>[0]["person_relationships"]) ??
            [],
        sibling_links: (record._sibling_links as PersonSiblingLinkRow[]) ?? [],
    });
    return (
        groups.children.length +
            groups.parents.length +
            groups.guardians.length +
            (hideEmergency ? 0 : groups.emergency_contacts.length) +
            (hideSiblings ? 0 : groups.siblings.length) >
        0
    );
}

function CompactAssociatedPeople({
    record,
    onOpenDrawer,
}: {
    record: Record<string, unknown>;
    onOpenDrawer: OpenDrawer;
}) {
    const profile = resolvePersonDrawerProfileFromRecord(record);
    const { hideEmergency, hideSiblings, siblingsGroupTitle } = personDrawerRelationshipPresentation(profile);
    const groups = buildPersonDrawerRelationshipGroups({
        person_id: String(record.id ?? ""),
        customer_persons:
            (record._customer_persons as Parameters<typeof buildPersonDrawerRelationshipGroups>[0]["customer_persons"]) ??
            [],
        person_relationships:
            (record._person_relationships as Parameters<typeof buildPersonDrawerRelationshipGroups>[0]["person_relationships"]) ??
            [],
        sibling_links: (record._sibling_links as PersonSiblingLinkRow[]) ?? [],
    });

    const rows = [
        ...groups.children.map((r) => ({ ...r, group: "Children" as const })),
        ...groups.parents.map((r) => ({ ...r, group: "Parents" as const })),
        ...groups.guardians.map((r) => ({ ...r, group: "Guardians" as const })),
        ...(!hideEmergency ? groups.emergency_contacts.map((r) => ({ ...r, group: "Emergency" as const })) : []),
        ...(!hideSiblings ? groups.siblings.map((r) => ({ ...r, group: siblingsGroupTitle as "Siblings" | "Children" })) : []),
    ].slice(0, 5);

    if (rows.length === 0) return null;

    return (
        <div data-person-drawer-associated-people="true">
            <p className={oppInqEyebrow}>Associated people</p>
            <ul className="mt-1 space-y-1 text-[12px] leading-snug text-alloy-midnight/75">
                {rows.map((row) => {
                    const label = row.display_name?.trim() || "Unnamed";
                    const key = row.person_id ?? row.customer_member_id ?? label;
                    return (
                        <li key={key} className="flex flex-wrap items-baseline gap-x-1.5">
                            {row.person_id ? (
                                <button
                                    type="button"
                                    onClick={() => onOpenDrawer("persons", row.person_id!)}
                                    className="font-semibold text-alloy-blue hover:underline"
                                >
                                    {label}
                                </button>
                            ) : (
                                <span className="font-medium text-alloy-midnight/85">{label}</span>
                            )}
                            <span className="text-alloy-midnight/45">· {row.group}</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/** Operational context only — lead-summary style; no identity repetition. */
export default function PersonDrawerContextPanel({
    record,
    onOpenDrawer,
}: {
    record: Record<string, unknown>;
    onOpenDrawer: OpenDrawer;
}) {
    const enrollmentMirror = (record._enrollment_mirror as PersonEnrollmentMirrorRow[]) ?? [];
    const enrollmentOpps = (record._enrollment_opportunities as PersonEnrollmentOpportunityRow[]) ?? [];
    const latestInquiry = enrollmentOpps[0] ?? null;

    const hasEnrollmentMirror = enrollmentMirror.length > 0;
    const hasLatestInquiry = Boolean(latestInquiry);
    const hasAssociated = personHasAssociatedPeople(record);

    if (!hasEnrollmentMirror && !hasLatestInquiry && !hasAssociated) {
        return null;
    }

    return (
        <RecordDrawerContextPanel data-record-drawer-context="person-operational" variant="lead-summary">
            <div className="space-y-2">
                {hasLatestInquiry ? (
                    <div data-person-drawer-latest-inquiry="true">
                        <p className={oppInqEyebrow}>Latest inquiry</p>
                        <PersonDrawerEnrollmentOpportunitiesMirror
                            rows={[latestInquiry!]}
                            onOpenDrawer={onOpenDrawer}
                        />
                    </div>
                ) : null}
                {hasEnrollmentMirror ? (
                    <div data-person-drawer-enrollment-activity="true">
                        <p className={oppInqEyebrow}>Enrollment activity</p>
                        <PersonDrawerEnrollmentMirror rows={enrollmentMirror.slice(0, 2)} onOpenDrawer={onOpenDrawer} />
                    </div>
                ) : null}
                {hasAssociated ? (
                    <CompactAssociatedPeople record={record} onOpenDrawer={onOpenDrawer} />
                ) : null}
            </div>
        </RecordDrawerContextPanel>
    );
}
