/**
 * Known facts are confirmed by semantic subject — and two people are never one.
 *
 * The experience being replaced took eight consecutive turns to establish that nothing about a
 * child had changed. The risk in fixing it is the opposite failure: a card that reads like one
 * person while carrying two people's facts. These assert the grouping rule from the side that
 * matters — what it must NEVER join.
 */

import { describe, expect, it } from "vitest";

import {
    activeConfirmationGroup,
    confirmationRef,
    confirmationSubjectFor,
    groupKnownConfirmations,
    isIdentityFact,
} from "@/lib/enrollment/participantRuntime/confirmationGroup";
import type { EnrollmentInformationNeed } from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";

const CHILD = "11111111-1111-4111-8111-111111111111";

function need(input: {
    key: string;
    entity?: string | null;
    scope?: "child" | "household" | "recipient";
    subjectId?: string | null;
    state?: EnrollmentInformationNeed["state"];
    value?: unknown;
    label?: string;
    section?: string | null;
    fieldType?: string;
}): EnrollmentInformationNeed {
    const scope = input.scope ?? "child";
    return {
        identity: {
            key: `${scope}:${input.subjectId ?? "-"}:${input.key}`,
            scope,
            subject_id: input.subjectId ?? null,
            canonical_key: input.key,
            shared_value_key: input.key,
            entity_type: input.entity ?? null,
            // Required by EnrollmentNeedIdentity. Absent here, the cast had
            // insufficient overlap and the whole literal stopped type-checking.
            subject_entity_type: null,
            field_key: input.key.split(":").pop() ?? null,
            basis: input.key.includes(":") ? "canonical" : "shared_alias",
            artifact_specific: false,
            collection_mode: "conversational",
            session_value_key: input.key,
        },
        scope,
        subject_id: input.subjectId ?? null,
        state: input.state ?? "known_requires_confirmation",
        occurrence_count: 1,
        occurrences: [
            {
                requirement_id: "r",
                form_definition_id: "f",
                form_definition_version_id: "v",
                session_item_id: "s",
                form_field_id: `field_${input.key}`,
                label: input.label ?? input.key,
                required: true,
                section_title: input.section ?? null,
                field_type: input.fieldType ?? "text",
                options: [],
            },
        ],
        requirement_ids: ["r"],
        has_value: true,
        current_value: input.value ?? "x",
        value_source: "canonical_prefill",
        // Required by EnrollmentInformationNeed and nullable, so null is the
        // exact value for a fixture that asserts nothing about origin.
        value_origin: null,
        requires_participant_action: (input.state ?? "known_requires_confirmation") === "known_requires_confirmation",
    } as EnrollmentInformationNeed;
}

const childFirst = need({ key: "child_first_name", entity: "child", subjectId: CHILD, value: "Solene", label: "First Name" });
const childLast = need({ key: "child_last_name", entity: "child", subjectId: CHILD, value: "Marchetti", label: "Childs Last Name" });
const childDob = need({ key: "customer_member:dob", entity: "customer_member", subjectId: CHILD, value: "2021-04-02", label: "Birth Date", fieldType: "date" });
const childGender = need({ key: "customer_member:gender", entity: "customer_member", subjectId: CHILD, value: "Male", label: "How would you describe your child's gender?" });

const guardianName = need({ key: "guardian_name", entity: "guardian", scope: "household", value: "Marisol Marchetti", label: "Parent/Guardian #1 Name" });
const guardianPhone = need({ key: "guardian_phone", entity: "guardian", scope: "household", value: "5035550142", label: "Parent/Guardian #1 Phone Number" });
const guardianEmail = need({ key: "guardian_email", entity: "guardian", scope: "household", value: "marisol@example.com", label: "Parent/Guardian #1 Email Address" });

const personPhone = need({ key: "person:phone", entity: "person", scope: "household", value: "5035559999", label: "Parent/Guardian #2 Phone Number" });
const personEmail = need({ key: "person:email", entity: "person", scope: "household", value: "second@example.com", label: "Parent/Guardian #2 Email Address" });

describe("the semantic subject", () => {
    it("collapses every child entity spelling onto the child", () => {
        // `child` and `customer_member` are two spellings of one person, and `fieldScope.ts` has
        // already ruled so. Splitting them would produce two cards about the same child.
        expect(confirmationSubjectFor(childFirst).key).toBe(confirmationSubjectFor(childDob).key);
        expect(confirmationSubjectFor(childFirst).kind).toBe("child");
    });

    it("keeps two DIFFERENT children apart", () => {
        const other = need({ key: "child_first_name", entity: "child", subjectId: "22222222-2222-4222-8222-222222222222" });
        expect(confirmationSubjectFor(childFirst).key).not.toBe(confirmationSubjectFor(other).key);
    });

    it("keeps two different PEOPLE apart", () => {
        // The one failure that would put one parent's phone number under another parent's name.
        expect(confirmationSubjectFor(guardianName).key).not.toBe(confirmationSubjectFor(personPhone).key);
    });

    it("never lumps unrecognised entities together", () => {
        const a = need({ key: "vendor:phone", entity: "vendor", scope: "household" });
        const b = need({ key: "physician:phone", entity: "physician", scope: "household" });
        expect(confirmationSubjectFor(a).key).not.toBe(confirmationSubjectFor(b).key);
    });
});

describe("the group", () => {
    const all = [childFirst, childLast, childDob, childGender, guardianName, guardianPhone, guardianEmail, personPhone, personEmail];

    it("is one group per subject, and three subjects here", () => {
        const groups = groupKnownConfirmations(all);
        expect(groups.map((g) => g.subject.key)).toEqual([
            `child:${CHILD}`,
            "person:guardian",
            "person:person",
        ]);
        expect(groups[0]!.members).toHaveLength(4);
        expect(groups[1]!.members).toHaveLength(3);
        expect(groups[2]!.members).toHaveLength(2);
    });

    it("IGNORES the artifact's own headings — a shared heading never merges two people", () => {
        // The Admissions packet prints the child, both guardians and three emergency contacts under
        // one heading. Grouping on that heading is exactly the mistake this rule exists to avoid.
        const oneHeading = all.map((n) => ({
            ...n,
            occurrences: [{ ...n.occurrences[0]!, section_title: "Contact Information" }],
        })) as EnrollmentInformationNeed[];
        expect(groupKnownConfirmations(oneHeading)).toHaveLength(3);
    });

    it("IGNORES the artifact's own headings — a split heading never splits one person", () => {
        const split = [
            { ...childFirst, occurrences: [{ ...childFirst.occurrences[0]!, section_title: "Page 1" }] },
            { ...childDob, occurrences: [{ ...childDob.occurrences[0]!, section_title: "Health Information" }] },
        ] as EnrollmentInformationNeed[];
        const groups = groupKnownConfirmations(split);
        expect(groups).toHaveLength(1);
        expect(groups[0]!.members).toHaveLength(2);
    });

    it("carries ONLY facts the platform holds — a missing value is never a row", () => {
        /*
         * The middle-name case. Putting an unknown fact on a card headed "is this right?" would
         * present an absence as stored truth; it stays a question, asked on its own afterwards.
         */
        const middle = need({ key: "child_middle_name", entity: "child", subjectId: CHILD, state: "missing" });
        const groups = groupKnownConfirmations([childFirst, childLast, middle]);
        expect(groups[0]!.members.map((m) => m.need_key)).not.toContain(middle.identity.key);
        expect(groups[0]!.members).toHaveLength(2);
    });

    it("excludes what is already settled", () => {
        const confirmed = { ...childLast, state: "confirmed" } as EnrollmentInformationNeed;
        expect(groupKnownConfirmations([childFirst, confirmed, childDob])).toHaveLength(1);
        expect(groupKnownConfirmations([childFirst, confirmed, childDob])[0]!.members).toHaveLength(2);
    });
});

describe("the active group", () => {
    it("is the one containing the turn the runtime selected", () => {
        const group = activeConfirmationGroup(
            [childFirst, childLast, guardianName, guardianPhone],
            guardianName.identity.key,
        );
        expect(group?.subject.key).toBe("person:guardian");
        expect(group?.members.map((m) => m.need_key)).toEqual([
            guardianName.identity.key,
            guardianPhone.identity.key,
        ]);
    });

    it("is NULL for a subject with a single fact — one fact is a question, not a card", () => {
        expect(activeConfirmationGroup([childFirst, guardianPhone], guardianPhone.identity.key)).toBeNull();
    });

    it("is null when nothing is being confirmed", () => {
        expect(activeConfirmationGroup([childFirst, childLast], null)).toBeNull();
    });
});

describe("identity facts", () => {
    it("recognise a name by its canonical key, whatever the label says", () => {
        // "Childs Last Name" is a bilingual column heading with its apostrophe lost to OCR. The key
        // behind it is what names the person.
        expect(isIdentityFact(childLast)).toBe(true);
        expect(isIdentityFact(guardianName)).toBe(true);
        expect(isIdentityFact(childDob)).toBe(false);
        expect(isIdentityFact(guardianEmail)).toBe(false);
    });

    it("do not match a field that merely CONTAINS the word", () => {
        // The `hib` inside "prohibiting" mistake, in its identity-key form.
        expect(isIdentityFact(need({ key: "customer_member:name_of_school" }))).toBe(false);
        expect(isIdentityFact(need({ key: "customer_member:nickname" }))).toBe(false);
    });
});

describe("the fact handle", () => {
    it("is stable for a need key and distinct between needs", () => {
        expect(confirmationRef(childFirst.identity.key)).toBe(confirmationRef(childFirst.identity.key));
        const refs = new Set([childFirst, childLast, childDob, childGender, guardianName].map((n) => confirmationRef(n.identity.key)));
        expect(refs.size).toBe(5);
    });

    it("never contains the need key it stands for", () => {
        // The handle is what lets the browser address a fact without naming a canonical key.
        expect(confirmationRef(childDob.identity.key)).not.toContain("dob");
        expect(confirmationRef(childDob.identity.key)).not.toContain(CHILD);
    });
});
