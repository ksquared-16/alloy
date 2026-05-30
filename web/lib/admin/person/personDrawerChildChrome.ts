import type { PersonDrawerProfileResult } from "@/lib/admin/person/personDrawerVisibilityTypes";
import { PERSON_DRAWER_CHILD_OPEN_SOURCE } from "@/lib/admin/drawer/personDrawerOpenSeed";
import { resolvePersonDrawerProfile } from "@/lib/admin/person/resolvePersonDrawerProfile";
import { personDrawerShowsChildLifecycleSurface } from "@/lib/admin/person/personDrawerChildLifecycleSlots";

export const PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS = "child_lifecycle" as const;

export type PersonDrawerChildChromeHint = {
    presentation_emphasis?: typeof PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS;
    open_source?: string | null;
};

/** Resolve profile from entity row — includes seed / open-hint fallbacks for first paint. */
export function resolvePersonDrawerProfileFromRecordWithHint(
    record: Record<string, unknown> | null | undefined,
    hint?: PersonDrawerChildChromeHint | null
): PersonDrawerProfileResult {
    if (!record) {
        return { profiles: [], display: "unknown", badgeLabels: [] };
    }

    const input = {
        person_id: String(record.id ?? ""),
        is_employee: record.is_employee === true,
        customer_persons: (record._customer_persons as Parameters<typeof resolvePersonDrawerProfile>[0]["customer_persons"]) ?? [],
        person_relationships: (record._person_relationships as Parameters<typeof resolvePersonDrawerProfile>[0]["person_relationships"]) ?? [],
        customer_members: (record._compatibility_members as Parameters<typeof resolvePersonDrawerProfile>[0]["customer_members"]) ?? [],
        opportunity_person_roles:
            (record._opportunity_person_roles as Parameters<typeof resolvePersonDrawerProfile>[0]["opportunity_person_roles"]) ?? [],
    };
    const resolved = resolvePersonDrawerProfile(input);

    if (resolved.profiles.includes("child")) {
        return resolved;
    }

    const recordHint = String(record._drawer_presentation_emphasis ?? "").trim();
    const hintEmphasis = hint?.presentation_emphasis ?? null;
    const openSource = hint?.open_source ?? null;
    if (
        recordHint === PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS ||
        hintEmphasis === PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS ||
        openSource === PERSON_DRAWER_CHILD_OPEN_SOURCE
    ) {
        return {
            profiles: ["child"],
            display: "child",
            badgeLabels: ["Child"],
        };
    }

    return resolved;
}

/** True when child drawer chrome should paint — including loading before full hydrate. */
export function personDrawerChildChromeActive(
    record: Record<string, unknown> | null | undefined,
    hint?: PersonDrawerChildChromeHint | null
): boolean {
    if (hint?.presentation_emphasis === PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS) return true;
    if (hint?.open_source === PERSON_DRAWER_CHILD_OPEN_SOURCE) return true;
    return personDrawerShowsChildLifecycleSurface(resolvePersonDrawerProfileFromRecordWithHint(record, hint));
}
