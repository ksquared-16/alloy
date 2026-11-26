import { describe, expect, it } from "vitest";
import {
    approveButtonLabel,
    decisionNounForIntent,
    resolveDecisionPresentation,
    resolveDecisionReadiness,
} from "@/lib/pos/decisionPresentation";
import type { IntakeRecommendation } from "@/lib/forms/intake/resolveIntakeIdentity";

function rec(partial: Partial<IntakeRecommendation>): IntakeRecommendation {
    return {
        decision: "create",
        confidence: "medium",
        proposed: { person: { email: null, phone: null, firstName: null, lastName: null } },
        candidates: [],
        matchedOn: [],
        blockers: [],
        ...partial,
    };
}

describe("decisionPresentation — business decision language (§1)", () => {
    it("derives the business noun from the configured intent, not a global hardcode", () => {
        expect(decisionNounForIntent("enrollment_lead")).toBe("enrollment lead");
        expect(decisionNounForIntent("waitlist")).toBe("waitlist opportunity");
        expect(decisionNounForIntent("operational_document")).toBe("document");
        expect(decisionNounForIntent("packet_step")).toBe("packet step");
    });

    it("falls back to a safe generic noun when intent is unknown/absent", () => {
        expect(decisionNounForIntent(null)).toBe("record");
        expect(decisionNounForIntent(undefined)).toBe("record");
    });

    it("create → enrollment-lead language", () => {
        const p = resolveDecisionPresentation({
            recommendation: rec({ decision: "create", proposed: { person: { email: "a@b.co", phone: null, firstName: "A", lastName: "B" } } }),
            intent: "enrollment_lead",
        });
        expect(p.recommendsLabel).toBe("Create new");
        expect(p.headline).toBe("Create a new enrollment lead");
        expect(p.approveAction).toBe("Create enrollment lead");
        expect(approveButtonLabel(p)).toBe("Approve — Create enrollment lead");
    });

    it("link → link-existing enrollment-lead language", () => {
        const p = resolveDecisionPresentation({
            recommendation: rec({ decision: "link", matchedOn: ["email"], candidates: [{ entityType: "person", id: "x", label: "X", matchReason: "parent email" }] }),
            intent: "enrollment_lead",
        });
        expect(p.recommendsLabel).toBe("Link existing");
        expect(p.headline).toBe("Link to an existing enrollment lead");
        expect(approveButtonLabel(p)).toBe("Approve — Link existing");
    });

    it("waitlist intent renders a waitlist opportunity, not enrollment lead", () => {
        const p = resolveDecisionPresentation({ recommendation: rec({ decision: "create", proposed: { person: { email: "a@b.co", phone: null, firstName: null, lastName: null } } }), intent: "waitlist" });
        expect(p.headline).toBe("Create a new waitlist opportunity");
    });

    it("never surfaces the generic 'Create a new record' / 'CRM Person' vocabulary for a configured form", () => {
        const p = resolveDecisionPresentation({ recommendation: rec({ decision: "create", proposed: { person: { email: "a@b.co", phone: null, firstName: null, lastName: null } } }), intent: "enrollment_lead" });
        expect(p.headline).not.toContain("record");
        expect(JSON.stringify(p)).not.toMatch(/CRM|Person\b/);
    });
});

describe("decisionPresentation — confidence/readiness semantics (§2)", () => {
    it("create-new with a searched identifier + no match ⇒ Ready to create (NOT medium confidence)", () => {
        const r = resolveDecisionReadiness(rec({ decision: "create", confidence: "medium", proposed: { person: { email: "new@fam.co", phone: null, firstName: "N", lastName: "F" } } }));
        expect(r.label).toBe("Ready to create");
        expect(r.detail).toBe("No existing match found.");
        expect(r.tone).toBe("ready");
        // The engine's raw "medium" must not leak into operator language.
        expect(JSON.stringify(r)).not.toMatch(/medium|confidence/i);
    });

    it("exact email match ⇒ High-confidence match", () => {
        const r = resolveDecisionReadiness(rec({ decision: "link", matchedOn: ["email"], confidence: "high" }));
        expect(r.label).toBe("High-confidence match");
        expect(r.detail).toBe("Exact parent email match.");
        expect(r.tone).toBe("match");
    });

    it("exact phone match ⇒ High-confidence match (not downgraded to medium)", () => {
        const r = resolveDecisionReadiness(rec({ decision: "link", matchedOn: ["phone"], confidence: "medium" }));
        expect(r.label).toBe("High-confidence match");
        expect(r.detail).toBe("Exact phone number match.");
        expect(r.tone).toBe("match");
    });

    it("missing identifiers ⇒ Review advised, gated (no ready-to-create)", () => {
        const r = resolveDecisionReadiness(rec({ decision: "route", blockers: ["missing_identifiers"], confidence: "none" }));
        expect(r.label).toBe("Review advised");
        expect(r.tone).toBe("review");
        expect(r.detail).toMatch(/no email or phone/i);
    });

    it("ambiguous email ⇒ Review advised (possible-match gating)", () => {
        const r = resolveDecisionReadiness(rec({ decision: "route", blockers: ["ambiguous_email"], matchedOn: ["email"], confidence: "low", candidates: [{ entityType: "person", id: "a", label: "A", matchReason: "parent email" }, { entityType: "person", id: "b", label: "B", matchReason: "parent email" }] }));
        expect(r.label).toBe("Review advised");
        expect(r.tone).toBe("review");
    });
});
