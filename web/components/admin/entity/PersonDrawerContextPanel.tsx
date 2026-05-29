"use client";

import RecordDrawerContextPanel from "@/components/admin/drawer/record/RecordDrawerContextPanel";
import { resolvePersonDrawerProfileFromRecord } from "@/components/admin/entity/PersonDrawerProfileBadges";
import { buildPersonDrawerRelationshipGroups } from "@/lib/admin/person/buildPersonDrawerRelationshipGroups";
import { personDrawerRelationshipPresentation } from "@/lib/admin/person/personDrawerPresentationProfile";
import type {
    PersonEnrollmentMirrorRow,
    PersonEnrollmentOpportunityRow,
    PersonSiblingLinkRow,
} from "@/lib/admin/person/personDrawerVisibilityTypes";
import { oppInqEyebrow } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { useMemo } from "react";

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

function CompactRelatedEnrollment({
    enrollmentOpps,
    enrollmentMirror,
    onOpenDrawer,
}: {
    enrollmentOpps: PersonEnrollmentOpportunityRow[];
    enrollmentMirror: PersonEnrollmentMirrorRow[];
    onOpenDrawer: OpenDrawer;
}) {
    const entries = useMemo(() => {
        const seen = new Set<string>();
        const out: Array<{
            id: string;
            name: string;
            status: string | null;
            detail: string | null;
        }> = [];

        for (const row of enrollmentOpps) {
            const id = String(row.opportunity_id ?? "").trim();
            if (!id || seen.has(id)) continue;
            seen.add(id);
            out.push({
                id,
                name: row.opportunity_name?.trim() || "Enrollment",
                status: row.status_label?.trim() || row.status_key?.trim() || null,
                detail: row.role_label?.trim() || null,
            });
        }

        for (const row of enrollmentMirror) {
            const id = String(row.opportunity_id ?? "").trim();
            if (!id || seen.has(id)) continue;
            seen.add(id);
            const detailParts = [row.outcome_status_label, row.program_label].filter(Boolean).map(String);
            out.push({
                id,
                name: row.opportunity_name?.trim() || "Enrollment",
                status:
                    row.opportunity_status_label?.trim() ||
                    row.opportunity_status_key?.trim() ||
                    row.outcome_status_label?.trim() ||
                    null,
                detail: detailParts.length > 0 ? detailParts.join(" · ") : null,
            });
        }

        return out.slice(0, 3);
    }, [enrollmentOpps, enrollmentMirror]);

    if (entries.length === 0) return null;

    return (
        <div data-person-drawer-related-enrollment="true">
            <p className={oppInqEyebrow}>Related enrollment</p>
            <ul className="mt-1 space-y-1 text-[12px] leading-snug text-alloy-midnight/75">
                {entries.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-baseline gap-x-1.5">
                        <button
                            type="button"
                            onClick={() => onOpenDrawer("opportunities", entry.id)}
                            className="font-semibold text-alloy-blue hover:underline"
                        >
                            {entry.name}
                        </button>
                        {entry.status ? <span className="text-alloy-midnight/45">· {entry.status}</span> : null}
                        {entry.detail ? <span className="text-alloy-midnight/45">· {entry.detail}</span> : null}
                    </li>
                ))}
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
    const hasRelatedEnrollment = enrollmentMirror.length > 0 || enrollmentOpps.length > 0;
    const hasAssociated = personHasAssociatedPeople(record);

    if (!hasRelatedEnrollment && !hasAssociated) {
        return null;
    }

    return (
        <RecordDrawerContextPanel data-record-drawer-context="person-operational" variant="lead-summary">
            <div className="space-y-1.5">
                {hasRelatedEnrollment ? (
                    <CompactRelatedEnrollment
                        enrollmentOpps={enrollmentOpps}
                        enrollmentMirror={enrollmentMirror}
                        onOpenDrawer={onOpenDrawer}
                    />
                ) : null}
                {hasAssociated ? (
                    <CompactAssociatedPeople record={record} onOpenDrawer={onOpenDrawer} />
                ) : null}
            </div>
        </RecordDrawerContextPanel>
    );
}
