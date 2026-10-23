/**
 * THE ENROLLMENT CASE THE SCHEDULING CARD IS ACTING INSIDE, or none (BP V2 D6).
 *
 * The card prices a child's assignment through `GET /api/admin/financial-config/opportunity/<id>` — an
 * opportunity's financial configuration. It asked `resolveFocusPanelMutationOpportunityId`, which was
 * written for grains that always have a case and so ends `return subjectId`: asked about a subject with no
 * case it hands back the subject's OWN id as an opportunity id. Staff were already excluded for exactly
 * that reason. A durable child record (opened from an Assignments Work View, a child page) has the same
 * shape — subject `{ type: "child", id: <customer_members.id> }`, no family binding in its truth — so the
 * card requested `financial-config/opportunity/<child id>` and got 404 (hosted, `qar_58463703cedd`).
 *
 * The answer comes from relationships the context already carries, never a guess:
 *  - staff: none — a person has no enrollment case;
 *  - the resolver's case when it names one (a family binding in truth, the opportunity drawer's contexts);
 *  - a subject the resolver could only answer with its OWN id: the case hosting the child's family work
 *    (`operationalHost.opportunityId`, resolved server-side) when there is one, otherwise none — and the
 *    card then makes no financial-config request at all rather than one with the wrong identity.
 *    (The self-id refusal is AssignmentTuitionCard's existing rule for the same route.)
 */

import { resolveFocusPanelMutationOpportunityId } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";

export function resolveSchedulingCaseOpportunityId(args: {
    subjectKind: "child" | "staff";
    context: {
        grain?: string | null;
        subject: { type?: string | null; id: string };
        truth?: Record<string, unknown> | null;
        operationalHost?: { opportunityId?: string | null } | null;
    };
}): string | null {
    if (args.subjectKind === "staff") return null;
    const subjectId = args.context.subject.id.trim();
    // The same rule `resolveAssignmentTuitionOpportunityId` (AssignmentTuitionCard) applies to this route:
    // an opportunity subject is its own case; for any other subject the resolver's self-id fallback is
    // refused, because a subject's own id in an opportunity route is a wrong answer.
    if (args.context.subject.type === "opportunity") return subjectId || null;
    const resolved = resolveFocusPanelMutationOpportunityId({
        subjectId,
        grain: args.context.grain,
        truth: args.context.truth ?? null,
    }).trim();
    if (resolved && resolved !== subjectId) return resolved;
    // No case in the subject's truth: the case hosting the child's family work, when the server resolved one.
    return args.context.operationalHost?.opportunityId?.trim() || null;
}
