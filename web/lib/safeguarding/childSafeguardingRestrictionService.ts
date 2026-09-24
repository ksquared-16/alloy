/**
 * Safeguarding V1 — the governed WRITER for child safeguarding restrictions.
 *
 * Alloy could already READ restrictions and compute pickup authority from them
 * (`resolvePickupAuthorization`), but nothing anywhere could create one: the table had readers
 * only. The published `pickup_authorized` contract was therefore correct and operationally
 * incomplete at the same time — an operator holding a court order had no way to make Alloy act on
 * it.
 *
 * ── TWO NAMED INTENTS, NOT CRUD ──
 *
 * A restriction is not a mutable record. The domain is append-and-transition: a change SUPERSEDES
 * the prior row so the state on any past date stays answerable, and history is never rewritten. So
 * this module exposes `addChildSafeguardingRestriction` and `endChildSafeguardingRestriction` and
 * no general update. There is no path here that edits a restriction's terms in place, because a
 * protective order whose terms changed silently is a protective order nobody can audit.
 *
 * ── WHY AN OPERATOR MAY CREATE AN ACTIVE ROW WHEN A PARENT MAY NOT ──
 *
 * `propose_safeguarding_restriction` exists and is deliberately NOT executable: a parent typing
 * "her father isn't allowed to get her" is an assertion that deserves a person's attention, never a
 * control that switches itself on. The database enforces the same boundary independently
 * (`status <> 'active' OR review_state = 'approved'`).
 *
 * An operator with manage authority IS that person. Their deliberate act is the review, so the row
 * is written `approved` with `reviewed_by` set to them — the approval is RECORDED, not skipped. The
 * CHECK constraint is satisfied because the review genuinely happened, not because it was bypassed.
 *
 * ── ENDING IS A TRANSITION, NOT A DELETE ──
 *
 * `endChildSafeguardingRestriction` moves the row to `revoked` and retains it. Deleting would erase
 * that the child was ever protected, which is the fact a later review most needs. `status` is what
 * decides: `isInForce` refuses any row that is not `active`, so revocation takes effect
 * immediately regardless of the effective dates left behind.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    SAFEGUARDING_EVIDENCE_BASES,
    SAFEGUARDING_OPERATIONAL_EFFECTS,
    SAFEGUARDING_RESTRICTION_KINDS,
    type SafeguardingEvidenceBasis,
    type SafeguardingOperationalEffect,
    type SafeguardingRestrictionKind,
} from "@/lib/safeguarding/safeguardingRestriction";

/** Columns safe to return to an authorized operator. `review_note` is excluded — see below. */
const OPERATOR_COLUMNS =
    "id, customer_member_id, affected_person_id, affected_party_description, restriction_kind," +
    " operational_effect, status, effective_from, effective_to, evidence_basis," +
    " evidence_document_id, source, source_reference, review_state, reviewed_at," +
    " supersedes_id, created_at, updated_at";

export type SafeguardingWriteResult<T> = { ok: true; value: T } | { ok: false; code: string; error: string };

export type AddSafeguardingRestrictionInput = {
    orgId: string;
    actorUserId: string;
    /** The child. A restriction protects a child, so the child is the grain even when it names an adult. */
    childCustomerMemberId: string;
    restrictionKind: SafeguardingRestrictionKind;
    operationalEffect: SafeguardingOperationalEffect;
    /** Null is legitimate: "there is a custody arrangement" names no one. */
    affectedPersonId?: string | null;
    affectedPartyDescription?: string | null;
    effectiveFrom?: string | null;
    effectiveTo?: string | null;
    evidenceBasis: SafeguardingEvidenceBasis;
    evidenceDocumentId?: string | null;
    sourceReference?: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function trimOrNull(v: string | null | undefined): string | null {
    const t = (v ?? "").trim();
    return t === "" ? null : t;
}

/**
 * The child must belong to the caller's org, checked with an explicit org predicate.
 *
 * A service-role client will happily read any tenant's row, so "the child exists" is not the
 * question — "the child is YOURS" is. A child outside the org is reported as not found rather than
 * forbidden: confirming that an id exists elsewhere is itself a cross-tenant disclosure.
 */
async function childBelongsToOrg(
    supabase: SupabaseClient,
    orgId: string,
    childCustomerMemberId: string,
): Promise<boolean> {
    const { data, error } = await supabase
        .from("customer_members")
        .select("id")
        .eq("id", childCustomerMemberId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error) return false;
    return Boolean(data);
}

export async function addChildSafeguardingRestriction(
    supabase: SupabaseClient,
    input: AddSafeguardingRestrictionInput,
): Promise<SafeguardingWriteResult<Record<string, unknown>>> {
    if (!SAFEGUARDING_RESTRICTION_KINDS.includes(input.restrictionKind)) {
        return { ok: false, code: "invalid_restriction_kind", error: "Unknown restriction kind." };
    }
    if (!SAFEGUARDING_OPERATIONAL_EFFECTS.includes(input.operationalEffect)) {
        return { ok: false, code: "invalid_operational_effect", error: "Unknown operational effect." };
    }
    if (!SAFEGUARDING_EVIDENCE_BASES.includes(input.evidenceBasis)) {
        return { ok: false, code: "invalid_evidence_basis", error: "Unknown evidence basis." };
    }
    // The database enforces this too. Refusing here gives the operator the reason instead of a
    // constraint name.
    if (input.evidenceBasis === "document" && !trimOrNull(input.evidenceDocumentId)) {
        return { ok: false, code: "evidence_document_required", error: "A document basis must name the document." };
    }
    for (const [name, value] of [["effective_from", input.effectiveFrom], ["effective_to", input.effectiveTo]] as const) {
        const v = trimOrNull(value);
        if (v && !ISO_DATE.test(v)) {
            return { ok: false, code: "invalid_date", error: `${name} must be YYYY-MM-DD.` };
        }
    }
    const from = trimOrNull(input.effectiveFrom);
    const to = trimOrNull(input.effectiveTo);
    if (from && to && to < from) {
        return { ok: false, code: "invalid_date_range", error: "effective_to must not precede effective_from." };
    }

    if (!(await childBelongsToOrg(supabase, input.orgId, input.childCustomerMemberId))) {
        return { ok: false, code: "child_not_found", error: "Child not found." };
    }

    // An affected person named by id must also be ours — otherwise a restriction could be attached
    // to a person from another tenant and would then never match anyone here.
    const affectedPersonId = trimOrNull(input.affectedPersonId);
    if (affectedPersonId) {
        const { data } = await supabase
            .from("persons").select("id").eq("id", affectedPersonId).eq("org_id", input.orgId).maybeSingle();
        if (!data) return { ok: false, code: "affected_person_not_found", error: "Affected person not found." };
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("child_safeguarding_restrictions")
        .insert({
            org_id: input.orgId,
            customer_member_id: input.childCustomerMemberId,
            affected_person_id: affectedPersonId,
            affected_party_description: trimOrNull(input.affectedPartyDescription),
            restriction_kind: input.restrictionKind,
            operational_effect: input.operationalEffect,
            // Active immediately: the operator's deliberate act IS the review, and it is recorded
            // as one below rather than asserted as one.
            status: "active",
            effective_from: from,
            effective_to: to,
            evidence_basis: input.evidenceBasis,
            evidence_document_id: trimOrNull(input.evidenceDocumentId),
            source: "operator",
            source_reference: trimOrNull(input.sourceReference),
            review_state: "approved",
            reviewed_by: input.actorUserId,
            reviewed_at: now,
            created_by: input.actorUserId,
        })
        .select(OPERATOR_COLUMNS)
        .single();

    if (error || !data) {
        return { ok: false, code: "write_failed", error: error?.message ?? "The restriction could not be recorded." };
    }
    return { ok: true, value: data as unknown as Record<string, unknown> };
}

export type EndSafeguardingRestrictionInput = {
    orgId: string;
    actorUserId: string;
    restrictionId: string;
    /** The day it stops applying. Defaults to today. Recorded; `status` is what decides. */
    endedOn?: string | null;
};

export async function endChildSafeguardingRestriction(
    supabase: SupabaseClient,
    input: EndSafeguardingRestrictionInput,
): Promise<SafeguardingWriteResult<Record<string, unknown>>> {
    const endedOn = trimOrNull(input.endedOn) ?? new Date().toISOString().slice(0, 10);
    if (!ISO_DATE.test(endedOn)) {
        return { ok: false, code: "invalid_date", error: "ended_on must be YYYY-MM-DD." };
    }

    const { data: existing } = await supabase
        .from("child_safeguarding_restrictions")
        .select("id, status, effective_from")
        .eq("id", input.restrictionId)
        .eq("org_id", input.orgId)
        .maybeSingle();
    if (!existing) {
        return { ok: false, code: "restriction_not_found", error: "Restriction not found." };
    }

    const current = existing as { status: string; effective_from: string | null };
    // Already ended. Report the existing row rather than a conflict, so a retry an operator could
    // not confirm converges instead of reading as a failure.
    if (current.status !== "active" && current.status !== "proposed") {
        const { data: unchanged } = await supabase
            .from("child_safeguarding_restrictions")
            .select(OPERATOR_COLUMNS).eq("id", input.restrictionId).eq("org_id", input.orgId).single();
        return { ok: true, value: (unchanged ?? {}) as unknown as Record<string, unknown> };
    }
    /*
     * A restriction that has NOT STARTED YET can still be lifted — a court order withdrawn before
     * it takes effect is an ordinary thing to record, and hosted certification found the opposite:
     * ending a future-dated restriction was refused outright because the default end (today) fell
     * before its `effective_from`, and `effective_to >= effective_from` is a database constraint.
     *
     * Refusing was the wrong answer to the right constraint. Revocation is decided by `status`, not
     * by the dates, so the window is clamped forward to the day the restriction would have begun:
     * it never comes into force, the row stays constraint-valid, and "revoked" still says why.
     */
    const effectiveTo =
        current.effective_from && endedOn < current.effective_from ? current.effective_from : endedOn;

    const { data, error } = await supabase
        .from("child_safeguarding_restrictions")
        .update({
            status: "revoked",
            effective_to: effectiveTo,
            updated_at: new Date().toISOString(),
            updated_by: input.actorUserId,
        })
        .eq("id", input.restrictionId)
        .eq("org_id", input.orgId)
        .select(OPERATOR_COLUMNS)
        .single();

    if (error || !data) {
        return { ok: false, code: "write_failed", error: error?.message ?? "The restriction could not be ended." };
    }
    return { ok: true, value: data as unknown as Record<string, unknown> };
}

/**
 * Every restriction recorded for a child, for an authorized operator.
 *
 * Returns proposed, expired and revoked rows too: filtering here would hide the difference between
 * "nothing was ever recorded" and "something was recorded that is not in force", which is the
 * distinction the whole module exists to preserve. `review_note` is never selected — it is the
 * free-text field most likely to carry a third party's account of a family, and no caller of this
 * function needs it.
 */
export async function listChildSafeguardingRestrictions(
    supabase: SupabaseClient,
    orgId: string,
    childCustomerMemberId: string,
): Promise<SafeguardingWriteResult<Record<string, unknown>[]>> {
    if (!(await childBelongsToOrg(supabase, orgId, childCustomerMemberId))) {
        return { ok: false, code: "child_not_found", error: "Child not found." };
    }
    const { data, error } = await supabase
        .from("child_safeguarding_restrictions")
        .select(OPERATOR_COLUMNS)
        .eq("org_id", orgId)
        .eq("customer_member_id", childCustomerMemberId)
        .order("created_at", { ascending: false });
    if (error) return { ok: false, code: "read_failed", error: error.message };
    return { ok: true, value: (data ?? []) as unknown as Record<string, unknown>[] };
}
