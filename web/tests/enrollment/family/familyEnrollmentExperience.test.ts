/**
 * ONE FAMILY JOURNEY, AND WHAT IT IS NOT ALLOWED TO DO TO THE CHILDREN UNDERNEATH IT.
 *
 * The whole risk of a family shell is bleed: one child reading as done because a sibling is, a
 * household total that quietly recomputes what Financials already decided, or a fact deduplicated
 * whose evidence belongs separately to each child. These assert against all three.
 */
import { describe, expect, it } from "vitest";

import {
    FAMILY_FACT_OWNERSHIP,
    composeFamilyEnrollmentExperience,
    type FamilyChildJourney,
    type FamilyEnrollmentFinancials,
} from "@/lib/enrollment/family/familyEnrollmentExperience";

const child = (over: Partial<FamilyChildJourney> = {}): FamilyChildJourney => ({
    customerMemberId: "emma",
    displayName: "Emma",
    processInstanceId: "pi-emma",
    sessionId: "sess-emma",
    participantPath: null,
    locationName: null,
    totalRequirements: 4,
    satisfiedRequirements: 4,
    remainingRequirements: 0,
    submitted: false,
    processingState: null,
    ...over,
});

const LIAM = child({
    customerMemberId: "liam",
    displayName: "Liam",
    processInstanceId: "pi-liam",
    sessionId: "sess-liam",
    satisfiedRequirements: 3,
    remainingRequirements: 1,
});

const money = (over: Partial<FamilyEnrollmentFinancials> = {}): FamilyEnrollmentFinancials => ({
    state: "DUE",
    grossCents: 20000,
    expectedFundingCents: 0,
    collectibleNowCents: 20000,
    appliedCents: 0,
    outstandingCents: 20000,
    lines: [],
    ...over,
});

const compose = (over: Partial<Parameters<typeof composeFamilyEnrollmentExperience>[0]> = {}) =>
    composeFamilyEnrollmentExperience({
        opportunityId: "opp-1",
        familyName: "Wright Family",
        children: [child(), LIAM],
        sharedInformationComplete: true,
        financials: money(),
        ...over,
    });

describe("the family journey a parent reads", () => {
    it("is one journey named for the family, over two children", () => {
        const f = compose();
        expect(f.headline).toBe("Wright Family Enrollment");
        expect(f.childCount).toBe(2);
    });

    it("lists family information, each child, and payment — and no ids", () => {
        const f = compose();
        expect(f.progress.map((r) => [r.label, r.detail])).toEqual([
            ["Family information", "Complete"],
            ["Emma", "4 of 4 complete"],
            ["Liam", "3 of 4 complete"],
            ["Payment", "200.00 due"],
        ]);
        // A parent must never be shown a packet or session identifier.
        const rendered = JSON.stringify(f.progress);
        expect(rendered).not.toContain("sess-");
        expect(rendered).not.toContain("pi-");
    });

    it("names the child on every child row, so a click can route to one child only", () => {
        const rows = compose().progress.filter((r) => r.key.startsWith("child:"));
        expect(rows.map((r) => r.customerMemberId)).toEqual(["emma", "liam"]);
    });

    /*
     * THE BLEED THIS EXISTS TO PREVENT. Emma finished; Liam has not. Liam must stay visibly
     * incomplete, and the family must not read as complete.
     */
    it("keeps one incomplete child visibly incomplete", () => {
        const f = compose();
        const byLabel = new Map(f.progress.map((r) => [r.label, r.complete]));
        expect(byLabel.get("Emma")).toBe(true);
        expect(byLabel.get("Liam")).toBe(false);
        expect(f.complete).toBe(false);
    });

    it("is not complete while money is outstanding, even with every child submitted", () => {
        const f = compose({
            children: [child({ submitted: true }), child({ ...LIAM, submitted: true })],
        });
        expect(f.complete).toBe(false);
    });

    it("is complete only when every child is submitted and nothing is owed", () => {
        const f = compose({
            children: [child({ submitted: true }), child({ ...LIAM, submitted: true })],
            financials: money({ state: "SATISFIED", collectibleNowCents: 0, appliedCents: 20000, outstandingCents: 0 }),
        });
        expect(f.complete).toBe(true);
    });

    it("shows each child's own Processing state without merging them", () => {
        const f = compose({
            children: [
                child({ submitted: true, processingState: "in_review" }),
                child({ ...LIAM, submitted: false }),
            ],
        });
        const details = f.progress.filter((r) => r.key.startsWith("child:")).map((r) => r.detail);
        expect(details).toEqual(["Submitted · in_review", "3 of 4 complete"]);
    });

    it("says nothing about payment when no fee is configured", () => {
        // A "$0.00 due" row invites a question that has no answer.
        const f = compose({ financials: money({ state: "NOT_APPLICABLE", grossCents: 0, collectibleNowCents: 0 }) });
        expect(f.progress.some((r) => r.label === "Payment")).toBe(false);
    });

    /*
     * MEASURED ON DEPLOYED STAGING, not imagined. A launched child resolved to zero requirements and
     * its own participant screen reported `complete: true, phase: "complete"` — while this row
     * rendered "0 of 0 complete" and marked the child unfinished. The family shell disagreeing with
     * the child's own screen is the precise bleed this file exists to prevent.
     */
    it("agrees with a launched child whose own screen says nothing is outstanding", () => {
        const f = compose({
            children: [child({ totalRequirements: 0, satisfiedRequirements: 0, remainingRequirements: 0 })],
        });
        const row = f.progress.find((r) => r.label === "Emma");
        expect(row?.detail).toBe("Nothing outstanding");
        expect(row?.complete).toBe(true);
    });

    it("still keeps the informative fraction for a child mid-way", () => {
        // The repair must not swallow "3 of 4 complete", which is the useful form.
        const f = compose();
        expect(f.progress.find((r) => r.label === "Liam")?.detail).toBe("3 of 4 complete");
    });

    it("does not call an unlaunched child complete just because nothing is outstanding", () => {
        // Not-started is `processInstanceId === null`, asked directly rather than inferred from a count.
        const f = compose({
            children: [child({ processInstanceId: null, sessionId: null, totalRequirements: 0, satisfiedRequirements: 0, remainingRequirements: 0 })],
        });
        const row = f.progress.find((r) => r.label === "Emma");
        expect(row?.detail).toBe("Not started");
        expect(row?.complete).toBe(false);
    });

    it("reports a child that has not started as not started", () => {
        const f = compose({
            children: [child({ processInstanceId: null, sessionId: null, totalRequirements: 0, satisfiedRequirements: 0 })],
        });
        expect(f.progress.find((r) => r.label === "Emma")?.detail).toBe("Not started");
    });
});

describe("the family shell quotes Financials rather than recomputing it", () => {
    it("passes every figure through untouched", () => {
        const f = compose({
            financials: money({
                state: "PARTIALLY_SATISFIED",
                grossCents: 25000,
                expectedFundingCents: 6000,
                collectibleNowCents: 15000,
                appliedCents: 10000,
                outstandingCents: 15000,
            }),
        });
        expect(f.financials).toEqual({
            state: "PARTIALLY_SATISFIED",
            grossCents: 25000,
            expectedFundingCents: 6000,
            collectibleNowCents: 15000,
            appliedCents: 10000,
            outstandingCents: 15000,
            lines: [],
        });
    });

    /*
     * An expected subsidy does NOT reduce what is collectible — only a governed submitted claim
     * does. The shell must show the authoritative figure, not gross minus expectation.
     */
    it("shows collectible-now, never gross minus expected funding", () => {
        const f = compose({
            financials: money({ grossCents: 20000, expectedFundingCents: 6000, collectibleNowCents: 20000 }),
        });
        expect(f.progress.find((r) => r.label === "Payment")?.detail).toBe("200.00 due");
    });
});

describe("the shared-versus-per-child matrix", () => {
    it("never deduplicates a fact whose evidence belongs to one child", () => {
        const perChild = FAMILY_FACT_OWNERSHIP.filter((f) => f.ownership === "repeated_per_child").map((f) => f.concept);
        expect(perChild).toContain("Health, allergies and medical providers");
        expect(perChild).toContain("Immunization record");
        expect(perChild).toContain("Consent");
        expect(perChild).toContain("Per-child fee obligation");
    });

    it("reuses canonical household facts rather than re-asking them", () => {
        const reused = FAMILY_FACT_OWNERSHIP.filter((f) => f.ownership === "reused_canonical").map((f) => f.concept);
        expect(reused).toContain("Parents and guardians");
        expect(reused).toContain("Home and mailing address");
    });

    it("gives every concept a reason, because the risk is over-deduplication", () => {
        for (const entry of FAMILY_FACT_OWNERSHIP) {
            expect(entry.why.length).toBeGreaterThan(40);
            expect(["shared_once", "reused_canonical", "repeated_per_child"]).toContain(entry.ownership);
        }
    });
});
