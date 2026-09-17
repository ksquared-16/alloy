/**
 * Shared distribution presentation helpers (OW-7).
 * Operational copy and link labeling — no backend semantics.
 */

import { ADMIN_PREVIEW_LINK_LABEL } from "@/lib/forms/adminFormPreview";
import { humanizeOperatorSlug } from "@/lib/forms/operatorDisplayLabels";

export type DistributionLinkRow = {
    id: string;
    is_active: boolean;
    created_at: string;
    expires_at?: string | null;
    metadata?: Record<string, unknown>;
};

export type DistributionCreatedLinkPayload = {
    embed_path: string;
    embed_url: string | null;
    /** Form mint only — shown once in the one-time panel. */
    plaintext_token?: string;
};

export const DISTRIBUTION_COPY = {
    formIntro: "Families complete this form from a secure link. Share intake when a published version is ready.",
    /*
     * ONE LINE, AND IT SAYS WHICH PATH THIS IS.
     *
     * It used to say "Launch this intake workflow — families complete each step in order. Completed
     * runs appear in the session inbox for review." — which describes what a packet IS, to someone
     * already looking at one, and then repeated the session-inbox sentence that the paragraph
     * directly beneath it also prints. What an operator needs here is the distinction the surface
     * exists to make: this send is the exception, because a configured process sends on its own.
     */
    packetIntro:
        "Configured processes such as Enrollment send automatically — use this only for a one-off send.",
    /*
     * Two headings, because they are two different lists.
     *
     * A Form's links are intake links a family answers from; a Packet's are one-off sends made
     * outside a process. Collapsing them onto one phrase gave the Forms surface packet vocabulary
     * for something that is not a "direct send" at all.
     */
    activeLinksLead: "Active intake links for this flow.",
    packetLinksLead: "Recent direct sends",
    emptyForm: "No intake links yet. Share this form when you are ready for families to respond.",
    emptyPacket: "Nothing sent directly yet.",
    shareIntake: "Share intake",
    /*
     * "Launch packet" named the machinery, not the act. The operator is SENDING a packet to a
     * family; "launch" is what the runtime does about it, and it reads as a bigger, more
     * process-shaped verb than the exceptional one-off this control performs.
     */
    launchPacket: "Send packet",
    previewRecipient: "Preview recipient experience",
    copyLinkNow: "Copy this link now",
    copySecurityNote: "For security, this exact URL will not be shown again.",
    intakeUrl: "Intake URL",
    advancedCredential: "Advanced — embed credential",
    adminRequired: "Admin role required to share intake links.",
    previewBadge: "Preview",
    /** Disclosure for links that are no longer active — history, kept and not deleted. */
    historyToggle: "View all history",
    activeBadge: "Active",
    inactiveBadge: "Inactive",
} as const;

export function distributionLinkLabel(
    link: DistributionLinkRow,
    fallback: string
): string {
    const meta = link.metadata;
    const label =
        meta && typeof meta.label === "string" && meta.label.trim() ? meta.label.trim() : null;
    if (label) return label;
    if (meta && (meta as { admin_preview?: unknown }).admin_preview === true) {
        return ADMIN_PREVIEW_LINK_LABEL;
    }
    if (meta && (meta as { alloy_admin_preview?: unknown }).alloy_admin_preview === true) {
        return ADMIN_PREVIEW_LINK_LABEL;
    }
    const humanized = humanizeOperatorSlug(fallback);
    return humanized || "Share link";
}

export function distributionIsPreviewLink(link: DistributionLinkRow): boolean {
    const meta = link.metadata;
    if (!meta) return false;
    if ((meta as { admin_preview?: unknown }).admin_preview === true) return true;
    if ((meta as { alloy_admin_preview?: unknown }).alloy_admin_preview === true) return true;
    return typeof meta.label === "string" && meta.label.trim() === ADMIN_PREVIEW_LINK_LABEL;
}

export function distributionLinkPurposeLine(link: DistributionLinkRow): string | null {
    const meta = link.metadata;
    if (!meta || typeof meta !== "object") return null;
    const purpose =
        typeof meta.purpose === "string" && meta.purpose.trim() ? meta.purpose.trim()
        : typeof meta.intake_purpose === "string" && meta.intake_purpose.trim() ? meta.intake_purpose.trim()
        : null;
    return purpose;
}

export function resolveDistributionEmbedUrl(payload: DistributionCreatedLinkPayload): string {
    if (payload.embed_url) return payload.embed_url;
    if (typeof window !== "undefined") {
        return `${window.location.origin}${payload.embed_path}`;
    }
    return payload.embed_path;
}
