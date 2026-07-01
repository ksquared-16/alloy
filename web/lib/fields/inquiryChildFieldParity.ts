/**
 * FC-1.5 — inquiry_child native field_definitions parity helpers.
 * Source of truth for required keys: INQUIRY_CHILD_NATIVE_FIELD_MANIFEST.
 */

import {
    INQUIRY_CHILD_NATIVE_FIELD_MANIFEST,
    INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS,
    type InquiryChildNativeOcmFieldKey,
} from "./inquiryChildFieldRegistry";

export const REQUIRED_INQUIRY_CHILD_NATIVE_FIELD_KEYS = INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS;

export type InquiryChildFieldDefRow = {
    field_key: string;
    entity_type?: string;
    is_active?: boolean;
};

/** Keys from manifest missing in the supplied field_definitions rows. */
export function computeInquiryChildNativeParityGaps(rows: InquiryChildFieldDefRow[]): InquiryChildNativeOcmFieldKey[] {
    const activeInquiryChild = new Set(
        rows
            .filter((r) => {
                const entity = (r.entity_type ?? "inquiry_child").trim().toLowerCase();
                return entity === "inquiry_child" && r.is_active !== false;
            })
            .map((r) => r.field_key.trim()),
    );
    return REQUIRED_INQUIRY_CHILD_NATIVE_FIELD_KEYS.filter((key) => !activeInquiryChild.has(key));
}

/** Manifest row for a native key (throws in dev if manifest drifts). */
export function manifestRowForInquiryChildNativeKey(fieldKey: InquiryChildNativeOcmFieldKey) {
    const row = INQUIRY_CHILD_NATIVE_FIELD_MANIFEST.find((m) => m.field_key === fieldKey);
    if (!row) throw new Error(`Missing manifest row for inquiry_child native key: ${fieldKey}`);
    return row;
}

/** All manifest field_keys — for migration / CI parity assertions. */
export function allInquiryChildManifestFieldKeys(): InquiryChildNativeOcmFieldKey[] {
    return [...REQUIRED_INQUIRY_CHILD_NATIVE_FIELD_KEYS];
}
