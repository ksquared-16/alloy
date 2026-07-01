/**
 * FC-CM-1 — customer_member config field_definitions parity helpers.
 */

import {
    CUSTOMER_MEMBER_CONFIG_FIELD_KEYS,
    CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST,
    CUSTOMER_MEMBER_ENTITY_TYPE,
    type CustomerMemberConfigFieldKey,
} from "./customerMemberFieldRegistry";

export const REQUIRED_CUSTOMER_MEMBER_CONFIG_FIELD_KEYS = CUSTOMER_MEMBER_CONFIG_FIELD_KEYS;

export type CustomerMemberFieldDefRow = {
    field_key: string;
    entity_type?: string;
    is_active?: boolean;
};

export function computeCustomerMemberConfigParityGaps(rows: CustomerMemberFieldDefRow[]): CustomerMemberConfigFieldKey[] {
    const active = new Set(
        rows
            .filter((r) => {
                const entity = (r.entity_type ?? CUSTOMER_MEMBER_ENTITY_TYPE).trim().toLowerCase();
                return entity === CUSTOMER_MEMBER_ENTITY_TYPE && r.is_active !== false;
            })
            .map((r) => r.field_key.trim()),
    );
    return REQUIRED_CUSTOMER_MEMBER_CONFIG_FIELD_KEYS.filter((key) => !active.has(key));
}

export function manifestRowForCustomerMemberConfigKey(fieldKey: CustomerMemberConfigFieldKey) {
    const row = CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST.find((m) => m.field_key === fieldKey);
    if (!row) throw new Error(`Missing manifest row for customer_member config key: ${fieldKey}`);
    return row;
}
