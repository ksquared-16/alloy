/**
 * D10 pilot — the gate on ONE inbound attachment. Pure; no database, no ingress, no send.
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
import { isInboundAttachmentRetrievalEnabled } from "@/lib/communications/email/inboundAttachmentRetrieval";

const ROOT = resolve(__dirname, "../../..");
const ORG = "0a000000-0000-4000-8000-0000000000d1";
const MSG = "3e000000-0000-4000-8000-0000000000d1";
const DOC = "d0000000-0000-4000-8000-0000000000d1";
const VER = "5e000000-0000-4000-8000-0000000000d1";
const SHA = "a".repeat(64);
const BOUND = { documentId: DOC, versionId: VER, checksumSha256: SHA };
const ALL = { storage: true, structuralScreening: true, malwareScanning: true };

const input = (over: Partial<InboundAttachmentInput> = {}): InboundAttachmentInput => ({
    message: { id: MSG, ownership: "owned", orgId: ORG },
    attachment: { id: "att-1", disposition: "attachment" },
    stored: { documentId: DOC, orgId: ORG, status: "uploaded", versionId: VER, checksumSha256: SHA },
    structural: "clean",
    malware: { verdict: "clean", subject: BOUND },
    ...over,
});

describe("today's capabilities are the measured ones", () => {
    it("storage absent, structural screening present, malware scanning absent; the default policy requires a malware scan", () => {
        expect(EMAIL_ATTACHMENT_FILING_CAPABILITY).toEqual({ storage: false, structuralScreening: true, malwareScanning: false });
        expect(decideInboundAttachmentFiling(input())).toEqual({ action: "hold", reasons: ["storage_unavailable", "malware_scanning_unavailable"] });
    });

    it("the storage flag matches production: the WS11 link migration is in the tree, but retrieval is OFF by default", () => {
        // The table's migration exists (pending; its apply is a separate approval), so a file is no longer the measure.
        // Storage is live only when Communications switches retrieval on, which the default environment does not.
        const dir = resolve(ROOT, "supabase/migrations");
        const ws11 = readdirSync(dir).filter((f) => f.endsWith(".sql") && readFileSync(resolve(dir, f), "utf8").includes("CREATE TABLE IF NOT EXISTS public.communication_message_attachments"));
        expect(ws11).toEqual(["20261218090000_communication_message_attachments.sql"]);
        expect(isInboundAttachmentRetrievalEnabled({})).toBe(EMAIL_ATTACHMENT_FILING_CAPABILITY.storage);
    });

    it("structural screening is the real D1c-1 ingestion screen", () => {
        expect(readFileSync(resolve(ROOT, "web/lib/documents/screenedIngestion.ts"), "utf8")).toContain("export function decideIngestion(");
    });

    it("every missing prerequisite has an owner, a proof and a next step", () => {
        const keys = EMAIL_ATTACHMENT_FILING_DEPENDENCIES.map((d) => d.key).sort();
        expect(keys).toEqual(["communications_ingestion_hook", "d1c2_malware_scanning", "processing_atomic_open", "ws11_attachment_storage"]);
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
        // D1c-2 binding: "clean" releases only the exact stored version it names.
        ["clean verdict naming no bytes", { malware: { verdict: "clean" } }, "malware_verdict_unbound"],
        ["clean verdict for an earlier version", { malware: { verdict: "clean", subject: { ...BOUND, versionId: "5e000000-0000-4000-8000-0000000000d2" } } }, "malware_verdict_unbound"],
        ["clean verdict for other bytes (hash differs)", { malware: { verdict: "clean", subject: { ...BOUND, checksumSha256: "b".repeat(64) } } }, "malware_verdict_unbound"],
        ["clean verdict for another document", { malware: { verdict: "clean", subject: { ...BOUND, documentId: "d0000000-0000-4000-8000-0000000000d2" } } }, "malware_verdict_unbound"],
        ["stored row without a version", { stored: { documentId: DOC, orgId: ORG, status: "uploaded", versionId: null, checksumSha256: SHA } }, "malware_verdict_unbound"],
        ["stored row without a content hash", { stored: { documentId: DOC, orgId: ORG, status: "uploaded", versionId: VER, checksumSha256: null } }, "malware_verdict_unbound"],
    ];
    for (const [why, over, reason] of held) {
        it(`${why} → held (${reason})`, () => {
            const d = decideInboundAttachmentFiling(input(over), ALL);
            expect(d.action).toBe("hold");
            expect(d.action === "hold" && d.reasons).toContain(reason);
        });
    }

    it("structural screening alone never releases: no scanner holds, whatever a caller passes", () => {
        const noScanner = { storage: true, structuralScreening: true, malwareScanning: false };
        const d = decideInboundAttachmentFiling(input({ malware: null }), noScanner);
        expect(d).toEqual({ action: "hold", reasons: ["malware_scanning_unavailable"] });
        // A legacy structural-only policy argument has no effect: the gate takes no policy.
        const legacy = (decideInboundAttachmentFiling as (...a: unknown[]) => ReturnType<typeof decideInboundAttachmentFiling>)(
            input({ malware: null }), noScanner, { requireMalwareScan: false });
        expect(legacy.action).toBe("hold");
        // A "clean" verdict without a scanner capability is ignored, never trusted.
        expect(decideInboundAttachmentFiling(input({ malware: { verdict: "clean", subject: null } }), noScanner).action).toBe("hold");
    });
});
