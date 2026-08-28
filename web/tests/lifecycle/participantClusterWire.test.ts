/**
 * A conversational topic, carried to the surface.
 *
 * The cluster is presentation over needs the objective already resolved: the grouping comes from
 * `packageOutstandingNeeds`, so the component cannot invent a relationship the packet never
 * evidenced. Exactly one member is active — the turn the runtime selected, and the only one the
 * composer is answering.
 */
import { describe, it, expect } from "vitest";
import { participantObjectiveWireModel } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";
import { participantQuestion, questionForNeed } from "@/lib/enrollment/participantRuntime/participantTurnPresentation";

let n = 0;
const need = (over: { label: string; entity?: string | null; type?: string; settled?: boolean; key?: string }) => {
    const key = over.key ?? `k${++n}`;
    return {
        identity: { key, scope: "household", subject_id: null, canonical_key: null, shared_value_key: null, session_value_key: `process:d:f${key}`, entity_type: over.entity ?? null, field_key: null, basis: "unbound", artifact_specific: true, collection_mode: "conversational" },
        scope: "household", subject_id: null,
        state: over.settled ? "known" : "missing",
        occurrence_count: 1,
        occurrences: [{ requirement_id: "r", form_definition_id: "d", form_definition_version_id: "v", session_item_id: "s", form_field_id: `f${key}`, label: over.label, required: true, field_type: over.type ?? "text", options: [], section_title: "Health Information and Developmental History" }],
        requirement_ids: ["r"], has_value: Boolean(over.settled), current_value: over.settled ? "an earlier answer" : null,
        value_source: "none", requires_participant_action: !over.settled,
    } as never;
};

const objectiveOf = (needs: unknown[], activeIndex = 0) =>
    ({
        stage_key: "enrolling", progress: {}, needs: { needs, total_needs: needs.length, needs_requiring_action: needs.length },
        known_requiring_confirmation: [], missing: needs, artifact_specific: [],
        next_turn: { kind: "collect_missing_value", need: needs[activeIndex], prompt: "", proposed_value: null, resolves_occurrences: 1 },
    }) as never;

const wireOf = (needs: unknown[], activeIndex = 0) =>
    participantObjectiveWireModel(objectiveOf(needs, activeIndex), { subjectDisplayName: "Marisol Baseline" });

describe("the active cluster", () => {
    it("carries the topic and every sibling question", () => {
        const w = wireOf([need({ label: "General health:" }), need({ label: "Any known complications at birth:" }), need({ label: "Serious illness and/or hospitalizations:" })]);
        const c = w.next_turn.cluster!;
        expect(c.title).toBe("Health Information and Developmental History");
        expect(c.questions).toHaveLength(3);
        expect(c.questions.map((q) => q.state)).toEqual(["active", "upcoming", "upcoming"]);
    });

    it("marks exactly one question active — the one the composer is answering", () => {
        const needs = [need({ label: "General health:" }), need({ label: "Any known complications at birth:" })];
        const c = wireOf(needs, 1).next_turn.cluster!;
        expect(c.questions.filter((q) => q.state === "active")).toHaveLength(1);
        expect(c.questions[1]!.state).toBe("active");
    });

    it("recedes a settled sibling and shows what was answered", () => {
        const c = wireOf([need({ label: "General health:" }), need({ label: "Any known complications at birth:", settled: true })]).next_turn.cluster!;
        expect(c.questions[1]!.state).toBe("settled");
        expect(c.questions[1]!.answer).toBe("an earlier answer");
    });

    it("gives a lone question no cluster — a question is not a topic", () => {
        expect(wireOf([need({ label: "General health:" })]).next_turn.cluster).toBeNull();
    });

    it("keeps every need id distinct", () => {
        const c = wireOf([need({ label: "A:" }), need({ label: "B:" }), need({ label: "C:" })]).next_turn.cluster!;
        expect(new Set(c.questions.map((q) => q.need_key)).size).toBe(3);
    });

    it("words a sibling exactly as it will be worded when its turn comes", () => {
        const needs = [need({ label: "General health:" }), need({ label: "Has your child ever been stung by a bee or wasp?" })];
        const sibling = wireOf(needs, 0).next_turn.cluster!.questions[1]!.question;
        const whenActive = participantQuestion(wireOf(needs, 1));
        expect(sibling).toBe(whenActive);
        expect(sibling).toBe("Has Marisol ever been stung by a bee or wasp?");
    });
});

describe("a prompt with no canonical owner claims no owner", () => {
    it("asks the school's own words instead of inventing a possessive", () => {
        // "What is your family's General health?" asserted an ownership the platform cannot support,
        // wrapped around wording the school had already got right.
        expect(questionForNeed(need({ label: "General health:" }) as never, "Marisol")).toBe("General health?");
        expect(questionForNeed(need({ label: "Primary Physician Name:" }) as never, "Marisol")).toBe("Primary Physician Name?");
    });

    it("still uses the child's name where a canonical owner exists", () => {
        const q = questionForNeed(need({ label: "Special diet", entity: "customer_member" }) as never, "Marisol");
        expect(q).toMatch(/Marisol/);
    });

    it("never doubles the question mark", () => {
        expect(questionForNeed(need({ label: "Regular medications?" }) as never, "Marisol")).not.toMatch(/\?\?/);
    });
});

describe("an authored choice list must reach the participant", () => {
    it("reads choices from static_options, which is where a realized Form keeps them", async () => {
        // A select whose choices never arrived refused every answer as "not one of the available
        // choices" — a question with no visible answers that rejects all of them is a loop with no
        // way out. Four needs on the certification packet were in exactly that state.
        const { projectEnrollmentInformationNeeds } = await import("@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds");
        const field = {
            id: "field_6", type: "select", label: "How would you describe your child's gender?", required: true,
            static_options: [{ label: "Male", value: "Male" }, { label: "Female", value: "Female" }],
        };
        const needs = projectEnrollmentInformationNeeds({
            forms: [{
                requirement_id: "r", form_definition_id: "d", form_definition_version_id: "v", session_item_id: "s",
                schema: { schema_version: "v1", title: "t", fields: [field], sections: [{ id: "s1", title: "Contact Information", field_ids: ["field_6"] }] },
            }],
            subjectId: "c1", sharedValues: {}, confirmations: {},
        } as never);
        expect(needs).toHaveLength(1);
        expect(needs[0]!.occurrences[0]!.options).toEqual(["Male", "Female"]);
    });
});
