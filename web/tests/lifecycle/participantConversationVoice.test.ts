/**
 * Whose fact is this?
 *
 * The real run asked a parent for "Marisol's phone number" — a guardian fact, printed on a page
 * headed "Parent/Guardian #1 Phone Number", inside a Form built around a child. The subject was
 * being taken from the child the packet was about, because the turn carried nothing else to take it
 * from. These pin the grain-driven repair across person, child, household and recipient.
 */
import { describe, it, expect } from "vitest";
import { participantQuestion, conversationVoice, naturalFieldLabel } from "@/lib/enrollment/participantRuntime/participantTurnPresentation";

const wire = (turn: Record<string, unknown>, child = "Marisol Baseline") =>
    ({
        subject_display_name: child,
        next_turn: { kind: "collect_missing_value", prompt: "", proposed_value: null, resolves_occurrences: 1, input_type: "text", label: null, options: [], optional: false, field_ids: [], ...turn },
    }) as never;

describe("the conversation speaks to the right person", () => {
    it("asks the responding adult for their own contact facts", () => {
        for (const entity of ["person", "guardian", "contact"]) {
            const q = participantQuestion(wire({ entity_type: entity, scope: "household", canonical_key: "phone", label: "Parent/Guardian #1 Phone Number:" }));
            expect(q, entity).toBe("What is your phone number?");
            expect(q, "the child's name must not appear on a guardian fact").not.toMatch(/Marisol/);
        }
    });

    it("asks about the child by their familiar name", () => {
        expect(participantQuestion(wire({ entity_type: "child", scope: "child", canonical_key: "child_last_name", label: "Childs Last Name" })))
            .toBe("What is Marisol's last name?");
    });

    it("speaks of the household as the family", () => {
        expect(participantQuestion(wire({ entity_type: "customer", scope: "household", canonical_key: "address", label: "Physical Address, City, State and Zip Code:" })))
            .toBe("What is your family's address?");
    });

    it("treats an enrolment fact as the child's", () => {
        expect(participantQuestion(wire({ entity_type: "enrollment", scope: "household", canonical_key: "start_date", label: "Student's first day:" })))
            .toBe("What is Marisol's first day?");
    });

    it("addresses a signature to the person signing", () => {
        expect(conversationVoice(wire({ scope: "recipient", entity_type: null }))).toMatchObject({ possessive: "your", secondPerson: true });
    });
});

describe("a question the school already wrote is asked their way", () => {
    it("does not wrap an authored question, and does not double the question mark", () => {
        const q = participantQuestion(wire({ entity_type: "customer_member", scope: "child", canonical_key: "gender", label: "How would you describe your child's gender?" }));
        expect(q).toBe("How would you describe Marisol's gender?");
        expect(q).not.toMatch(/\?\?/);
        expect(q).not.toMatch(/What is/);
    });

    it("puts the child's name where the school could only write 'your child'", () => {
        expect(participantQuestion(wire({ entity_type: "customer_member", scope: "child", canonical_key: "nap_routine", label: "Does your child become tired or nap during the day?" })))
            .toBe("Does Marisol become tired or nap during the day?");
    });

    it("still frames an ordinary field label", () => {
        expect(participantQuestion(wire({ entity_type: "customer_member", scope: "child", canonical_key: "special_diet", label: "Special diet" })))
            // Authored casing is preserved by existing doctrine — the school's words, not ours.
            .toBe("What is Marisol's Special diet?");
    });
});

describe("the fact is named by its canonical key, not by where it was printed", () => {
    it("recognises a fact whose imported label lost its apostrophe to OCR", () => {
        expect(naturalFieldLabel("Childs Last Name", "child_last_name")).toBe("last name");
        expect(naturalFieldLabel("Phone Number NúMero De TeléFono Row1", "phone")).toBe("phone number");
    });

    it("leaves a school's own participant-facing wording alone", () => {
        expect(naturalFieldLabel("Emergency contact name")).toBe("Emergency contact name");
    });
});
