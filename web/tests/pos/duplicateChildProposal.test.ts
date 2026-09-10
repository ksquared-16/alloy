import { describe, expect, it } from "vitest";

import { buildMatchedRecords } from "@/lib/pos/matchedRecordsPresentation";
import { buildCommitPlanLines } from "@/lib/pos/commitPlanSummary";
import type { IntakeRecommendation } from "@/lib/forms/intake/resolveIntakeIdentity";

/**
 * A PACKET SENT TO A FAMILY OFFERED TO CREATE THAT FAMILY'S CHILD AGAIN.
 *
 * The packet was launched deliberately for Pathb Certopp, customer_member da21e74c. The child came
 * back on every submission. But the operator rail read:
 *
 *     APPROVAL WILL: Create Pathb Certopp as a new child
 *
 * because the child card was hardcoded to "New child record" — the person spine does not match
 * children, so with nothing else known that was honest. It stopped being honest once the session
 * carried the child on the submission itself. An operator following that prompt makes the duplicate.
 *
 * The fix is NOT to stop proposing creation. Untargeted intake must still create.
 */

const routeRecommendation: IntakeRecommendation = {
    decision: "route",
    confidence: "none",
    proposed: { person: { email: null, phone: null, firstName: null, lastName: null } },
    candidates: [],
    matchedOn: [],
    blockers: ["missing_identifiers"],
};

const submitted = [
    { label: "Child First Name", value: "Pathb" },
    { label: "Child Last Name", value: "Certopp" },
    { label: "Child Date Of Birth", value: "2021-11-02" },
];

const subject = { displayName: "Pathb Certopp", dob: "2021-11-02" };

describe("targeted session for an existing child", () => {
    it("NEVER proposes creating that child again", () => {
        const cards = buildMatchedRecords({
            recommendation: routeRecommendation,
            intent: null,
            submitted,
            authoritativeSubject: subject,
        });
        const lines = buildCommitPlanLines(cards);
        const text = lines.map((l) => l.text).join(" | ");
        // The exact sentence the operator was shown.
        expect(text).not.toMatch(/Create Pathb Certopp as a new child/);
        expect(text).not.toMatch(/as a new child/);
        expect(text).toMatch(/Update Pathb Certopp/);
    });

    it("states the child as an existing record, not a new one", () => {
        const child = buildMatchedRecords({
            recommendation: routeRecommendation,
            intent: null,
            submitted,
            authoritativeSubject: subject,
        }).find((c) => c.role === "child");
        expect(child?.basisTone).toBe("match");
        expect(child?.basis).toMatch(/Existing child record/i);
    });

    it("names the child from the RECORD, so a returned answer cannot rename them", () => {
        /*
         * If the participant typed a different surname, the card must still identify the record the
         * paperwork was sent for. Renaming the match to whatever came back would quietly attach the
         * decision to a different-looking child.
         */
        const child = buildMatchedRecords({
            recommendation: routeRecommendation,
            intent: null,
            submitted: [
                { label: "Child First Name", value: "Pathb" },
                { label: "Child Last Name", value: "SomethingElse" },
            ],
            authoritativeSubject: subject,
        }).find((c) => c.role === "child");
        expect(child?.name).toBe("Pathb Certopp");
    });
});

describe("untargeted public intake keeps creating", () => {
    it("still proposes a new child when no subject was named", () => {
        // The other half of the fix: duplicates were not solved by disabling creation.
        const cards = buildMatchedRecords({ recommendation: routeRecommendation, intent: null, submitted });
        const child = cards.find((c) => c.role === "child");
        expect(child?.basisTone).toBe("new");
        expect(child?.basis).toBe("New child record");
        expect(buildCommitPlanLines(cards).map((l) => l.text).join(" | ")).toMatch(/Create Pathb Certopp as a new child/);
    });

    it("is unchanged when authoritativeSubject is explicitly null", () => {
        const cards = buildMatchedRecords({
            recommendation: routeRecommendation,
            intent: null,
            submitted,
            authoritativeSubject: null,
        });
        expect(cards.find((c) => c.role === "child")?.basisTone).toBe("new");
    });
});
