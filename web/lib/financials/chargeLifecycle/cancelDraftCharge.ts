/**
 * W7-F016 — CANCELLING A DRAFT CHARGE, RETAINED AND ATTRIBUTED.
 *
 * A draft is not financial history yet: it has posted nothing, written no journal entry and owes
 * nothing. So an operator may withdraw it. But "never posted" is not "never existed" — a draft is
 * seen on the account, can carry responsibility allocations and a discount decision, and somebody
 * created it. The cancellation is therefore the existing `void` status, written in place with who
 * cancelled it, when and why, and the row stays readable. Nothing is deleted.
 *
 * POSTED MONEY IS REFUSED HERE. Once posted, a charge changes only through the governed correction
 * and reversal paths, and saying so is the refusal's whole message.
 *
 * Draft reductions written beside this draft (a discount awaiting its own posting, linked through
 * `source_charge_id`) are withdrawn with it: a discount on a charge that no longer exists would be
 * money taken off nothing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type CancelDraftChargeReason = "operator_cancelled" | "replaced_by_edit";

export class CancelDraftChargeError extends Error {
    constructor(
        public readonly code: "charge_not_found" | "charge_not_draft" | "db_error",
        message: string,
    ) {
        super(message);
    }
}

export async function cancelDraftCharge(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        chargeId: string;
        actorUserId: string | null;
        reason: CancelDraftChargeReason;
        note?: string | null;
        /** When an Edit replaced this draft with a new one, the charge that now stands for it. */
        replacedByChargeId?: string | null;
        now?: Date;
    },
): Promise<{ chargeId: string; status: "void"; alreadyCancelled: boolean; withdrawnReductions: number }> {
    const { data: row, error } = await supabase
        .from("charges")
        .select("id, status, metadata")
        .eq("org_id", args.orgId)
        .eq("id", args.chargeId)
        .maybeSingle();
    if (error) throw new CancelDraftChargeError("db_error", error.message);
    if (!row) throw new CancelDraftChargeError("charge_not_found", "No such charge in this organisation.");
    const status = String((row as { status?: string }).status ?? "");
    const metadata = ((row as { metadata?: Record<string, unknown> | null }).metadata ?? {}) as Record<string, unknown>;
    if (status === "void" && metadata.retirement) {
        return { chargeId: args.chargeId, status: "void", alreadyCancelled: true, withdrawnReductions: 0 };
    }
    if (status !== "draft") {
        throw new CancelDraftChargeError(
            "charge_not_draft",
            "Only a draft can be cancelled. A posted charge is changed through a correction or a reversal.",
        );
    }

    const at = (args.now ?? new Date()).toISOString();
    const retirement = {
        reason: args.reason,
        at,
        actor_user_id: args.actorUserId,
        note: args.note?.trim() || null,
        replaced_by_charge_id: args.replacedByChargeId ?? null,
    };

    /* Conditional on `status = draft`: a draft that posted a moment ago is not cancelled after all. */
    const { data: updated, error: updateError } = await supabase
        .from("charges")
        .update({ status: "void", voided_at: at, updated_by: args.actorUserId, metadata: { ...metadata, retirement } })
        .eq("org_id", args.orgId)
        .eq("id", args.chargeId)
        .eq("status", "draft")
        .select("id");
    if (updateError) throw new CancelDraftChargeError("db_error", updateError.message);
    if (!updated || updated.length === 0) {
        throw new CancelDraftChargeError(
            "charge_not_draft",
            "This charge posted before it could be cancelled. Use a correction or a reversal instead.",
        );
    }

    const { data: reductions, error: reductionReadError } = await supabase
        .from("charges")
        .select("id, metadata")
        .eq("org_id", args.orgId)
        .eq("source_charge_id", args.chargeId)
        .eq("status", "draft");
    if (reductionReadError) throw new CancelDraftChargeError("db_error", reductionReadError.message);
    let withdrawn = 0;
    for (const r of (reductions ?? []) as Array<{ id: string; metadata: Record<string, unknown> | null }>) {
        const { error: rErr } = await supabase
            .from("charges")
            .update({
                status: "void",
                voided_at: at,
                updated_by: args.actorUserId,
                metadata: { ...(r.metadata ?? {}), retirement: { ...retirement, reason: "source_draft_cancelled", source_charge_id: args.chargeId } },
            })
            .eq("org_id", args.orgId)
            .eq("id", r.id)
            .eq("status", "draft");
        if (rErr) throw new CancelDraftChargeError("db_error", rErr.message);
        withdrawn += 1;
    }

    return { chargeId: args.chargeId, status: "void", alreadyCancelled: false, withdrawnReductions: withdrawn };
}
