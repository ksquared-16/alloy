/**
 * OPTIONAL QUESTIONS READ LIKE A PERSON ASKING THEM.
 *
 * Staging walk (aa797393, disposable family ZZQA1496Q) on the PUBLISHED Admissions schema:
 *   "Does you have a Street address?"  ·  "Does Ben have an Eating habits?"
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { validateFormSchema } from "@/lib/forms/schema";
import { projectEnrollmentInformationNeeds } from "@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds";
import { participantObjectiveWireModel } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";
import { optionalAttributePhrase, participantQuestion } from "@/lib/enrollment/participantRuntime/participantTurnPresentation";

const SCHEMA = validateFormSchema(JSON.parse(readFileSync(resolve(__dirname, "../forms/__fixtures_admissions_v12_published.json"), "utf8")));
const CHILD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const ask = (label: string) => {
    const needs = projectEnrollmentInformationNeeds({
        forms: [{ requirement_id: "r", form_definition_id: "fd", form_definition_version_id: "v", session_item_id: "si", schema: SCHEMA } as never],
        subjectId: CHILD,
        sharedValues: {},
        confirmations: {} as never,
    });
    const need = needs.find((n) => n.occurrences.some((o) => o.label === label));
    if (!need) return null;
    const wire = participantObjectiveWireModel(
        {
            stage_key: "enrolling",
            progress: { total_requirements: 1, satisfied_requirements: 0, remaining_requirements: 1 },
            needs: { needs, total_needs: needs.length, needs_requiring_action: 1 },
            known_requiring_confirmation: [],
            missing: [need],
            artifact_specific: [],
            outstanding_evidence: [],
            next_turn: { kind: "collect_missing_value", need, prompt: "", proposed_value: null, resolves_occurrences: need.occurrence_count },
        } as never,
        { subjectDisplayName: "Ben Example" },
    );
    return participantQuestion(wire);
};

describe("the spoken attribute", () => {
    it.each([
        ["Street address", "a street address"],
        ["Eating habits", "any eating habits"],
        ["Special diet", "a special diet"],
        ["Favorite foods", "any favorite foods"],
        ["ZIP / postal code", "a ZIP / postal code"],
        ["Email", "an email"],
    ])("%s → %s", (label, phrase) => expect(optionalAttributePhrase(label)).toBe(phrase));
});

describe("the published Admissions questions the staging walk asked", () => {
    it("asks the parent about themselves in the second person", () => {
        expect(ask("Street address")).toBe("Do you have a street address?");
        expect(ask("City")).toBe("Do you have a city?");
    });

    it("asks about a child's plural attribute with any, in lower case", () => {
        const q = ask("Eating habits");
        expect(q).toBe("Does Ben have any eating habits?");
    });
});
