"use client";

import RecordDrawerContextPanel from "@/components/admin/drawer/record/RecordDrawerContextPanel";
import { resolvePersonDrawerProfileFromRecord } from "@/components/admin/entity/PersonDrawerProfileBadges";
import { buildPersonDrawerRelationshipGroups } from "@/lib/admin/person/buildPersonDrawerRelationshipGroups";
import {
    personDrawerShowsChildLifecycleSurface,
    primaryEnrollmentHint,
} from "@/lib/admin/person/personDrawerChildLifecycleSlots";
import { personDrawerRelationshipInputFromRecord } from "@/lib/admin/person/personDrawerRelationshipInput";
import {
    resolvePersonDrawerRelationshipSectionModel,
} from "@/lib/admin/person/personDrawerRelationshipSection";

import { oppInqEyebrow } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";

type OpenDrawer = (type: string, id: string) => void;

const MAX_QUICK_LINKS = 4;

type QuickLinkRow = {
    key: string;
    label: string;
    group: string;
    person_id?: string | null;
    opportunity_id?: string | null;
};

/** Compact quick links — subset of body relationship section; no duplicate enrollment detail. */
export function buildPersonDrawerQuickLinks(record: Record<string, unknown>): QuickLinkRow[] | null {
    const profile = resolvePersonDrawerProfileFromRecord(record);
    const groups = buildPersonDrawerRelationshipGroups(personDrawerRelationshipInputFromRecord(record));
    const model = resolvePersonDrawerRelationshipSectionModel(profile, groups);
    const childLifecycle = personDrawerShowsChildLifecycleSurface(profile);

    const rows: QuickLinkRow[] = [];

    if (model.showChildren) {
        for (const r of groups.children) {
            rows.push({
                key: r.person_id ?? r.customer_member_id ?? r.display_name ?? "child",
                label: r.display_name?.trim() || "Unnamed",
                group: "Child",
                person_id: r.person_id,
            });
        }
    }
    if (model.showParents) {
        for (const r of groups.parents) {
            rows.push({
                key: r.person_id ?? r.display_name ?? "parent",
                label: r.display_name?.trim() || "Unnamed",
                group: "Parent",
                person_id: r.person_id,
            });
        }
    }
    if (model.showGuardians) {
        for (const r of groups.guardians) {
            rows.push({
                key: r.person_id ?? r.display_name ?? "guardian",
                label: r.display_name?.trim() || "Unnamed",
                group: "Guardian",
                person_id: r.person_id,
            });
        }
    }
    if (model.showEmergency) {
        for (const r of groups.emergency_contacts) {
            rows.push({
                key: r.person_id ?? r.display_name ?? "emergency",
                label: r.display_name?.trim() || "Unnamed",
                group: "Emergency",
                person_id: r.person_id,
            });
        }
    }
    if (model.showSiblings) {
        for (const r of groups.siblings) {
            rows.push({
                key: r.person_id ?? r.customer_member_id ?? r.display_name ?? "sibling",
                label: r.display_name?.trim() || "Unnamed",
                group: model.siblingsTitle.replace(/s$/, ""),
                person_id: r.person_id,
            });
        }
    }

    if (childLifecycle) {
        const enrollment = primaryEnrollmentHint(record);
        const peopleLinks = rows.slice(0, enrollment ? MAX_QUICK_LINKS - 1 : MAX_QUICK_LINKS);
        if (enrollment) {
            peopleLinks.push({
                key: `opp:${enrollment.opportunity_id}`,
                label: enrollment.label,
                group: "Enrollment",
                opportunity_id: enrollment.opportunity_id,
            });
        }
        return peopleLinks.length > 0 ? peopleLinks : null;
    }

    return rows.length > 0 ? rows.slice(0, MAX_QUICK_LINKS) : null;
}

/** Operational context only — quick relationship links; full detail in overview section. */
export default function PersonDrawerContextPanel({
    record,
    onOpenDrawer,
}: {
    record: Record<string, unknown>;
    onOpenDrawer: OpenDrawer;
}) {
    const quickLinks = buildPersonDrawerQuickLinks(record);
    if (!quickLinks?.length) {
        return null;
    }

    return (
        <RecordDrawerContextPanel data-record-drawer-context="person-operational" variant="lead-summary">
            <div data-person-drawer-associated-people="true">
                <p className={oppInqEyebrow}>Quick links</p>
                <ul className="mt-1 space-y-1 text-[12px] leading-snug text-alloy-midnight/75">
                    {quickLinks.map((row) => (
                        <li key={row.key} className="flex flex-wrap items-baseline gap-x-1.5">
                            {row.opportunity_id ? (
                                <button
                                    type="button"
                                    onClick={() => onOpenDrawer("opportunities", row.opportunity_id!)}
                                    className="font-semibold text-alloy-blue hover:underline"
                                >
                                    {row.label}
                                </button>
                            ) : row.person_id ? (
                                <button
                                    type="button"
                                    onClick={() => onOpenDrawer("persons", row.person_id!)}
                                    className="font-semibold text-alloy-blue hover:underline"
                                >
                                    {row.label}
                                </button>
                            ) : (
                                <span className="font-medium text-alloy-midnight/85">{row.label}</span>
                            )}
                            <span className="text-alloy-midnight/45">· {row.group}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </RecordDrawerContextPanel>
    );
}
