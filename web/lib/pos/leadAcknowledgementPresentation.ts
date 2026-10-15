/**
 * WHAT THE OPERATOR SEES AFTER APPROVING A LEAD — and what they can do from there.
 *
 * Approving used to show a check mark and then, 3.2 seconds later, jump to the next queue item on
 * its own. The operator never reached the lead they had just created, and a matched family read as
 * "Family confirmed" exactly like a new one. This is an acknowledgement instead: it stays until the
 * operator chooses, states honestly whether a family was CREATED or an existing one LINKED, and
 * offers only the destinations that exist for the committed records.
 *
 * Pure: the server's commit result in, a view model out. No ids reach the operator's eyes.
 */

import type { CommittedRecordIds, CreatedRecordFlags } from "./approvalResultPresentation";

export interface LeadCommitHandoff {
    workUnitId: string | null;
    workViewId: string | null;
    workViewRouteKey: string | null;
    statusKey: string | null;
    stageKey: string | null;
}

export interface LeadCommitResultLike {
    kind: "lead";
    recordId?: string | null;
    created?: boolean;
    records?: CommittedRecordIds | null;
    createdRecords?: CreatedRecordFlags | null;
    matchedExisting?: boolean;
    handoff?: LeadCommitHandoff | null;
}

export type LeadAcknowledgementAction =
    | "open_lead"
    | "contact_family"
    | "update_information"
    | "open_person"
    | "open_child";

export interface LeadAcknowledgementView {
    title: string;
    body: string;
    /** An existing family was linked — nothing about it may read as created. */
    matched: boolean;
    leadId: string | null;
    personId: string | null;
    childId: string | null;
    /** Only the actions whose destination exists, primary first. */
    actions: LeadAcknowledgementAction[];
}

export function buildLeadAcknowledgementView(result: LeadCommitResultLike): LeadAcknowledgementView {
    const records = result.records ?? null;
    const leadId = records?.lead ?? result.recordId ?? null;
    const personId = records?.person ?? null;
    const childId = records?.child ?? null;
    const matched = result.matchedExisting === true;
    const leadCreated = result.createdRecords ? result.createdRecords.lead : result.created !== false && !!leadId;

    const title = !leadId
        ? "Completed"
        : matched
          ? leadCreated
              ? "Lead added to an existing family"
              : "Linked to an existing family"
          : "Lead created";
    const body = !leadId
        ? "This submission has been processed."
        : matched
          ? "This submission matched a family already in Alloy. No new family was created — the existing record was updated and linked."
          : "A new family is now an Enrollment lead, in the same place a lead created in Alloy appears.";

    const actions: LeadAcknowledgementAction[] = [];
    if (leadId) actions.push("open_lead", "contact_family", "update_information");
    if (personId) actions.push("open_person");
    if (childId) actions.push("open_child");

    return { title, body, matched, leadId, personId, childId, actions };
}

export const LEAD_ACKNOWLEDGEMENT_ACTION_LABEL: Record<LeadAcknowledgementAction, string> = {
    open_lead: "Open Lead",
    contact_family: "Contact Family",
    update_information: "Update Information",
    open_person: "Open parent",
    open_child: "Open child",
};
