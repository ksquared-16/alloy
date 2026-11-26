/**
 * Copy primary-contact Context Details onto another household adult.
 *
 * Copies shared contact channels + address only — never first/last name
 * (those identify a different person). Empty primary values are skipped so
 * we don't wipe secondary fields with blanks.
 */

import type { PersonContactPatch, PersonContactValues } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";

/** PersonContactValues keys that belong to Context Details (not identity name). */
export const COPYABLE_PRIMARY_CONTACT_DETAIL_KEYS = [
    "email",
    "phone",
    "address_line1",
    "address_line2",
    "city",
    "state",
    "postal_code",
] as const satisfies ReadonlyArray<keyof PersonContactValues>;

export type CopyablePrimaryContactDetailKey = (typeof COPYABLE_PRIMARY_CONTACT_DETAIL_KEYS)[number];

export type CopyPrimaryContactDetailsResult = {
    patch: PersonContactPatch;
    /** Keys that will be written (non-empty on primary). */
    copiedKeys: CopyablePrimaryContactDetailKey[];
};

function trimOrEmpty(value: string | null | undefined): string {
    return typeof value === "string" ? value.trim() : "";
}

/**
 * Build a PATCH that duplicates primary Context Details onto a target contact.
 * Pure. Returns an empty patch when there is nothing to copy.
 */
export function buildCopyPrimaryContactDetailsPatch(
    primary: PersonContactValues,
    _target: PersonContactValues,
): CopyPrimaryContactDetailsResult {
    const patch: PersonContactPatch = {};
    const copiedKeys: CopyablePrimaryContactDetailKey[] = [];
    for (const key of COPYABLE_PRIMARY_CONTACT_DETAIL_KEYS) {
        const next = trimOrEmpty(primary[key]);
        if (!next) continue;
        patch[key] = next;
        copiedKeys.push(key);
    }
    return { patch, copiedKeys };
}

/** Operator-facing labels for confirm copy (short). */
export function labelForCopyablePrimaryContactDetailKey(key: CopyablePrimaryContactDetailKey): string {
    switch (key) {
        case "email":
            return "email";
        case "phone":
            return "phone";
        case "address_line1":
            return "address";
        case "address_line2":
            return "address line 2";
        case "city":
            return "city";
        case "state":
            return "state";
        case "postal_code":
            return "ZIP";
        default:
            return key;
    }
}

/** Compact summary for confirm copy — e.g. "email, phone, and address". */
export function summarizeCopyablePrimaryContactDetailKeys(
    keys: readonly CopyablePrimaryContactDetailKey[],
): string {
    if (keys.length === 0) return "contact details";
    const hasAddress = keys.some((k) =>
        k === "address_line1" || k === "address_line2" || k === "city" || k === "state" || k === "postal_code",
    );
    const labels: string[] = [];
    if (keys.includes("email")) labels.push("email");
    if (keys.includes("phone")) labels.push("phone");
    if (hasAddress) labels.push("address");
    if (labels.length === 0) {
        return keys.map(labelForCopyablePrimaryContactDetailKey).join(", ");
    }
    if (labels.length === 1) return labels[0]!;
    if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
    return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}
