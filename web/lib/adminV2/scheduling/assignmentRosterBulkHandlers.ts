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
 * (`assignment.archive`, `.create`), which is the same RegisteredAction the Focus Panel card invokes
 * for one assignment. No endpoint here, no domain rule here, and no second ledger: the caller
 * supplies the subjects it already loaded from `?view=assignment_roster`.
 *
 * ── EVERY ANSWER IS READ ──
 *
 * Each row commits on its own (there is no batch transaction), so each handler reports what really
 * happened per row: applied, REFUSED by the server (its reason), or FAILED (an error or no answer).
 * A bulk run that applies some rows and not others is reported as exactly that, never as success.
 *
 * (A bulk "Make primary" used to live here. It is retired — V7 decision P1: a child's primary is the
 * enrollment's own schedule, and promotion copied a secondary's category and room into it.)
 */

import type {
    AssignmentRosterBulkHandlers,
    AssignmentRosterSubject,
    BulkOutcome,
} from "@/components/adminV2/scheduling/screens/AssignmentRosterPanel";
import type { OrgAssignmentTypeOption } from "@/lib/operationalAssignments/loadOrgAssignmentTypes";

export type { BulkOutcome };

/** Run one row's action and file its answer into the outcome. */
async function settle(outcome: BulkOutcome, label: string, run: () => Promise<Response>): Promise<void> {
    let res: Response;
    try {
        res = await run();
    } catch (e) {
        outcome.failed.push(`${label}: ${e instanceof Error ? e.message : "no response"}`);
        return;
    }
    if (res.ok) {
        outcome.succeeded += 1;
        return;
    }
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } | string } | null;
    const message = (typeof body?.error === "string" ? body.error : body?.error?.message) || `status ${res.status}`;
    (res.status >= 500 ? outcome.failed : outcome.refused).push(`${label}: ${message}`);
}

/** Post one canonical action. Sequential by caller design — see `buildAssignmentRosterBulkHandlers`. */
async function execute(actionKey: string, entityType: string, entityId: string, payload: unknown): Promise<Response> {
    return fetch("/api/admin/actions/execute", {
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
    /** The subjects the host already loaded (labels for the outcome lines). */
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
            const outcome: BulkOutcome = { succeeded: 0, refused: [], failed: [] };
            for (const assignment_id of assignmentIds) {
                const owner = subjects.find((s) => s.assignments.some((a) => a.assignmentId === assignment_id));
                await settle(outcome, owner?.subjectName ?? assignment_id, () =>
                    execute("assignment.archive", "assignment", assignment_id, { assignment_id }),
                );
            }
            onRefresh();
            return outcome;
        },

        onBulkAssignment: async (_subjects, preview) => {
            // Only rows the PREVIEW judged ready. The preview is the eligibility authority;
            // re-deciding it here would be a second opinion the operator never saw.
            const outcome: BulkOutcome = { succeeded: 0, refused: [], failed: [] };
            for (const row of preview.filter((p) => p.status === "ready")) {
                // A row that cannot name its subject is not a row to execute: it is reported, not sent.
                if (!row.customerMemberId) {
                    outcome.refused.push(`${row.subjectName ?? "A row"}: no child to assign`);
                    continue;
                }
                await settle(outcome, row.subjectName ?? row.customerMemberId, () =>
                    execute("assignment.create", "child", row.customerMemberId as string, row.payload),
                );
            }
            onRefresh();
            return outcome;
        },

        onBulkRoomChange: async (rows) => {
            // A room change is a NEW effective-dated assignment, not an edit — which is why this
            // posts `assignment.create` like the one above. The dating is what supersedes the prior
            // room, and that is the ledger's own mechanism.
            const outcome: BulkOutcome = { succeeded: 0, refused: [], failed: [] };
            for (const row of rows) {
                await settle(outcome, row.subjectName, () =>
                    execute("assignment.create", "child", row.customerMemberId, row.payload),
                );
            }
            onRefresh();
            return outcome;
        },

        assignmentTypes: input.assignmentTypes,
        siteId: input.siteId,
    };
}
