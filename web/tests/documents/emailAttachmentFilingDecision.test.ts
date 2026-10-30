/**
 * D10 pilot — the gate on ONE inbound attachment. Pure; no database, no ingress, no send.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    DEFAULT_EMAIL_ATTACHMENT_FILING_POLICY,
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
const ALL = { storage: true, structuralScreening: true, malwareScanning: true };
const STRUCTURAL_ONLY = { requireMalwareScan: false };

const input = (over: Partial<InboundAttachmentInput> = {}): InboundAttachmentInput => ({
    message: { id: MSG, ownership: "owned", orgId: ORG },
    attachment: { id: "att-1", disposition: "attachment" },
    stored: { documentId: DOC, orgId: ORG, status: "uploaded" },
    structural: "clean",
    malware: { verdict: "clean" },
    ...over,
});

describe("today's capabilities are the measured ones", () => {
    it("storage absent, structural screening present, malware scanning absent; the default policy requires a malware scan", () => {
        expect(EMAIL_ATTACHMENT_FILING_CAPABILITY).toEqual({ storage: false, structuralScreening: true, malwareScanning: false });
        expect(DEFAULT_EMAIL_ATTACHMENT_FILING_POLICY).toEqual({ requireMalwareScan: true });
        expect(decideInboundAttachmentFiling(input())).toEqual({ action: "hold", reasons: ["storage_unavailable", "malware_scanning_unavailable"] });
    });

    it("the storage flag matches the tree: no migration creates communication_message_attachments", () => {
        const dir = resolve(ROOT, "supabase/migrations");
        const ws11 = readdirSync(dir).filter((f) => f.endsWith(".sql") && readFileSync(resolve(dir, f), "utf8").includes("communication_message_attachments"));
        expect(ws11.length > 0).toBe(EMAIL_ATTACHMENT_FILING_CAPABILITY.storage);
    });

    it("structural screening is the real D1c-1 ingestion screen", () => {
        expect(readFileSync(resolve(ROOT, "web/lib/documents/screenedIngestion.ts"), "utf8")).toContain("export function decideIngestion(");
    });

    it("every missing prerequisite has an owner, a proof and a next step", () => {
        const keys = EMAIL_ATTACHMENT_FILING_DEPENDENCIES.map((d) => d.key).sort();
        expect(keys).toEqual(["communications_ingestion_hook", "d1c2_malware_scanning", "ws11_attachment_storage"]);
        for (const d of EMAIL_ATTACHMENT_FILING_DEPENDENCIES) {
            expect(d.state, d.key).toBe("missing");
            expect(d.owner.length).toBeGreaterThan(5);
            expect(d.proof.length).toBeGreaterThan(20);
        }
    });
});

describe("the gate, with every capability present", () => {
    it("opens ONE case on the stored document, with no proposed subject", () => {
        expect(decideInboundAttachmentFiling(input(), ALL)).toEqual({
            action: "open_processing_case",
            orgId: ORG,
            documentId: DOC,
            sourceKind: "email_attachment",
            sourceId: DOC,
            sourceKey: `email_attachment:${MSG}:att-1`,
            proposedSubject: null,
        });
        expect(emailAttachmentSourceKey(MSG, "att-1")).toBe(`email_attachment:${MSG}:att-1`);
    });

    const held: Array<[string, Partial<InboundAttachmentInput>, string]> = [
        ["no attributable organization", { message: { id: MSG, ownership: "no_attributable_org", orgId: null } }, "message_not_owned"],
        ["ambiguous across organizations", { message: { id: MSG, ownership: "cross_org_ambiguous", orgId: null } }, "message_ownership_ambiguous"],
        ["inline part", { attachment: { id: "att-1", disposition: "inline" } }, "not_an_attachment"],
        ["not stored", { stored: null, structural: null }, "attachment_not_stored"],
        ["refused by structural screening", { stored: null, structural: "refused" }, "screening_refused"],
        ["stored in another organization", { stored: { documentId: DOC, orgId: "0b000000-0000-4000-8000-0000000000d1", status: "uploaded" } }, "stored_in_another_organization"],
        ["quarantined by structural screening", { structural: "quarantined", stored: { documentId: DOC, orgId: ORG, status: "quarantined" } }, "document_unavailable"],
        ["stored but never screened", { structural: null }, "screening_missing"],
        ["malware scan pending", { malware: { verdict: "pending" } }, "malware_pending"],
        ["malware scan absent", { malware: null }, "malware_pending"],
        ["infected", { malware: { verdict: "infected" } }, "malware_rejected"],
        ["scan failed", { malware: { verdict: "failed" } }, "malware_rejected"],
    ];
    for (const [why, over, reason] of held) {
        it(`${why} → held (${reason})`, () => {
            const d = decideInboundAttachmentFiling(input(over), ALL);
            expect(d.action).toBe("hold");
            expect(d.action === "hold" && d.reasons).toContain(reason);
        });
    }

    it("a structural-only policy is an explicit choice: it releases on D1c-1 alone, and still holds quarantine", () => {
        const noScanner = { storage: true, structuralScreening: true, malwareScanning: false };
        expect(decideInboundAttachmentFiling(input({ malware: null }), noScanner, STRUCTURAL_ONLY).action).toBe("open_processing_case");
        expect(decideInboundAttachmentFiling(input({ malware: null }), noScanner).action).toBe("hold");
        const q = decideInboundAttachmentFiling(input({ structural: "quarantined", stored: { documentId: DOC, orgId: ORG, status: "quarantined" }, malware: null }), noScanner, STRUCTURAL_ONLY);
        expect(q).toEqual({ action: "hold", reasons: ["document_unavailable"] });
    });
});
