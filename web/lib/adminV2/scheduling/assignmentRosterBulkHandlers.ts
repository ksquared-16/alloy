"use client";

/**
 * THE ASSIGNMENT LEDGER'S BULK COMMANDS — one wiring, for every host that offers them.
 *
 * These four handlers lived inline in the Assignments workspace, which was correct while it was the
 * only place an operator could select several assignments. That workspace is retired and
 * `Operations → Work → Roster` now offers the same lens, and two copies of "how do I archive a set of assignments" would be two places to fix
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
    /**
     * Open the SUBJECTLESS create command — the lens-level one, which must ask who first.
     *
     * Optional, so a host without a chooser offers no command at all rather than one that opens
     * nothing. This builder returns an EXPLICIT object rather than spreading its input, so a handler
     * the host passes but this type does not name is silently dropped — which is exactly how the
     * first attempt at this command reached the panel as `undefined` and rendered nothing.
     */
    onCreateAssignment?: () => void;
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
        onCreateAssignment: input.onCreateAssignment,
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
                // A row that cannot name its subject is not a row to execute. `customerMemberId` is
                // nullable on the preview shape, and the inline version this replaced posted it into
                // an untyped JSON body — so a null went to the action as `entity_id: null` and was
                // refused server-side rather than skipped here. CI's typecheck found it the moment
                // the call went through a typed helper.
                if (!row.customerMemberId) continue;
                await execute("assignment.create", "child", row.customerMemberId, row.payload);
            }
            onRefresh();
        },

        onBulkRoomChange: async (rows) => {
            // A room change is a NEW effective-dated assignment, not an edit — which is why this
            // posts `assignment.create` like the one above. The dating is what supersedes the prior
            // room, and that is the ledger's own mechanism.
            //
            // No null guard here, unlike the handler above: these rows declare
            // `customerMemberId: string`, so a guard would be dead code implying a case the type
            // says cannot happen.
            for (const row of rows) {
                await execute("assignment.create", "child", row.customerMemberId, row.payload);
            }
            onRefresh();
        },

        assignmentTypes: input.assignmentTypes,
        siteId: input.siteId,
    };
}
