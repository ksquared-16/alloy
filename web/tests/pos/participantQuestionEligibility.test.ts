/**
 * A destination is a placement on a document. A question is a thing a person is asked.
 *
 * The published Forms conflated them: one destination became one participant field, labelled with
 * the OCR string and typed by the reader's widget guess. 173 fields for 86 correlated facts, 63 of
 * them wearing labels like "Phone Number NúMero De TeléFono Row1", and a phone stored as the number
 * 1231231234 because the source box was numeric.
 *
 * These controls pin the separation, and each one names the live defect it prevents.
 */

import { describe, expect, it } from "vitest";
import {
    canonicalLabelFor,
    isAsked,
    looksLikeSourceLabel,
    projectParticipantRole,
    semanticTypeFor,
    humaniseCanonicalKey,
    readsAsAuthoredQuestion,
    looksLikeDependentFragment,
    looksLikeHeading,
    looksLikeStructuralIdentifier,
} from "@/lib/pos/processingCase/formDraft/participantQuestionEligibility";
import type { ConfigurationProposal } from "@/lib/pos/discovery/contracts";

const concept = (label: string, concept_key?: string, kind = "scalar_field") =>
    ({ label, concept_key: concept_key ?? null, kind }) as never;
const proposal = (disposition: string, target?: { entity_type: string; field_key: string; shared_value_key?: string }) =>
    ({ disposition, ...(target ? { target_field_source: target } : {}) }) as unknown as ConfigurationProposal;

describe("a destination can exist without being a participant question", () => {
    it("places a derived value on the artifact and never asks for it", () => {
        const p = projectParticipantRole({ concept: concept("Today's Date"), proposal: proposal("derived_value_system") });
        expect(p.role).toBe("artifact_placement_only");
        expect(isAsked(p.role)).toBe(false);
        expect(p.label).toBeUndefined();
    });

    it("reproduces prose as static content rather than asking it", () => {
        expect(projectParticipantRole({ concept: concept("Oregon law requires…"), proposal: proposal("static_content") }).role).toBe("static_content");
    });

    it("leaves a held concept to its owner", () => {
        // The vaccine dose series: Health owns it, so V1 does not ask forty text boxes for it.
        expect(projectParticipantRole({ concept: concept("Dose 5 Dosis 5 Tdap", "child.tdap"), proposal: proposal("held_for_canonical_owner") }).role).toBe("held");
    });
});

describe("one semantic value serves many destinations", () => {
    it("carries a shared value key so a fact populates every destination that needs it", () => {
        // Ask-once lives here. The published Forms carry it on 5 of 173 fields, which is why the
        // same fact was asked repeatedly.
        const p = projectParticipantRole({
            concept: concept("Childs Last Name Apellido Delde La Menor Row1", "child.name"),
            proposal: proposal("reuse_canonical_field", { entity_type: "customer_member", field_key: "child_last_name" }),
        });
        expect(p.sharedValueKey).toBeTruthy();
        expect(p.role).toBe("prefill_confirm");
    });

    it("gives two destinations of the same fact the same shared key", () => {
        const mk = () => projectParticipantRole({
            concept: concept("Phone Number NúMero De TeléFono Row1", "person.phone"),
            proposal: proposal("reuse_canonical_field", { entity_type: "person", field_key: "phone" }),
        });
        expect(mk().sharedValueKey).toBe(mk().sharedValueKey);
    });
});

describe("participant copy is never the source string", () => {
    it("replaces an OCR label with the registered canonical label", () => {
        const p = projectParticipantRole({
            concept: concept("Childs Last Name Apellido Delde La Menor Row1", "child.name"),
            proposal: proposal("reuse_canonical_field", { entity_type: "customer_member", field_key: "child_last_name" }),
        });
        expect(p.label).toBe(canonicalLabelFor("customer_member", "child_last_name"));
        expect(looksLikeSourceLabel(p.label)).toBe(false);
    });

    it("holds for review rather than publishing OCR as a question", () => {
        // The rule that keeps "Dose 5 Dosis 5 Tdap" off a parent's screen when nothing can name it.
        const p = projectParticipantRole({ concept: concept("Dose 5 Dosis 5 Tdap"), proposal: proposal("create_proposed_field") });
        expect(p.role).toBe("hold_for_review");
        expect(p.label).toBeUndefined();
    });

    it("humanises a canonical KEY but never a source string", () => {
        // The distinction that keeps this from becoming regex cleanup: `person.phone` is an
        // identifier Alloy chose, so "Phone" names a concept. The OCR string is not an identifier
        // and never becomes copy — it holds for review instead.
        expect(humaniseCanonicalKey("emergency_contact_phone")).toBe("Emergency contact phone");
        expect(humaniseCanonicalKey("phone")).toBe("Phone");
        expect(humaniseCanonicalKey("Phone Number NúMero De TeléFono Row1")).toBeNull();
    });

    it("recognises the noise it must never publish", () => {
        for (const label of ["Phone Number NúMero De TeléFono Row1", "Childs Last Name Apellido Delde La Menor Row1", "Dose 5 Dosis 5 Tdap", "First Name Primer Nombre Row1"]) {
            expect(looksLikeSourceLabel(label), label).toBe(true);
        }
        for (const label of ["Allergies", "Child first name", "Emergency contact phone"]) {
            expect(looksLikeSourceLabel(label), label).toBe(false);
        }
    });
});

describe("a phone destination cannot force numeric storage", () => {
    it("types phone as phone even when the source widget was numeric", () => {
        // The live defect: person:phone = 1231231234, stored as a number because the Oregon box was.
        expect(semanticTypeFor("phone", "number")).toBe("phone");
        expect(semanticTypeFor("emergency_contact_phone", "number")).toBe("phone");
        const p = projectParticipantRole({
            concept: concept("Phone Number NúMero De TeléFono Row1", "person.phone"),
            proposal: proposal("reuse_canonical_field", { entity_type: "person", field_key: "phone" }),
            readerType: "number",
        });
        expect(p.semanticType).toBe("phone");
    });

    it("still honours the reader where no canonical semantic applies", () => {
        expect(semanticTypeFor("sibling_count", "number")).toBe("number");
        expect(semanticTypeFor("notes", "date")).toBe("date");
    });
});

describe("obligations survive around non-question destinations", () => {
    it("keeps uploads, acknowledgements and signatures whatever their neighbours are", () => {
        expect(projectParticipantRole({ concept: concept("Attach the record"), proposal: proposal("upload_requirement") }).role).toBe("upload");
        expect(projectParticipantRole({ concept: concept("I certify…"), proposal: proposal("acknowledgement") }).role).toBe("acknowledgement");
        expect(projectParticipantRole({ concept: concept("Signature"), proposal: proposal("signature_requirement") }).role).toBe("signature");
    });

    it("treats a repeating series as one structured collection, not N questions", () => {
        // The vaccine grid's shape when it IS collected: a series, answered as a group.
        expect(projectParticipantRole({ concept: concept("Vaccine doses", "child.tdap", "value_series"), proposal: proposal("structured_collection") }).role).toBe("structured_collection");
    });
});

describe("the projection is deterministic", () => {
    it("returns the same result for the same input", () => {
        const run = () => projectParticipantRole({
            concept: concept("Allergies", "child.allergies"),
            proposal: proposal("reuse_canonical_field", { entity_type: "customer_member", field_key: "allergies" }),
        });
        expect(run()).toEqual(run());
    });
});

describe("a held concept whose source already asks the question", () => {
    /**
     * `held_unknown_owner` says nobody owns the DURABLE fact — not that a family should not be asked.
     * The Admissions Packet is a bespoke school intake form, so 15 of its held concepts already carry
     * the school's own wording ("Is your child able to play alone?"). Asking those is honest and
     * creates no canonical field; holding them would have stalled publication on nothing.
     */
    it("asks it, process-scoped, and creates no field", () => {
        const p = projectParticipantRole({
            concept: concept("Is your child able to play alone?", "child.is_your_child_able_to_play_alone"),
            proposal: proposal("held_unknown_owner"),
        });
        expect(p.role).toBe("question");
        expect(p.label).toBe("Is your child able to play alone?");
        expect(p.basis).toMatch(/no durable field/);
    });

    it("never turns a heading or a structural identifier into a question", () => {
        /*
         * These once held for review; the settled decisions then classified them — headings as
         * static content, `subject_line` as placement-only. What must never change is the part that
         * matters: none of them becomes something a family is asked.
         */
        for (const label of ["Developmental History:", "Social relationships:", "subject_line"]) {
            const p = projectParticipantRole({ concept: concept(label), proposal: proposal("held_unknown_owner") });
            expect(isAsked(p.role), label).toBe(false);
            expect(p.label, label).toBeUndefined();
        }
    });

    it("refuses a checkbox caption", () => {
        // The CIS exemption boxes: "Module", "Sp", "Polio", "Religious".
        for (const label of ["Module", "Sp", "Polio", "Religious"]) {
            expect(projectParticipantRole({ concept: concept(label), proposal: proposal("held_unknown_owner") }).role, label).toBe("hold_for_review");
        }
    });

    it("refuses anything still wearing OCR noise", () => {
        expect(readsAsAuthoredQuestion("Parents Or Guardians Names Nombre De Los Padres O Tutores")).toBe(false);
    });

    it("recognises authored questions by their own shape", () => {
        for (const q of ["How is your child comforted?", "Does your child have any fears? (dark, spiders, etc.)", "Has your student ever participated in speech therapy"]) {
            expect(readsAsAuthoredQuestion(q), q).toBe(true);
        }
        for (const notQ of ["Module", "Name:", "Sp"]) expect(readsAsAuthoredQuestion(notQ), notQ).toBe(false);
    });

    it("never lets a guardian fact become a child field", () => {
        // Once held; now settled as process-scoped. The invariant that survives both is that party
        // grain is never flattened onto the child.
        const p = projectParticipantRole({
            concept: concept("Parent/Guardian #1 Employer:", "guardian.parent_guardian_1_employer"),
            proposal: proposal("held_unknown_owner"),
        });
        expect(p.role).toBe("process_scoped");
        expect(p.role).not.toBe("prefill_confirm");
        expect(p.sharedValueKey).toBeUndefined();
    });
});

describe("the four settled decisions", () => {
    const held = (label: string, concept_key: string, kind = "scalar_field") =>
        ({ concept: concept(label, concept_key, kind), proposal: proposal("held_unknown_owner") });

    it("reads a guardian identity fact FROM Relationship + Person, never from a child field", () => {
        // Owned by Person is a statement about where the truth lives, so it is a statement about
        // where to READ it — not a reason to leave a required box on the document blank. The
        // canonical prefill map resolves this leaf, so the box is prefilled and asked only if unknown.
        const p = projectParticipantRole(held("Parent/Guardian #1 Name:", "guardian.name"));
        expect(p.role).toBe("prefill_confirm");
        expect(p.canonicalBinding).toEqual({ entity_type: "guardian", field_key: "name" });
        expect(p.sharedValueKey).toBe("guardian_name");
        expect(p.basis).toMatch(/person\.full_name/);
        expect(p.label).toBe("Parent/Guardian #1 Name");
    });

    it("still holds a guardian leaf no canonical owner can resolve", () => {
        // A guardian address has no registered prefill path, so nothing is invented for it; the
        // value-production invariant is what catches it if the source requires a value.
        const p = projectParticipantRole(held("Mailing Address or Secondary Parent Address", "guardian.address"));
        expect(p.role).toBe("relationship_person");
        expect(p.canonicalBinding).toBeUndefined();
    });

    it("reads the EMPLOYER subject from the destination's own prompt", () => {
        // "Parent/Guardian #1 Employer Address:" arrived under the key `guardian.address`. Keyed only
        // on the concept, the employer's address was filed as a guardian fact and hidden — while its
        // own sibling, "Parent/Guardian #1 Employer:", was asked.
        const p = projectParticipantRole({ ...held("Mailing Address or Secondary Parent Address", "guardian.address"), facetLabel: "Parent/Guardian #1 Employer Address:" });
        expect(p.role).toBe("process_scoped");
        expect(p.label).toBe("Parent/Guardian #1 Employer Address");
    });

    it("keeps guardian employment askable but never durable", () => {
        // No canonical external-person employment owner exists, and this slice does not invent one.
        const p = projectParticipantRole(held("Parent/Guardian #1 Employer:", "guardian.parent_guardian_1_employer"));
        expect(p.role).toBe("process_scoped");
        expect(p.label).toBe("Parent/Guardian #1 Employer");
        expect(p.basis).toMatch(/never stored durably/);
    });

    it("checks grain BEFORE label shape", () => {
        /*
         * The ordering bug this pins: "Parent/Guardian #1 Employer:" ends in a colon and is three
         * words, so a shape-first rule filed it as a heading and silently dropped a question the
         * school asks. Grain is a semantic fact; punctuation is typography.
         */
        expect(looksLikeHeading("Parent/Guardian #1 Employer:")).toBe(true);
        expect(projectParticipantRole(held("Parent/Guardian #1 Employer:", "guardian.parent_guardian_1_employer")).role).toBe("process_scoped");
    });

    it("keeps the exemption controls with the artifact that owns them", () => {
        for (const label of ["Module", "Sp", "Polio", "Religious"]) {
            const p = projectParticipantRole({ ...held(label, `child.${label.toLowerCase()}`, "choice_field"), onSelfContainedArtifact: true });
            expect(p.role, label).toBe("artifact_structured_control");
        }
    });

    it("does not turn those captions into packet-wide questions elsewhere", () => {
        // Off their own artifact they are meaningless captions, and holding is the honest answer.
        expect(projectParticipantRole({ ...held("Polio", "child.polio", "choice_field"), onSelfContainedArtifact: false }).role).toBe("hold_for_review");
    });

    it("makes a heading static content and never a question", () => {
        for (const label of ["Developmental History:", "Social relationships:"]) {
            expect(projectParticipantRole(held(label, "child.x")).role, label).toBe("static_content");
        }
    });

    it("asks a dependent fragment only behind its gate", () => {
        const p = projectParticipantRole({ ...held("If yes, their relationship to your child:", "child.if_yes_rel"), precedingGateConceptId: "gate-15" });
        expect(p.role).toBe("dependent_question");
        expect(p.dependsOnConceptId).toBe("gate-15");
        expect(p.label).toBe("If yes, their relationship to your child");
    });

    it("holds a dependent fragment whose gate cannot be recovered", () => {
        // An unconditioned "If yes…" asked of everyone is worse than a hold.
        const p = projectParticipantRole(held("If yes, their relationship to your child:", "child.if_yes_rel"));
        expect(p.role).toBe("hold_for_review");
    });

    it("keeps structural metadata out of the questionnaire entirely", () => {
        expect(looksLikeStructuralIdentifier("subject_line")).toBe(true);
        expect(looksLikeStructuralIdentifier("Is your child able to play alone?")).toBe(false);
        const p = projectParticipantRole(held("subject_line", "child.subject_line"));
        expect(p.role).toBe("artifact_placement_only");
        expect(p.label).toBeUndefined();
    });

    it("recognises a dependent fragment by its opening, not its content", () => {
        expect(looksLikeDependentFragment("If yes, please explain")).toBe(true);
        expect(looksLikeDependentFragment("If so, describe")).toBe(true);
        expect(looksLikeDependentFragment("Is your child able to play alone?")).toBe(false);
    });
});
