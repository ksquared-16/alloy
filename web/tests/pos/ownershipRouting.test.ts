/**
 * The governing rule of Slice 7, made testable:
 *
 *     NEW_CANONICAL_FIELD is an affirmative ownership conclusion, never the fallback for
 *     "nothing else matched."
 *
 * The negative controls matter more than the positives. A router that holds everything would pass
 * the safety tests and be useless; a router that proposes a field whenever nothing matched is what
 * we had. Both directions are asserted.
 */

import { describe, expect, it } from "vitest";
import { routeOwnership } from "@/lib/pos/discovery/ownershipRouting";
import { matchConcepts } from "@/lib/pos/discovery/configurationMatching";
import { DISCOVERY_CONTRACT_VERSION, type BusinessConceptCandidate } from "@/lib/pos/discovery/contracts";

const route = (label: string, key = "child.x") => routeOwnership({ label, concept_key: key });

const concept = (over: Partial<BusinessConceptCandidate> & { label: string }): BusinessConceptCandidate => ({
    contract_version: DISCOVERY_CONTRACT_VERSION,
    id: "1:section:f",
    kind: "scalar_field",
    concept_key: "child.x",
    subject: "child",
    cardinality: "single",
    suggested_data_type: "text",
    source: { page: 1, section_title: "S", section_key: "s", labels: [over.label] },
    confidence: { band: "high", percent: 95, signals: [] },
    explanation: "",
    ...over,
});

const propose = (label: string, over: Partial<BusinessConceptCandidate> = {}) =>
    matchConcepts([concept({ label, ...over })])[0];

describe("a protected financial credential can NEVER become a field", () => {
    const CREDENTIALS = [
        "Routing number: Typically, the first set of 9 numbers printed on the bottom of checks on the left side.",
        "Account number: Typically, the second set of numbers printed on the bottom of check.",
        "Bank account number",
        "ABA number",
        "IBAN",
    ];

    it("routes every one to Financials, never to a field", () => {
        for (const label of CREDENTIALS) {
            const r = route(label);
            expect(r.owner, label).toBe("FINANCIAL_PAYMENT");
            expect(r.bulkAcceptSafe, label).toBe(false);
        }
    });

    it("produces a proposal carrying nothing creatable", () => {
        for (const label of CREDENTIALS) {
            const p = propose(label);
            expect(p.disposition, label).toBe("financial_payment");
            expect(p.proposed_field, label).toBeUndefined();
            expect(p.target_field_source, label).toBeUndefined();
        }
    });

    it("stays refused at 99% confidence — a confident routing number is still a routing number", () => {
        // The failure this prevents: a bulk "accept all high-confidence" sweeping a bank credential
        // into a customer field because the MATCHER was sure about the question.
        const p = propose("Routing number", { confidence: { band: "high", percent: 99, signals: ["exact label"] } });
        expect(p.disposition).toBe("financial_payment");
        expect(p.proposed_field).toBeUndefined();
    });

    it("holds payment-method setup and billing amounts too, for different reasons", () => {
        expect(route("Financial Institution:").owner).toBe("FINANCIAL_PAYMENT");
        expect(route("Select Account Type:").owner).toBe("FINANCIAL_PAYMENT");
        expect(route("Account Holder Full Name:").owner).toBe("FINANCIAL_PAYMENT");
        const fee = route("Non-Refundable Annual Material Fee");
        expect(fee.owner).toBe("FINANCIAL_PAYMENT");
        expect(fee.basis).toMatch(/billing configuration/i);
    });
});

describe("a value Alloy can compute is not a value Alloy stores", () => {
    it("derives age rather than storing it", () => {
        const r = route("Student Age Upon Enrolling:");
        expect(r.owner).toBe("DERIVED_SYSTEM");
        expect(r.derivedFrom).toMatch(/date of birth/i);
        expect(r.basis).toMatch(/wrong by the next birthday/i);
    });

    it("derives sibling existence from the household", () => {
        const r = route("Does your child have siblings?");
        expect(r.owner).toBe("DERIVED_SYSTEM");
        expect(r.derivedFrom).toMatch(/household/i);
    });

    it("resolves an execution date from the execution, not from a person", () => {
        for (const label of ["Today's Date:", "Date:", "Date / Fecha"]) {
            const r = route(label, "person.today_s_date");
            expect(r.owner, label).toBe("DERIVED_SYSTEM");
        }
    });

    it("does not treat a real date-valued fact as an execution date", () => {
        // Negative control: date of birth is a fact, not a timestamp of the signing.
        expect(route("Date of birth").owner).not.toBe("DERIVED_SYSTEM");
    });
});

describe("enrolment truth binds to enrolment, not to a duplicate child field", () => {
    it("routes the first day to the registered start date", () => {
        const r = route("Student's first day:");
        expect(r.owner).toBe("PROCESS_PARTICIPANT");
        expect(r.destination?.entity_type).toBe("enrollment");
        expect(r.destination?.field_key).toBe("start_date");
    });

    it("binds rather than proposes", () => {
        const p = propose("Student's first day:");
        expect(p.disposition).toBe("reuse_canonical_field");
        expect(p.proposed_field).toBeUndefined();
    });
});

describe("the affirmative conclusion — and only it — reaches a field", () => {
    it("binds a settled child-profile fact to the destination that already exists", () => {
        // Slice 5 settled these, seeded them for every org, and the importer could not reach them.
        for (const [label, key] of [
            ["Eating habits:", "eating_habits"],
            ["Special diet:", "special_diet"],
            ["Favorite foods:", "favorite_foods"],
            ["Toilet habits:", "toileting_routine"],
            ["Any special naptime needs?", "nap_routine"],
            ["How would you describe your child's personality?", "temperament"],
        ] as const) {
            const r = route(label);
            expect(r.owner, label).toBe("CANONICAL_FIELD");
            expect(r.destination?.field_key, label).toBe(key);
            expect(matchConcepts([concept({ label })])[0].disposition, label).toBe("reuse_canonical_field");
        }
    });

    it("matches the field's own vocabulary, not one school's spelling", () => {
        // `Favourite foods` in the manifest, "Favorite foods" on the form. Same fact.
        expect(route("Favourite foods").destination?.field_key).toBe("favorite_foods");
        expect(route("Favorite foods").destination?.field_key).toBe("favorite_foods");
    });
});

describe("unknown ownership holds — it never becomes a field", () => {
    it("holds a plausible-sounding profile question rather than inventing durable truth", () => {
        for (const label of [
            "How is your child comforted?",
            "Does your child have any fears? (dark, spiders, etc.)",
            "What would you like your child to gain from their experience?",
            "Social relationships:",
        ]) {
            const r = route(label);
            expect(r.owner, label).toBe("HELD_UNKNOWN_OWNER");
            expect(propose(label).proposed_field, label).toBeUndefined();
        }
    });

    it("is the DEFAULT — an unrecognised concept holds, it does not fall through", () => {
        const r = route("Zzzqqq unrecognisable question about nothing");
        expect(r.owner).toBe("HELD_UNKNOWN_OWNER");
        expect(r.bulkAcceptSafe).toBe(false);
    });

    it("marks a settled fact whose TYPE is unavailable, rather than making it text", () => {
        // Bedtime is a time of day. A text field here would accept "whenever".
        for (const label of ["When does your child go to sleep at night?", "When does your child wake up?"]) {
            const r = route(label);
            expect(r.blockedOn, label).toBe("TIME_ADOPTION");
            expect(propose(label).proposed_field, label).toBeUndefined();
        }
    });
});

describe("earlier slices are preserved", () => {
    it("still routes health, safeguarding, consent and exemption to their owners", () => {
        expect(route("Does your child take any medication?").owner).toBe("HEALTH");
        expect(route("Serious illness and/or hospitalizations:").owner).toBe("HEALTH");
        expect(route("Is there a restraining order limiting contact with your child?").owner).toBe("SAFEGUARDING");
        expect(route("I authorize emergency medical treatment for my child").owner).toBe("CONSENT");
        expect(route("I request that my child be exempted from the following immunizations").owner).toBe("REQUIREMENT_EXCEPTION");
    });

    it("does not undo READY NOW ownership", () => {
        // Physician/dentist stay relationships; a diet stays a child-profile fact.
        expect(route("Primary physician name").owner).not.toBe("HEALTH");
        expect(route("Special diet:").owner).toBe("CANONICAL_FIELD");
    });

    it("names a person by role as a relationship, never a field", () => {
        const r = route("Parent/Guardian #1 Name:");
        expect(r.owner).toBe("RELATIONSHIP");
        expect(propose("Parent/Guardian #1 Name:").proposed_field).toBeUndefined();
    });
});

describe("the no-fallthrough invariant", () => {
    it("cannot reach field creation from any non-CANONICAL_FIELD owner", () => {
        // This is the structural guarantee, not a rule list. A routing that is not CANONICAL_FIELD
        // returns a held proposal even when no branch below handles its owner — the missing-branch
        // fall-through is precisely how a relationship became a `person.name` field mid-slice.
        const labels = [
            "Routing number", "Today's Date:", "Student Age Upon Enrolling:", "Does your child have siblings?",
            "Parent/Guardian #1 Name:", "When does your child wake up?", "General health:",
            "Zzzqqq unrecognisable", "Financial Institution:", "Serious illness and/or hospitalizations:",
        ];
        for (const label of labels) {
            const p = propose(label);
            expect(p.disposition, label).not.toBe("create_proposed_field");
            expect(p.proposed_field, label).toBeUndefined();
        }
    });
});
