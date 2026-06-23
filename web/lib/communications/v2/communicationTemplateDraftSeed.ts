/**
 * Communications V2 — apply a template's current_version to an editable composer draft.
 * Pure parse helpers + a thin fetch wrapper for client workspaces.
 */

import { templateChannelSupportsSubject, type TemplateChannel } from "@/lib/communications/v2/templateSchema";

export type CommunicationTemplatePreview = {
    subject: string | null;
    body: string;
};

export type CommunicationTemplateDraftSeed = {
    subject: string;
    body: string;
};

export function parseCommunicationTemplateCurrentVersion(currentVersion: unknown): CommunicationTemplatePreview | null {
    if (!currentVersion || typeof currentVersion !== "object") return null;
    const cv = currentVersion as Record<string, unknown>;
    const body = cv.body != null ? String(cv.body) : "";
    const subjectRaw = cv.subject;
    const subject =
        subjectRaw == null || String(subjectRaw).trim() === ""
            ? null
            : String(subjectRaw).trim();
    return { subject, body };
}

/** Map template preview → editable draft fields for a delivery channel. */
export function communicationTemplateDraftSeedFromPreview(
    preview: CommunicationTemplatePreview,
    channel: TemplateChannel | "email" | "sms"
): CommunicationTemplateDraftSeed {
    const ch = channel === "email" || channel === "sms" ? channel : "email";
    return {
        subject: templateChannelSupportsSubject(ch) ? (preview.subject ?? "") : "",
        body: preview.body,
    };
}

export async function fetchCommunicationTemplateCurrentVersion(
    templatesApiBase: string,
    templateId: string
): Promise<CommunicationTemplatePreview | null> {
    const id = templateId.trim();
    if (!id) return null;
    const res = await fetch(`${templatesApiBase}/${id}`, { credentials: "include" });
    const json = (await res.json().catch(() => ({}))) as { current_version?: unknown };
    if (!res.ok) return null;
    return parseCommunicationTemplateCurrentVersion(json.current_version);
}
