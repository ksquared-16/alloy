/**
 * THE SUBJECT BINDING — how a canonical assignment subject reaches the canonical assignment actions.
 *
 * `OperationalAssignmentSubject` already says WHO an assignment is about; the write service has
 * spoken both dialects since it was extended in place so "children and staff do not acquire
 * competing scheduling engines". What did not exist was the client-side half of that sentence: the
 * Scheduling card hardcoded `subject_type: "child"`, `entity_type: "child"` and `customer_member_id`
 * at nine dispatch sites, so a staff subject could not reach actions that already accepted it.
 *
 * This module is that half, and NOTHING else. It introduces no subject type of its own — the union
 * is imported, not redeclared — and it decides no assignment meaning. It answers exactly three
 * questions, each of which previously had nine copies of its answer inlined in a component:
 *
 *     assignmentActionBinding      which entity does the invocation address?
 *     assignmentAnchorPayload      which canonical identifiers name the subject in the payload?
 *     assignmentSubjectApplicability  which actions can canonically apply to this subject?
 *
 * ── APPLICABILITY IS REPORTED, NOT INVENTED ──
 *
 * Every flag below restates a rule the write layer already enforces, with the enforcing line named.
 * They exist so the card can decline to OFFER an action the service would refuse, which is a
 * presentation duty. They are not the authority: the service re-answers each one on execution, and
 * if these two ever disagree the service is right. Adding a capability here that the service does
 * not grant would manufacture validity for a button — the failure mode the convergence audit names.
 */

import type { OperationalAssignmentSubject } from "@/lib/operationalAssignments/operationalAssignmentService";

/** The entity an action invocation addresses for a given subject. */
export type AssignmentActionBinding = {
    /** `invocation.entityType` — the vocabulary `supportedEntityTypes` is declared in. */
    entityType: "child" | "person";
    /** `invocation.entityId` — the child's member row, or the staff person. */
    entityId: string;
};

/**
 * Address the canonical actions for this subject.
 *
 * A child is addressed by `customer_members.id` and a staff member by `persons.id`. That asymmetry
 * is not incidental: it is the same asymmetry `resolveSubjectSite` resolves against, and collapsing
 * it — addressing a child by their linked person, say — would send a plausible id to an action that
 * would accept it and write the wrong row.
 */
export function assignmentActionBinding(subject: OperationalAssignmentSubject): AssignmentActionBinding {
    if (subject.type === "staff") {
        return { entityType: "person", entityId: (subject.personId ?? "").trim() };
    }
    return { entityType: "child", entityId: (subject.customerMemberId ?? "").trim() };
}

/**
 * The canonical identifiers that name this subject inside an action payload.
 *
 * Optional keys are emitted as `undefined` rather than omitted or nulled, because that is what the
 * child path has always sent and `JSON.stringify` drops them identically. Preserving it exactly is
 * the point: generalizing the card must not change a single byte of an existing child write.
 */
export function assignmentAnchorPayload(subject: OperationalAssignmentSubject): Record<string, unknown> {
    if (subject.type === "staff") {
        const siteLocationId = (subject.siteLocationId ?? "").trim();
        return {
            subject_type: "staff",
            person_id: (subject.personId ?? "").trim(),
            site_location_id: siteLocationId || undefined,
        };
    }
    const agreementId = (subject.enrollmentAgreementId ?? "").trim();
    const siteLocationId = (subject.siteLocationId ?? "").trim();
    return {
        subject_type: "child",
        enrollment_agreement_id: agreementId || undefined,
        customer_member_id: (subject.customerMemberId ?? "").trim(),
        site_location_id: siteLocationId || undefined,
    };
}

/** What the canonical write layer will accept for this subject. */
export type AssignmentSubjectApplicability = {
    /**
     * `assignment.set_primary` — valid for BOTH subjects.
     *
     * `setPrimaryOperationalAssignment` resolves a staff subject explicitly (it requires
     * `personId` + `siteLocationId`, and refuses a promote target whose `subject_person_id`
     * differs), so a staff primary is a real operational home, not a child concept borrowed.
     */
    canSetPrimary: boolean;
    /**
     * Create a primary directly, via `is_primary: true` on `assignment.create` — CHILD ONLY.
     *
     * `createOperationalAssignment` throws "Only a child assignment may be primary" for any
     * non-child subject. Staff reach a primary through `assignment.set_primary` instead, which is
     * why `canSetPrimary` above is true while this is false: they are different capabilities and
     * only one of them is child-shaped.
     */
    canCreatePrimaryDirectly: boolean;
    /**
     * `assignment.promote_proposed` — CHILD ONLY.
     *
     * Declared `supportedEntityTypes: ["child"]`, and unreachable for staff regardless: promotion
     * turns a proposed row committed, and `resolveSubjectSite` returns `commitmentKind: "committed"`
     * for every staff subject, so a staff assignment is never proposed to begin with.
     */
    canPromoteProposed: boolean;
    /**
     * Whether an enrollment agreement can anchor this subject's commitment — CHILD ONLY.
     *
     * A staff subject resolves to `enrollmentAgreementId: null` unconditionally. Sending an
     * agreement id for one would be a claim about employment that no table makes.
     */
    hasEnrollmentAgreement: boolean;
    /**
     * Whether the child-scoped `POST /api/admin/scheduling` primary-home path may be used.
     *
     * That route reads `customer_member_id` and refuses without it, so it is not a subject-general
     * write. Staff creation goes through `assignment.create` — the registered action — for every
     * assignment including the first.
     */
    canUseChildSchedulePath: boolean;
};

export function assignmentSubjectApplicability(
    subject: OperationalAssignmentSubject,
): AssignmentSubjectApplicability {
    const isChild = subject.type === "child";
    return {
        canSetPrimary: true,
        canCreatePrimaryDirectly: isChild,
        canPromoteProposed: isChild,
        hasEnrollmentAgreement: isChild,
        canUseChildSchedulePath: isChild,
    };
}
