import { describe, expect, it } from "vitest";

import {
    tourInvitationDetailFromExecutePayload,
    tourInvitationDraftFromDetail,
} from "@/lib/tours/tourInvitationPrepareWarmCache";

describe("tourInvitationPrepareWarmCache detail parsing", () => {
    it("reads draft when execution_result IS the detail (command-runtime shape)", () => {
        const detail = tourInvitationDetailFromExecutePayload({
            ok: true,
            data: {
                execution_result: {
                    invitation_id: "inv-1",
                    draft: {
                        invitationId: "inv-1",
                        emailSubject: "Come visit",
                        emailBody: "Hello\nhttps://example.test/a/abc",
                        smsBody: "Hi https://example.test/a/abc",
                        invitationActionUrl: "https://example.test/a/abc",
                        recipientPersonId: "p1",
                        recipientDisplayName: "Parent",
                        recipientEmail: "p@example.com",
                    },
                },
            },
        });
        const draft = tourInvitationDraftFromDetail(detail);
        expect(draft?.invitationId).toBe("inv-1");
        expect(draft?.emailSubject).toBe("Come visit");
        expect(draft?.emailBody).toContain("https://example.test/a/abc");
        expect(draft?.recipientEmail).toBe("p@example.com");
    });

    it("reads nested .detail when present (legacy wrap)", () => {
        const detail = tourInvitationDetailFromExecutePayload({
            data: {
                execution_result: {
                    detail: {
                        invitation_id: "inv-2",
                        draft: {
                            emailSubject: "Subject",
                            emailBody: "Body only",
                            invitationActionUrl: "https://example.test/a/xyz",
                        },
                    },
                },
            },
        });
        const draft = tourInvitationDraftFromDetail(detail);
        expect(draft?.invitationId).toBe("inv-2");
        expect(draft?.emailBody).toContain("https://example.test/a/xyz");
    });

    it("appends invitationActionUrl when template body omitted the link", () => {
        const draft = tourInvitationDraftFromDetail({
            invitation_id: "inv-3",
            draft: {
                emailSubject: "Visit",
                emailBody: "Hello without a link.",
                smsBody: "SMS without a link.",
                invitationActionUrl: "https://book.example/a/1",
            },
        });
        expect(draft?.emailBody).toContain("https://book.example/a/1");
        expect(draft?.emailBody.startsWith("Hello without a link.")).toBe(true);
        expect(draft?.smsBody).toContain("https://book.example/a/1");
        expect(draft?.smsBody.startsWith("SMS without a link.")).toBe(true);
    });
});
