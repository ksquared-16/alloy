/**
 * Operator-facing Assignment lifecycle labels resolved from canonical facts.
 *
 * Does not invent a parallel status engine. Composes:
 * - commitment authority (proposed | committed)
 * - effective dating vs as-of (upcoming | current | ended)
 * - archival / terminal row status
 *
 * Operator vocabulary for planning authority is always **Proposed**
 * (never "Planned" / "Proposal") — matches commitment_kind = proposed.
 */

export type AssignmentLifecycleLabel =
    | "Proposed"
    | "Upcoming"
    | "Active"
    | "Completed"
    | "Archived";

export type AssignmentLifecycleTone = "blue" | "pine" | "muted" | "gold";

export type AssignmentLifecycleFacts = {
    /** proposed = planning authority; committed = agreement-backed */
    commitmentKind?: "proposed" | "committed" | null;
    /** Durable row status (planned, active, ending, ended, archived, …) */
    status?: string | null;
    effectiveFrom?: string | null;
    effectiveTo?: string | null;
    openEnded?: boolean;
    /** YYYY-MM-DD org-local as-of for effective windows */
    asOf?: string | null;
};

function cmpYmd(a: string, b: string): number {
    return a.slice(0, 10).localeCompare(b.slice(0, 10));
}

function isTerminalStatus(status: string | null | undefined): boolean {
    const s = (status ?? "").trim().toLowerCase();
    return s === "ended" || s === "canceled" || s === "cancelled" || s === "superseded";
}

function isArchivedStatus(status: string | null | undefined): boolean {
    const s = (status ?? "").trim().toLowerCase();
    return s === "archived";
}

/**
 * Resolve one operator-facing lifecycle label from canonical Assignment facts.
 *
 * Precedence:
 * 1. Archived (explicit archive)
 * 2. Completed (terminal / past end)
 * 3. Proposed (planning authority — commitment_kind proposed)
 * 4. Upcoming (committed, start in future)
 * 5. Active (committed, covering as-of)
 */
export function resolveAssignmentLifecycleState(
    facts: AssignmentLifecycleFacts
): { label: AssignmentLifecycleLabel; tone: AssignmentLifecycleTone } {
    const status = (facts.status ?? "").trim().toLowerCase();
    const commitment =
        facts.commitmentKind === "proposed" || facts.commitmentKind === "committed"
            ? facts.commitmentKind
            : status === "proposed" || status === "planned"
              ? "proposed"
              : "committed";

    if (isArchivedStatus(status)) {
        return { label: "Archived", tone: "muted" };
    }

    const asOf = (facts.asOf ?? "").slice(0, 10) || null;
    const from = (facts.effectiveFrom ?? "").slice(0, 10) || null;
    const to = facts.openEnded ? null : (facts.effectiveTo ?? "").slice(0, 10) || null;

    if (isTerminalStatus(status)) {
        return { label: "Completed", tone: "muted" };
    }
    if (asOf && to && cmpYmd(to, asOf) < 0) {
        return { label: "Completed", tone: "muted" };
    }

    if (commitment === "proposed") {
        return { label: "Proposed", tone: "blue" };
    }

    if (asOf && from && cmpYmd(from, asOf) > 0) {
        return { label: "Upcoming", tone: "blue" };
    }

    return { label: "Active", tone: "pine" };
}
