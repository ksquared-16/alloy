"use client";

import RecordDrawerContextPanel from "@/components/admin/drawer/record/RecordDrawerContextPanel";
import { resolvePersonDrawerProfileFromRecord } from "@/components/admin/entity/PersonDrawerProfileBadges";
import { buildPersonDrawerRelationshipGroups } from "@/lib/admin/person/buildPersonDrawerRelationshipGroups";
import { personDrawerRelationshipInputFromRecord } from "@/lib/admin/person/personDrawerRelationshipInput";
import {
    personDrawerRelationshipSectionHasContent,
    resolvePersonDrawerRelationshipSectionModel,
} from "@/lib/admin/person/personDrawerRelationshipSection";
import { oppInqEyebrow } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";

type OpenDrawer = (type: string, id: string) => void;

/** Compact quick links — subset of body relationship section; no duplicate enrollment data. */
function CompactAssociatedPeople({
    record,
    onOpenDrawer,
}: {
    record: Record<string, unknown>;
    onOpenDrawer: OpenDrawer;
}) {
    const profile = resolvePersonDrawerProfileFromRecord(record);
    const groups = buildPersonDrawerRelationshipGroups(personDrawerRelationshipInputFromRecord(record));
    const model = resolvePersonDrawerRelationshipSectionModel(profile, groups);

    const rows: Array<{
        person_id: string | null;
        customer_member_id?: string | null;
        display_name: string | null;
        group: string;
    }> = [];

    if (model.showChildren) {
        for (const r of groups.children) rows.push({ ...r, group: "Child" });
    }
    if (model.showParents) {
        for (const r of groups.parents) rows.push({ ...r, group: "Parent" });
    }
    if (model.showGuardians) {
        for (const r of groups.guardians) rows.push({ ...r, group: "Guardian" });
    }
    if (model.showEmergency) {
        for (const r of groups.emergency_contacts) rows.push({ ...r, group: "Emergency" });
    }
    if (model.showSiblings) {
        for (const r of groups.siblings) rows.push({ ...r, group: model.siblingsTitle.replace(/s$/, "") });
    }

    const quickLinks = rows.slice(0, 4);
    if (quickLinks.length === 0) return null;

    return (
        <div data-person-drawer-associated-people="true">
            <p className={oppInqEyebrow}>Quick links</p>
            <ul className="mt-1 space-y-1 text-[12px] leading-snug text-alloy-midnight/75">
                {quickLinks.map((row) => {
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

/** Operational context only — quick relationship links; full detail in overview section. */
export default function PersonDrawerContextPanel({
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

    return (
        <RecordDrawerContextPanel data-record-drawer-context="person-operational" variant="lead-summary">
            <CompactAssociatedPeople record={record} onOpenDrawer={onOpenDrawer} />
        </RecordDrawerContextPanel>
    );
}
