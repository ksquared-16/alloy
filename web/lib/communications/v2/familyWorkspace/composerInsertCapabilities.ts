/**
 * Lightweight insert capabilities for the family New Message composer.
 * Capabilities are resolved from context — not hardcoded into the toolbar chrome.
 */

export type ComposerInsertCapabilityKey = "tour_invitation_link";

export type ComposerInsertCapability = {
    key: ComposerInsertCapabilityKey;
    label: string;
};

export type ComposerInsertCapabilityContext = {
    /** Opportunity-scoped subjects can provision Tour invitation links. */
    opportunityId?: string | null;
    /** When false, suppress Tour even if opportunity is present. */
    tourInvitationEligible?: boolean;
};

export function resolveComposerInsertCapabilities(
    context: ComposerInsertCapabilityContext,
): ComposerInsertCapability[] {
    const opportunityId = String(context.opportunityId ?? "").trim();
    const tourEligible = context.tourInvitationEligible !== false && Boolean(opportunityId);
    const out: ComposerInsertCapability[] = [];
    if (tourEligible) {
        out.push({ key: "tour_invitation_link", label: "Tour Invitation Link" });
    }
    return out;
}
