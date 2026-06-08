/**
 * Operator-facing share / embed copy (Forms MVP Card 4).
 * Plain language only — no runtime token internals.
 */

import type { OperationalIntentKey } from "@/lib/forms/operationalIntentTemplates";
import { operationalIntentTemplate } from "@/lib/forms/operationalIntentTemplates";

export function buildFormEmbedIframeSnippet(embedUrl: string, title = "Alloy form"): string {
    const safeUrl = embedUrl.trim();
    const safeTitle = title.replace(/"/g, "&quot;");
    return `<iframe src="${safeUrl}" width="100%" height="720" style="border:0;" title="${safeTitle}" loading="lazy"></iframe>`;
}

export function resolveFormShareHint(intent: OperationalIntentKey | null): string {
    if (intent) return operationalIntentTemplate(intent).shareHint;
    return "Copy the share link or embed this form on your website once intake is configured.";
}

export function buildEmbedOperatorNote(intent: OperationalIntentKey | null): string {
    if (intent === "enrollment_lead" || intent === "waitlist") {
        return "Families can complete this form from your website. A new enrollment inquiry will be created for staff review.";
    }
    if (intent === "existing_family") {
        return "For existing families, send from an enrollment inquiry so the response attaches without creating a duplicate lead.";
    }
    if (intent === "packet_step") {
        return "This form is usually completed as one step in an enrollment packet — send the packet from an opportunity.";
    }
    return "Paste the embed code on a page where families should complete this form.";
}
