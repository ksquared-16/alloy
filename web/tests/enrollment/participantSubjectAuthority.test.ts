/**
 * WHO a question is about, when Alloy has nowhere to keep the answer.
 *
 * ## The defect this pins
 *
 * The certified Admissions Form declares a canonical entity on 4 of its 80 destinations. The other
 * 76 — the child's own name, age and gender, both guardians' names and employers, three emergency
 * contacts, a physician and a dentist — reached the conversation with no subject at all, because
 * `classifyFieldScope` returns `household` as the documented FALLBACK for an unbound field and the
 * subject layer read that fallback as a statement about who the question was about.
 *
 * The observed consequence, driven live: the child's name was asked THIRD, after a different
 * person's phone number and email, while the child's date of birth — same child, same section of
 * the same page — was asked first, because Alloy happens to keep dates of birth and does not keep
 * "Student Age Upon Enrolling".
 *
 * **Whether a question has an Alloy canonical binding must never decide who the question is about.**
 *
 * ## What is asserted, and what deliberately is not
 *
 * The Form below is representative, not the certified packet: two guardians, two emergency contacts
 * and a child, with the canonical bindings scattered exactly as a real import scatters them — the
 * guardian's phone bound, their name and employer not; the child's date of birth bound, their name
 * and gender not. Nothing here asserts a label, an index into an Admissions form, or an order table.
 * It asserts that every one of a person's questions travels together, and that the answer is the
 * same whichever of that person's fields happens to be bound.
 *
 * No ordering layer is added and none is tested: the existing `orderNeedsForTraversal` does the
 * work once the subject reaching it is the true one.
 */

import { describe, expect, it } from "vitest";

import type { FormSchemaV1 } from "@/lib/forms/schema";
import { projectEnrollmentInformationNeeds } from "@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds";
import { confirmationSubjectFor } from "@/lib/enrollment/participantRuntime/confirmationGroup";
import {
    orderNeedsForTraversal,
    traversalPlacement,
    TRAVERSAL_RANK,
} from "@/lib/enrollment/participantRuntime/participantTraversalOrder";
import { enrollmentConfirmationPolicy } from "@/lib/enrollment/participantRuntime/enrollmentConfirmationPolicy";
import type { EnrollmentInformationNeed } from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";

const CHILD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

type Src = { entity_type: string; field_key: string } | undefined;

function field(id: string, label: string, source?: Src) {
    return { id, type: "text", label, required: true, read_only: false, ...(source ? { field_source: source } : {}) };
}

/**
 * A packet shaped like the ones schools actually send, with the bindings scattered as imports
 * scatter them. THREE people and one child; five of the twelve destinations bound.
 */
const SCHEMA = {
    schema_version: 1,
    title: "Enrolment information",
    fields: [
        field("c_name", "Child's Full Name"),
        field("c_dob", "Child's Date of Birth", { entity_type: "child", field_key: "dob" }),
        field("c_gender", "Child's Gender"),

        field("g1_name", "Parent/Guardian #1 Name"),
        field("g1_phone", "Parent/Guardian #1 Phone Number", { entity_type: "guardian", field_key: "phone" }),
        field("g1_employer", "Parent/Guardian #1 Employer"),

        field("g2_name", "Parent/Guardian #2 Name"),
        field("g2_phone", "Parent/Guardian #2 Phone Number"),

        field("e1_name", "Emergency Contact #1 Name"),
        field("e1_phone", "Emergency Contact #1 Phone Number"),
        field("e2_name", "Emergency Contact #2 Name"),
        field("e2_phone", "Emergency Contact #2 Phone Number"),
    ],
    sections: [
        { id: "s1", title: "About the child", field_ids: ["c_name", "c_dob", "c_gender"] },
        { id: "s2", title: "Parents and guardians", field_ids: ["g1_name", "g1_phone", "g1_employer", "g2_name", "g2_phone"] },
        { id: "s3", title: "Emergency contacts", field_ids: ["e1_name", "e1_phone", "e2_name", "e2_phone"] },
    ],
} as unknown as FormSchemaV1;

function project(): EnrollmentInformationNeed[] {
    return projectEnrollmentInformationNeeds({
        forms: [{
            requirement_id: "r",
            form_definition_id: "fd",
            form_definition_version_id: "v",
            session_item_id: "si",
            schema: SCHEMA,
        } as never],
        subjectId: CHILD,
        sharedValues: {},
        confirmations: {} as never,
    });
}

const byField = (needs: readonly EnrollmentInformationNeed[], fieldId: string) =>
    needs.find((n) => n.occurrences.some((o) => o.form_field_id === fieldId))!;

describe("subject is not destination", () => {
    const needs = project();

    it("gives a Form-only child question the same subject as the bound one beside it", () => {
        const name = confirmationSubjectFor(byField(needs, "c_name"));
        const dob = confirmationSubjectFor(byField(needs, "c_dob"));
        expect(name.kind).toBe("child");
        expect(name.key).toBe(dob.key);
        expect(name.subject_id).toBe(CHILD);
    });

    it("manufactures no canonical destination to get there", () => {
        /*
         * The whole point. A subject is not a place to keep a value, and buying one by inventing a
         * binding would put an unbound school question into the shared namespace where some other
         * artifact could claim it.
         */
        for (const id of ["c_name", "c_gender", "g1_name", "g1_employer", "g2_name", "g2_phone", "e1_name", "e2_phone"]) {
            const need = byField(needs, id);
            expect(need.identity.canonical_key).toBeNull();
            expect(need.identity.shared_value_key).toBeNull();
            expect(need.identity.basis).toBe("unbound");
        }
    });

    it("keeps the two guardians apart even though only one of them is bound", () => {
        const g1 = confirmationSubjectFor(byField(needs, "g1_name"));
        const g2 = confirmationSubjectFor(byField(needs, "g2_name"));
        expect(g1.kind).toBe("person");
        expect(g2.kind).toBe("person");
        expect(g1.entity_type).toBe("guardian");
        expect(g2.entity_type).toBe("guardian");
        expect(g1.ordinal).toBe(1);
        expect(g2.ordinal).toBe(2);
        expect(g1.key).not.toBe(g2.key);
    });

    it("puts the bound and unbound halves of ONE person in the same subject", () => {
        // The guardian's phone is bound and their employer is not. They are still one person.
        expect(confirmationSubjectFor(byField(needs, "g1_phone")).key)
            .toBe(confirmationSubjectFor(byField(needs, "g1_employer")).key);
    });

    it("never merges two people's needs into one", () => {
        const g1Phone = byField(needs, "g1_phone");
        const g2Phone = byField(needs, "g2_phone");
        expect(g1Phone.identity.key).not.toBe(g2Phone.identity.key);
    });

    it("gives each emergency contact their own subject", () => {
        const e1 = confirmationSubjectFor(byField(needs, "e1_phone"));
        const e2 = confirmationSubjectFor(byField(needs, "e2_phone"));
        expect(e1.entity_type).toBe("emergency_contact");
        expect(e2.entity_type).toBe("emergency_contact");
        expect(e1.key).not.toBe(e2.key);
    });
});

describe("the conversation the existing traversal then produces", () => {
    const needs = project();
    const ordered = orderNeedsForTraversal(needs, enrollmentConfirmationPolicy(), needs);
    const fieldsInOrder = ordered.map((n) => n.occurrences[0]!.form_field_id);
    const blocksInOrder = ordered.map((n) => traversalPlacement(n, {
        basicSections: new Set(["fd::About the child"]),
    }).blockKey);

    /** The distinct blocks, in the order the conversation first reaches each. */
    const blockRun = blocksInOrder.filter((b, i) => b !== blocksInOrder[i - 1]);

    /** The block each field was placed in, so an assertion names the PERSON and not a position. */
    const block = (id: string) => traversalPlacement(byField(needs, id), {
        basicSections: new Set(["fd::About the child"]),
    }).blockKey;

    it("meets one person at a time — no block is returned to", () => {
        // The invariant, stated as a property rather than an expected list: if a block appears
        // twice in `blockRun` the conversation left that person and came back.
        expect(new Set(blockRun).size).toBe(blockRun.length);
    });

    it("gives every person their OWN block, and each person only one", () => {
        /*
         * Adjacency alone is not the claim and will pass by accident — four strangers dumped into
         * one bucket are adjacent too. Each of these five subjects must be a block of its own, and
         * every one of that subject's questions must be in it.
         */
        expect(block("c_name")).toBe(block("c_dob"));
        expect(block("c_gender")).toBe(block("c_dob"));
        expect(block("g1_name")).toBe(block("g1_phone"));
        expect(block("g1_employer")).toBe(block("g1_phone"));
        expect(block("g2_name")).toBe(block("g2_phone"));
        expect(block("e1_name")).toBe(block("e1_phone"));
        expect(block("e2_name")).toBe(block("e2_phone"));

        const distinct = [block("c_dob"), block("g1_phone"), block("g2_phone"), block("e1_phone"), block("e2_phone")];
        expect(new Set(distinct).size).toBe(5);
    });

    it("starts with the child, and the child's Form-only questions are in that block", () => {
        expect(fieldsInOrder.slice(0, 3).sort()).toEqual(["c_dob", "c_gender", "c_name"]);
        expect(block("c_name")).toBe("child:basics");
    });

    it("then the primary guardian, all three of their questions together", () => {
        expect(fieldsInOrder.slice(3, 6).sort()).toEqual(["g1_employer", "g1_name", "g1_phone"]);
        expect(block("g1_phone")).toBe("person:guardian#1");
    });

    it("then the second guardian and each emergency contact, each as their own block", () => {
        expect(fieldsInOrder.slice(6)).toEqual(["g2_name", "g2_phone", "e1_name", "e1_phone", "e2_name", "e2_phone"]);
        expect(block("g2_phone")).toBe("person:guardian#2");
        expect(block("e1_phone")).toBe("person:emergency_contact#1");
        expect(block("e2_phone")).toBe("person:emergency_contact#2");
    });

    it("ranks the second guardian with the other people, not with the primary one", () => {
        /*
         * "Additional people" is where the traversal model already puts second guardians. Before the
         * ordinal reached the placement, #1 and #2 shared one block called `guardian` — which is the
         * shape in which one person's answers land on another.
         */
        const rank = (id: string) => traversalPlacement(byField(needs, id), { basicSections: new Set(["fd::About the child"]) }).rank;
        expect(rank("g1_phone")).toBe(TRAVERSAL_RANK.primaryGuardian);
        expect(rank("g2_phone")).toBe(TRAVERSAL_RANK.otherPeople);
        expect(rank("e1_phone")).toBe(TRAVERSAL_RANK.otherPeople);
    });
});
