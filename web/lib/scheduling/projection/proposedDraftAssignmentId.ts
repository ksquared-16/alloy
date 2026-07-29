/**
 * Synthetic proposed-draft assignment ids from pre-enrollment participation
 * (`process_instances.metadata`) use `proposed:<customer_member_id>` — not a real
 * `operational_assignments` UUID. Delete must clear draft schedule facts, not OA delete.
 */

export const PROPOSED_DRAFT_ASSIGNMENT_ID_PREFIX = "proposed:" as const;

export function isProposedDraftAssignmentId(assignmentId: string | null | undefined): boolean {
    return String(assignmentId ?? "").trim().startsWith(PROPOSED_DRAFT_ASSIGNMENT_ID_PREFIX);
}

/** Member id encoded in `proposed:<customer_member_id>`, or null when not synthetic. */
export function customerMemberIdFromProposedDraftAssignmentId(
    assignmentId: string | null | undefined,
): string | null {
    const raw = String(assignmentId ?? "").trim();
    if (!raw.startsWith(PROPOSED_DRAFT_ASSIGNMENT_ID_PREFIX)) return null;
    const memberId = raw.slice(PROPOSED_DRAFT_ASSIGNMENT_ID_PREFIX.length).trim();
    return memberId.length > 0 ? memberId : null;
}
