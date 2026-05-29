"use client";

import { personDrawerRolePillClassName } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import type { PersonDrawerProfileResult } from "@/lib/admin/person/personDrawerVisibilityTypes";
import {
    resolvePersonDrawerProfile,
    type PersonDrawerProfileInput,
} from "@/lib/admin/person/resolvePersonDrawerProfile";

type Props = {
    record: Record<string, unknown> | null | undefined;
    className?: string;
};

export function resolvePersonDrawerProfileFromRecord(
    record: Record<string, unknown> | null | undefined
): PersonDrawerProfileResult {
    if (!record) {
        return { profiles: [], display: "unknown", badgeLabels: [] };
    }
    const input: PersonDrawerProfileInput = {
        person_id: String(record.id ?? ""),
        is_employee: record.is_employee === true,
        customer_persons: (record._customer_persons as PersonDrawerProfileInput["customer_persons"]) ?? [],
        person_relationships: (record._person_relationships as PersonDrawerProfileInput["person_relationships"]) ?? [],
        customer_members: (record._compatibility_members as PersonDrawerProfileInput["customer_members"]) ?? [],
        opportunity_person_roles:
            (record._opportunity_person_roles as PersonDrawerProfileInput["opportunity_person_roles"]) ?? [],
    };
    return resolvePersonDrawerProfile(input);
}

export default function PersonDrawerProfileBadges({ record, className }: Props) {
    const { badgeLabels } = resolvePersonDrawerProfileFromRecord(record);
    if (badgeLabels.length === 0) return null;

    return (
        <div className={className ?? "flex flex-wrap items-center gap-1.5"} data-person-drawer-profile-badges="true">
            {badgeLabels.map((label) => (
                <span
                    key={label}
                    className={personDrawerRolePillClassName}
                >
                    {label}
                </span>
            ))}
        </div>
    );
}
