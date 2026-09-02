/**
 * Every active question carries its subject — or keeps the school's own words.
 *
 * A parent was asked, in its entirety, "Middle Name?". The runtime knew it was talking about Malik
 * and said none of it, because 131 of the 173 destinations in the certified packet carry no
 * `field_source` at all and a need with no entity had no subject to speak of.
 */

import { describe, expect, it } from "vitest";

import { inferUnboundDestinationEntity } from "@/lib/enrollment/informationNeeds/unboundDestinationSubject";
import { projectEnrollmentInformationNeeds } from "@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds";
import { participantObjectiveWireModel } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";
import { participantQuestion } from "@/lib/enrollment/participantRuntime/participantTurnPresentation";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const CHILD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** The Oregon CIS's first page, in its real order. */
const CIS = {
    title: "Oregon Certificate of Immunization Status",
    fields: [
        { id: "f1", type: "text", label: "Childs Last Name", required: true, field_source: { entity_type: "child", field_key: "child_last_name", shared_value_key: "child_last_name" } },
        { id: "f2", type: "text", label: "First Name", required: true, field_source: { entity_type: "child", field_key: "child_first_name", shared_value_key: "child_first_name" } },
        { id: "f3", type: "text", label: "Middle Name", required: false },
        { id: "f4", type: "date", label: "Birth Date", required: true, field_source: { entity_type: "customer_member", field_key: "dob" } },
        { id: "f5", type: "text", label: "Parents Or Guardians Names", required: true, field_source: { entity_type: "guardian", field_key: "name", shared_value_key: "guardian_name" } },
        { id: "f6", type: "text", label: "Phone Number", required: true, field_source: { entity_type: "person", field_key: "phone" } },
        { id: "f7", type: "text", label: "Dose 1 Diphtheria Tetanus Pertussis", required: false },
        { id: "f8", type: "text", label: "Dose 2 Diphtheria Tetanus Pertussis", required: false },
        { id: "f9", type: "text", label: "General health", required: false },
    ],
    sections: [{ id: "p1", title: "Page 1", field_ids: ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9"] }],
} as unknown as FormSchemaV1;

describe("who an unbound destination is about", () => {
    it("reads the CHILD from the boxes it sits between", () => {
        // Position 3, with child-bound boxes on both sides. This is what a person filling the form
        // in reads, and it works identically for a box labelled in Spanish or labelled nothing.
        expect(inferUnboundDestinationEntity(CIS, "f3")).toBe("child");
    });

    it("refuses one-sided evidence", () => {
        /*
         * The vaccine dose rows have `person:phone` as their nearest preceding bound box and nothing
         * bound after them. A one-sided rule would attribute a diphtheria dose to the responding
         * adult; failing closed costs the question its subject instead of giving it the wrong one.
         */
        expect(inferUnboundDestinationEntity(CIS, "f7")).toBeNull();
        expect(inferUnboundDestinationEntity(CIS, "f9")).toBeNull();
    });

    it("stops where the block changes", () => {
        // Between `guardian` and `person` there is no agreement, so nothing is claimed.
        const shifted = {
            ...CIS,
            fields: [...(CIS as unknown as { fields: unknown[] }).fields],
            sections: [{ id: "p1", title: "Page 1", field_ids: ["f5", "f3", "f6"] }],
        } as unknown as FormSchemaV1;
        expect(inferUnboundDestinationEntity(shifted, "f3")).toBeNull();
    });

    it("never touches identity", () => {
        // Grammar and ordering read the inference; nothing that decides what a value IS may.
        const needs = projectEnrollmentInformationNeeds({
            forms: [{ requirement_id: "r", form_definition_id: "fd", form_definition_version_id: "v", session_item_id: "si", schema: CIS } as never],
            subjectId: CHILD,
            sharedValues: {},
            confirmations: {} as never,
        });
        const middle = needs.find((n) => n.occurrences[0]?.form_field_id === "f3")!;
        expect(middle.identity.subject_entity_type).toBe("child");
        // Unchanged: it is still unbound, still artifact-specific, still owns no canonical datum.
        expect(middle.identity.entity_type).toBeNull();
        expect(middle.identity.canonical_key).toBeNull();
        expect(middle.identity.shared_value_key).toBeNull();
        expect(middle.identity.artifact_specific).toBe(true);
    });
});

describe("the question a parent actually reads", () => {
    const ask = (fieldId: string) => {
        const needs = projectEnrollmentInformationNeeds({
            forms: [{ requirement_id: "r", form_definition_id: "fd", form_definition_version_id: "v", session_item_id: "si", schema: CIS } as never],
            subjectId: CHILD,
            sharedValues: {},
            confirmations: {} as never,
        });
        const need = needs.find((n) => n.occurrences[0]?.form_field_id === fieldId)!;
        const wire = participantObjectiveWireModel(
            {
                stage_key: "enrolling",
                progress: { total_requirements: 1, satisfied_requirements: 0, remaining_requirements: 1 },
                needs: { needs, total_needs: needs.length, needs_requiring_action: 1 },
                known_requiring_confirmation: [],
                missing: [need],
                artifact_specific: [],
                outstanding_evidence: [],
                next_turn: {
                    kind: "collect_missing_value",
                    need,
                    prompt: "",
                    proposed_value: null,
                    resolves_occurrences: need.occurrence_count,
                },
            } as never,
            { subjectDisplayName: "Malik Whitfield" },
        );
        return participantQuestion(wire);
    };

    it("names the child instead of handing over a column heading", () => {
        // The reported defect, in one line.
        expect(ask("f3")).toBe("Does Malik have a middle name?");
        expect(ask("f3")).not.toBe("Middle Name?");
    });

    it("keeps the school's own words where the packet names no subject", () => {
        /*
         * A deliberate earlier decision, and still right: "General health" belongs to nobody the
         * runtime can name, and "What is your family's General health?" is worse than the label.
         * Far fewer destinations reach here now — that is the improvement, not abolishing the rule.
         */
        expect(ask("f9")).toBe("General health?");
    });
});
