/**
 * Enrollment packet outbound email templates (placeholders + link block).
 * Used by admin launch route and client composer defaults — keep in sync.
 */

export const DEFAULT_ENROLLMENT_EMAIL_SUBJECT_TEMPLATE = "Enrollment packet for {{household_name}}";

export const DEFAULT_ENROLLMENT_EMAIL_BODY_TEMPLATE = [
    "Hello {{recipient_name}},",
    "",
    "Please complete your enrollment using the link(s) below:",
    "",
    "{{packet_links}}",
    "",
    "Thank you,",
    "{{organization_name}}",
].join("\n");

export type EnrollmentPacketLinkRow = {
    embed_url: string | null;
    enrollee_label: string | null;
};

/** HTTP(S) links only — matches mint embed URLs. */
export function enrollmentPacketEmbedUrls(rows: EnrollmentPacketLinkRow[]): string[] {
    return rows
        .map((r) => (typeof r.embed_url === "string" ? r.embed_url.trim() : ""))
        .filter((u) => u.startsWith("http://") || u.startsWith("https://"));
}

/**
 * One link: URL only. Multiple: "Label: URL" per line.
 */
export function buildEnrollmentPacketLinksText(rows: EnrollmentPacketLinkRow[]): string {
    const usable = rows.filter((r) => {
        const u = typeof r.embed_url === "string" ? r.embed_url.trim() : "";
        return u.startsWith("http://") || u.startsWith("https://");
    });
    if (usable.length === 0) return "";
    if (usable.length === 1) return usable[0]!.embed_url!.trim();
    return usable.map((r) => `${r.enrollee_label?.trim() || "Enrollee"}: ${r.embed_url!.trim()}`).join("\n");
}

/** For subject line — avoid multi-line blocks. */
export function buildEnrollmentPacketLinksSubjectFragment(rows: EnrollmentPacketLinkRow[]): string {
    const urls = enrollmentPacketEmbedUrls(rows);
    if (urls.length === 0) return "";
    if (urls.length === 1) return urls[0]!;
    return "Enrollment links (see message)";
}

export function applyEnrollmentEmailPlaceholders(template: string, vars: Record<string, string>): string {
    let out = template;
    for (const [key, val] of Object.entries(vars)) {
        out = out.split(`{{${key}}}`).join(val);
    }
    return out;
}

/**
 * Reads optional templates from form_packet_definitions.metadata.
 * Supported shapes:
 * - metadata.enrollment_email: { subject_template?, body_template? } or { subject?, body? }
 * - metadata.enrollment_packet_email_subject / enrollment_packet_email_body (strings)
 */
export function parseEnrollmentEmailTemplatesFromPacketMetadata(metadata: unknown): { subject?: string; body?: string } | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const m = metadata as Record<string, unknown>;

    const ne = m.enrollment_email;
    if (ne && typeof ne === "object" && !Array.isArray(ne)) {
        const e = ne as Record<string, unknown>;
        const st = e.subject_template ?? e.subject;
        const bt = e.body_template ?? e.body;
        const out: { subject?: string; body?: string } = {};
        if (typeof st === "string" && st.trim()) out.subject = st.trim();
        if (typeof bt === "string" && bt.trim()) out.body = bt.trim();
        if (out.subject || out.body) return out;
    }

    const legacyS = m.enrollment_packet_email_subject;
    const legacyB = m.enrollment_packet_email_body;
    if (typeof legacyS === "string" && legacyS.trim() && typeof legacyB === "string" && legacyB.trim()) {
        return { subject: legacyS.trim(), body: legacyB.trim() };
    }
    if (typeof legacyS === "string" && legacyS.trim()) return { subject: legacyS.trim() };
    if (typeof legacyB === "string" && legacyB.trim()) return { body: legacyB.trim() };

    return null;
}

export type FinalizeEnrollmentEmailInput = {
    /** Operator-edited templates (may still contain placeholders). */
    operatorSubject: string;
    operatorBody: string;
    rows: EnrollmentPacketLinkRow[];
    householdName: string;
    recipientName: string;
    packetName: string;
    organizationName: string;
};

const MAX_SUBJECT = 998;
const MAX_BODY = 100_000;

/**
 * Applies placeholders, injects packet link block for {{packet_links}}, and ensures every minted URL appears in the body.
 */
export function finalizeEnrollmentOutboundEmail(input: FinalizeEnrollmentEmailInput):
    | { ok: true; subject: string; body: string }
    | { ok: false; error: string } {
    const urls = enrollmentPacketEmbedUrls(input.rows);
    if (urls.length === 0) {
        return { ok: false, error: "No packet links available to include in email" };
    }

    const packetLinksText = buildEnrollmentPacketLinksText(input.rows);
    const subjectLinksFragment = buildEnrollmentPacketLinksSubjectFragment(input.rows);

    const base: Record<string, string> = {
        household_name: input.householdName.trim() || "your household",
        recipient_name: input.recipientName.trim() || "there",
        packet_name: input.packetName.trim() || "Enrollment",
        organization_name: input.organizationName.trim(),
        packet_links: packetLinksText,
    };

    const subject = applyEnrollmentEmailPlaceholders(input.operatorSubject.trim(), {
        ...base,
        packet_links: subjectLinksFragment,
    });

    let body = applyEnrollmentEmailPlaceholders(input.operatorBody.trim(), base);

    const missingUrl = urls.some((url) => !body.includes(url));
    if (missingUrl) {
        body = `${body.trimEnd()}\n\n${packetLinksText}`;
    }

    for (const url of urls) {
        if (!body.includes(url)) {
            return {
                ok: false,
                error: "Email body must include all packet links. Keep {{packet_links}} or the generated URLs.",
            };
        }
    }

    if (subject.length > MAX_SUBJECT) return { ok: false, error: "Email subject is too long" };
    if (body.length > MAX_BODY) return { ok: false, error: "Email body is too long" };

    return { ok: true, subject, body };
}
