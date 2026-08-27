/**
 * Finish one person before starting the next.
 *
 * The queue used to sort on state alone — every confirmation anywhere, then every collection
 * anywhere, in source-field order. That is how a conversation comes to jump from a guardian to a
 * child's date of birth and back to the guardian: the PDF's box order was the conversation's order.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
    orderNeedsForTraversal,
    TRAVERSAL_RANK,
    traversalPlacement,
} from "@/lib/enrollment/participantRuntime/participantTraversalOrder";
import type { EnrollmentInformationNeed } from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";

const CHILD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const POLICY = new Set(["child_first_name", "customer_member:dob", "guardian_phone"]);

function need(input: {
    key: string | null;
    entity?: string | null;
    subjectEntity?: string | null;
    scope?: "child" | "household";
    section?: string | null;
    state?: EnrollmentInformationNeed["state"];
    form?: string;
}): EnrollmentInformationNeed {
    const scope = input.scope ?? (input.entity === "child" || input.entity === "customer_member" ? "child" : "household");
    return {
        identity: {
            key: `${scope}:${input.key ?? Math.random()}`,
            scope,
            subject_id: scope === "child" ? CHILD : null,
            canonical_key: input.key,
            shared_value_key: input.key,
            entity_type: input.entity ?? null,
            subject_entity_type: input.entity ?? input.subjectEntity ?? null,
            field_key: input.key,
            basis: input.key ? "canonical" : "unbound",
            artifact_specific: !input.key,
            collection_mode: "conversational",
            session_value_key: input.key,
        },
        scope,
        subject_id: scope === "child" ? CHILD : null,
        state: input.state ?? "missing",
        occurrence_count: 1,
        occurrences: [{
            requirement_id: "r",
            form_definition_id: input.form ?? "admissions",
            form_definition_version_id: "v",
            session_item_id: "si",
            form_field_id: `f_${input.key ?? "x"}`,
            label: input.key ?? "question",
            required: true,
            section_title: input.section ?? null,
            field_type: "text",
            options: [],
        }],
        requirement_ids: ["r"],
        has_value: false,
        current_value: null,
        value_source: "none",
        value_origin: null,
        requires_participant_action: true,
    } as EnrollmentInformationNeed;
}

const CONTACT = "Contact Information";
const HEALTH = "Health Information and Developmental History";

describe("the order the conversation meets people in", () => {
    const childName = need({ key: "child_first_name", entity: "child", section: CONTACT, state: "known_requires_confirmation" });
    const childDob = need({ key: "customer_member:dob", entity: "customer_member", section: CONTACT });
    const childMeds = need({ key: "customer_member:medical_notes", entity: "customer_member", section: HEALTH });
    const childDiet = need({ key: "customer_member:special_diet", entity: "customer_member", section: HEALTH });
    const guardianPhone = need({ key: "guardian_phone", entity: "guardian", state: "known_requires_confirmation" });
    const guardianEmail = need({ key: "guardian_email", entity: "guardian" });
    const personPhone = need({ key: "person:phone", entity: "person" });
    const address = need({ key: "customer:address", entity: "customer" });

    const all = [childMeds, guardianEmail, childName, personPhone, address, childDob, guardianPhone, childDiet];

    it("puts the child's basics first and their health narrative after the household", () => {
        /*
         * The child comes first and comes back later on purpose: a parent settles who their child IS
         * before anything else, and the long health and development narrative is a different
         * conversation that belongs after the people are established.
         */
        const ordered = orderNeedsForTraversal(all, POLICY);
        const keys = ordered.map((n) => n.identity.canonical_key);
        expect(keys.slice(0, 2)).toEqual(["child_first_name", "customer_member:dob"]);
        expect(keys.indexOf("customer_member:medical_notes")).toBeGreaterThan(keys.indexOf("customer:address"));
    });

    it("finishes a person before starting the next", () => {
        const keys = orderNeedsForTraversal(all, POLICY).map((n) => n.identity.canonical_key);
        // The guardian's two facts are adjacent — the conversation does not leave and come back.
        expect(Math.abs(keys.indexOf("guardian_phone") - keys.indexOf("guardian_email"))).toBe(1);
        // And the child's two basics are adjacent.
        expect(Math.abs(keys.indexOf("child_first_name") - keys.indexOf("customer_member:dob"))).toBe(1);
    });

    it("never lets source field order dictate WHICH SUBJECT comes next", () => {
        /*
         * The guarantee is about subjects, not a total permutation invariance.
         *
         * Within one rank, sibling blocks deliberately keep the packet's own sequence — where
         * nothing more meaningful distinguishes two of the child's topics, the order the school
         * chose is better than an arbitrary one. What must NOT depend on input order is the
         * subject progression itself.
         */
        const ranks = (input: readonly EnrollmentInformationNeed[]) =>
            orderNeedsForTraversal(input, POLICY, all).map(
                (n) => traversalPlacement(n, { basicSections: new Set([`admissions::${CONTACT}`]) }).rank,
            );
        const forward = ranks(all);
        const reversed = ranks([...all].reverse());
        expect(reversed).toEqual(forward);
        // And the progression never goes backwards: one subject is finished before the next starts.
        expect([...forward].sort((a, b) => a - b)).toEqual(forward);
    });

    it("keeps the basic block stable once the child's identity is confirmed", () => {
        /*
         * The section the child's name is in is a property of the PACKET and must not move as the
         * conversation progresses. Computed from the outstanding set, it went empty the moment the
         * identity facts settled and the entire health narrative was reclassified as basic — asked
         * at turns 2 to 6 instead of after the household. Observed live before this was fixed.
         */
        const outstanding = all.filter((n) => n !== childName);
        const ordered = orderNeedsForTraversal(outstanding, POLICY, all);
        const keys = ordered.map((n) => n.identity.canonical_key);
        expect(keys.indexOf("customer_member:medical_notes")).toBeGreaterThan(keys.indexOf("customer:address"));
    });

    it("ranks each subject where the choreography says", () => {
        const basics = new Set([`admissions::${CONTACT}`]);
        expect(traversalPlacement(childDob, { basicSections: basics }).rank).toBe(TRAVERSAL_RANK.childBasics);
        expect(traversalPlacement(guardianPhone, { basicSections: basics }).rank).toBe(TRAVERSAL_RANK.primaryGuardian);
        expect(traversalPlacement(personPhone, { basicSections: basics }).rank).toBe(TRAVERSAL_RANK.otherPeople);
        expect(traversalPlacement(address, { basicSections: basics }).rank).toBe(TRAVERSAL_RANK.household);
        expect(traversalPlacement(childMeds, { basicSections: basics }).rank).toBe(TRAVERSAL_RANK.childTopics);
    });
});

describe("the confirmation prompt precedes its card", () => {
    it("is the render order, not an accident of styling", () => {
        /*
         * The card is the OBJECT being confirmed, so the sentence introducing it has to come first.
         * Verified in a real browser at both widths; pinned here so a later edit cannot invert it
         * by moving one JSX element.
         */
        const card = readFileSync(
            resolve(__dirname, "../../app/forms/embed/[token]/EnrollmentConversationCard.tsx"),
            "utf8",
        );
        const prompt = card.indexOf("{group.title}");
        const object = card.indexOf("<ConfirmationGroupCard");
        expect(prompt).toBeGreaterThan(-1);
        expect(object).toBeGreaterThan(-1);
        expect(prompt, "the prompt introduces the card").toBeLessThan(object);
    });
});
