"use client";

/**
 * THE ASSIGNMENT LEDGER'S BULK COMMANDS — one wiring, for every host that offers them.
 *
 * These four handlers lived inline in `SchedulingWorkspace`, which was correct while the Assignments
 * workspace was the only place an operator could select several assignments. Roster now offers the
 * same lens, and two copies of "how do I archive a set of assignments" would be two places to fix
 * the day a payload changes — with no error to tell you the second one drifted.
 *
 * ── IT EXECUTES NOTHING OF ITS OWN ──
 *
 * Every handler posts to `/api/admin/actions/execute` with a canonical `action_key`
 * (`assignment.archive`, `.set_primary`, `.create`), which is the same RegisteredAction the Focus
 * Panel card invokes for one assignment. No endpoint here, no domain rule here, and no second
 * ledger: the caller supplies the subjects it already loaded from `?view=assignment_roster`.
 *
 * ── THE ONE DOMAIN RULE THAT IS ENFORCED, AND WHY IT LIVES HERE ──
 *
 * `set_primary` is a CHILD concept: it promotes an assignment against an enrollment agreement, and a
 * staff subject has neither. The guard travels WITH the handler rather than sitting in the panel,
 * because a second host adopting the panel would otherwise have to remember to re-apply it — and
 * forgetting is silent, since the command would simply be posted with a null agreement.
 */

import type {
    AssignmentRosterBulkHandlers,
    AssignmentRosterSubject,
} from "@/components/adminV2/scheduling/screens/AssignmentRosterPanel";
import type { OrgAssignmentTypeOption } from "@/lib/operationalAssignments/loadOrgAssignmentTypes";

/** Post one canonical action. Sequential by caller design — see `buildAssignmentRosterBulkHandlers`. */
async function execute(actionKey: string, entityType: string, entityId: string, payload: unknown) {
    await fetch("/api/admin/actions/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            action_key: actionKey,
            entity_type: entityType,
            entity_id: entityId,
            payload,
        }),
    });
}

export type BuildAssignmentRosterBulkHandlersInput = {
    /** The subjects the host already loaded. Read for the `set_primary` grain guard. */
    subjects: readonly AssignmentRosterSubject[];
    assignmentTypes: OrgAssignmentTypeOption[];
    siteId: string;
    /** Re-read the ledger after a mutation. The host owns its own refresh. */
    onRefresh: () => void;
    /** Open the single-subject create surface. Hosts differ; the command does not. */
    onCreateForChild: (customerMemberId: string) => void;
};

/**
 * The four bulk commands, wired to canonical actions.
 *
 * Execution is SEQUENTIAL, deliberately and unchanged from the original. These are effective-dated
 * writes against overlapping assignment rows, and firing them concurrently would race the very
 * ordering that `effective_from` exists to make deterministic.
 */
export function buildAssignmentRosterBulkHandlers(
    input: BuildAssignmentRosterBulkHandlersInput,
): AssignmentRosterBulkHandlers {
    const { subjects, onRefresh } = input;

    return {
        onCreateForChild: input.onCreateForChild,

        onBulkArchive: async (assignmentIds) => {
            for (const assignment_id of assignmentIds) {
                await execute("assignment.archive", "assignment", assignment_id, { assignment_id });
            }
            onRefresh();
        },

        onBulkMakePrimary: async (rows) => {
            for (const row of rows) {
                // Primary is a child concept; a staff subject has no enrollment agreement and must
                // not reach this command. Skipping is the honest outcome — the row simply is not
                // eligible, which is different from the command failing.
                const subject = subjects.find((s) => s.subjectKey === row.subjectKey);
                const agreementId = subject?.enrollmentAgreementId;
                if (!agreementId || subject?.subjectType === "staff") continue;
                await execute("assignment.set_primary", "child", agreementId, {
                    subject_type: "child",
                    enrollment_agreement_id: agreementId,
                    effective_date: row.effectiveFrom,
                    promote_assignment_id: row.assignmentId,
                });
            }
            onRefresh();
        },

        onBulkAssignment: async (_subjects, preview) => {
            // Only rows the PREVIEW judged ready. The preview is the eligibility authority;
            // re-deciding it here would be a second opinion the operator never saw.
            for (const row of preview.filter((p) => p.status === "ready")) {
                await execute("assignment.create", "child", row.customerMemberId, row.payload);
            }
            onRefresh();
        },

        onBulkRoomChange: async (rows) => {
            // A room change is a NEW effective-dated assignment, not an edit — which is why this
            // posts `assignment.create` like the one above. The dating is what supersedes the prior
            // room, and that is the ledger's own mechanism.
            for (const row of rows) {
                await execute("assignment.create", "child", row.customerMemberId, row.payload);
            }
            onRefresh();
        },

        assignmentTypes: input.assignmentTypes,
        siteId: input.siteId,
    };
}
