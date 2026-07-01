import type { PersonDrawerProfileResult } from "@/lib/admin/person/personDrawerVisibilityTypes";
import { PERSON_DRAWER_CHILD_OPEN_SOURCE } from "@/lib/admin/drawer/personDrawerOpenSeed";
import { resolvePersonDrawerProfile } from "@/lib/admin/person/resolvePersonDrawerProfile";
import {
    resolvePersonDrawerPresentationEmphasis,
    type PersonDrawerPresentationEmphasis,
} from "@/lib/admin/person/personDrawerPresentationEmphasis";

export const PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS = "guardian_communication" as const;
export const PERSON_DRAWER_PARENT_OPEN_SOURCE = "opportunity_household_adult";

export type PersonDrawerParentChromeHint = {
    presentation_emphasis?: typeof PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS;
    open_source?: string | null;
};

/** Resolve profile from entity row — includes seed / open-hint fallbacks for first paint. */
export function resolvePersonDrawerProfileFromRecordWithParentHint(
    record: Record<string, unknown> | null | undefined,
    hint?: PersonDrawerParentChromeHint | null
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

    const recordHint = String(record._drawer_presentation_emphasis ?? "").trim() as PersonDrawerPresentationEmphasis;
    const hintEmphasis = hint?.presentation_emphasis ?? null;
    const openSource = hint?.open_source ?? null;

    const parentLike =
        resolved.profiles.includes("parent") ||
        resolved.profiles.includes("guardian") ||
        resolved.display === "parent" ||
        resolved.display === "guardian";

    if (
        parentLike &&
        (recordHint === PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS ||
            hintEmphasis === PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS ||
            openSource === PERSON_DRAWER_PARENT_OPEN_SOURCE)
    ) {
        const badgeLabels = resolved.badgeLabels.length > 0 ? resolved.badgeLabels : ["Parent / Guardian"];
        return {
            profiles: resolved.profiles.length > 0 ? resolved.profiles : ["parent"],
            display: resolved.display === "unknown" ? "parent" : resolved.display,
            badgeLabels,
        };
    }

    return resolved;
}

/** True when parent/guardian operating chrome should paint — child-first rule excludes child profiles. */
export function personDrawerParentChromeActive(
    record: Record<string, unknown> | null | undefined,
    hint?: PersonDrawerParentChromeHint | null
): boolean {
    const profile = resolvePersonDrawerProfileFromRecordWithParentHint(record, hint);
    if (profile.profiles.includes("child")) return false;

    if (hint?.presentation_emphasis === PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS) return true;
    if (hint?.open_source === PERSON_DRAWER_PARENT_OPEN_SOURCE) return true;
    if (String(record?._drawer_presentation_emphasis ?? "").trim() === PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS) {
        return true;
    }

    return resolvePersonDrawerPresentationEmphasis(profile) === PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS;
}
