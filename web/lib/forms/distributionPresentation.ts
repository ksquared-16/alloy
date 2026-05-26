/**
 * Shared distribution presentation helpers (OW-7).
 * Operational copy and link labeling — no backend semantics.
 */

import { ADMIN_PREVIEW_LINK_LABEL } from "@/lib/forms/adminFormPreview";

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
    packetIntro:
        "Launch this intake workflow — families complete each step in order. Completed runs appear in the session inbox for review.",
    activeLinksLead: "Active intake links for this flow.",
    emptyForm: "No intake links yet. Share this form when you are ready for families to respond.",
    emptyPacket: "No launch links yet. Launch when steps are saved and ready.",
    shareIntake: "Share intake",
    launchPacket: "Launch packet",
    previewRecipient: "Preview recipient experience",
    copyLinkNow: "Copy this link now",
    copySecurityNote: "For security, this exact URL will not be shown again.",
    intakeUrl: "Intake URL",
    advancedCredential: "Advanced — embed credential",
    adminRequired: "Admin role required to share intake links.",
    previewBadge: "Preview",
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
    return fallback;
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
