/**
 * Identity-card edit capability contract.
 *
 * Editable is offered only when a complete write path exists:
 * canonical owner + mutation binding + save support. Computed and
 * relationship fields stay read-only; unsupported modes are hidden in Builder
 * and rejected at publish.
 */

import {
    IDENTITY_UNSUPPORTED_SAVE_REFS,
    isIdentityFieldSaveSupported,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldMutationBinding";
import { isIdentityFieldInlineSaveSupported } from "@/lib/adminV2/runtime/focusPanel/identity/identityInlineChildSave";
import { resolveIdentityFieldLinkContract } from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldLinkContract";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    fieldIsSaveable,
    normalizeFieldVisibility,
    type SurfaceFieldVisibility,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import { generateDefaultIdentityFieldPlacements } from "@/lib/adminV2/settings/surfaces/identityFieldPlacement";

/** Fields that are derived / display-only — never offer Editable. */
const COMPUTED_IDENTITY_FIELD_REFS = new Set<string>([
    ...IDENTITY_UNSUPPORTED_SAVE_REFS,
    "child.age_band",
    "child.gender_label",
    "child.readiness_summary",
    "child.medical_summary",
    "child.documents_summary",
    "child.pickup_summary",
    "child.communications_summary",
    "child.notes_summary",
    "person.full_name",
    "contact.full_name",
]);

/** Relationship / collection membership — mutate via canonical actions, not scalar inline edit. */
const RELATIONSHIP_ACTION_ONLY_REFS = new Set<string>([
    "household.members",
    "child.guardians",
    "contact.relationship",
    "person.relationship",
]);

export type IdentityFieldEditContract = {
    fieldRef: string;
    canOfferEditable: boolean;
    reason:
        | "supported"
        | "computed"
        | "relationship_action"
        | "no_write_adapter";
};

export function resolveIdentityFieldEditContract(fieldRef: string): IdentityFieldEditContract {
    const trimmed = fieldRef.trim();
    if (!trimmed) {
        return { fieldRef: trimmed, canOfferEditable: false, reason: "no_write_adapter" };
    }
    if (COMPUTED_IDENTITY_FIELD_REFS.has(trimmed)) {
        return { fieldRef: trimmed, canOfferEditable: false, reason: "computed" };
    }
    if (RELATIONSHIP_ACTION_ONLY_REFS.has(trimmed)) {
        return { fieldRef: trimmed, canOfferEditable: false, reason: "relationship_action" };
    }
    if (isIdentityFieldInlineSaveSupported(trimmed)) {
        return { fieldRef: trimmed, canOfferEditable: true, reason: "supported" };
    }
    if (
        isIdentityFieldSaveSupported(trimmed)
        && !resolveIdentityFieldLinkContract(trimmed).canOfferLinked
    ) {
        return { fieldRef: trimmed, canOfferEditable: true, reason: "supported" };
    }
    return { fieldRef: trimmed, canOfferEditable: false, reason: "no_write_adapter" };
}

export function identityFieldVisibilityOptionsForBuilder(
    fieldRef: string,
): SurfaceFieldVisibility[] {
    const contract = resolveIdentityFieldEditContract(fieldRef);
    if (contract.canOfferEditable) {
        return ["editable", "read-only", "hidden"];
    }
    const link = resolveIdentityFieldLinkContract(fieldRef);
    if (link.canOfferLinked) {
        return ["linked", "read-only", "hidden"];
    }
    return ["read-only", "hidden"];
}

export type UnsupportedEditableConfigIssue = {
    surfaceId: string;
    groupKey: string;
    fieldRef: string;
    tier: string;
    reason: IdentityFieldEditContract["reason"];
};

/** Publish gate: reject Editable policies that lack a complete write contract. */
export function collectUnsupportedEditableIdentityConfigs(
    config: NestedSurfaceConfig,
): UnsupportedEditableConfigIssue[] {
    const issues: UnsupportedEditableConfigIssue[] = [];
    for (const group of config.groups) {
        const placements = group.fieldPlacements ?? generateDefaultIdentityFieldPlacements(group);
        for (const placement of placements) {
            const policy = normalizeFieldVisibility(
                placement.policy ?? group.fieldPolicies?.[placement.fieldRef] ?? "read-only",
            );
            if (!fieldIsSaveable(policy)) continue;
            const contract = resolveIdentityFieldEditContract(placement.fieldRef);
            if (contract.canOfferEditable) continue;
            issues.push({
                surfaceId: config.surfaceId,
                groupKey: group.key,
                fieldRef: placement.fieldRef,
                tier: placement.tier,
                reason: contract.reason,
            });
        }
        for (const [fieldRef, visibility] of Object.entries(group.fieldPolicies ?? {})) {
            if (!fieldIsSaveable(normalizeFieldVisibility(visibility))) continue;
            const contract = resolveIdentityFieldEditContract(fieldRef);
            if (contract.canOfferEditable) continue;
            if (issues.some((issue) => issue.groupKey === group.key && issue.fieldRef === fieldRef)) {
                continue;
            }
            issues.push({
                surfaceId: config.surfaceId,
                groupKey: group.key,
                fieldRef,
                tier: "fieldPolicies",
                reason: contract.reason,
            });
        }
    }
    return issues;
}

export function formatUnsupportedEditablePublishError(
    issues: readonly UnsupportedEditableConfigIssue[],
): string {
    if (issues.length === 0) return "";
    const sample = issues
        .slice(0, 4)
        .map((issue) => `${issue.groupKey}.${issue.fieldRef} (${issue.reason})`)
        .join("; ");
    const more = issues.length > 4 ? ` (+${issues.length - 4} more)` : "";
    return `Cannot publish Editable fields without a complete write contract: ${sample}${more}. Set them to Read-only or Hidden.`;
}
