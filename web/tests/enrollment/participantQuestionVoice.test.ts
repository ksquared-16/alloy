/**
 * WHAT A PARENT ACTUALLY READS.
 *
 * Both defects here were found by walking the real participant conversation over a Form authored
 * in the real Studio — not by any unit test, because both were correct-looking compositions of
 * correct-looking parts.
 *
 *   "Does you have a phone number?"     — a sentence built from `subject` with a hard-coded "Does".
 *   "Does your family have any allergies we should know about?"
 *                                       — for a question the school authored as "Does your child
 *                                         have any allergies?", overridden by a substring test for
 *                                         "allerg" that ran before the authored question.
 */
import { describe, expect, it } from "vitest";
import { participantQuestion, voiceForSubject, capitalizedAux } from "@/lib/enrollment/participantRuntime/participantTurnPresentation";
import { deterministicPrompt } from "@/lib/enrollment/participantRuntime/selectNextParticipantTurn";

function ask(opts: {
    label: string;
    entity_type?: string | null;
    scope?: string | null;
    optional?: boolean;
    child?: string | null;
}): string {
    return participantQuestion({
        subject_display_name: opts.child ?? "Toureeb",
        next_turn: {
            kind: "collect_missing_value",
            prompt: "",
            proposed_value: null,
            resolves_occurrences: 1,
            input_type: null,
            label: opts.label,
            options: [],
            optional: Boolean(opts.optional),
            entity_type: opts.entity_type ?? null,
            scope: opts.scope ?? null,
        },
    } as never);
}

describe("the auxiliary agrees with the subject", () => {
    it("says 'Do you' when the person answering owns the fact", () => {
        const q = ask({ label: "phone number", entity_type: "guardian", optional: true });
        expect(q).toBe("Do you have a phone number?");
        expect(q).not.toMatch(/Does you\b/);
    });

    it("says 'Does your family' for a household fact — still third person", () => {
        expect(ask({ label: "mailing preference", entity_type: "customer", optional: true })).toBe(
            "Does your family have a mailing preference?",
        );
    });

    it("says 'Does <child>' for a fact about the child", () => {
        expect(ask({ label: "middle name", entity_type: "child", optional: true })).toBe(
            "Does Toureeb have a middle name?",
        );
    });

    it("every voice states its own agreement, so no sentence has to guess", () => {
        for (const entityType of ["person", "guardian", "contact", "customer", "child", "customer_member", "enrollment", null]) {
            for (const scope of ["recipient", "household", "child", null]) {
                const v = voiceForSubject({ entityType, scope, childName: "Toureeb" });
                expect(["do", "does"]).toContain(v.aux);
                // "you" is the only second-person singular subject, and it is the only one that
                // takes *do*.
                expect(v.aux === "do").toBe(v.subject === "you");
                expect(capitalizedAux(v)).toBe(v.aux === "do" ? "Do" : "Does");
            }
        }
    });
});

describe("an authored question outranks the allergies heuristic", () => {
    it("asks the school's own question, about the child the school named", () => {
        const q = ask({ label: "Does your child have any allergies?", entity_type: null, scope: "household" });
        expect(q).toBe("Does Toureeb have any allergies?");
        expect(q).not.toMatch(/your family/);
    });

    it("still turns a BARE allergies label into something a specialist would say", () => {
        expect(ask({ label: "Allergies", entity_type: "child" })).toBe(
            "Does Toureeb have any allergies we should know about?",
        );
    });

    it("and agrees the verb when a bare allergies label belongs to the person answering", () => {
        const q = ask({ label: "Allergies", entity_type: "guardian" });
        expect(q).toBe("Do you have any allergies we should know about?");
        expect(q).not.toMatch(/Does you\b/);
    });

    it("keeps the authored subject substitution — 'your child' becomes the child's name", () => {
        expect(ask({ label: "Does your child's sibling attend?", entity_type: "child" })).toBe(
            "Does Toureeb's sibling attend?",
        );
    });
});

describe("an address question says whose address it is", () => {
    const need = (label: string, subject: "child" | "person", role: string | null, known = "") =>
        ({
            identity: { key: "a", canonical_key: null },
            occurrences: [{ label }],
            state: known ? "known_requires_confirmation" : "missing",
            current_value: known || null,
            address: { label, subject, role, known_line: known, parts: [] },
        }) as never;

    it("asks for the parent's own address as theirs", () => {
        expect(deterministicPrompt(need("Home address", "person", "guardian"))).toBe("What is your home address?");
    });

    it("never asks the determiner-less heading a school wrote", () => {
        expect(deterministicPrompt(need("Home address", "person", "guardian"))).not.toBe("What is home address?");
    });

    it("names the role when the address belongs to someone else on the record", () => {
        expect(deterministicPrompt(need("Home address", "person", "emergency_contact"))).toBe(
            "What is your emergency contact's home address?",
        );
    });

    it("speaks of the child, and the presentation layer says the child's name", () => {
        const runtime = deterministicPrompt(need("Home address", "child", null));
        expect(runtime).toBe("What is your child's home address?");
        expect(
            participantQuestion({
                subject_display_name: "Toureeb",
                next_turn: {
                    kind: "collect_missing_value", prompt: runtime, proposed_value: null, resolves_occurrences: 1,
                    input_type: null, label: "Home address", options: [], address: { label: "Home address" },
                    entity_type: "customer_member", scope: "shared",
                },
            } as never),
        ).toBe("What is Toureeb's home address?");
    });

    it("leaves a label that already possesses the address alone", () => {
        expect(deterministicPrompt(need("Guardian's home address", "person", "guardian"))).toBe(
            "What is guardian's home address?",
        );
    });

    it("confirms a known address in the same voice", () => {
        expect(deterministicPrompt(need("Home address", "person", "guardian", "48 Beacon Street, Brookline, MA 02445"))).toBe(
            "We have your home address as 48 Beacon Street, Brookline, MA 02445. Is that right?",
        );
    });
});

describe("the allergies heuristic is for a field CALLED Allergies", () => {
    it("still asks a bare topic heading out loud", () => {
        expect(ask({ label: "Allergies", entity_type: "child" })).toBe(
            "Does Toureeb have any allergies we should know about?",
        );
        expect(ask({ label: "Food allergies", entity_type: "child" })).toBe(
            "Does Toureeb have any allergies we should know about?",
        );
        expect(ask({ label: "Allergy information", entity_type: "child" })).toBe(
            "Does Toureeb have any allergies we should know about?",
        );
    });

    it("leaves the school's own instruction alone", () => {
        const q = ask({ label: "Please describe the allergy and the reaction", entity_type: null, scope: null });
        expect(q).toBe("Please describe the allergy and the reaction?");
        // It must NOT become the yes/no question the family answered one turn earlier.
        expect(q).not.toMatch(/have any allergies we should know about/);
    });

    it("does not re-ask 'are there any' for a detail request about the reaction", () => {
        for (const label of [
            "Please describe the allergy and the reaction",
            "List each allergy and what happens",
            "If your child has an allergy, tell us what to watch for",
        ]) {
            expect(ask({ label, entity_type: null, scope: null })).not.toMatch(/have any allergies we should know about/);
        }
    });

    it("a parenthetical example list does not make a heading into prose", () => {
        expect(ask({ label: "Allergies (food, medication, etc.)", entity_type: "child" })).toBe(
            "Does Toureeb have any allergies we should know about?",
        );
    });
});
