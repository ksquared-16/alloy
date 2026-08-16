/**
 * THE CHILD REGRESSION GATE for subject generalization.
 *
 * The risk in making the Scheduling card subject-general is not that staff fails loudly — it is that
 * CHILD changes quietly. Nine dispatch sites previously inlined `subject_type: "child"`,
 * `entity_type: "child"` and `customer_member_id` as literals; every one of them now derives those
 * from `assignmentSubjectBinding`. If that derivation differs from the literals by so much as a key
 * name or a `null`-vs-`undefined`, existing child writes change meaning and no UI test would notice,
 * because the card would still render and the action would still return ok.
 *
 * So this file pins the LITERALS as they stood before generalization, verbatim, and asserts the
 * derived payload is `toEqual` them — including the `undefined`-not-omitted convention, which
 * `toStrictEqual` is used to hold where it matters. These expectations are transcribed from the
 * pre-generalization component, NOT re-derived from the module under test; a shared helper here
 * would make the test agree with the code by construction and prove nothing.
 */

import { describe, expect, it } from "vitest";

import {
    assignmentActionBinding,
    assignmentAnchorPayload,
    assignmentSubjectApplicability,
} from "@/lib/operationalAssignments/assignmentSubjectBinding";
import type { OperationalAssignmentSubject } from "@/lib/operationalAssignments/operationalAssignmentService";

const MEMBER_ID = "11111111-1111-4111-8111-111111111111";
const AGREEMENT_ID = "22222222-2222-4222-8222-222222222222";
const SITE_ID = "33333333-3333-4333-8333-333333333333";
const PERSON_ID = "44444444-4444-4444-8444-444444444444";

/**
 * The pre-generalization child anchor, transcribed from `childAssignmentCreatePayload`:
 *
 *     {
 *         subject_type: "child",
 *         enrollment_agreement_id: agreementId || undefined,
 *         customer_member_id: child.id,
 *         site_location_id: siteId || undefined,
 *         ...extra,
 *     }
 */
function legacyChildAnchor(agreementId: string, siteId: string): Record<string, unknown> {
    return {
        subject_type: "child",
        enrollment_agreement_id: agreementId || undefined,
        customer_member_id: MEMBER_ID,
        site_location_id: siteId || undefined,
    };
}

const committedChild: OperationalAssignmentSubject = {
    type: "child",
    enrollmentAgreementId: AGREEMENT_ID,
    customerMemberId: MEMBER_ID,
    siteLocationId: SITE_ID,
};

const proposedChild: OperationalAssignmentSubject = {
    type: "child",
    enrollmentAgreementId: null,
    customerMemberId: MEMBER_ID,
    siteLocationId: SITE_ID,
};

const staff: OperationalAssignmentSubject = {
    type: "staff",
    personId: PERSON_ID,
    siteLocationId: SITE_ID,
};

describe("child payloads are unchanged by generalization", () => {
    it("committed child anchor matches the pre-generalization literal", () => {
        expect(assignmentAnchorPayload(committedChild)).toStrictEqual(
            legacyChildAnchor(AGREEMENT_ID, SITE_ID),
        );
    });

    it("proposed child (no agreement) anchor matches the pre-generalization literal", () => {
        expect(assignmentAnchorPayload(proposedChild)).toStrictEqual(legacyChildAnchor("", SITE_ID));
    });

    it("an absent agreement is an ABSENT key, never a null", () => {
        // `enrollment_agreement_id: null` would be a different request: the action reads it with
        // `t()` which stringifies, and "null" is not falsy. The child path has always sent
        // `undefined` here, which JSON.stringify drops entirely.
        const anchor = assignmentAnchorPayload(proposedChild);
        expect(anchor.enrollment_agreement_id).toBeUndefined();
        expect(JSON.parse(JSON.stringify(anchor))).not.toHaveProperty("enrollment_agreement_id");
    });

    it("an absent site is an ABSENT key, never an empty string", () => {
        const anchor = assignmentAnchorPayload({ ...proposedChild, siteLocationId: null });
        expect(anchor.site_location_id).toBeUndefined();
        expect(JSON.parse(JSON.stringify(anchor))).not.toHaveProperty("site_location_id");
    });

    it("the child invocation still addresses the MEMBER row, not the linked person", () => {
        // The regression this pins: a child WITH a linked person is the common case, and addressing
        // them by `persons.id` would reach an action that accepts the id and writes another subject.
        expect(assignmentActionBinding(committedChild)).toStrictEqual({
            entityType: "child",
            entityId: MEMBER_ID,
        });
    });

    /**
     * The full create payload, assembled the way every create/duplicate site assembles it:
     * anchor first, caller extras last. Pinned end-to-end because the SPREAD ORDER is load-bearing —
     * `is_primary` and `supersedes_assignment_id` must survive, and the anchor must not overwrite
     * a caller's explicit value.
     */
    it("a duplicate-assignment create payload is byte-identical to the legacy assembly", () => {
        const extra = {
            schedule_pattern_id: "pattern-1",
            start_date: "2026-09-01",
            room_location_id: "room-1",
            assignment_type_id: "type-1",
            duplicate_of: "assignment-1",
            assignment_type_label: "Before Care",
            is_primary: false,
        };
        const derived = { ...assignmentAnchorPayload(committedChild), ...extra };
        const legacy = { ...legacyChildAnchor(AGREEMENT_ID, SITE_ID), ...extra };
        expect(JSON.stringify(derived)).toBe(JSON.stringify(legacy));
    });

    it("a set_primary payload is byte-identical to the legacy assembly", () => {
        // Legacy site: `{ subject_type:"child", ...anchor, enrollment_agreement_id: proj ?? "", … }`.
        // The trailing override is `?? ""` — an EMPTY STRING, not `undefined` — and it is kept
        // verbatim here rather than "cleaned up", because the action distinguishes them.
        const tail = {
            enrollment_agreement_id: AGREEMENT_ID,
            effective_date: "2026-09-01",
            promote_assignment_id: "assignment-1",
            subject_label: "Lennon",
        };
        const derived = { ...assignmentAnchorPayload(committedChild), ...tail };
        const legacy = { ...legacyChildAnchor(AGREEMENT_ID, SITE_ID), ...tail };
        expect(JSON.stringify(derived)).toBe(JSON.stringify(legacy));
    });
});

describe("staff binds to canonical staff identifiers", () => {
    it("addresses the PERSON, and never carries a member id", () => {
        expect(assignmentActionBinding(staff)).toStrictEqual({
            entityType: "person",
            entityId: PERSON_ID,
        });
        expect(assignmentAnchorPayload(staff)).not.toHaveProperty("customer_member_id");
    });

    it("names the subject with person_id + site, and no enrollment agreement", () => {
        expect(assignmentAnchorPayload(staff)).toStrictEqual({
            subject_type: "staff",
            person_id: PERSON_ID,
            site_location_id: SITE_ID,
        });
    });

    it("never claims an enrollment agreement", () => {
        // A staff subject resolves to `enrollmentAgreementId: null` in the service unconditionally.
        // Sending one would be a claim about employment that no table makes.
        expect(assignmentAnchorPayload(staff)).not.toHaveProperty("enrollment_agreement_id");
    });
});

describe("applicability restates the write layer, and does not widen it", () => {
    it("set_primary is valid for BOTH subjects", () => {
        expect(assignmentSubjectApplicability(committedChild).canSetPrimary).toBe(true);
        expect(assignmentSubjectApplicability(staff).canSetPrimary).toBe(true);
    });

    it("creating a primary DIRECTLY is child-only, even though set_primary is not", () => {
        // `createOperationalAssignment`: "Only a child assignment may be primary". The two
        // capabilities differ, and conflating them would offer staff a button the service refuses.
        expect(assignmentSubjectApplicability(committedChild).canCreatePrimaryDirectly).toBe(true);
        expect(assignmentSubjectApplicability(staff).canCreatePrimaryDirectly).toBe(false);
    });

    it("promote_proposed is child-only", () => {
        expect(assignmentSubjectApplicability(committedChild).canPromoteProposed).toBe(true);
        expect(assignmentSubjectApplicability(staff).canPromoteProposed).toBe(false);
    });

    it("the child-scoped schedule POST path is not offered to staff", () => {
        expect(assignmentSubjectApplicability(staff).canUseChildSchedulePath).toBe(false);
    });

    it("child applicability is unchanged from what the card previously assumed unconditionally", () => {
        // Before generalization the card assumed ALL of these, for every subject, because every
        // subject was a child. Child must keep every one of them.
        expect(assignmentSubjectApplicability(committedChild)).toStrictEqual({
            canSetPrimary: true,
            canCreatePrimaryDirectly: true,
            canPromoteProposed: true,
            hasEnrollmentAgreement: true,
            canUseChildSchedulePath: true,
        });
    });
});
