import { CREATE_LEAD_PLATFORM_REQUIRED_KEYS } from "@/lib/admin/actions/createLeadPlatformGather";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";

/**
 * Platform policy for create_lead: location_id is always required to create a lead record.
 * Business Process stage rules may add fields but cannot remove this minimum via UI validation.
 */
export const CREATE_LEAD_PLATFORM_REQUIRES_LOCATION = CREATE_LEAD_PLATFORM_REQUIRED_KEYS.includes(
    "location_id",
);

/** Pure resolver for tests — platform flag + spec required payload keys. */
export function resolveCreateLeadLocationRequired(input: {
    platformRequiresLocation: boolean;
    specRequiredPayloadKeys: readonly string[];
}): boolean {
    if (input.platformRequiresLocation) return true;
    return input.specRequiredPayloadKeys.includes("location_id");
}

/** Single source of truth for Create Lead location requirement across modal, checklist, and commit validation. */
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
