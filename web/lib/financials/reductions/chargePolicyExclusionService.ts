/**
 * "THIS POLICY WAS DELIBERATELY NOT APPLIED TO THIS CHARGE, AND HERE IS WHY."
 *
 * ── WHY THE RELATIONSHIP EXCEPTION COULD NOT SAY THIS ─────────────────────────────────────────
 *
 * `commercial_policy_exceptions` is scoped to the relationship — to exactly the thing an accepted
 * price is scoped to. Dating one narrowly enough to cover a single charge's service date waives
 * the policy for that family across the whole window, so every other charge in it silently loses
 * the discount too. That is a different decision from the one the operator made, recorded as if it
 * were the same one.
 *
 * So this is keyed to the charge, and nothing else about the doctrine moves: the reason is
 * mandatory, the author is recorded, lifting an exclusion ends it rather than deleting it, and
 * the one canonical resolver is what consults it.
 *
 * ── WHAT IT IS NOT ────────────────────────────────────────────────────────────────────────────
 *
 * Not `discount_enabled`. Not a boolean anywhere. A flag can be flipped by anyone for any reason
 * and leaves nothing behind to answer "why did this family not get their discount" — which is the
 * question somebody eventually asks, usually months later.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = "commercial_policy_charge_exclusions";

export type ChargePolicyExclusion = {
    id: string;
    policyId: string;
    chargeId: string;
    reason: string;
    createdBy: string | null;
    createdAt: string;
};

export type ChargeExclusionRefusal =
    | "reason_required"
    | "charge_required"
    | "policy_required"
    | "already_excluded"
    | "db_error";

export type ChargeExclusionResult =
    | { ok: true; exclusion: ChargePolicyExclusion }
    | { ok: false; code: ChargeExclusionRefusal; message: string };

const t = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Live exclusions for these charges, indexed `${chargeId}::${policyId}`. One query, never per charge. */
export async function readChargePolicyExclusions(
    supabase: SupabaseClient,
    args: { orgId: string; chargeIds: readonly string[] },
): Promise<Map<string, ChargePolicyExclusion>> {
    const index = new Map<string, ChargePolicyExclusion>();
    const ids = [...new Set(args.chargeIds.filter((c) => t(c).length > 0))];
    if (ids.length === 0) return index;

    const { data } = await supabase
        .from(TABLE)
        .select("id, policy_id, charge_id, reason, created_by, created_at")
        .eq("org_id", args.orgId)
        .in("charge_id", ids)
        .is("ended_at", null)
        .is("superseded_at", null);

    for (const row of ((data ?? []) as Array<Record<string, unknown>>)) {
        const chargeId = String(row.charge_id);
        const policyId = String(row.policy_id);
        index.set(`${chargeId}::${policyId}`, {
            id: String(row.id),
            policyId,
            chargeId,
            reason: String(row.reason ?? ""),
            createdBy: row.created_by ? String(row.created_by) : null,
            createdAt: String(row.created_at ?? ""),
        });
    }
    return index;
}

/**
 * Record that an otherwise-applicable policy is excluded from one charge.
 *
 * The reason is refused before anything is written, not validated afterwards: an exclusion that
 * reached the table without one would already be the unattributable decision this model exists to
 * prevent.
 */
export async function createChargePolicyExclusion(
    supabase: SupabaseClient,
    args: { orgId: string; policyId: string; chargeId: string; reason: string; actorUserId?: string | null },
): Promise<ChargeExclusionResult> {
    const reason = t(args.reason);
    if (!t(args.chargeId)) return { ok: false, code: "charge_required", message: "Name the charge this applies to." };
    if (!t(args.policyId)) return { ok: false, code: "policy_required", message: "Name the policy being excluded." };
    if (reason.length < 3) {
        return {
            ok: false,
            code: "reason_required",
            message: "Say why this discount is being waived. It changes what a real family owes.",
        };
    }

    const { data, error } = await supabase
        .from(TABLE)
        .insert({
            org_id: args.orgId,
            policy_id: t(args.policyId),
            charge_id: t(args.chargeId),
            reason,
            created_by: args.actorUserId ?? null,
        })
        .select("id, policy_id, charge_id, reason, created_by, created_at")
        .maybeSingle();

    if (error) {
        /* The live-row unique index is the concurrency answer; a second waiver is not an error. */
        if (/duplicate key|unique/i.test(error.message)) {
            return { ok: false, code: "already_excluded", message: "This policy is already waived for this charge." };
        }
        return { ok: false, code: "db_error", message: error.message };
    }
    const row = (data ?? {}) as Record<string, unknown>;
    return {
        ok: true,
        exclusion: {
            id: String(row.id),
            policyId: String(row.policy_id),
            chargeId: String(row.charge_id),
            reason: String(row.reason ?? ""),
            createdBy: row.created_by ? String(row.created_by) : null,
            createdAt: String(row.created_at ?? ""),
        },
    };
}

/**
 * Lift a waiver. The row stays — that it once stood is part of the charge's history.
 *
 * It returns the row it ended, and the same refusal shape as creating one. A bare boolean was
 * enough while nothing called this; the moment an operator surface does, the caller needs to know
 * WHICH charge to re-read and WHY a lift did nothing. "ok: false" with no reason is indistinguish-
 * able from a waiver somebody else had already lifted, and the two want different words on screen.
 */
export async function endChargePolicyExclusion(
    supabase: SupabaseClient,
    args: { orgId: string; exclusionId: string; actorUserId?: string | null },
): Promise<ChargeExclusionResult> {
    const id = t(args.exclusionId);
    if (!id) return { ok: false, code: "charge_required", message: "Name the waiver being ended." };

    const { data, error } = await supabase
        .from(TABLE)
        .update({ ended_at: new Date().toISOString(), ended_by: args.actorUserId ?? null, updated_at: new Date().toISOString() })
        .eq("org_id", args.orgId)
        .eq("id", id)
        /* Only a waiver that still stands can be lifted; ending an ended one moves no money. */
        .is("ended_at", null)
        .select("id, policy_id, charge_id, reason, created_by, created_at")
        .maybeSingle();
    if (error) return { ok: false, code: "db_error", message: error.message };
    if (!data) {
        return {
            ok: false,
            code: "already_excluded",
            message: "That waiver is not in force — it was already lifted, or it is not this organisation's.",
        };
    }
    const row = data as Record<string, unknown>;
    return {
        ok: true,
        exclusion: {
            id: String(row.id),
            policyId: String(row.policy_id),
            chargeId: String(row.charge_id),
            reason: String(row.reason ?? ""),
            createdBy: row.created_by ? String(row.created_by) : null,
            createdAt: String(row.created_at ?? ""),
        },
    };
}
