/**
 * Identity-card inline child save routing — real writes for scalar profile fields.
 *
 * Location / Program enrollment fields also save through this ChildrenCard path via
 * `buildChildFocusSavePatch` (OCM). Room / Schedule stay Linked → Assignments.
 */

import {
    inquiryChildIdentityHasChanges,
    type InquiryChildIdentityPatch,
    type InquiryChildOcmPatch,
} from "@/lib/admin/drawer/inquiryChildFieldEdit";
import type { InquiryChildRow } from "@/components/admin/entity/OpportunityInquiryChildrenSection";
import type { ChildFocusSavePatch } from "@/lib/adminV2/runtime/focusPanel/children/childFocusEditState";
import { reconcileLegacyChildEnrollmentAlias } from "@/lib/fields/canonicalFieldProjection";
import { CHILD_PROFILE_INLINE_SAVE_MAP } from "@/lib/fields/customerMemberProfileSurfaces";

const INLINE_IDENTITY_KEYS = new Set<string>([
    "child.first_name",
    "child.last_name",
    "child.date_of_birth",
]);

/**
 * Derived from the child-profile manifest. Hand-maintaining this map was one of four parallel lists
 * a new durable child fact had to be added to; the manifest is the owner now.
 * @see lib/fields/customerMemberProfileSurfaces
 */
const INLINE_PROFILE_KEYS: Readonly<Record<string, string>> = CHILD_PROFILE_INLINE_SAVE_MAP;

const INLINE_OCM_NOTES_REFS = new Set<string>(["inquiry_child.notes"]);

export function isIdentityFieldInlineSaveSupported(fieldRef: string): boolean {
    const normalized = reconcileLegacyChildEnrollmentAlias(fieldRef.trim());
    if (!normalized) return false;
    if (INLINE_IDENTITY_KEYS.has(normalized)) return true;
    if (normalized in INLINE_PROFILE_KEYS) return true;
    if (INLINE_OCM_NOTES_REFS.has(normalized)) return true;
    if (normalized === "child.date_of_birth") return true;
    return false;
}

export type IdentityInlineChildSavePatch = ChildFocusSavePatch & {
    profilePatch?: Record<string, unknown>;
};

function trimValue(value: string): string {
    return value.trim();
}

function notesBaseline(row: InquiryChildRow): string {
    return String(row.notes ?? "").trim();
}

/** Build a minimal save patch for one inline-editable identity field. Pure. */
export function buildIdentityInlineChildSavePatch(args: {
    fieldRef: string;
    value: string;
    row: InquiryChildRow;
    identityBaseline: InquiryChildIdentityPatch;
}): IdentityInlineChildSavePatch | null {
    const normalized = reconcileLegacyChildEnrollmentAlias(args.fieldRef.trim());
    if (!isIdentityFieldInlineSaveSupported(normalized)) return null;

    const nextValue = trimValue(args.value);
    const identityPatch: InquiryChildIdentityPatch = {};
    const ocmPatch: InquiryChildOcmPatch = {};
    let profilePatch: Record<string, unknown> | undefined;

    if (normalized === "child.first_name") {
        const draft = { ...args.identityBaseline, first_name: nextValue };
        if (inquiryChildIdentityHasChanges(draft, args.identityBaseline)) {
            identityPatch.first_name = nextValue || null;
        }
    } else if (normalized === "child.last_name") {
        const draft = { ...args.identityBaseline, last_name: nextValue };
        if (inquiryChildIdentityHasChanges(draft, args.identityBaseline)) {
            identityPatch.last_name = nextValue || null;
        }
    } else if (normalized === "child.date_of_birth") {
        const draft = { ...args.identityBaseline, dob: nextValue };
        if (inquiryChildIdentityHasChanges(draft, args.identityBaseline)) {
            identityPatch.dob = nextValue || null;
        }
    } else if (normalized in INLINE_PROFILE_KEYS) {
        const profileKey = INLINE_PROFILE_KEYS[normalized]!;
        profilePatch = { [profileKey]: nextValue || null };
    } else if (INLINE_OCM_NOTES_REFS.has(normalized)) {
        const baseline = notesBaseline(args.row);
        if (nextValue !== baseline) {
            ocmPatch.notes = nextValue || null;
        }
    }

    const hasIdentity = Object.keys(identityPatch).length > 0;
    const hasOcm = Object.keys(ocmPatch).length > 0;
    const hasProfile = profilePatch != null && Object.keys(profilePatch).length > 0;
    if (!hasIdentity && !hasOcm && !hasProfile) {
        return { identityPatch: {}, ocmPatch: {}, profilePatch: undefined };
    }

    return { identityPatch, ocmPatch, profilePatch };
}
