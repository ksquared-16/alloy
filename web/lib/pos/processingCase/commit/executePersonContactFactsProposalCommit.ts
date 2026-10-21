/**
 * Commit an approved PARENT DETAILS proposal — the responding adult's home / work phone, employer,
 * work hours, work address and preferred contact method — onto that adult's Person record.
 *
 *   operator approval (Processing) → the submission's own adult (`form_submissions.person_id`)
 *   → that adult belongs to the submitting household → the name they gave is theirs
 *   → writePersonContactFacts (definition-checked; a blank never clears a value)
 *
 * Nothing is written from a submission without this approval, and nothing is attributed to an
 * adult the answers do not describe: when the stated name is another adult's, the commit refuses
 * rather than guess whose work phone it is. A retry of a recorded proposal is `already_applied`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadRelatedRecordProposalForCase } from "@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase";
import { isRejectedProposal } from "@/lib/pos/processingCase/commit/participantChildRequestCommit";
import {
    personBelongsToHousehold,
    statedNameContradictsPerson,
    writePersonContactFacts,
    type PersonContactFactKey,
    type PersonContactFactWrite,
} from "@/lib/fields/personContactFacts/personContactFacts";

export const PERSON_CONTACT_FACT_COMMIT_LEDGER_KEY = "person_contact_fact_commits";

export type PersonContactFactCommitRecord = {
    outcome: "applied" | "already_on_record";
    proposal_id: string;
    person_id: string;
    written: PersonContactFactWrite[];
    unchanged: PersonContactFactKey[];
    actor_user_id: string | null;
    committed_at: string;
};

export type PersonContactFactCommitOutcome =
    | { ok: true; status: 200; already_applied: boolean; record: PersonContactFactCommitRecord }
    | { ok: false; status: number; code: string; error: string };

function ledgerFrom(metadata: Record<string, unknown>): Record<string, PersonContactFactCommitRecord> {
    const raw = metadata[PERSON_CONTACT_FACT_COMMIT_LEDGER_KEY];
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, PersonContactFactCommitRecord>) : {};
}

export async function executePersonContactFactsProposalCommit(args: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string | null;
    caseId: string;
    proposalId: string;
    metadata: Record<string, unknown>;
}): Promise<PersonContactFactCommitOutcome> {
    const fail = (status: number, code: string, error: string): PersonContactFactCommitOutcome => ({ ok: false, status, code, error });

    const prior = ledgerFrom(args.metadata)[args.proposalId];
    if (prior) return { ok: true, status: 200, already_applied: true, record: prior };
    if (isRejectedProposal(args.metadata, args.proposalId)) return fail(409, "declined", "This proposal was rejected, so it cannot be recorded.");

    const context = await loadRelatedRecordProposalForCase({ supabase: args.supabase, orgId: args.orgId, caseId: args.caseId, proposalId: args.proposalId });
    if (!context) return fail(404, "proposal_not_found", "That proposal is no longer on this case.");
    const intent = context.proposal.person_contact_facts_intent;
    if (context.proposal.execution_kind !== "person_contact_facts" || !intent) return fail(400, "not_person_facts", "This proposal is not a parent's contact details.");

    const personId = (context.expectedPersonId ?? "").trim();
    if (!personId) return fail(400, "missing_person_anchor", "This paperwork is not attributed to a parent, so the details have nowhere to go.");
    const { data: person, error: personError } = await args.supabase
        .from("persons")
        .select("id, first_name, last_name")
        .eq("org_id", args.orgId)
        .eq("id", personId)
        .maybeSingle();
    if (personError) throw new Error(personError.message);
    if (!person) return fail(404, "person_not_found", "The parent this paperwork is attributed to was not found.");
    if (context.expectedCustomerId && !(await personBelongsToHousehold(args.supabase, { orgId: args.orgId, personId, customerId: context.expectedCustomerId }))) {
        return fail(403, "person_wrong_household", "The parent this paperwork is attributed to is not one of this family's adults.");
    }
    const p = person as { first_name: string | null; last_name: string | null };
    if (statedNameContradictsPerson({ first: intent.stated_first_name, last: intent.stated_last_name }, p)) {
        return fail(
            409,
            "different_adult",
            `These answers are given by ${[intent.stated_first_name, intent.stated_last_name].filter(Boolean).join(" ")}, but the paperwork is attributed to ${[p.first_name, p.last_name].filter(Boolean).join(" ")}. They were not recorded on either.`,
        );
    }

    const result = await writePersonContactFacts(args.supabase, { orgId: args.orgId, personId, facts: intent.facts });
    if (result.missing_definitions.length > 0) {
        return fail(409, "fact_not_configured", `This organisation has no field for: ${result.missing_definitions.join(", ")}. Nothing was recorded for those.`);
    }

    const record: PersonContactFactCommitRecord = {
        outcome: result.written.length > 0 ? "applied" : "already_on_record",
        proposal_id: args.proposalId,
        person_id: personId,
        written: result.written,
        unchanged: result.unchanged,
        actor_user_id: args.userId,
        committed_at: new Date().toISOString(),
    };
    const { error } = await args.supabase
        .from("processing_cases")
        .update({ metadata: { ...args.metadata, [PERSON_CONTACT_FACT_COMMIT_LEDGER_KEY]: { ...ledgerFrom(args.metadata), [args.proposalId]: record } } })
        .eq("org_id", args.orgId)
        .eq("id", args.caseId);
    if (error) throw new Error(error.message);
    return { ok: true, status: 200, already_applied: false, record };
}
