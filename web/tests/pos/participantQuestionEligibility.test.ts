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
