import { describe, expect, it } from "vitest";
import {
    DEFAULT_ENROLLMENT_EMAIL_BODY_TEMPLATE,
    DEFAULT_ENROLLMENT_EMAIL_SUBJECT_TEMPLATE,
    applyEnrollmentEmailPlaceholders,
    buildEnrollmentPacketLinksSubjectFragment,
    buildEnrollmentPacketLinksText,
    finalizeEnrollmentOutboundEmail,
    parseEnrollmentEmailTemplatesFromPacketMetadata,
} from "@/lib/forms/packets/enrollmentPacketEmailTemplate";

describe("parseEnrollmentEmailTemplatesFromPacketMetadata", () => {
    it("reads enrollment_email object", () => {
        const r = parseEnrollmentEmailTemplatesFromPacketMetadata({
            enrollment_email: { subject_template: "S {{x}}", body_template: "B {{y}}" },
        });
        expect(r?.subject).toBe("S {{x}}");
        expect(r?.body).toBe("B {{y}}");
    });

    it("reads legacy flat keys", () => {
        const r = parseEnrollmentEmailTemplatesFromPacketMetadata({
            enrollment_packet_email_subject: "Subj",
            enrollment_packet_email_body: "Bod",
        });
        expect(r?.subject).toBe("Subj");
        expect(r?.body).toBe("Bod");
    });
});

describe("buildEnrollmentPacketLinksText", () => {
    it("returns single URL when one link", () => {
        expect(
            buildEnrollmentPacketLinksText([
                { embed_url: "https://a.example/x", enrollee_label: "Kid" },
            ])
        ).toBe("https://a.example/x");
    });

    it("returns labelled lines for multiple links", () => {
        const t = buildEnrollmentPacketLinksText([
            { embed_url: "https://a.example/1", enrollee_label: "Ann" },
            { embed_url: "https://a.example/2", enrollee_label: "Ben" },
        ]);
        expect(t).toContain("Ann: https://a.example/1");
        expect(t).toContain("Ben: https://a.example/2");
    });
});

describe("buildEnrollmentPacketLinksSubjectFragment", () => {
    it("uses first URL for single link", () => {
        expect(buildEnrollmentPacketLinksSubjectFragment([{ embed_url: "https://x", enrollee_label: null }])).toBe("https://x");
    });

    it("uses generic text for multiple", () => {
        expect(
            buildEnrollmentPacketLinksSubjectFragment([
                { embed_url: "https://a", enrollee_label: null },
                { embed_url: "https://b", enrollee_label: null },
            ])
        ).toBe("Enrollment links (see message)");
    });
});

describe("finalizeEnrollmentOutboundEmail", () => {
    const rows = [{ embed_url: "https://links.example/p1", enrollee_label: "Sam" }];

    it("rejects when no usable URLs", () => {
        const r = finalizeEnrollmentOutboundEmail({
            operatorSubject: DEFAULT_ENROLLMENT_EMAIL_SUBJECT_TEMPLATE,
            operatorBody: DEFAULT_ENROLLMENT_EMAIL_BODY_TEMPLATE,
            rows: [{ embed_url: null, enrollee_label: "x" }],
            householdName: "H",
            recipientName: "R",
            packetName: "P",
            organizationName: "O",
        });
        expect(r.ok).toBe(false);
    });

    it("injects links via placeholder", () => {
        const r = finalizeEnrollmentOutboundEmail({
            operatorSubject: DEFAULT_ENROLLMENT_EMAIL_SUBJECT_TEMPLATE,
            operatorBody: "Hi\n\n{{packet_links}}\n",
            rows,
            householdName: "Smith",
            recipientName: "Pat",
            packetName: "Fall",
            organizationName: "OrgCo",
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.body).toContain("https://links.example/p1");
        expect(r.subject).toContain("Smith");
    });

    it("appends links when placeholder removed", () => {
        const r = finalizeEnrollmentOutboundEmail({
            operatorSubject: "Sub",
            operatorBody: "No links here",
            rows,
            householdName: "H",
            recipientName: "R",
            packetName: "P",
            organizationName: "",
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.body).toContain("https://links.example/p1");
    });
});

describe("applyEnrollmentEmailPlaceholders", () => {
    it("replaces known tokens", () => {
        expect(
            applyEnrollmentEmailPlaceholders("{{a}} {{b}}", {
                a: "1",
                b: "2",
            })
        ).toBe("1 2");
    });
});
