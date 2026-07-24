/**
 * Approval Result presentation (§5).
 *
 * After a lead commit, turn what ACTUALLY happened into a concise, human "Linked / Created /
 * Updated" result. Honest by construction: created lines are gated on the real committed record
 * ids the server returns (`operationalResult.records`), linked lines on the recommendation's link
 * decision, and "Updated ZIP" only when a person the ZIP could be written to actually exists.
 *
 * Human language only — no command names, table names, CRM taxonomy, ids, or internal entities.
 */

import type { MatchedRecordCard } from "./matchedRecordsPresentation";

export interface ApprovalResultLine {
    /** Primary line, e.g. "Marisol Ziptest" or "Enrollment lead". */
    primary: string;
    /** Optional record kind, e.g. "Parent" / "Child". */
    secondary?: string;
}

export interface ApprovalResultView {
    linked: ApprovalResultLine[];
    created: ApprovalResultLine[];
    updated: ApprovalResultLine[];
    isEmpty: boolean;
}

/** The committed-record ids the server returns on a lead commit — presence means "it happened". */
export interface CommittedRecordIds {
    household: string | null;
    child: string | null;
    person: string | null;
    lead: string | null;
    participation: string | null;
}

export function buildApprovalResultView(input: {
    /** The same honest matched-record cards the middle column builds (names + roles). */
    cards: MatchedRecordCard[];
    /** Committed record ids from operationalResult.records; null for non-lead handoffs. */
    records: CommittedRecordIds | null;
    /** Name of the existing parent that was linked (from the matched candidate), when linking. */
    linkedParentName?: string | null;
    /** Household the existing parent belongs to, when linking. */
    linkedHouseholdName?: string | null;
    /** ZIP submitted on the form, if any. */
    submittedZip?: string | null;
}): ApprovalResultView {
    const linked: ApprovalResultLine[] = [];
    const created: ApprovalResultLine[] = [];
    const updated: ApprovalResultLine[] = [];
    const r = input.records;

    const parent = input.cards.find((c) => c.role === "parent");
    const child = input.cards.find((c) => c.role === "child");
    const biz = input.cards.find((c) => c.role === "business_object");

    if (parent) {
        if (parent.basisTone === "match") {
            // Existing parent linked — no create_person op, so gate on the link decision, not an id.
            linked.push({ primary: input.linkedParentName ?? parent.name ?? "Existing parent", secondary: "Parent" });
            if (input.linkedHouseholdName) linked.push({ primary: `Existing ${input.linkedHouseholdName} household` });
        } else if (r?.person) {
            created.push({ primary: parent.name ?? "New parent", secondary: "Parent" });
        }
    }

    if (child && r?.child) created.push({ primary: child.name ?? "New child", secondary: "Child" });
    if (biz && r?.lead) created.push({ primary: biz.title });
    if (r?.participation) created.push({ primary: "Enrollment participation" });

    // ZIP is written onto the lead's person (created or linked) — show it only when such a person exists.
    if (input.submittedZip && (r?.person || r?.lead)) updated.push({ primary: `ZIP Code: ${input.submittedZip}` });

    return { linked, created, updated, isEmpty: linked.length === 0 && created.length === 0 && updated.length === 0 };
}
