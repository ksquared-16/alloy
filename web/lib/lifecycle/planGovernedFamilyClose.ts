/**
 * What would closing this family actually do?
 *
 * PURE. Takes the family's child tracks and answers three questions — who gets closed, who is
 * skipped, and what stops the whole thing — with no database, no clock and no writes. The preview
 * an operator reads and the validation the executor runs are therefore the SAME computation, so a
 * preview cannot promise something execution refuses, or hide something execution would do.
 *
 * The classification is NOT redefined here. `classifyChildTrackState` already owns the four-way
 * judgement and is already the fail-closed authority the bare-close guard trusts; this module maps
 * those four answers onto one operation:
 *
 *   terminal                 skipped — already closed, nothing to do, never re-written
 *   active_pre_enrollment    CLOSED by this operation, and named in the preview first
 *   enrolled_blocking        HARD BLOCK, no override
 *   unknown_blocking         HARD BLOCK — a state the platform cannot read is not a state it may close over
 *
 * Enumeration failure is also a block. A close that cannot see the children cannot vouch for them,
 * and this is the one place where guessing produces a stranded child under a closed family.
 *
 * WHY ENROLLED CANNOT BE OVERRIDDEN. Ending an enrollment is an agreement-ending operation with its
 * own process, its own obligations and its own record. A lead-closing button that could quietly
 * convert an enrolled child to `not_enrolling` would be performing that operation without any of
 * it. There is deliberately no force flag, and adding one later should be treated as a change to
 * the enrollment-ending process rather than a change to this module.
 */

import {
    classifyChildTrackState,
    type ChildTrackClassification,
} from "@/lib/lifecycle/familyCloseGuard";
import type { ProcessInstanceRow } from "@/lib/process/processInstances";

export type FamilyCloseBlockCode =
    | "child_enrolled"
    | "child_state_unknown"
    | "children_unreadable";

export type FamilyCloseAffectedChild = {
    /** `customer_members.id` — the durable child. Execution identity, never rendered. */
    customer_member_id: string;
    /** `process_instances.id` — this child's journey through this lead. Never rendered. */
    process_instance_id: string;
    /** Operator-facing name. */
    label: string;
    /** Raw durable state, carried for the trace — not for display. */
    state_key: string | null;
};

export type FamilyCloseBlock = {
    code: FamilyCloseBlockCode;
    /** Every child that triggered this block, so the preview names all of them at once. */
    children: FamilyCloseAffectedChild[];
    /** Operator-facing sentence. Names children, never ids or status keys. */
    message: string;
    /** Present only for `children_unreadable`. */
    detail?: string;
};

export type GovernedFamilyClosePlan = {
    /** True only when the operation may proceed. */
    allowed: boolean;
    /** Children this operation WILL close. Empty is legitimate — a family with no live children. */
    closing: FamilyCloseAffectedChild[];
    /** Children already closed. Listed for transparency; never written. */
    skipped: FamilyCloseAffectedChild[];
    /** Why it cannot proceed. Empty when `allowed`. */
    blocks: FamilyCloseBlock[];
};

export type FamilyCloseChildRow = Pick<ProcessInstanceRow, "id" | "subject_id" | "state">;

function childFrom(row: FamilyCloseChildRow, names: ReadonlyMap<string, string>): FamilyCloseAffectedChild {
    const customerMemberId = row.subject_id?.trim() ?? "";
    return {
        customer_member_id: customerMemberId,
        process_instance_id: row.id,
        label: names.get(customerMemberId)?.trim() || "This child",
        state_key: row.state ?? null,
    };
}

/** "Emma", "Emma and Liam", "Emma, Liam and Sophia" — operator prose, not a list dump. */
export function joinChildNames(children: ReadonlyArray<{ label: string }>): string {
    const names = children.map((c) => c.label);
    if (names.length === 0) return "";
    if (names.length === 1) return names[0]!;
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]!}`;
}

export function planGovernedFamilyClose(input: {
    /** Fail-closed read result. `ok: false` blocks — it is never read as "no children". */
    read: { ok: true; rows: ReadonlyArray<FamilyCloseChildRow> } | { ok: false; error: string };
    /** customer_member_id → operator-facing name. Missing names degrade to "This child". */
    childNames?: ReadonlyMap<string, string>;
}): GovernedFamilyClosePlan {
    if (!input.read.ok) {
        return {
            allowed: false,
            closing: [],
            skipped: [],
            blocks: [
                {
                    code: "children_unreadable",
                    children: [],
                    message:
                        "This lead's children could not be read just now, so it cannot be closed. "
                        + "Try again in a moment.",
                    detail: input.read.error,
                },
            ],
        };
    }

    const names = input.childNames ?? new Map<string, string>();
    const byClassification = new Map<ChildTrackClassification, FamilyCloseAffectedChild[]>();
    for (const row of input.read.rows) {
        const classification = classifyChildTrackState(row.state);
        const list = byClassification.get(classification) ?? [];
        list.push(childFrom(row, names));
        byClassification.set(classification, list);
    }

    const closing = byClassification.get("active_pre_enrollment") ?? [];
    const skipped = byClassification.get("terminal") ?? [];
    const enrolled = byClassification.get("enrolled_blocking") ?? [];
    const unknown = byClassification.get("unknown_blocking") ?? [];

    const blocks: FamilyCloseBlock[] = [];

    // Hardest block first, so a preview always leads with the thing that cannot be worked around.
    if (enrolled.length) {
        const who = joinChildNames(enrolled);
        blocks.push({
            code: "child_enrolled",
            children: enrolled,
            message:
                `${who} ${enrolled.length === 1 ? "is" : "are"} already enrolled. This family cannot `
                + `be closed. End or withdraw ${enrolled.length === 1 ? `${who}'s` : "their"} `
                + `enrollment through the enrolled-child process first.`,
        });
    }
    if (unknown.length) {
        const who = joinChildNames(unknown);
        blocks.push({
            code: "child_state_unknown",
            children: unknown,
            message:
                `${who} ${unknown.length === 1 ? "is" : "are"} in an enrollment state this process `
                + `does not recognize, so this family cannot be closed. Check `
                + `${unknown.length === 1 ? "their" : "those children's"} enrollment records.`,
        });
    }

    // Sort for a stable preview — the operator sees the same order every time they open it.
    const byLabel = (a: FamilyCloseAffectedChild, b: FamilyCloseAffectedChild) =>
        a.label.localeCompare(b.label) || a.customer_member_id.localeCompare(b.customer_member_id);

    return {
        allowed: blocks.length === 0,
        closing: [...closing].sort(byLabel),
        skipped: [...skipped].sort(byLabel),
        blocks,
    };
}

/** Compact diagnostic for the transaction trace. Never operator copy. */
export function describeGovernedFamilyClosePlan(plan: GovernedFamilyClosePlan): string {
    if (!plan.allowed) {
        return plan.blocks.map((b) => `${b.code}(${b.children.length})`).join("; ");
    }
    return `closing=${plan.closing.length} skipped=${plan.skipped.length}`;
}
