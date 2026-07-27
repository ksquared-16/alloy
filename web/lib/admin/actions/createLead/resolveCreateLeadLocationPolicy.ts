/**
 * Platform policy for create_lead Location.
 *
 * Location is **not** a universal code-owned Create Lead minimum.
 * It is required only when the resolved ActionIntakeSpec lists `location_id`
 * (or equivalent) among explicit `record_creation` / required intake fields.
 */

import { CREATE_LEAD_PLATFORM_REQUIRED_KEYS } from "@/lib/admin/actions/createLeadPlatformGather";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";

/** Always false after Location was removed from the platform minimum key set. */
export const CREATE_LEAD_PLATFORM_REQUIRES_LOCATION = CREATE_LEAD_PLATFORM_REQUIRED_KEYS.includes(
    "location_id"
);

/** Pure resolver for tests — platform flag + spec required payload keys. */
export function resolveCreateLeadLocationRequired(input: {
    platformRequiresLocation: boolean;
    specRequiredPayloadKeys: readonly string[];
}): boolean {
    if (input.platformRequiresLocation) return true;
    return input.specRequiredPayloadKeys.includes("location_id");
}

/** Location required only when the effective intake/required key set includes it. */
export function isCreateLeadLocationRequired(input?: {
    intakeSpec?: ActionIntakeSpec | null;
    requiredPayloadKeys?: readonly string[];
}): boolean {
    const specKeys = input?.intakeSpec?.required.map((field) => field.payload_key) ?? [];
    const bundleKeys = input?.requiredPayloadKeys ?? specKeys;
    return resolveCreateLeadLocationRequired({
        platformRequiresLocation: CREATE_LEAD_PLATFORM_REQUIRES_LOCATION,
        specRequiredPayloadKeys: bundleKeys,
    });
}
