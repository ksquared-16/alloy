/**
 * WHICH CHILD PROFILE FIELDS ARE MEDICAL — Medical's one answer.
 *
 * Derived from the child field registry's own privacy classification (`sensitivity: "health"`), so
 * a field classified there is withheld everywhere this list is consulted: the shared profile loader,
 * the child record API, the drawer and durable record, Processing evidence. Reading them requires
 * `health.view`; writing them requires `health.manage`. Never a second hand-kept list.
 */

import { CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST } from "@/lib/fields/customerMemberFieldRegistry";

export const CHILD_HEALTH_PROFILE_FIELD_KEYS: readonly string[] = Object.freeze(
    CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST.filter((r) => r.sensitivity === "health").map((r) => r.field_key),
);

export function isChildHealthProfileFieldKey(key: string | null | undefined): boolean {
    return typeof key === "string" && CHILD_HEALTH_PROFILE_FIELD_KEYS.includes(key.trim());
}
