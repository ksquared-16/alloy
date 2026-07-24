import { describe, expect, it } from "vitest";
import { buildIdentityConversation, type ReviewDataRaw } from "@/lib/pos/identityConversation";

// The real /identity/review payload shape for the existing-parent + possible-child scenario.
const MARISOL: ReviewDataRaw = {
    planEligible: false,
    identityBlockers: [
        "plausible_match_needs_review: child:d03ca604:0: A plausible existing match exists — operator must accept...",
        "child_identity_unconfirmed: household:d03ca604:lead: Lead/process participation cannot finalize...",
    ],
    resolutions: [
        {
            id: "r-parent",
            subject_ref: "parent:d03ca604-58d4",
            subject_role: "parent",
            decision_action: "link_existing",
            selected_candidate_id: "f644",
            provisional: { email: "marisol.ziptest+p1@example.invalid", phone: null, last_name: "Ziptest", first_name: "Marisol" },
            candidates: [{ recordId: "f644", displayName: "Marisol Ziptest", confidenceBand: "confirmed", entityType: "person", explanation: "Exact email match.", signals: [{ kind: "supporting", explanation: "Exact canonical email match within organization." }] }],
        },
        {
            id: "r-child",
            subject_ref: "child:d03ca604:0",
            subject_role: "child",
            decision_action: "review_required",
            selected_candidate_id: "d815",
            provisional: { dob: null, last_name: "Ziptest", first_name: "Wren", display_name: "Wren Ziptest" },
            candidates: [{ recordId: "d815", displayName: "Wren", confidenceBand: "possible", entityType: "child", explanation: "Child name matches an existing household member, but date of birth is incomplete — operator confirmation required.", signals: [{ kind: "supporting", explanation: "Child matches an existing household member record." }] }],
        },
        {
            id: "r-household",
            subject_ref: "household:d03ca604",
            subject_role: "household",
            decision_action: "link_existing",
            selected_candidate_id: "01e8",
            provisional: { household_name: "Ziptest" },
            candidates: [{ recordId: "01e8", displayName: "Ziptest", confidenceBand: "confirmed", entityType: "household" }],
        },
        {
            id: "r-lead",
            subject_ref: "household:d03ca604:lead",
            subject_role: "lead",
            decision_action: "create_new",
            selected_candidate_id: null,
            provisional: { name: "Marisol Ziptest" },
            candidates: [{ recordId: "none", displayName: "Lead", confidenceBand: "excluded" }],
        },
    ],
    subjectEligibility: [
        { subjectRole: "parent", state: "confirmed_existing", eligibleForPlan: true },
        { subjectRole: "child", state: "needs_review", eligibleForPlan: false },
        { subjectRole: "household", state: "confirmed_existing", eligibleForPlan: true },
        { subjectRole: "lead", state: "needs_review", eligibleForPlan: false },
    ],
};

describe("identityConversation (presentation realization)", () => {
    it("shows only parent + child as subjects; household/lead are not cards", () => {
        const view = buildIdentityConversation(MARISOL);
        expect(view.subjects.map((s) => s.kind)).toEqual(["parent", "child"]);
    });

    it("no engine vocabulary or raw ids reach the operator view", () => {
        const blob = JSON.stringify(buildIdentityConversation(MARISOL, { candidateProfiles: [{ id: "f644", email: "x@y.z", zip: "97701" }] }));
        expect(blob).not.toMatch(/confirmed_existing|needs_review|plausible_match|child_identity_unconfirmed|subject_ref|decision_action|household:|person_name|confidenceBand|eligibleForPlan/);
        // Internal record ids must not appear as content.
        expect(blob).not.toMatch(/d03ca604|f644f65c|d81516bb/);
    });

    it("parent reads 'Already exists' with an exact-match reason", () => {
        const view = buildIdentityConversation(MARISOL);
        const parent = view.subjects.find((s) => s.kind === "parent")!;
        expect(parent.matchState).toBe("exact_match");
        expect(parent.headline).toBe("Already exists");
        expect(parent.match?.reasons.join(" ")).toMatch(/email match/i);
    });

    it("child reads as a possible existing child needing confirmation", () => {
        const view = buildIdentityConversation(MARISOL);
        const child = view.subjects.find((s) => s.kind === "child")!;
        expect(child.matchState).toBe("possible_match");
        expect(child.headline).toBe("Possible existing child");
        expect(child.needsDecision).toBe(true);
        expect(child.detail).toMatch(/date of birth is incomplete/i);
    });

    it("actions are operator decisions, not database operations", () => {
        const view = buildIdentityConversation(MARISOL);
        const child = view.subjects.find((s) => s.kind === "child")!;
        const labels = child.actions.map((a) => a.label);
        expect(labels).toContain("Same child");
        expect(labels).toContain("New child");
        expect(labels).toContain("Not sure yet");
        // The underlying engine action is preserved for the API call.
        expect(child.actions.find((a) => a.label === "Same child")?.decisionAction).toBe("link_existing");
        // create-new despite a plausible match requires a reason.
        expect(child.actions.find((a) => a.decisionAction === "create_new")?.requiresReason).toBe(true);
    });

    it("calm review-required panel replaces the technical blocker text", () => {
        const view = buildIdentityConversation(MARISOL);
        expect(view.reviewNeeded?.title).toBe("Review required");
        expect(view.reviewNeeded?.body).toMatch(/No records will be changed until you decide/);
        expect(view.reviewNeeded?.body).not.toMatch(/plausible_match|blocker|participation/);
        expect(view.allResolved).toBe(false);
    });

    it("outcome preview reflects current decisions (child still pending)", () => {
        const view = buildIdentityConversation(MARISOL);
        const texts = view.outcome.map((o) => o.text);
        expect(texts).toContain("Link Marisol Ziptest");
        expect(texts).toContain("Create the enrollment lead");
        expect(view.outcome.find((o) => /Confirm Wren Ziptest/.test(o.text))?.pending).toBe(true);
    });

    it("parent profile card is enriched from candidate details when provided", () => {
        const view = buildIdentityConversation(MARISOL, { candidateProfiles: [{ id: "f644", email: "marisol@x.invalid", zip: "97701", children: ["Wren"] }] });
        const parent = view.subjects.find((s) => s.kind === "parent")!;
        expect(parent.match?.profile?.zip).toBe("97701");
        expect(parent.match?.profile?.children).toEqual(["Wren"]);
    });
});
