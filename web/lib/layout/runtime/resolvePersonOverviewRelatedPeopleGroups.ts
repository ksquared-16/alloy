/**
 * Person overview — related adults grouped by household role for layout runtime widget.
 *
 * Source: VM visibility fields on layout runtime record via resolvePersonDrawerHouseholdModel.
 */

import {
    resolvePersonDrawerHouseholdModel,
    type PersonDrawerHouseholdChildMember,
    type PersonDrawerHouseholdMember,
} from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type PersonOverviewRelatedPeopleGroup = {
    key: string;
    title: string;
    members: PersonDrawerHouseholdMember[];
};

const GROUP_SPECS = [
    { key: "parents_guardians", title: "Parents / guardians", field: "guardians" as const },
    { key: "emergency_contacts", title: "Emergency contacts", field: "emergency_contacts" as const },
    { key: "authorized_pickup", title: "Authorized pickup", field: "authorized_pickups" as const },
    { key: "other_household_members", title: "Other household adults", field: "other_household_members" as const },
] as const;

function dedupeMembers(members: PersonDrawerHouseholdMember[]): PersonDrawerHouseholdMember[] {
    const seen = new Set<string>();
    const out: PersonDrawerHouseholdMember[] = [];
    for (const member of members) {
        const key = member.person_id ?? member.display_name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(member);
    }
    return out;
}

/** Flatten household model into operator-facing role groups (excludes viewing person). */
export function resolvePersonOverviewRelatedPeopleGroups(
    record: ProofRuntimeRecord,
): PersonOverviewRelatedPeopleGroup[] {
    const viewingPersonId = String(record.id ?? record["person.id"] ?? "").trim() || null;
    const model = resolvePersonDrawerHouseholdModel(record, { viewing_person_id: viewingPersonId });

    const buckets: Record<(typeof GROUP_SPECS)[number]["field"], PersonDrawerHouseholdMember[]> = {
        guardians: [],
        emergency_contacts: [],
        authorized_pickups: [],
        other_household_members: [],
    };

    for (const group of model.groups) {
        for (const spec of GROUP_SPECS) {
            buckets[spec.field].push(...group[spec.field]);
        }
    }

    return GROUP_SPECS.map((spec) => ({
        key: spec.key,
        title: spec.title,
        members: dedupeMembers(buckets[spec.field]).filter(
            (member) => !viewingPersonId || member.person_id !== viewingPersonId,
        ),
    })).filter((group) => group.members.length > 0);
}

export type PersonOverviewHouseholdConnectedChildren = {
    key: string;
    title: string;
    children: PersonDrawerHouseholdChildMember[];
};

/** Connected children on the household — for visibility checks alongside related adults. */
export function resolvePersonOverviewHouseholdConnectedChildren(
    record: ProofRuntimeRecord,
): PersonOverviewHouseholdConnectedChildren | null {
    const viewingPersonId = String(record.id ?? record["person.id"] ?? "").trim() || null;
    const model = resolvePersonDrawerHouseholdModel(record, { viewing_person_id: viewingPersonId });
    const children = model.groups.flatMap((group) => group.children);
    if (children.length === 0) return null;
    return {
        key: "connected_children",
        title: "Connected children",
        children,
    };
}

export function personOverviewRelatedPeopleHasContent(record: ProofRuntimeRecord): boolean {
    return (
        resolvePersonOverviewRelatedPeopleGroups(record).length > 0
        || resolvePersonOverviewHouseholdConnectedChildren(record) != null
    );
}
