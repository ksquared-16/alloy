/**
 * The participant experience, end to end — the convergence slice's own proofs.
 *
 * The screen QA saw was form-first with a conversational widget attached: it asked "What is Child
 * Dob?" for a child whose date of birth was on file, rendered a generic text box for it, and showed
 * the raw packet Form — containing that same field — directly underneath.
 *
 * Every defect behind that had one owner, and each is pinned here.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { participantObjectiveWireModel } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";
import {
    controlForTurn,
    displayValue,
    naturalFieldLabel,
    participantIntro,
    participantQuestion,
    progressLine,
} from "@/lib/enrollment/participantRuntime/participantTurnPresentation";
import { ENROLLMENT_CONFIRMATION_REQUIRED_KEYS } from "@/lib/enrollment/participantRuntime/enrollmentConfirmationPolicy";
import { formFieldCollectsValue } from "@/lib/forms/formFieldCollectsValue";
import { buildPacketFieldPlan } from "@/lib/pos/packet/packetFieldPlan";

const read = (rel: string) => readFileSync(resolve(__dirname, "../../", rel), "utf8");

function need(over: Record<string, unknown> = {}) {
    return {
        identity: {
            key: "child:c1:child_date_of_birth",
            canonical_key: "child_date_of_birth",
            shared_value_key: "child_date_of_birth",
            field_key: "child_date_of_birth",
            entity_type: "child",
            basis: "shared_alias",
            scope: "child",
            subject_id: "c1",
            artifact_specific: false,
        },
        scope: "child",
        subject_id: "c1",
        state: "known_requires_confirmation",
        current_value: "2022-05-15",
        occurrence_count: 15,
        occurrences: [
            {
                requirement_id: "r1",
                form_definition_id: "f1",
                form_definition_version_id: "v1",
                session_item_id: "si1",
                form_field_id: "field_2",
                label: "Child Dob",
                required: true,
                field_type: "date",
                options: [],
            },
        ],
        requires_participant_action: true,
        ...over,
    } as never;
}

function objective(over: Record<string, unknown> = {}) {
    return {
        process_instance_id: "pi",
        session_id: "s",
        business_process_revision_id: "rev",
        stage_key: "enrolling",
        progress: { total_requirements: 1, satisfied_requirements: 0, remaining_requirements: 1 },
        needs: { needs_requiring_action: 2, total_needs: 6, needs: [] },
        known_requiring_confirmation: [need()],
        missing: [],
        artifact_specific: [],
        next_turn: {
            kind: "confirm_known_value",
            need: need(),
            prompt: "We have Child Dob as 2022-05-15. Is that correct?",
            proposed_value: "2022-05-15",
            resolves_occurrences: 15,
        },
        ...over,
    } as never;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("known facts are confirmed, not asked for", () => {
    it("the alias a real form uses is in the confirmation policy", () => {
        // Firefly's Enrollment form binds DOB by `shared_value_key: child_date_of_birth`. The policy
        // held only the entity spellings, so a known DOB resolved `known` — no confirm turn — and
        // the parent was asked for a fact already on file.
        expect(ENROLLMENT_CONFIRMATION_REQUIRED_KEYS.has("child_date_of_birth")).toBe(true);
        expect(ENROLLMENT_CONFIRMATION_REQUIRED_KEYS.has("customer_member:dob")).toBe(true);
    });

    it("both public routes supply the canonical record", () => {
        // The parameter existed and was threaded the whole way down; nothing ever passed it, so
        // every known fact arrived as `missing`. That is the root cause of "What is Child Dob?".
        for (const rel of [
            "app/api/public/forms/[token]/enrollment-objective/route.ts",
            "app/api/public/forms/[token]/enrollment-turn/route.ts",
        ]) {
            const src = read(rel);
            expect(src, `${rel} must resolve canonical values`).toContain("resolveParticipantCanonicalContext");
            expect(src).toContain("canonicalValues: canonical.values");
        }
    });

    it("asks the parent to confirm, in their own words, with the value spelled out", () => {
        const wire = participantObjectiveWireModel(objective(), { subjectDisplayName: "Test Process" });
        // "birthday", the way a specialist would say it — and "still right?", which is what you ask
        // about something already on file. The child is called by their FIRST name: the
        // conversation is with a parent about their child, not about a record.
        expect(participantQuestion(wire)).toBe(
            "I have Test's birthday as May 15, 2022. Is that still right?",
        );
        // NOT the internal prompt, and never the column heading.
        expect(participantQuestion(wire)).not.toContain("Child Dob");
    });

    it("turns operator labels into participant language, and dates into dates", () => {
        expect(naturalFieldLabel("Child Dob")).toBe("date of birth");
        expect(naturalFieldLabel("Allergies")).toBe("allergies");
        expect(displayValue("2022-05-15")).toBe("May 15, 2022");
        expect(displayValue(true)).toBe("Yes");
    });

    it("opens by telling the parent what the conversation will do", () => {
        const wire = participantObjectiveWireModel(objective(), { subjectDisplayName: "Test Process" });
        const intro = participantIntro(wire);
        // Specialist voice: what Alloy already has, and what it still needs. Not a welcome banner.
        // First name, same as every other line of the conversation.
        expect(intro).toContain("I already have most of Test's information");
        expect(intro).toContain("ask for anything I'm missing");
    });
});

describe("controls are semantic, not one text box", () => {
    it("a date need offers a date control", () => {
        const wire = participantObjectiveWireModel(
            objective({
                known_requiring_confirmation: [],
                missing: [need({ state: "missing", current_value: null })],
                next_turn: {
                    kind: "collect_missing_value",
                    need: need({ state: "missing", current_value: null }),
                    prompt: "What is Child Dob?",
                    proposed_value: null,
                    resolves_occurrences: 15,
                },
            }),
            { subjectDisplayName: "Test Process" },
        );
        expect(wire.next_turn.input_type).toBe("date");
        expect(controlForTurn(wire.next_turn)).toMatchObject({ kind: "value", inputType: "date" });
    });

    it("the authored type wins over the label", () => {
        // A field an operator deliberately made free text must not become a date picker because its
        // label happens to contain "date".
        expect(
            controlForTurn({
                kind: "collect_missing_value",
                prompt: "",
                proposed_value: null,
                resolves_occurrences: 1,
                input_type: "text",
                label: "Preferred start date note",
                options: [],
                optional: false,
                field_ids: [],
            }),
        ).toMatchObject({ kind: "value", inputType: "text" });
    });

    it("boolean and closed-enum needs get their own controls", () => {
        expect(
            controlForTurn({ kind: "collect_missing_value", prompt: "", proposed_value: null, resolves_occurrences: 1, input_type: "boolean", label: "Consent", options: [], optional: false, field_ids: [] }),
        ).toMatchObject({ kind: "boolean" });
        expect(
            controlForTurn({ kind: "collect_missing_value", prompt: "", proposed_value: null, resolves_occurrences: 1, input_type: "select", label: "Program", options: ["AM", "PM"], optional: false, field_ids: [] }),
        ).toMatchObject({ kind: "options", options: ["AM", "PM"] });
    });

    it("the card renders each control kind rather than one input", () => {
        const card = read("app/forms/embed/[token]/EnrollmentConversationCard.tsx");
        expect(card).toContain('data-participant-control="boolean"');
        expect(card).toContain('data-participant-control="options"');
        expect(card).toContain("participantQuestion(objective)");
    });
});

describe("one interaction per unique need, and no raw form beneath it", () => {
    it("the ask-once ratio is stated, not multiplied into fifteen questions", () => {
        const wire = participantObjectiveWireModel(objective(), { subjectDisplayName: "Ada" });
        expect(wire.next_turn.resolves_occurrences).toBe(15);
    });

    it("the host defers the packet Form while shared facts remain", () => {
        const host = read("app/forms/embed/[token]/FormEmbedClient.tsx");
        expect(host).toContain("sharedCollectionInProgress");
        expect(host).toContain('=== "shared_collection"');
        // Deferred, never bypassed: values still reach the Form through the existing prefill path.
        expect(host).toContain("participantPhase === \"shared_collection\"");
    });

    it("phase is derived from outstanding shared needs, and reported on every turn", () => {
        const collecting = participantObjectiveWireModel(objective());
        expect(collecting.phase).toBe("shared_collection");

        const reviewing = participantObjectiveWireModel(
            objective({
                known_requiring_confirmation: [],
                missing: [],
                next_turn: { kind: "complete_artifact", need: null, prompt: "", proposed_value: null, resolves_occurrences: 0 },
            }),
        );
        expect(reviewing.phase).toBe("artifact_review");

        const card = read("app/forms/embed/[token]/EnrollmentConversationCard.tsx");
        expect(card).toContain("onPhaseChange?.(json.data.objective.phase)");
    });

    it("hands off to a populated artifact for REVIEW, not a blank form", () => {
        const wire = participantObjectiveWireModel(
            objective({
                known_requiring_confirmation: [],
                missing: [],
                next_turn: { kind: "complete_artifact", need: null, prompt: "", proposed_value: null, resolves_occurrences: 0 },
            }),
            { subjectDisplayName: "Test Process" },
        );
        expect(participantQuestion(wire)).toContain("I filled out");
        // The instruction lives on the [Review paperwork] action, not in the sentence.
        expect(participantQuestion(wire)).toContain("that's everything I needed");
        // No progress line at all during review — the artifact itself is the context.
        expect(progressLine(wire)).toBe("");
    });
});

describe("signature and acknowledgment belong to the artifact", () => {
    it("they are artifact-specific by identity, so no confirm turn can reach them", () => {
        for (const key of ["signature", "acknowledgment", "consent"]) {
            expect(ENROLLMENT_CONFIRMATION_REQUIRED_KEYS.has(key)).toBe(false);
        }
    });

    it("shared collection ends before the artifact phase begins", () => {
        // A signature can only be reached once `known_requiring_confirmation` and `missing` are
        // empty — which is exactly the condition that ends suppression and shows the artifact.
        const stillCollecting = participantObjectiveWireModel(objective({ missing: [need({ state: "missing" })] }));
        expect(stillCollecting.phase).toBe("shared_collection");
    });
});

describe("display-only content is never participant work", () => {
    it("a text block collects nothing", () => {
        expect(formFieldCollectsValue({ type: "text_block" })).toBe(false);
        expect(formFieldCollectsValue({ type: "date" })).toBe(true);
    });

    it("the packet plan skips display fields", () => {
        const plan = buildPacketFieldPlan([
            {
                form_id: "f1",
                form_name: "Enrollment",
                schema: {
                    version: 1,
                    fields: [
                        { id: "disp_1", type: "text_block", label: "Page 2", content: "Handbook" },
                        { id: "field_2", type: "date", label: "Child Dob", field_source: { entity_type: "child", field_key: "dob", shared_value_key: "child_date_of_birth" } },
                    ],
                } as never,
            },
        ]);
        // "Page 2" was appearing to parents as something to fill in.
        expect(plan.entries.map((e) => e.label)).toEqual(["Child Dob"]);
    });
});
