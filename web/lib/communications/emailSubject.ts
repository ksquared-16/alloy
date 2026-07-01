/**
 * Canonical outbound email subject for Communications V1 (plain text).
 * Used when the client omits subject or sends whitespace-only.
 */

export function resolveOutboundEmailSubject(primaryEntityType: string, subjectRaw?: string | null): string {
    const trimmed = typeof subjectRaw === "string" ? subjectRaw.trim() : "";
    if (trimmed) return trimmed;

    const et = primaryEntityType.trim().toLowerCase();
    if (et === "opportunities") return "Update regarding your inquiry";
    if (et === "jobs") return "Update regarding your service";
    return "Message from Alloy";
}
