/**
 * The fourth obligation.
 *
 * Three of the four document-shaped obligations in the real corpus are documents. The fourth is the
 * family handbook's ACH sentence, and forcing it to be a fourth upload would have produced exactly
 * the outcome the whole ownership pass exists to prevent: a family attaching bank paperwork, and
 * Alloy holding account details it must never hold.
 *
 * So these controls run in both directions. The positives prove the deferral is recorded with its
 * owner and its lineage. The negatives prove the deferral is narrow — that an immunization clause is
 * still a document, and that "deferred" never becomes a way to make an obligation disappear.
 */

import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { loadCertificationPacket } from "@/lib/pos/packetIntake/loadCertificationPacket";
import { composePacket } from "@/lib/pos/packetIntake/composePacket";
import { buildFormDraftFromStructure } from "@/lib/pos/processingCase/formDraft/buildFormDraftFromStructure";
import { applyDiscovery } from "@/lib/pos/discovery/applyDiscovery";
import { deferredCapabilityFor, PAYMENT_SETUP_REQUIRED } from "@/lib/pos/discovery/deferredCapabilities";
import { reconcileDocumentObligations, describeObligationReconciliation } from "@/lib/pos/packet/obligationReconciliation";
import { isBulkAcceptSafe } from "@/lib/pos/discovery/bulkAcceptSafety";
import { structureForArtifact } from "@/lib/pos/processingCase/structure/structureForArtifact";
import { classifyPaymentSetupArtifact } from "@/lib/pos/packet/paymentSetupArtifact";
import { conciseRow, needsOperatorReview } from "@/lib/pos/discovery/reviewPresentation";
import type { PacketIntakeInput, PacketIntakeResult } from "@/lib/pos/packetIntake/contracts";
import type { ConfigurationProposal, ProposalDecisionState } from "@/lib/pos/discovery/contracts";

let inputs: PacketIntakeInput[];
let packet: PacketIntakeResult;

beforeAll(async () => {
    inputs = await loadCertificationPacket(path.join(process.cwd(), "tests/fixtures/processing"));
    packet = composePacket(inputs);
}, 300_000);

const all = () => inputs.flatMap((i) => i.discovery.proposals);
const allConcepts = () => inputs.flatMap((i) => i.discovery.concepts);
const theDeferred = (): ConfigurationProposal => {
    const p = all().find((x) => x.deferred_capability);
    expect(p, "no deferred obligation found in the corpus").toBeDefined();
    return p!;
};

describe("the classifier is narrow", () => {
    it("recognises payment setup however the school words it", () => {
        for (const clause of [
            "To update information provided in your ACH account, please complete an updated electronic ACH form.",
            "Please attach a voided check to establish automatic payments.",
            "Complete the direct debit authorization before the first day of school.",
            "Update your payment method by the 10th of the month.",
        ]) {
            expect(deferredCapabilityFor({ label: clause, concept_id: "c" }), clause).not.toBeNull();
        }
    });

    it("leaves real document obligations alone — the negative control", () => {
        // If any of these deferred, the certification would lose a document requirement and call it
        // an ownership decision.
        for (const clause of [
            "Oregon law requires proof of immunization or exemption signed prior to a child’s attendance at school.",
            "Medical exemptions and immunity documentation require a letter signed by a licensed physician.",
            "I have attached the required document from (check one):",
            "Please attach a copy of the child's birth certificate.",
            "Tuition is due on the first of each month.",
        ]) {
            expect(deferredCapabilityFor({ label: clause, concept_id: "c" }), clause).toBeNull();
        }
    });
});

describe("the fourth obligation, in the real corpus", () => {
    it("is payment setup held for Financials — not a document, not missing", () => {
        const p = theDeferred();
        expect(p.disposition).toBe("financial_payment");
        expect(p.deferred_capability!.obligation).toBe(PAYMENT_SETUP_REQUIRED);
        expect(p.deferred_capability!.intended_owner).toBe("FINANCIAL_PAYMENT");
        // Existing vocabulary, deliberately: a deferral IS a hold, reached by a clause.
        expect(p.deferred_capability!.hold_state).toBe("HELD_PENDING_FINANCIALS");
        expect(p.ownership_routing?.owner).toBe("FINANCIAL_PAYMENT");
    });

    it("keeps the lineage that lets an operator recognise it", () => {
        const cap = theDeferred().deferred_capability!;
        expect(cap.clause).toMatch(/\bACH\b/i);
        expect(cap.concept_id).toBe(theDeferred().candidate_id);
        expect(cap.section_title).toBeTruthy();
        expect(cap.reason).toMatch(/Financials|payment provider/i);
    });

    it("is the only one — the other three stay documents", () => {
        const r = reconcileDocumentObligations(all(), allConcepts());
        expect(describeObligationReconciliation(r)).toBe(
            "4 document/payment-like obligations discovered → 3 Enrollment document-upload obligations → 1 deferred Financials/Payments obligation → 0 dropped",
        );
        for (const e of r.executable) expect(e.clause).not.toMatch(/\bACH\b/i);
    });
});

describe("what the deferral must never do", () => {
    /**
     * Apply an ARTIFACT exactly as the packet realization does — projected to that artifact's own
     * sections, with every proposal accepted, which is the most permissive publish possible.
     *
     * Document-grain would have been the easier harness and the wrong one: the source PDF contains
     * the payment page whether or not the packet executes it, so a document-grain assertion proves
     * nothing about what a family is shown.
     */
    function appliedArtifact(artifact: PacketIntakeResult["artifacts"][number]) {
        const input = inputs.find((i) => i.artifact.document_id === artifact.document_id)!;
        const projected = structureForArtifact(input.structure, artifact);
        const draft = buildFormDraftFromStructure({
            structure: projected.structure,
            sourceDocumentId: artifact.document_id,
            extractedText: null,
            extractedTextAvailable: false,
            fileName: null,
            classificationKey: null,
        });
        const decisions: Record<string, ProposalDecisionState> = {};
        for (const p of input.discovery.proposals) decisions[p.id] = "accepted";
        return applyDiscovery({ draft, discovery: input.discovery, decisions });
    }

    /** The artifacts this packet would actually realize. */
    const executableArtifacts = () =>
        packet.artifacts.filter(
            (a) =>
                !classifyPaymentSetupArtifact(
                    a,
                    packet.source_analysis[a.document_id]?.concepts ?? [],
                    packet.source_analysis[a.document_id]?.proposals ?? [],
                ).isPaymentSetup,
        );

    it("never becomes a file_ref, even when an operator accepts everything", () => {
        // This regression runs the other way from most: the danger is not that the obligation fails
        // to execute, it is that it DOES — as a bank document a family is asked to attach.
        const uploads = executableArtifacts().flatMap((a) =>
            appliedArtifact(a).updatedDraft.sections.flatMap((sec) => sec.clause_uploads ?? []),
        );
        expect(uploads).toHaveLength(3);
        for (const u of uploads) expect(u.label ?? "").not.toMatch(/\bACH\b|bank|routing/i);
    });

    it("asks no family for a routing or account number", () => {
        // The Direct Payment Authorization's proposals all refused to STORE a bank credential — and
        // a Form is built from the source's destinations, not its proposals, so the page still
        // ASKED for one. That gap is why the artifact defers rather than realizing.
        expect(theDeferred().proposed_field).toBeUndefined();
        for (const a of executableArtifacts()) {
            for (const f of appliedArtifact(a).updatedDraft.fields) {
                expect(f.label ?? "", `${a.title} asks a family for a bank credential`).not.toMatch(
                    /routing number|account number|bank account/i,
                );
            }
        }
    });

    it("holds the paper authorization artifact instead of executing it", () => {
        const held = packet.artifacts.filter(
            (a) =>
                classifyPaymentSetupArtifact(
                    a,
                    packet.source_analysis[a.document_id]?.concepts ?? [],
                    packet.source_analysis[a.document_id]?.proposals ?? [],
                ).isPaymentSetup,
        );
        expect(held.map((a) => a.title)).toEqual(["Direct Payment Authorization"]);
    });

    it("keeps executing artifacts that merely mention money", () => {
        // The conservative half of the rule. If a tuition line were enough to hold an artifact, the
        // Tuition & Enrollment Agreement would stop being signed.
        const titles = executableArtifacts().map((a) => a.title);
        expect(titles).toContain("Tuition & Enrollment Agreement");
        expect(titles).toContain("Parent Handbook Acknowledgement");
        expect(titles.length).toBe(packet.artifacts.length - 1);
    });

    it("is recorded in the apply ledger as held, never as an unexplained skip", () => {
        const doc = theDeferred();
        const input = inputs.find((i) => i.discovery.proposals.some((p) => p.id === doc.id))!;
        const decisions: Record<string, ProposalDecisionState> = {};
        for (const p of input.discovery.proposals) decisions[p.id] = "accepted";
        const draft = buildFormDraftFromStructure({
            structure: input.structure,
            sourceDocumentId: input.artifact.document_id,
            extractedText: null,
            extractedTextAvailable: false,
            fileName: null,
            classificationKey: null,
        });
        const row = applyDiscovery({ draft, discovery: input.discovery, decisions }).result.results.find((r) => r.proposal_id === doc.id);
        expect(row).toBeDefined();
        expect(row!.outcome).toBe("skipped");
        expect(row!.detail).toMatch(/Financials \/ Payments/);
        expect(row!.detail).toMatch(/nothing was dropped/i);
    });

    it("is never swept into a bulk accept", () => {
        expect(isBulkAcceptSafe(theDeferred())).toBe(false);
    });

    it("does not block the operator — it is a conclusion, not a decision", () => {
        // A deferred capability with an owner named is not something an operator can decide today.
        // Putting it in the review queue would stall a certification on a question nobody can answer.
        expect(needsOperatorReview(theDeferred())).toBe(false);
    });

    it("reads as deferred in review — never as something families provide", () => {
        const row = conciseRow(theDeferred());
        expect(row.ownership).toMatch(/Deferred/);
        expect(row.ownership).toMatch(/Financials \/ Payments/);
        expect(row.consequence).toMatch(/nobody is asked/i);
    });
});

describe("the reconciliation can actually fail", () => {
    it("reports a lost obligation rather than counting it as handled", () => {
        // Anchored on concepts, so an obligation that quietly became something else is visible. If
        // this ever passes with `ok: true`, the reconciliation has stopped being a check.
        const r = reconcileDocumentObligations(
            [{ candidate_id: "c1", disposition: "static_content" }],
            [{ id: "c1", kind: "upload_requirement", label: "Please attach the signed physician letter." }],
        );
        expect(r.discovered).toBe(1);
        expect(r.dropped).toHaveLength(1);
        expect(r.ok).toBe(false);
    });

    it("reports an obligation with no proposal at all", () => {
        const r = reconcileDocumentObligations([], [{ id: "c1", kind: "upload_requirement", label: "Attach it." }]);
        expect(r.dropped[0]!.disposition).toBe("no_proposal");
        expect(r.ok).toBe(false);
    });
});
