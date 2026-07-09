/**
 * Processing Studio public form intake — link + publish metadata helpers.
 *
 * Public submissions enter Processing for review. No CRM lead capture defaults.
 */

import { isPosConnectedSurface } from "@/lib/forms/binding/posConnectedMarker";

export const PROCESSING_INTAKE_FORM_CONTEXT_MODE = "processing_intake" as const;

export type ProcessingFormPublishStatus = "draft" | "published" | "archived";

export function isProcessingIntakeLink(metadata: unknown): boolean {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
    const mode = (metadata as { form_context_mode?: unknown }).form_context_mode;
    return mode === PROCESSING_INTAKE_FORM_CONTEXT_MODE;
}

export function buildProcessingPublicLinkMetadata(args: {
    formName: string;
    publicSlug?: string | null;
}): Record<string, unknown> {
    const label = args.formName.trim() || "Public form";
    return {
        form_context_mode: PROCESSING_INTAKE_FORM_CONTEXT_MODE,
        pos_connected: true,
        source: "processing_studio",
        embed_mode: true,
        label,
        purpose: "Public form — submissions enter Processing for review.",
        ...(args.publicSlug ? { public_slug: args.publicSlug } : {}),
    };
}

export function processingPublishMetadataPatch(
    existing: Record<string, unknown>,
    args: { formId: string; formKey: string; formName: string; publicSlug: string }
): Record<string, unknown> {
    return {
        ...existing,
        source: "processing",
        processing_intake_enabled: true,
        processing_public_slug: args.publicSlug,
        processing_public_form_id: args.formId,
        processing_public_form_key: args.formKey.trim() || null,
    };
}

/** Gate: open a Processing Case for this form submission surface. */
export function shouldOpenProcessingCaseForFormSubmission(args: {
    definitionMetadata?: unknown;
    versionMetadata?: unknown;
    linkMetadata?: unknown;
}): boolean {
    if (isPosConnectedSurface(args)) return true;
    return isProcessingIntakeLink(args.linkMetadata);
}

export function deriveProcessingFormPublishStatus(args: {
    formActive?: boolean;
    hasPublishedVersion?: boolean;
    hasActiveProcessingLink?: boolean;
}): ProcessingFormPublishStatus {
    if (args.formActive === false) return "archived";
    if (args.hasPublishedVersion && args.hasActiveProcessingLink) return "published";
    return "draft";
}
