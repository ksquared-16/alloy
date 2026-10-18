/**
 * A FAMILY TELLS THE SCHOOL ABOUT A NEW CHILD — a Processing source, never a child.
 *
 * The family view's "Add a new child" records the participant's statement
 * (`processing_participant_child_requests`) and opens a Processing Case whose primary source is that
 * statement (`participant_child_request`). From there it is the SAME canonical Processing authority as
 * a document- or form-derived child:
 *
 *   PROPOSAL   the statement adapts to one `children` related-record proposal with origin
 *              `proposed_new_record` — the shape `executeNewChildProposalCommit` already commits;
 *   REVIEW     the operator sees it in the case, may correct the name / date of birth, reject it, or
 *              commit it; commit is identity-safe (`addChild`, duplicate candidates, explicit choice);
 *   OUTCOME    the commit / rejection is written back to the request so the family view can say what
 *              happened, and the case completes.
 *
 * Nothing here creates a child. Nothing here is reachable without a server-verified household.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { RelatedRecordInstanceProposal, RelatedRecordProposalBundle } from "@/lib/intake/proposals/types";
import { makeProcessingCaseDbDeps } from "@/lib/pos/processingCase/processingCaseDb";
import { openProcessingCaseFromSource } from "@/lib/pos/processingCase/openProcessingCaseFromSource";

export const PARTICIPANT_CHILD_REQUEST_SOURCE_KIND = "participant_child_request" as const;
export const PARTICIPANT_CHILD_REQUESTS_TABLE = "processing_participant_child_requests" as const;

export type ParticipantChildRequestStatus = "pending" | "committed" | "declined";

export type ParticipantChildRequestRow = {
    id: string;
    org_id: string;
    customer_id: string;
    opportunity_id: string | null;
    requested_by_person_id: string | null;
    first_name: string;
    last_name: string;
    date_of_birth: string;
    status: ParticipantChildRequestStatus;
    customer_member_id: string | null;
    decided_at: string | null;
    decision_reason: string | null;
    created_at: string;
};

const ROW_COLUMNS =
    "id, org_id, customer_id, opportunity_id, requested_by_person_id, first_name, last_name, date_of_birth, status, customer_member_id, decided_at, decision_reason, created_at";

/** One request is one proposal; the id is stable for the life of the request. */
export function participantChildRequestProposalId(requestId: string): string {
    return `rrp:${PARTICIPANT_CHILD_REQUEST_SOURCE_KIND}:${requestId}:children:${requestId}`;
}

/** The request as the canonical related-record proposal the Processing new-child commit consumes. */
export function adaptParticipantChildRequestToRelatedRecordProposals(row: ParticipantChildRequestRow): RelatedRecordProposalBundle {
    const field = (key: string, label: string, value: string) => ({
        provider_ref: `customer_member.${key}`,
        submitted_value: value,
        source_fact_ref: key,
        label,
    });
    const instance: RelatedRecordInstanceProposal = {
        proposal_id: participantChildRequestProposalId(row.id),
        collection_provider_ref: "children",
        item_entity_type: "customer_member",
        instance_key: row.id,
        origin: "proposed_new_record",
        field_proposals: [
            field("first_name", "First name", row.first_name),
            field("last_name", "Last name", row.last_name),
            field("date_of_birth", "Date of birth", row.date_of_birth),
        ],
        source_lineage: {
            source_kind: PARTICIPANT_CHILD_REQUEST_SOURCE_KIND,
            source_record_id: row.id,
            source_metadata: {
                schema_group_id: "participant_child_request",
                customer_id: row.customer_id,
                ...(row.requested_by_person_id ? { requested_by_person_id: row.requested_by_person_id } : {}),
            },
        },
        diagnostics: [],
        status: "valid",
        execution_kind: "native_structural",
    };
    return {
        collections: [{
            collection_key: "participant_child_request",
            collection_provider_ref: "children",
            instances: [instance],
            status: "valid",
            diagnostics: [],
        }],
        diagnostics: [],
    };
}

export async function loadParticipantChildRequests(
    supabase: SupabaseClient,
    orgId: string,
    ids: readonly string[],
): Promise<ParticipantChildRequestRow[]> {
    if (ids.length === 0) return [];
    const { data, error } = await supabase
        .from(PARTICIPANT_CHILD_REQUESTS_TABLE)
        .select(ROW_COLUMNS)
        .eq("org_id", orgId)
        .in("id", [...ids]);
    if (error) throw new Error(error.message);
    return (data ?? []) as ParticipantChildRequestRow[];
}

/** The household's requests the family should still see as requests (a committed one is a child now). */
export async function listOpenParticipantChildRequests(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly customerId: string },
): Promise<ParticipantChildRequestRow[]> {
    const { data, error } = await supabase
        .from(PARTICIPANT_CHILD_REQUESTS_TABLE)
        .select(ROW_COLUMNS)
        .eq("org_id", input.orgId)
        .eq("customer_id", input.customerId)
        .in("status", ["pending", "declined"]);
    if (error) throw new Error(error.message);
    return ((data ?? []) as ParticipantChildRequestRow[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export type NewChildStatement = { readonly firstName: unknown; readonly lastName: unknown; readonly dateOfBirth: unknown };

export type ParticipantChildRequestRefusal =
    | { readonly code: "invalid"; readonly message: string; readonly field: "first_name" | "last_name" | "date_of_birth" }
    | { readonly code: "already_in_household"; readonly message: string; readonly customerMemberId: string };

export type SubmitParticipantChildRequestResult =
    | { readonly ok: true; readonly requestId: string; readonly processingCaseId: string; readonly created: boolean }
    | { readonly ok: false; readonly refusal: ParticipantChildRequestRefusal };

const clean = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const fold = (v: string) => v.toLowerCase();

/** The minimum a reviewable proposal needs: a first and last name and a real date of birth in the past. */
export function validateNewChildStatement(
    input: NewChildStatement,
    today: Date = new Date(),
): { ok: true; firstName: string; lastName: string; dateOfBirth: string } | { ok: false; refusal: Extract<ParticipantChildRequestRefusal, { code: "invalid" }> } {
    const firstName = clean(input.firstName);
    const lastName = clean(input.lastName);
    const dateOfBirth = clean(input.dateOfBirth);
    if (!firstName || firstName.length > 100) return { ok: false, refusal: { code: "invalid", field: "first_name", message: "Please enter the child's first name." } };
    if (!lastName || lastName.length > 100) return { ok: false, refusal: { code: "invalid", field: "last_name", message: "Please enter the child's last name." } };
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
    const parsed = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
    const real = parsed && parsed.toISOString().slice(0, 10) === dateOfBirth;
    if (!real || parsed!.getTime() > today.getTime() || Number(m![1]) < 1900) {
        return { ok: false, refusal: { code: "invalid", field: "date_of_birth", message: "Please enter the child's date of birth." } };
    }
    return { ok: true, firstName, lastName, dateOfBirth };
}

/**
 * Record a participant's statement about a new child and open its Processing Case.
 *
 * The caller has already proven, on the server, that the participant is authorized for `customerId`.
 * Retrying the same statement returns the same request and case (one pending request per child).
 * A child already in the household is refused here — the family is pointed at that child instead.
 */
export async function submitParticipantChildRequest(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly customerId: string;
        readonly opportunityId: string | null;
        readonly requestedByPersonId: string | null;
        readonly child: NewChildStatement;
    },
    attempt = 0,
): Promise<SubmitParticipantChildRequestResult> {
    const valid = validateNewChildStatement(input.child);
    if (!valid.ok) return { ok: false, refusal: valid.refusal };

    // A child this household already has is not a new child.
    const { data: members, error: memberError } = await supabase
        .from("customer_members")
        .select("id, first_name, last_name")
        .eq("org_id", input.orgId)
        .eq("customer_id", input.customerId)
        .eq("relationship", "child")
        .eq("is_active", true);
    if (memberError) throw new Error(memberError.message);
    // Same first and last name in the same household is the same child (the operator's commit still runs
    // the organization-wide identity check for everything else).
    const same = ((members ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>).find(
        (m) => fold(clean(m.first_name)) === fold(valid.firstName) && fold(clean(m.last_name)) === fold(valid.lastName),
    );
    if (same) {
        return {
            ok: false,
            refusal: {
                code: "already_in_household",
                customerMemberId: same.id,
                message: `${valid.firstName} is already part of your family's record — choose them from the list instead.`,
            },
        };
    }

    // The same statement, still with the school, is the same request.
    const { data: pending, error: pendingError } = await supabase
        .from(PARTICIPANT_CHILD_REQUESTS_TABLE)
        .select(ROW_COLUMNS)
        .eq("org_id", input.orgId)
        .eq("customer_id", input.customerId)
        .eq("status", "pending")
        .eq("date_of_birth", valid.dateOfBirth);
    if (pendingError) throw new Error(pendingError.message);
    let row = ((pending ?? []) as ParticipantChildRequestRow[]).find(
        (r) => fold(clean(r.first_name)) === fold(valid.firstName) && fold(clean(r.last_name)) === fold(valid.lastName),
    );
    let created = false;
    if (!row) {
        const { data: inserted, error: insertError } = await supabase
            .from(PARTICIPANT_CHILD_REQUESTS_TABLE)
            .insert({
                org_id: input.orgId,
                customer_id: input.customerId,
                opportunity_id: input.opportunityId,
                requested_by_person_id: input.requestedByPersonId,
                first_name: valid.firstName,
                last_name: valid.lastName,
                date_of_birth: valid.dateOfBirth,
            })
            .select(ROW_COLUMNS)
            .single();
        if (insertError) {
            // A concurrent identical request won the one-pending-per-child index: retry as a read.
            if ((insertError as { code?: string }).code === "23505" && attempt === 0) {
                return submitParticipantChildRequest(supabase, input, 1);
            }
            throw new Error(insertError.message);
        }
        row = inserted as ParticipantChildRequestRow;
        created = true;
    }

    const opened = await openProcessingCaseFromSource(makeProcessingCaseDbDeps(supabase), {
        orgId: input.orgId,
        sourceKind: PARTICIPANT_CHILD_REQUEST_SOURCE_KIND,
        sourceId: row.id,
        caseType: "participant_child_request",
    });
    return { ok: true, requestId: row.id, processingCaseId: opened.processingCaseId, created };
}

/** Record the Processing outcome on the request. Idempotent; a decided request never changes again. */
export async function recordParticipantChildRequestOutcome(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly requestId: string;
        readonly userId: string;
        readonly outcome: { readonly status: "committed"; readonly customerMemberId: string } | { readonly status: "declined"; readonly reason: string | null };
    },
): Promise<{ ok: true; status: ParticipantChildRequestStatus } | { ok: false; status: ParticipantChildRequestStatus | null }> {
    const [row] = await loadParticipantChildRequests(supabase, input.orgId, [input.requestId]);
    if (!row) return { ok: false, status: null };
    if (row.status !== "pending") {
        const same = row.status === input.outcome.status
            && (input.outcome.status !== "committed" || row.customer_member_id === input.outcome.customerMemberId);
        return same ? { ok: true, status: row.status } : { ok: false, status: row.status };
    }
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from(PARTICIPANT_CHILD_REQUESTS_TABLE)
        .update({
            status: input.outcome.status,
            customer_member_id: input.outcome.status === "committed" ? input.outcome.customerMemberId : null,
            decision_reason: input.outcome.status === "declined" ? input.outcome.reason : null,
            decided_at: now,
            decided_by: input.userId,
            updated_at: now,
        })
        .eq("org_id", input.orgId)
        .eq("id", input.requestId)
        .eq("status", "pending")
        .select("status");
    if (error) throw new Error(error.message);
    if ((data ?? []).length === 0) {
        // Someone decided it between the read and the write — answer with what is stored.
        return recordParticipantChildRequestOutcome(supabase, input);
    }
    return { ok: true, status: input.outcome.status };
}
