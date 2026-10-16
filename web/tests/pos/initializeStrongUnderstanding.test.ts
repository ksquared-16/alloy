/**
 * The importer's first pass applies what discovery is SURE of — the same rule as the review's
 * "accept all high-confidence" — and leaves everything else as a proposal.
 */
import { describe, expect, it } from "vitest";

import { chooseDraftForCase } from "@/lib/pos/processingCase/formDraft/buildFormDraftForCaseSafe";
import { initializeStrongUnderstanding } from "@/lib/pos/discovery/initializeStrongUnderstanding";
import { isBulkAcceptSafe } from "@/lib/pos/discovery/bulkAcceptSafety";

const draftFor = (text: string) =>
    chooseDraftForCase({
        sourceDocumentId: "doc",
        fileName: "source.txt",
        classificationKey: null,
        text: { available: true, text, reason: null },
        pdfBytes: null,
        mimeType: "text/plain",
        extractAcroForm: async () => ({ fields: [] }) as never,
    });

const EMERGENCY =
    "EMERGENCY CONTACTS\nEmergency Contact 1 Name: ________ Phone: ________ Relationship: ________\nEmergency Contact 2 Name: ________ Phone: ________ Relationship: ________\n";
const CHILD = "CHILD INFORMATION\nChild's Gender: ________\nChild's Nickname: ________\nGuardian's Name: ________\nHome language: ________\n";

describe("strong understanding initializes the form", () => {
    it("turns printed emergency-contact rows into the canonical collection, and records it as accepted", async () => {
        const draft = await draftFor(EMERGENCY);
        const { draft: out, application } = initializeStrongUnderstanding(draft);
        expect(application?.counts.applied).toBeGreaterThan(0);
        expect((out.collections ?? []).length).toBe(1);
        const applied = application!.results.filter((r) => r.outcome === "applied");
        expect(applied.map((r) => r.disposition)).toEqual(["relationship_binding"]);
        const proposal = out.configuration_discovery!.proposals.find((p) => p.id === applied[0]!.proposal_id);
        expect(proposal?.decision_state).toBe("accepted");
        expect(application!.ledger.length).toBeGreaterThan(0);
        // The emergency contact is never written onto the guardian.
        expect(draft.fields.find((f) => /emergency contact 1 name/i.test(f.label))?.field_source).toBeUndefined();
    });

    it("applies nothing a person still has to decide", async () => {
        const draft = await draftFor(`${EMERGENCY}${CHILD}`);
        const { draft: out } = initializeStrongUnderstanding(draft);
        for (const p of out.configuration_discovery!.proposals) {
            if (p.decision_state === "accepted") expect(isBulkAcceptSafe(p), p.id).toBe(true);
        }
    });

    it("keeps what the resolver already settled", async () => {
        const draft = await draftFor(CHILD);
        const { draft: out, skipped } = initializeStrongUnderstanding(draft);
        expect(skipped.some((s) => s.reason === "already_mapped")).toBe(true);
        expect(out.fields.map((f) => f.field_source ?? null)).toEqual(draft.fields.map((f) => f.field_source ?? null));
    });

    it("does not bind a whole name to a first name — that is the operator's First | Last split", async () => {
        const draft = await draftFor(CHILD);
        const guardian = draft.fields.find((f) => f.label === "Guardian's Name")!;
        delete guardian.field_source;
        const { draft: out, skipped } = initializeStrongUnderstanding(draft);
        expect(skipped.some((s) => s.reason === "whole_name")).toBe(true);
        expect(out.fields.find((f) => f.label === "Guardian's Name")?.field_source).toBeUndefined();
    });

    it("is a no-op for a draft discovery could not read", async () => {
        const draft = await draftFor(CHILD);
        delete draft.configuration_discovery;
        expect(initializeStrongUnderstanding(draft)).toEqual({ draft, application: null, skipped: [] });
    });
});
