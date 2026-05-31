/**
 * Supabase nested FK selects are often typed as T | T[]; many-to-one joins return one object at runtime.
 */

export function firstNestedRecord<T>(value: T | T[] | null | undefined): T | null {
    if (value == null) return null;
    if (Array.isArray(value)) return value[0] ?? null;
    return value;
}

export type NormalizedCustomerMemberNested = {
    display_name: string | null;
    person_id: string | null;
    first_name?: string | null;
    last_name?: string | null;
    metadata?: Record<string, unknown> | null;
    persons?: {
        date_of_birth?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
    } | null;
};

export function normalizeCustomerMemberNested(
    raw: unknown
): NormalizedCustomerMemberNested | null {
    const member = firstNestedRecord(
        raw as NormalizedCustomerMemberNested | NormalizedCustomerMemberNested[] | null | undefined
    );
    if (!member) return null;
    const persons = firstNestedRecord(
        member.persons as { date_of_birth?: string | null } | { date_of_birth?: string | null }[] | null | undefined
    );
    return {
        display_name: member.display_name ?? null,
        person_id: member.person_id ?? null,
        first_name: member.first_name ?? null,
        last_name: member.last_name ?? null,
        metadata: member.metadata ?? null,
        persons: persons ?? null,
    };
}

export type NormalizedPlacementLinkMemberRow = {
    placement_candidate_id: string;
    placement_link_group_id: string;
    placement_link_groups: {
        id: string;
        link_mode: string;
        placement_link_group_members: Array<{ id: string }> | null;
    } | null;
};

export function normalizePlacementLinkMemberRow(raw: unknown): NormalizedPlacementLinkMemberRow {
    const row = raw as {
        placement_candidate_id: string;
        placement_link_group_id: string;
        placement_link_groups: unknown;
    };
    const grpRaw = firstNestedRecord(
        row.placement_link_groups as
            | NormalizedPlacementLinkMemberRow["placement_link_groups"]
            | NonNullable<NormalizedPlacementLinkMemberRow["placement_link_groups"]>[]
            | null
            | undefined
    );
    const membersRaw = grpRaw?.placement_link_group_members;
    const members = Array.isArray(membersRaw)
        ? membersRaw
        : membersRaw
          ? [membersRaw as { id: string }]
          : null;

    return {
        placement_candidate_id: String(row.placement_candidate_id),
        placement_link_group_id: String(row.placement_link_group_id),
        placement_link_groups: grpRaw
            ? {
                  id: String(grpRaw.id),
                  link_mode: String(grpRaw.link_mode),
                  placement_link_group_members: members,
              }
            : null,
    };
}
