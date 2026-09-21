/**
 * The conversation had context and never said so.
 *
 * Eighty questions arrived as eighty questions: the guardian's employer, then their employer
 * address, then — with no seam of any kind — the SECOND guardian's name, then an emergency
 * contact's phone number. The traversal was already finishing one person before starting the next;
 * the parent had no way to know that, and the one eyebrow the surface did print said "Contact
 * Information", which is the page the box sits on rather than whose question it is.
 *
 * What is asserted here is that the label comes from the block the traversal already chose — not
 * from a second grouping, not from a list of labels — and that it names a person the way Alloy's own
 * relationship vocabulary names them.
 */

import { describe, expect, it } from "vitest";

import type { FormSchemaV1 } from "@/lib/forms/schema";
import { projectEnrollmentInformationNeeds } from "@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds";
import { participantConversationGroup } from "@/lib/enrollment/participantRuntime/participantConversationGroup";
import { enrollmentConfirmationPolicy } from "@/lib/enrollment/participantRuntime/enrollmentConfirmationPolicy";
import { packageOutstandingNeeds } from "@/lib/enrollment/participantRuntime/conversationalPackage";
import type { EnrollmentInformationNeed } from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";

const CHILD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function field(id: string, label: string, source?: { entity_type: string; field_key: string }) {
    return { id, type: "text", label, required: true, read_only: false, ...(source ? { field_source: source } : {}) };
}

const SCHEMA = {
    schema_version: 1,
    title: "Enrolment information",
    fields: [
        field("c_dob", "Child's Date of Birth", { entity_type: "child", field_key: "dob" }),
        field("c_name", "Child's Full Name"),
        field("g1_name", "Parent/Guardian #1 Name"),
        field("g1_phone", "Parent/Guardian #1 Phone Number"),
        field("g2_name", "Parent/Guardian #2 Name"),
        field("g2_phone", "Parent/Guardian #2 Phone Number"),
        field("e1_name", "Emergency Contact #1 Name"),
        field("e1_phone", "Emergency Contact #1 Phone Number"),
        field("doc_name", "Primary Physician Name"),
        field("doc_phone", "Primary Physician Phone Number"),
        field("h_sleep", "When does your child go to sleep at night?"),
        field("h_food", "Favorite foods"),
    ],
    sections: [
        { id: "s1", title: "About the child", field_ids: ["c_dob", "c_name"] },
        { id: "s2", title: "Parents and guardians", field_ids: ["g1_name", "g1_phone", "g2_name", "g2_phone"] },
        { id: "s3", title: "Emergency contacts", field_ids: ["e1_name", "e1_phone"] },
        { id: "s4", title: "Health and daily routines", field_ids: ["doc_name", "doc_phone", "h_sleep", "h_food"] },
    ],
} as unknown as FormSchemaV1;

const needs = projectEnrollmentInformationNeeds({
    forms: [{ requirement_id: "r", form_definition_id: "fd", form_definition_version_id: "v", session_item_id: "si", schema: SCHEMA } as never],
    subjectId: CHILD,
    sharedValues: {},
    confirmations: {} as never,
});

const byField = (fieldId: string) => needs.find((n) => n.occurrences.some((o) => o.form_field_id === fieldId))!;

const group = (fieldId: string) =>
    participantConversationGroup({
        need: byField(fieldId),
        allNeeds: needs,
        requiresConfirmation: enrollmentConfirmationPolicy(),
        childName: "Lennon",
    });

describe("what the conversation calls the block it is in", () => {
    it("names a repeated person with Alloy's own role word and the form's number", () => {
        expect(group("g1_phone")?.title).toBe("Guardian #1");
        expect(group("g2_phone")?.title).toBe("Guardian #2");
        expect(group("e1_phone")?.title).toBe("Emergency contact");
    });

    it("omits the number where the packet names only one of that role", () => {
        // "Physician #1" on a form with one physician is a number a parent has no use for.
        expect(group("doc_phone")?.title).toBe("Physician");
    });

    it("speaks the child's name for their basics and the SCHOOL's heading for a later topic", () => {
        expect(group("c_name")?.title).toBe("Lennon's details");
        /*
         * The school's words are still the school's — what changed is WHOSE topic it is said to be.
         *
         * Named by the section alone, a child topic read as a peer of the people listed beside it,
         * and on the real packet that was misleading: "Emergency Contact Information & Authorized
         * Adults" sat under "Marisol Vega · Emergency contact" and held two answers about the CHILD
         * — custody arrangements, and whether anyone has a restraining order. Every row now leads
         * with its subject, which is the same grammar the person rows already used.
         */
        expect(group("h_sleep")?.title).toBe("Lennon · Health and daily routines");
        expect(group("h_sleep")?.title).toContain("Health and daily routines");
    });

    it("falls back to the bare heading when nothing names the child", () => {
        const anonymous = participantConversationGroup({
            need: byField("h_sleep"),
            allNeeds: needs,
            requiresConfirmation: enrollmentConfirmationPolicy(),
            childName: null,
        });
        expect(anonymous?.title).toBe("Health and daily routines");
    });

    it("is keyed by the traversal's own block, so it changes exactly when the subject does", () => {
        expect(group("g1_name")?.key).toBe(group("g1_phone")?.key);
        expect(group("g1_name")?.key).not.toBe(group("g2_name")?.key);
        expect(group("c_dob")?.key).toBe(group("c_name")?.key);
    });
});

describe("packaging asks the same subject owner", () => {
    it("never puts two people's questions in one topic", () => {
        /*
         * `voiceKeyFor` re-derived the subject from the declared entity, so on a real imported
         * packet — where almost nothing declares one — every unbound destination in a section
         * collapsed to one voice key and both guardians packaged together under one heading.
         */
        const outstanding = needs.filter((n) => n.requires_participant_action);
        const packages = packageOutstandingNeeds(outstanding);
        const subjectOf = (key: string) =>
            group(needs.find((n) => n.identity.key === key)!.occurrences[0]!.form_field_id)?.key ?? null;
        for (const pkg of packages) {
            const subjects = new Set(pkg.need_keys.map(subjectOf));
            expect(subjects.size, `package ${pkg.need_keys.join(",")} mixes subjects`).toBe(1);
        }
        // And the packet really does contain several subjects, so the loop above is not vacuous.
        expect(new Set(packages.map((p) => p.voice_key)).size).toBeGreaterThan(3);
    });
});

describe("the surface draws it instead of the school's page heading", () => {
    it("renders the group and suppresses the cluster's section title when it has one", () => {
        const src = new URL("../../app/forms/embed/[token]/EnrollmentConversationCard.tsx", import.meta.url).pathname;
        const text = require("node:fs").readFileSync(src, "utf8") as string;
        expect(text).toContain("<ConversationTransition group={objective.next_turn.group ?? null} />");
        expect(text).toContain("showTitle={!objective.next_turn.group}");
    });
});

describe("an unnameable block says nothing", () => {
    it("returns null rather than labelling a question 'Other'", () => {
        const orphan = {
            ...byField("h_food"),
            identity: { ...byField("h_food").identity, journey_subject_id: null, subject_party: null, entity_type: null, subject_entity_type: null },
            scope: "recipient",
        } as unknown as EnrollmentInformationNeed;
        expect(participantConversationGroup({
            need: orphan, allNeeds: needs, requiresConfirmation: enrollmentConfirmationPolicy(), childName: "Lennon",
        })).toBeNull();
    });
});
