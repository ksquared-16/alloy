/**
 * Default compact identity summary presentation — runtime projection only.
 * Does not change Surface Builder field membership; only label density when
 * the operator has not authored an explicit labelMode.
 */

import type { IdentityFieldLabelMode } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import { reconcileLegacyChildEnrollmentAlias } from "@/lib/fields/canonicalFieldProjection";

/** Fields that already read as icon+value lines in summary (email/phone/etc.). */
const COMPACT_ICON_VALUE_FIELDS = new Set([
    "contact.email",
    "contact.phone",
    "person.email",
    "person.phone",
    "person.primary_email",
    "person.primary_phone",
    "child.email",
    "child.phone",
]);

/** Name parts duplicated by the record title in collection summary. */
const COMPACT_TITLE_REDUNDANT_FIELDS = new Set([
    "contact.first_name",
    "contact.last_name",
    "person.first_name",
    "person.last_name",
    "child.first_name",
    "child.last_name",
    "inquiry_child.first_name",
    "inquiry_child.last_name",
]);

export function isCompactTitleRedundantIdentityField(fieldRef: string): boolean {
    return COMPACT_TITLE_REDUNDANT_FIELDS.has(reconcileLegacyChildEnrollmentAlias(fieldRef.trim()));
}

export function isCompactIconValueIdentityField(fieldRef: string): boolean {
    return COMPACT_ICON_VALUE_FIELDS.has(reconcileLegacyChildEnrollmentAlias(fieldRef.trim()));
}

/**
 * When placement has no authored labelMode, apply compact summary defaults.
 * Authored visible/eyebrow/hidden always wins.
 */
export function resolveCompactIdentitySummaryLabelMode(args: {
    fieldRef: string;
    authoredLabelMode?: IdentityFieldLabelMode | null;
    purpose: "summary" | "context_facts" | "details";
    /**
     * When true, a resolved `"visible"` from legacy defaults is treated as unauthored
     * so compact summary can still hide redundant name/email/phone labels.
     */
    treatResolvedVisibleAsUnauthored?: boolean;
}): IdentityFieldLabelMode {
    const authored = args.authoredLabelMode;
    if (authored === "hidden" || authored === "eyebrow") return authored;
    if (authored === "visible" && !args.treatResolvedVisibleAsUnauthored) return "visible";
    if (args.purpose !== "summary") return authored ?? "visible";
    const ref = reconcileLegacyChildEnrollmentAlias(args.fieldRef.trim());
    if (COMPACT_TITLE_REDUNDANT_FIELDS.has(ref)) return "hidden";
    if (COMPACT_ICON_VALUE_FIELDS.has(ref)) return "hidden";
    return authored ?? "visible";
}
