import {
    CUSTOMER_MEMBER_CONFIG_FIELD_KEYS,
    isCustomerMemberConfigFieldKey,
} from "@/lib/fields/customerMemberFieldRegistry";

/** Native customer_members columns accepted on PATCH (excludes identity FKs). */
export const CUSTOMER_MEMBER_NATIVE_PATCH_KEYS = [
    "display_name",
    "relationship",
    "first_name",
    "last_name",
    "dob",
    "is_active",
    "external_source",
    "external_id",
    "metadata",
] as const;

const NATIVE_PATCH_SET = new Set<string>(CUSTOMER_MEMBER_NATIVE_PATCH_KEYS);
const CONFIG_PATCH_SET = new Set<string>(CUSTOMER_MEMBER_CONFIG_FIELD_KEYS);

export function partitionCustomerMemberPatchBody(body: Record<string, unknown>): {
    native: Record<string, unknown>;
    config: Record<string, unknown>;
} {
    const native: Record<string, unknown> = {};
    const config: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
        if (k.startsWith("_") || v === undefined) continue;
        if (NATIVE_PATCH_SET.has(k)) native[k] = v;
        else if (CONFIG_PATCH_SET.has(k) || isCustomerMemberConfigFieldKey(k)) config[k] = v;
    }
    return { native, config };
}

export function findUnsupportedCustomerMemberPatchKeys(body: Record<string, unknown>): string[] {
    const allowed = new Set<string>([...CUSTOMER_MEMBER_NATIVE_PATCH_KEYS, ...CUSTOMER_MEMBER_CONFIG_FIELD_KEYS]);
    return Object.keys(body).filter((k) => !k.startsWith("_") && body[k] !== undefined && !allowed.has(k));
}
