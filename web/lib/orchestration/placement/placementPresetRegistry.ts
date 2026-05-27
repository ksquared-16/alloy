import type { PlacementProfile } from "@/lib/orchestration/placement/placementPriorityTypes";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfile";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfileV2";

/**
 * Code-owned preset registry (Card 4). Large rule JSON stays in modules — metadata references **`profile_id`** only.
 */
const REGISTRY: Readonly<Record<string, PlacementProfile>> = Object.freeze({
    [CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.profile_id]: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1,
    [CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2.profile_id]: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2,
});

export function listRegisteredPlacementProfileIds(): string[] {
    return Object.keys(REGISTRY).sort();
}

export function getPlacementProfileFromRegistry(profileId: string): PlacementProfile | null {
    const k = profileId.trim();
    if (!k) return null;
    return REGISTRY[k] ?? null;
}

export function isRegisteredPlacementProfileId(profileId: string): boolean {
    return getPlacementProfileFromRegistry(profileId) != null;
}
