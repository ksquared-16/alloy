/**
 * D10 pilot — the inbound-attachment filing decision holds every attachment until storage and screening are real, and
 * only then opens ONE Processing case per (message, document) with no guessed family. Pure; no database, no ingress.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    EMAIL_ATTACHMENT_FILING_CAPABILITY,
    EMAIL_ATTACHMENT_FILING_DEPENDENCIES,
    decideInboundAttachmentFiling,
    emailAttachmentSourceKey,
    type InboundAttachmentInput,
} from "@/lib/documents/inbound/emailAttachmentFilingDecision";

const ROOT = resolve(__dirname, "../../..");
const ORG = "0a000000-0000-4000-8000-0000000000d1";
const MSG = "3e000000-0000-4000-8000-0000000000d1";
const DOC = "d0000000-0000-4000-8000-0000000000d1";
const READY = { storage: true, screening: true };

const input = (over: Partial<InboundAttachmentInput> = {}): InboundAttachmentInput => ({
    message: { id: MSG, ownership: "owned", orgId: ORG },
    attachment: { id: "att-1", disposition: "attachment" },
    stored: { documentId: DOC, orgId: ORG, status: "active" },
    screening: { verdict: "clean" },
    ...over,
});

describe("today: every attachment is held, naming what would release it", () => {
    it("storage and screening are not available, and the decision says so instead of pretending", () => {
        expect(EMAIL_ATTACHMENT_FILING_CAPABILITY).toEqual({ storage: false, screening: false });
        const d = decideInboundAttachmentFiling(input());
        expect(d).toEqual({ action: "hold", reasons: ["storage_unavailable", "screening_unavailable"] });
    });

    it("the capability flags match the tree: WS11 storage is in no migration", () => {
        const dir = resolve(ROOT, "supabase/migrations");
        const ws11 = readdirSync(dir).filter((f) => f.endsWith(".sql") && readFileSync(resolve(dir, f), "utf8").includes("communication_message_attachments"));
        expect(ws11.length > 0).toBe(EMAIL_ATTACHMENT_FILING_CAPABILITY.storage);
    });

    it("every prerequisite has an owner, a proof and a next step; the missing ones are marked missing", () => {
        const byKey = Object.fromEntries(EMAIL_ATTACHMENT_FILING_DEPENDENCIES.map((d) => [d.key, d]));
        expect(Object.keys(byKey).sort()).toEqual(["d10_case_opening", "d1c2_content_screening", "ws11_attachment_storage"]);
        for (const d of EMAIL_ATTACHMENT_FILING_DEPENDENCIES) {
            expect(d.owner.length, d.key).toBeGreaterThan(5);
            expect(d.proof.length, d.key).toBeGreaterThan(20);
            expect(d.next.length, d.key).toBeGreaterThan(5);
        }
        expect(byKey.ws11_attachment_storage.state).toBe("missing");
        expect(byKey.d1c2_content_screening.state).toBe("missing");
    });
});

describe("once the prerequisites are real", () => {
    it("an owned, stored, screened-clean attachment opens one case with a stable key and NO proposed subject", () => {
        const d = decideInboundAttachmentFiling(input(), READY);
        expect(d).toEqual({
            action: "open_processing_case",
            orgId: ORG,
            documentId: DOC,
            sourceKind: "email_attachment",
            sourceKey: `email_attachment:${MSG}:${DOC}`,
            filingKey: `email_attachment:${MSG}:${DOC}`,
            proposedSubject: null,
        });
    });

    it("a redelivered email yields the same key, so the existing dedupe and the filing key converge", () => {
        const a = decideInboundAttachmentFiling(input(), READY);
        const b = decideInboundAttachmentFiling(input(), READY);
        expect(a).toEqual(b);
        expect(emailAttachmentSourceKey(MSG, DOC)).toBe(`email_attachment:${MSG}:${DOC}`);
        // within the filing command's 8–200 character key bound
        expect(emailAttachmentSourceKey(MSG, DOC).length).toBeLessThanOrEqual(200);
    });

    const held: Array<[string, Partial<InboundAttachmentInput>, string]> = [
        ["no attributable organization", { message: { id: MSG, ownership: "no_attributable_org", orgId: null } }, "message_not_owned"],
        ["ambiguous across organizations", { message: { id: MSG, ownership: "cross_org_ambiguous", orgId: null } }, "message_ownership_ambiguous"],
        ["inline part", { attachment: { id: "att-1", disposition: "inline" } }, "not_an_attachment"],
        ["not stored", { stored: null }, "attachment_not_stored"],
        ["stored in another organization", { stored: { documentId: DOC, orgId: "0b000000-0000-4000-8000-0000000000d1", status: "active" } }, "stored_in_another_organization"],
        ["quarantined", { stored: { documentId: DOC, orgId: ORG, status: "quarantined" } }, "document_unavailable"],
        ["not yet screened", { screening: null }, "screening_pending"],
        ["screening pending", { screening: { verdict: "pending" } }, "screening_pending"],
        ["infected", { screening: { verdict: "infected" } }, "screening_rejected"],
        ["suspicious", { screening: { verdict: "suspicious" } }, "screening_rejected"],
        ["scan failed", { screening: { verdict: "failed" } }, "screening_rejected"],
    ];
    for (const [why, over, reason] of held) {
        it(`${why} → held (${reason}); nothing is opened`, () => {
            const d = decideInboundAttachmentFiling(input(over), READY);
            expect(d.action).toBe("hold");
            expect(d.action === "hold" && d.reasons).toContain(reason);
        });
    }

    it("storage without screening still holds: an unscanned attachment is never released", () => {
        const d = decideInboundAttachmentFiling(input(), { storage: true, screening: false });
        expect(d).toEqual({ action: "hold", reasons: ["screening_unavailable"] });
    });
});
