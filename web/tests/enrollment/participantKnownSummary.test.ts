/**
 * "I already have most of Toureeb's information" — and then showing nothing.
 *
 * ## The two halves of the defect
 *
 * FIRST, THE MISSING LIST. `settled[]` is D-99 evidence and correctly so: a row there means the
 * participant confirmed or supplied that value. At session open there is none, so `settled` ships
 * empty while the objective reports work already settled. The parent got the sentence and no
 * substance. Weakening the evidence contract to fill the opening would have made "confirmed" mean
 * "we have it on file", which is the one thing it must never mean.
 *
 * SECOND, AND WORSE: on the certified Admissions packet the sentence was simply FALSE. That packet
 * binds four canonical destinations out of eighty — child date of birth, enrolment start date,
 * guardian phone, guardian email — so for a family whose record holds none of them the platform
 * knows nothing at all. The sixteen units the objective reported settled were the packet's fifteen
 * OPTIONAL questions, which settle by being optional, plus one fact the parent had already given.
 *
 * So there are two things here, and they are separate on purpose: a `known` projection that is
 * presentation and creates no evidence, and an opening line that makes its claim only when that
 * projection has something in it.
 */

import { describe, expect, it } from "vitest";

import { groupKnownFacts, groupSettledConfirmations } from "@/lib/enrollment/participantRuntime/confirmationGroup";
import { participantObjectiveWireModel } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";
import { participantIntro } from "@/lib/enrollment/participantRuntime/participantTurnPresentation";
import type { EnrollmentInformationNeed } from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";

const CHILD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function need(over: Record<string, unknown> = {}): EnrollmentInformationNeed {
    return {
        identity: {
            key: "child:c:child_date_of_birth",
            canonical_key: "child_date_of_birth",
            shared_value_key: "child_date_of_birth",
            field_key: "child_date_of_birth",
            entity_type: "child",
            subject_entity_type: "child",
            subject_party: null,
            journey_subject_id: CHILD,
            basis: "shared_alias",
            scope: "child",
            subject_id: CHILD,
            artifact_specific: false,
            collection_mode: "conversational",
            session_value_key: "child_date_of_birth",
        },
        scope: "child",
        subject_id: CHILD,
        state: "known_requires_confirmation",
        has_value: true,
        current_value: "2021-06-14",
        value_source: "canonical_prefill",
        value_origin: null,
        occurrence_count: 1,
        occurrences: [{
            requirement_id: "r",
            form_definition_id: "fd",
            form_definition_version_id: "v",
            session_item_id: "si",
            form_field_id: "field_2",
            label: "Student Date of Birth:",
            required: true,
            section_title: "Contact Information",
            field_type: "date",
            options: [],
        }],
        requirement_ids: ["r"],
        requires_participant_action: true,
        ...over,
    } as unknown as EnrollmentInformationNeed;
}

const guardianPhone = need({
    identity: {
        key: "household:-:guardian_phone",
        canonical_key: "guardian_phone",
        shared_value_key: "guardian_phone",
        field_key: "guardian_phone",
        entity_type: "guardian",
        subject_entity_type: "guardian",
        subject_party: { role: "guardian", ordinal: 1, canonical_role: true },
        journey_subject_id: CHILD,
        basis: "shared_alias",
        scope: "household",
        subject_id: null,
        artifact_specific: false,
        collection_mode: "conversational",
        session_value_key: "guardian_phone",
    },
    scope: "household",
    subject_id: null,
    current_value: "(602) 290-4816",
    occurrences: [{
        requirement_id: "r", form_definition_id: "fd", form_definition_version_id: "v", session_item_id: "si",
        form_field_id: "field_7", label: "Parent/Guardian #1 Phone Number:", required: true,
        section_title: "Contact Information", field_type: "text", options: [],
    }],
});

/** Answered in this session. Evidenced, and therefore NOT something Alloy already had. */
const supplied = need({
    identity: { ...(need().identity as object), key: "child:c:child_gender", canonical_key: "child:gender", shared_value_key: "child:gender" },
    state: "confirmed",
    value_origin: "participant_supplied",
    current_value: "Girl",
    requires_participant_action: false,
});

/** Optional and unanswered: settled work, and nothing the platform KNOWS. */
const optionalBlank = need({
    identity: { ...(need().identity as object), key: "artifact:si:v:field_44", canonical_key: null, shared_value_key: null, basis: "unbound", artifact_specific: true },
    state: "missing",
    has_value: false,
    current_value: null,
    optional: true,
    requires_participant_action: false,
});

function objective(needs: readonly EnrollmentInformationNeed[]) {
    return {
        process_instance_id: "pi",
        session_id: "s",
        business_process_revision_id: "rev",
        stage_key: "enrolling",
        progress: { total_requirements: 1, satisfied_requirements: 0, remaining_requirements: 1 },
        needs: { needs_requiring_action: needs.length, total_needs: needs.length, needs },
        known_requiring_confirmation: needs.filter((n) => n.state === "known_requires_confirmation"),
        missing: [],
        artifact_specific: [],
        next_turn: { kind: "confirm_known_value", need: needs[0], prompt: "…", proposed_value: null, resolves_occurrences: 1 },
    } as never;
}

describe("what Alloy already holds", () => {
    it("is grouped by the SAME subject rule the conversation uses", () => {
        const groups = groupKnownFacts([need(), guardianPhone]);
        expect(groups.map((g) => g.subject.key)).toEqual([`child:${CHILD}`, "person:guardian#1"]);
    });

    it("excludes what the participant supplied — that is not something we already had", () => {
        const keys = groupKnownFacts([need(), supplied]).flatMap((g) => g.members.map((m) => m.need_key));
        expect(keys).toEqual([need().identity.key]);
    });

    it("excludes a settled OPTIONAL question, which is work done and not a fact", () => {
        /*
         * The specific trap. The certified packet's sixteen "settled" units at session open were
         * fifteen optional questions — they settle by being optional. Counting them as known is how
         * an empty summary comes to sit under a sentence claiming sixteen facts.
         */
        expect(groupKnownFacts([optionalBlank])).toEqual([]);
    });

    it("creates no confirmation evidence and moves nothing into settled", () => {
        const wire = participantObjectiveWireModel(objective([need(), guardianPhone]), { subjectDisplayName: "Toureeb Tourb" });
        expect(wire.known.length).toBe(2);
        // The whole point of a second, weaker projection.
        expect(wire.settled).toEqual([]);
        expect(groupSettledConfirmations([need(), guardianPhone])).toEqual([]);
        // Still outstanding: showing a value is not answering for the parent.
        expect(need().requires_participant_action).toBe(true);
    });

    it("gives each subject a heading and no internal identifiers", () => {
        const wire = participantObjectiveWireModel(objective([need(), guardianPhone]), { subjectDisplayName: "Toureeb Tourb" });
        expect(wire.known[0]!.heading).toBe("Toureeb's details");
        expect(wire.known[0]!.facts.map((f) => f.label)).toEqual(["Birthday"]);
        expect(wire.known[1]!.heading).toBe("Your details");
        const serialized = JSON.stringify(wire.known);
        for (const leak of ["child_date_of_birth", "guardian_phone", "field_2", "field_7", "si", "fd"]) {
            expect(serialized.includes(leak), `known must not leak ${leak}`).toBe(false);
        }
    });

    it("offers no editor, because nothing here is settled", () => {
        const wire = participantObjectiveWireModel(objective([need()]), { subjectDisplayName: "Toureeb Tourb" });
        const fact = wire.known[0]!.facts[0]! as Record<string, unknown>;
        expect(Object.keys(fact).sort()).toEqual(["label", "value"]);
    });
});

describe("the opening line", () => {
    it("claims prior knowledge only when there is some", () => {
        const withKnown = participantObjectiveWireModel(objective([need()]), { subjectDisplayName: "Toureeb Tourb" });
        expect(participantIntro(withKnown)).toContain("what I already have");

        const withNothing = participantObjectiveWireModel(objective([optionalBlank]), { subjectDisplayName: "Toureeb Tourb" });
        expect(withNothing.known).toEqual([]);
        expect(participantIntro(withNothing)).not.toContain("already have");
        expect(participantIntro(withNothing)).toContain("Toureeb's enrollment paperwork");
    });
});

describe("the participant surface renders it", () => {
    it("draws the known summary only while nothing is settled", () => {
        const src = new URL("../../app/forms/embed/[token]/EnrollmentConversationCard.tsx", import.meta.url).pathname;
        const text = require("node:fs").readFileSync(src, "utf8") as string;
        expect(text).toContain("<KnownSummary known={objective.known} />");
        expect(text).toContain("objective.settled.length === 0 ?");
        // Read-only by construction: no Edit affordance is wired into the known rows.
        const start = text.indexOf("function KnownGroup(");
        const end = text.indexOf("function SettledGroup(");
        expect(text.slice(start, end)).not.toContain("onEdit");
    });
});
