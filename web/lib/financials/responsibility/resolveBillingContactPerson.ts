/**
 * WHO the billing contact is, as one canonical person.
 *
 * ## Why this lives in Financials
 *
 * "Billing contact" is not a relationship role. There are five relationship definitions and none is
 * billing; the string `billing_contact` appears in the settings surfaces as a SECTION mapped to a
 * role key nothing writes. What IS canonical is financial responsibility:
 * `financial_responsibility_arrangements` → `financial_responsibility_shares`, where
 * `responsible_party_type` is CHECK-constrained to `'person'` and `responsible_party_id` is a real
 * FK into `persons`.
 *
 * So the question has an answer, and this is where it belongs. A consumer — Forms, a document, a
 * letter — asks for a person and never touches a responsibility table itself.
 *
 * ## Determinism, and refusing to guess
 *
 * The governing arrangement comes from `readArrangementInForce`, which already applies the
 * most-specific-wins and dating rules, so this adds no policy of its own about WHICH arrangement.
 * Within one arrangement it uses `priority` — the column the schema describes as "the order the
 * certification can rely on" — and a single lowest priority is the answer.
 *
 * Two parties tied at the lowest priority is genuinely ambiguous. An arrangement can legitimately
 * split a charge between two guardians with equal standing, and nothing in the model says which of
 * them receives post. That returns `ambiguous` with both candidates rather than picking the first
 * row, because picking would put a billing-contact policy in a resolver that was never given one.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { readArrangementInForce } from "@/lib/financials/responsibility/responsibilityService";

export type BillingContactResolution =
    /** Exactly one person is responsible, or one sits alone at the lowest priority. */
    | { readonly kind: "resolved"; readonly personId: string; readonly arrangementId: string; readonly basis: "sole_share" | "lowest_priority" }
    /** No arrangement governs this household, or it names nobody. */
    | { readonly kind: "none"; readonly reason: "no_arrangement" | "no_shares" }
    /** Two or more parties share the lowest priority; the model does not say which receives post. */
    | { readonly kind: "ambiguous"; readonly arrangementId: string; readonly candidatePersonIds: readonly string[] }
    /** The responsibility model could not be read. Never treated as "nobody". */
    | { readonly kind: "unavailable"; readonly detail: string };

export async function resolveBillingContactPerson(
    supabase: SupabaseClient,
    args: {
        readonly orgId: string;
        readonly customerId: string;
        readonly customerMemberId?: string | null;
        /** ISO date the arrangement must be in force on. Defaults to today. */
        readonly onDate?: string;
    },
): Promise<BillingContactResolution> {
    const onDate = args.onDate ?? new Date().toISOString().slice(0, 10);
    let arrangement;
    try {
        arrangement = await readArrangementInForce(supabase, {
            orgId: args.orgId,
            customerId: args.customerId,
            customerMemberId: args.customerMemberId ?? null,
            onDate,
        });
    } catch (e) {
        return { kind: "unavailable", detail: e instanceof Error ? e.message : "responsibility read failed" };
    }
    if (!arrangement) return { kind: "none", reason: "no_arrangement" };
    if (!arrangement.shares.length) return { kind: "none", reason: "no_shares" };

    if (arrangement.shares.length === 1) {
        return {
            kind: "resolved",
            personId: arrangement.shares[0]!.responsiblePartyId,
            arrangementId: arrangement.id,
            basis: "sole_share",
        };
    }

    const lowest = Math.min(...arrangement.shares.map((s) => s.priority));
    const atLowest = arrangement.shares.filter((s) => s.priority === lowest);
    if (atLowest.length > 1) {
        return {
            kind: "ambiguous",
            arrangementId: arrangement.id,
            // Stable order, so a caller logging this twice logs the same thing.
            candidatePersonIds: [...atLowest.map((s) => s.responsiblePartyId)].sort(),
        };
    }
    return {
        kind: "resolved",
        personId: atLowest[0]!.responsiblePartyId,
        arrangementId: arrangement.id,
        basis: "lowest_priority",
    };
}
