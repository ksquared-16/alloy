/**
 * Commit an approved HEALTH FACT proposal — an allergy, condition or medication a family wrote on a
 * Form — onto the child's Medical record, through Health's one writer.
 *
 *   commit request (operator, Processing)
 *     → load the proposal (org-scoped, server re-derived from the submission)
 *     → refuse unless it is a valid health row that was not rejected
 *     → the child is the SUBMISSION'S child, validated against the org and household
 *     → Health access: the operator must hold `health.manage` (healthFactService asserts it again)
 *     → addHealthFact / editHealthFact — provenance `form_submission`, source_ref = the row
 *     → ledger on the case, so a retry is `already_applied`
 *
 * ## What it never does
 *
 *   - Write from an unreviewed submission. The participant runtime never reaches this module.
 *   - Choose a child. A submission naming no child is refused, never resolved to "the only child".
 *   - Duplicate a fact. The child's ACTIVE fact of the same kind and identity (the same allergen,
 *     condition or medication) is either already this answer (`already_on_record`) or is corrected by
 *     it — `editHealthFact` supersedes it, so the lineage keeps both and the card shows one.
 *   - Invent a severity. The payload is exactly what `healthFactFormMembers` read from the row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadRelatedRecordProposalForCase } from "@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase";
import { isRejectedProposal } from "@/lib/pos/processingCase/commit/participantChildRequestCommit";
import { addHealthFact, editHealthFact, HealthFactError } from "@/lib/health/healthFactService";
import { evaluateHealthAccess, HEALTH_MANAGE_PERMISSION, type HealthAccessSubject } from "@/lib/health/healthAccess";
import { healthFactIdentityKey } from "@/lib/health/healthFactFormMembers";
import { PERSON_HEALTH_FACTS_TABLE, PERSON_HEALTH_FACT_SELECT, type PersonHealthFactRow } from "@/lib/health/healthFactModel";

export const HEALTH_FACT_COMMIT_LEDGER_KEY = "health_fact_commits";

export type HealthFactCommitRecord = {
    outcome: "applied" | "corrected" | "already_on_record";
    proposal_id: string;
    fact_kind: string;
    customer_member_id: string;
    health_fact_id: string;
    superseded_fact_id: string | null;
    source_ref: string;
    actor_user_id: string | null;
    committed_at: string;
};

export type HealthFactCommitOutcome =
    | { ok: true; status: 200; already_applied: boolean; record: HealthFactCommitRecord }
    | { ok: false; status: number; code: string; error: string };

function ledgerFrom(metadata: Record<string, unknown>): Record<string, HealthFactCommitRecord> {
    const raw = metadata[HEALTH_FACT_COMMIT_LEDGER_KEY];
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, HealthFactCommitRecord>) : {};
}

function samePayload(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
        if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) return false;
    }
    return true;
}

export async function executeHealthFactProposalCommit(args: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string | null;
    access: HealthAccessSubject;
    caseId: string;
    proposalId: string;
    metadata: Record<string, unknown>;
}): Promise<HealthFactCommitOutcome> {
    const fail = (status: number, code: string, error: string): HealthFactCommitOutcome => ({ ok: false, status, code, error });

    // Health access first: an operator who may not change health information learns nothing more.
    const access = evaluateHealthAccess(args.access, HEALTH_MANAGE_PERMISSION);
    if (!access.allowed) return fail(403, access.code, access.message);

    const prior = ledgerFrom(args.metadata)[args.proposalId];
    if (prior) return { ok: true, status: 200, already_applied: true, record: prior };
    if (isRejectedProposal(args.metadata, args.proposalId)) {
        return fail(409, "declined", "This proposal was rejected, so it cannot be committed.");
    }

    const context = await loadRelatedRecordProposalForCase({
        supabase: args.supabase,
        orgId: args.orgId,
        caseId: args.caseId,
        proposalId: args.proposalId,
    });
    if (!context) return fail(404, "proposal_not_found", "That proposal is no longer on this case.");
    const { proposal } = context;
    const intent = proposal.health_fact_intent;
    if (proposal.execution_kind !== "health_fact" || !intent) {
        return fail(400, "not_a_health_fact", "This proposal is not a health fact.");
    }
    if (proposal.status !== "valid" || intent.missing_required.length > 0) {
        return fail(409, "proposal_incomplete", `This ${intent.fact_kind} is incomplete: ${proposal.diagnostics.map((d) => d.message).join(" ") || "a required answer is missing."}`);
    }

    // ── the child: the submission's own, validated — never inferred from the household ──────────
    const childId = (context.expectedCustomerMemberId ?? "").trim();
    if (!childId) {
        return fail(400, "missing_child_anchor", "This paperwork does not name a child, so the health fact has nowhere to go.");
    }
    const { data: child, error: childError } = await args.supabase
        .from("customer_members")
        .select("id, customer_id")
        .eq("org_id", args.orgId)
        .eq("id", childId)
        .maybeSingle();
    if (childError) throw new Error(childError.message);
    if (!child) return fail(404, "anchor_not_found", "The child this paperwork is about was not found.");
    const childCustomerId = String((child as { customer_id?: string | null }).customer_id ?? "");
    if (context.expectedCustomerId && childCustomerId && context.expectedCustomerId !== childCustomerId) {
        return fail(403, "anchor_wrong_household", "The child does not belong to the family that submitted this paperwork.");
    }

    const sourceRef = `form_submission:${proposal.source_lineage.source_record_id}:${proposal.instance_key}`;
    const now = new Date().toISOString();

    // ── one fact per identity: the same allergen is a correction, not a second allergy ──────────
    const { data: activeRows, error: activeError } = await args.supabase
        .from(PERSON_HEALTH_FACTS_TABLE)
        .select(PERSON_HEALTH_FACT_SELECT)
        .eq("org_id", args.orgId)
        .eq("subject_entity_type", "customer_member")
        .eq("subject_entity_id", childId)
        .eq("fact_kind", intent.fact_kind)
        .eq("status", "active");
    if (activeError) throw new Error(activeError.message);
    const identity = healthFactIdentityKey(intent.fact_kind, intent.payload);
    const active = ((activeRows ?? []) as unknown as PersonHealthFactRow[]);
    const sameSource = active.find((r) => r.source_ref === sourceRef);
    const sameIdentity = sameSource ?? active.find((r) => identity !== null && healthFactIdentityKey(r.fact_kind, r.payload ?? {}) === identity);

    let record: HealthFactCommitRecord;
    try {
        if (sameIdentity && samePayload(sameIdentity.payload ?? {}, intent.payload)) {
            record = {
                outcome: "already_on_record",
                proposal_id: args.proposalId,
                fact_kind: intent.fact_kind,
                customer_member_id: childId,
                health_fact_id: sameIdentity.id,
                superseded_fact_id: null,
                source_ref: sourceRef,
                actor_user_id: args.userId,
                committed_at: now,
            };
        } else if (sameIdentity) {
            const { created, superseded } = await editHealthFact(args.supabase, {
                orgId: args.orgId,
                access: args.access,
                factId: sameIdentity.id,
                payload: intent.payload,
                sourceKind: "form_submission",
                sourceRef,
                actorUserId: args.userId,
            });
            record = {
                outcome: "corrected",
                proposal_id: args.proposalId,
                fact_kind: intent.fact_kind,
                customer_member_id: childId,
                health_fact_id: created.id,
                superseded_fact_id: superseded.id,
                source_ref: sourceRef,
                actor_user_id: args.userId,
                committed_at: now,
            };
        } else {
            const created = await addHealthFact(args.supabase, {
                orgId: args.orgId,
                access: args.access,
                subjectEntityType: "customer_member",
                subjectEntityId: childId,
                factKind: intent.fact_kind,
                payload: intent.payload,
                sourceKind: "form_submission",
                sourceRef,
                actorUserId: args.userId,
            });
            record = {
                outcome: "applied",
                proposal_id: args.proposalId,
                fact_kind: intent.fact_kind,
                customer_member_id: childId,
                health_fact_id: created.id,
                superseded_fact_id: null,
                source_ref: sourceRef,
                actor_user_id: args.userId,
                committed_at: now,
            };
        }
    } catch (e) {
        if (e instanceof HealthFactError) return fail(e.code === "invalid_input" ? 400 : 500, e.code, e.message);
        throw e;
    }

    const ledger = { ...ledgerFrom(args.metadata), [args.proposalId]: record };
    const { error: ledgerError } = await args.supabase
        .from("processing_cases")
        .update({ metadata: { ...args.metadata, [HEALTH_FACT_COMMIT_LEDGER_KEY]: ledger } })
        .eq("org_id", args.orgId)
        .eq("id", args.caseId);
    // The fact is written and carries its source_ref, so a retry finds it (`sameSource`) even if the
    // ledger write failed — it is a convenience for the review surface, not the idempotency guard.
    if (ledgerError) throw new Error(ledgerError.message);

    return { ok: true, status: 200, already_applied: false, record };
}

/** A health proposal the ledger already recorded — the review surface reads it as done. */
export function healthFactAlreadyCommitted(metadata: unknown, proposalId: string): HealthFactCommitRecord | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    return ledgerFrom(metadata as Record<string, unknown>)[proposalId] ?? null;
}
