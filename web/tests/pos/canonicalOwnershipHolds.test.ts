/**
 * §3/§4 — a settled owner outside Enrollment is a STATE, not a blank.
 *
 * The failure this prevents: the operator sees a real packet question with no destination, clicks
 * the only affirmative control on the row ("create a new field"), and Enrollment quietly acquires a
 * second allergy list that the Health foundation must reconcile against forever.
 *
 * The negative controls matter more than the positives here. A hold that catches too much is worse
 * than no hold: it blocks facts that DO have a home and reads to the operator as a broken import.
 */

import { describe, expect, it } from "vitest";
import { ownershipHoldFor } from "@/lib/pos/discovery/canonicalOwnershipHolds";

const held = (label: string, key = "child.x") => ownershipHoldFor({ label, concept_key: key });

describe("Health foundation kinds (D-H5)", () => {
    it("holds the four kinds rather than creating a competing destination", () => {
        expect(held("Does your child have any allergies?")?.state).toBe("AWAITING_HEALTH_FOUNDATION");
        expect(held("List current medications")?.state).toBe("AWAITING_HEALTH_FOUNDATION");
        expect(held("Chronic conditions we should know about")?.state).toBe("AWAITING_HEALTH_FOUNDATION");
        expect(held("Immunization record")?.state).toBe("AWAITING_HEALTH_FOUNDATION");
    });

    it("names the owner, so the operator learns where it went instead of that it failed", () => {
        const hold = held("Allergies")!;
        expect(hold.owner).toBe("Health & Safety");
        expect(hold.decision).toBe("D-H5");
        expect(hold.explanation).toMatch(/must not create a second list/i);
    });
});

describe("the three cross-platform concepts", () => {
    it("routes an immunization EXEMPTION to requirement exceptions, not to Health", () => {
        // Contains "immunization" and is not a health fact at all — it is permission to skip a
        // requirement. Rule order is what makes this come out right.
        const hold = held("I request that my child be exempted from the following required immunizations")!;
        expect(hold.state).toBe("AWAITING_REQUIREMENT_EXCEPTION_MODEL");
        expect(hold.decision).toBe("D-H2");
    });

    it("routes emergency medical authorization to Consent", () => {
        const hold = held("I authorize the school to obtain emergency medical treatment for my child")!;
        expect(hold.state).toBe("AWAITING_CANONICAL_CONSENT_OWNER");
        expect(hold.owner).toBe("Consent");
    });

    it("no longer holds safeguarding — Slice 6 gave it an owner", () => {
        // Slice 5 held these because nothing could own them. `child_safeguarding_restrictions` now
        // can, so they bind like any other proposal rather than waiting.
        expect(held("Is there a custody or restraining order affecting pick-up?")).toBeNull();
        expect(held("Persons not permitted to pick up this child")).toBeNull();
    });

    it("emits the retired state from nowhere at all", () => {
        // What makes the retirement a fact rather than a claim. If a rule is ever re-added, this
        // fails before the packet re-run does.
        const probes = [
            "Is there a custody or restraining order affecting pick-up?",
            "Persons not permitted to pick up this child",
            "Are there any custody or visiting arrangements we need to be aware of?",
            "Is there anyone who has a legal restraining order prohibiting or limiting contact with your child?",
            "Court order on file",
            "Allergies",
            "Regular medications?",
        ];
        for (const p of probes) {
            expect(held(p)?.state, p).not.toBe("NEEDS_CANONICAL_SAFEGUARDING_OWNER");
        }
    });

    it("still does not file a safeguarding question as health data", () => {
        // The rule that mattered in Slice 5 still holds: these are not medical facts. They are now
        // simply owned rather than unowned.
        expect(held("Persons not permitted to pick up this child")?.state).not.toBe("AWAITING_HEALTH_FOUNDATION");
    });
});

describe("negative controls — what must NOT be held", () => {
    it("does not hold a special diet", () => {
        // A diet is a durable child-profile fact with a manifest row (Slice 5 §2). Holding it would
        // block a fact that has a home, and would make the diet look like an allergy record.
        expect(held("Does your child have a special diet?")).toBeNull();
        expect(held("Dietary restrictions")).toBeNull();
    });

    it("does not hold a doctor or dentist — they are relationships with definitions", () => {
        expect(held("Primary physician name")).toBeNull();
        expect(held("Child's dentist")).toBeNull();
        expect(held("Physician phone number")).toBeNull();
    });

    it("does not hold ordinary profile, contact or scheduling facts", () => {
        expect(held("Child's last name")).toBeNull();
        expect(held("Emergency contact name")).toBeNull();
        expect(held("Preferred name")).toBeNull();
        expect(held("What time does your child go to bed?")).toBeNull();
        expect(held("Favourite foods")).toBeNull();
    });

    it("does not hold insurance or provider identity", () => {
        expect(held("Medical insurance provider name")).toBeNull();
    });
});

describe("a numbered dose series is an administration record, whatever it is called", () => {
    // The eight vaccine rows on the real Oregon CIS are labelled `Hib`, `Tdap`, `Hep A`. No general
    // word rule can match those, and a vaccine-name table is the school-specific lookup this program
    // has refused since Slice 1. The STRUCTURE is what says it.
    const series = (label: string, members: string[]) =>
        ownershipHoldFor({ label, concept_key: `child.${label.toLowerCase()}`, repetition: { member_labels: members } });

    it("holds a dose series whose label says nothing", () => {
        const hold = series("Hib", ["Dose 1 Dosis 1 Hib", "Dose 2 Dosis 2 Hib", "Dose 3 Dosis 3 Hib"]);
        expect(hold?.state).toBe("AWAITING_HEALTH_FOUNDATION");
    });

    it("reads the Spanish column too — the shape is not English", () => {
        expect(series("Tdap", ["Dosis 1 Tdap", "Dosis 2 Tdap"])?.state).toBe("AWAITING_HEALTH_FOUNDATION");
    });

    it("does NOT hold an ordinary repeating collection", () => {
        // The control that keeps this from being "hold every collection". Emergency contacts and
        // sibling rows repeat too, and they have owners here.
        expect(series("Emergency contact", ["Contact 1 name", "Contact 2 name", "Contact 3 name"])).toBeNull();
        expect(series("Sibling", ["Child 1 name", "Child 2 name"])).toBeNull();
        expect(series("Authorized pickup", ["Person 1", "Person 2"])).toBeNull();
    });

    it("needs more than one dose to be a series", () => {
        // A single "dose" mention is a sentence, not a schedule.
        expect(series("Notes", ["Dose 1 given at home"])).toBeNull();
    });
});

describe("a hold can never produce a durable field", () => {
    it("carries no proposed field, so nothing downstream can create one", async () => {
        const { matchConcepts } = await import("@/lib/pos/discovery/configurationMatching");
        const { DISCOVERY_CONTRACT_VERSION } = await import("@/lib/pos/discovery/contracts");
        const concept = {
            contract_version: DISCOVERY_CONTRACT_VERSION,
            id: "1:health:allergy_list",
            kind: "scalar_field" as const,
            label: "List all medications your child takes",
            concept_key: "child.list_all_medications",
            subject: "child" as const,
            cardinality: "single" as const,
            suggested_data_type: "text",
            source: { page: 1, section_title: "Health", section_key: "health", labels: ["List all medications your child takes"] },
            confidence: { band: "review" as const, percent: 60, signals: [] },
            explanation: "",
        };
        const [proposal] = matchConcepts([concept]);
        expect(proposal.disposition).toBe("held_for_canonical_owner");
        expect(proposal.proposed_field, "a held concept must carry nothing creatable").toBeUndefined();
        expect(proposal.ownership_hold?.owner).toBe("Health & Safety");
        // It is still visible. Holding is not hiding — the packet DOES ask this.
        expect(proposal.explanation).toContain("List all medications your child takes");
    });

    it("outranks a LOW-confidence match to a generic notes field", async () => {
        // The quiet failure: an immunization record binds to "Medical notes" with low confidence,
        // the review shows a green "Existing field" chip, and the operator is given nothing to
        // decide — while the record becomes a sentence in a notes blob.
        const { suggestFieldBinding } = await import("@/lib/forms/canonicalBindingSuggestions");
        const bind = suggestFieldBinding("Immunization record", "text");
        expect(bind?.field_source?.field_key, "precondition: it really does match medical_notes").toBe("medical_notes");
        expect(bind?.confidence).toBe("low");
        expect(held("Immunization record")?.state).toBe("AWAITING_HEALTH_FOUNDATION");
    });

    it("does NOT outrank a confident match to a real destination", async () => {
        // An allergy NOTE has a child-grain home after M1. Holding it would refuse a binding that
        // is correct, and a hold that blocks correct bindings reads as a broken import.
        const { matchConcepts } = await import("@/lib/pos/discovery/configurationMatching");
        const { DISCOVERY_CONTRACT_VERSION } = await import("@/lib/pos/discovery/contracts");
        const [proposal] = matchConcepts([{
            contract_version: DISCOVERY_CONTRACT_VERSION,
            id: "1:health:allergies",
            kind: "scalar_field" as const,
            label: "Allergies",
            concept_key: "child.allergies",
            subject: "child" as const,
            cardinality: "single" as const,
            suggested_data_type: "text",
            source: { page: 1, section_title: "Health", section_key: "health", labels: ["Allergies"] },
            confidence: { band: "high" as const, percent: 90, signals: [] },
            explanation: "",
        }]);
        expect(proposal.disposition).toBe("reuse_canonical_field");
        expect(proposal.target_field_source?.field_key).toBe("allergies");
    });
});
