/**
 * The person half of repeated-person finalization, guarded at the seams a live run cannot pin.
 *
 * The live certification is in the run record: Corinne reused (no new person, same relationship
 * row), Farrah created once (25 → 26 persons, 2 → 3 relationships), both replays
 * `already_applied` with the counts unchanged, and Bea — the sibling — left with zero
 * relationships. These guard the code that made each of those true.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url).pathname, "utf8");

const EXECUTOR = read("../../lib/pos/processingCase/commit/executeRelationshipProposalCommit.ts");
const ROUTE = read(
    "../../app/api/admin/processing/cases/[caseId]/related-record-proposals/[proposalId]/commit/route.ts",
);
const LOADER = read("../../lib/pos/processingCase/commit/loadRelatedRecordProposalForCase.ts");

describe("a known person is reused, never recreated", () => {
    it("drafts a Person only when the proposal asks to create one", () => {
        expect(EXECUTOR).toContain(
            'const draft = resolved.identityAction === "create_proposed_person" ? personDraftFromFacts(facts) : null;',
        );
    });

    it("sends the existing person id instead of a draft when one is known", () => {
        const at = EXECUTOR.indexOf("executeCommandInvocation({");
        const call = EXECUTOR.slice(at, at + 1400);
        expect(call).toContain("resolved.existingPersonId ? { selectedPersonId: resolved.existingPersonId }");
        expect(call).toContain("draft ? { createPersonDraft: draft }");
    });

    it("never writes canonically itself — the command runtime does", () => {
        expect(EXECUTOR).toContain("executeCommandInvocation");
        expect(EXECUTOR, "a direct table write would bypass the canonical relationship owner").not.toMatch(
            /\.from\("person_child_relationships"\)|\.from\("persons"\)/,
        );
    });
});

describe("a pure reuse is a truthful outcome, not a failure", () => {
    it("routes a configured relationship away from the native child plan entirely", () => {
        /*
         * The 409 "no clean approved fields" belongs to the native CHILD path. An emergency contact
         * is a configured relationship and must never reach it.
         *
         * Asserting the WHOLE condition, because the first version of this test asserted only that
         * the classification string appeared somewhere and the call sites were in order — and
         * stayed green when the branch was disabled with `if (false && …)`. A guard that survives
         * the defect it names is not a guard.
         */
        expect(ROUTE).toContain(
            'if (proposalContext?.proposal.execution_kind === "configured_relationship") {',
        );
        const at = ROUTE.indexOf('if (proposalContext?.proposal.execution_kind === "configured_relationship") {');
        expect(at).toBeGreaterThan(0);
        // Compare the CALL sites, not the imports at the top of the file.
        expect(ROUTE.indexOf("await executeRelationshipProposalCommit({"), "the relationship branch must come first")
            .toBeLessThan(ROUTE.indexOf("await executeExistingChildProposalCommit({"));
        // And the relationship branch returns before the native one can be reached.
        expect(ROUTE.slice(at, ROUTE.indexOf("await executeExistingChildProposalCommit({"))).toContain("return relOutcome.ok");
    });

    it("reports an applied or already-applied outcome, never a bare rejection, once authorized", () => {
        expect(EXECUTOR).toContain('outcome: "already_applied"');
        expect(EXECUTOR).toContain('outcome: "applied"');
    });
});

describe("replay cannot duplicate what a commit already wrote", () => {
    it("short-circuits on a ledger entry that already applied", () => {
        const at = EXECUTOR.indexOf("const prior = ledgerFrom(args.metadata)[key];");
        expect(at).toBeGreaterThan(0);
        const block = EXECUTOR.slice(at, at + 260);
        expect(block).toContain('prior.outcome === "applied"');
        expect(block).toContain('outcome: "already_applied"');
    });

    it("short-circuits BEFORE the person draft and before the command runs", () => {
        const ledgerAt = EXECUTOR.indexOf("const prior = ledgerFrom(args.metadata)[key];");
        expect(ledgerAt).toBeLessThan(EXECUTOR.indexOf("personDraftFromFacts(facts)"));
        expect(ledgerAt).toBeLessThan(EXECUTOR.indexOf("executeCommandInvocation({"));
    });

    it("keys the ledger on the resolved anchor, so the same role for another child is not a retry", () => {
        const at = EXECUTOR.indexOf("const key = idempotencyKey(");
        expect(at).toBeGreaterThan(0);
        const call = EXECUTOR.slice(at, at + 320);
        expect(call).toContain("anchor.scope");
        expect(call).toContain("anchor.memberIds");
        expect(call).toContain("household.revision");
    });
});

describe("provenance is carried by the commit path", () => {
    /*
     * DETERMINATION (instruction §9). The nulls seen in review evidence are NOT a defect of this
     * commit path: `loadRelatedRecordProposalForCase` passes the real packet session and step, so a
     * committed proposal's lineage names the packet step the family filled. The chain is also
     * deterministic without duplication — the proposal id embeds the submission, the case is the
     * address the proposal is fetched through, and `listCaseFormSubmissionSources` expands the
     * case's packet source into its ordered submissions. No identifier was duplicated to fill a
     * field.
     */
    it("passes the packet session, step and form name into the proposal lineage", () => {
        expect(LOADER).toContain("packetSessionId: entry.packetSessionId");
        expect(LOADER).toContain("packetStepIndex: entry.stepIndex");
        expect(LOADER).toContain("formName: entry.formName");
    });

    it("reaches the submissions through the case's own sources", () => {
        expect(LOADER).toContain("listCaseFormSubmissionSources(args.supabase, args.orgId, args.caseId)");
    });

    it("records which household and resolution the commit ran against", () => {
        expect(EXECUTOR).toContain("resolution_revision: household.revision");
        expect(EXECUTOR).toContain("resolved_customer_id: anchorCustomerId");
    });
});
