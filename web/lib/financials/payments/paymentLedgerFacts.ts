/**
 * WHO PAID, BY WHAT, AND INTO WHICH ACCOUNT — a payment's ledger facts (W7-F032).
 *
 * ── THE PAYER IS THE PAYMENT'S OWN RECORD ──────────────────────────────────────────────────────
 *
 * `payments.payer_entity_type / payer_entity_id` is the canonical payer: one per payment row, set by
 * `payment.record` and by provider recognition from the collection attempt's payer. There is no
 * multi-payer receipt — several payers are several payment rows, each its own ledger row. The ledger
 * used to print the HOUSEHOLD (`customers.name`) in this place, which is the account the money was
 * taken against, not who paid it. Where a receipt names no payer, the household is still the honest
 * answer and is labelled as such.
 *
 * ── THE CARD IS THE COLLECTION'S, NOT THE RECEIPT'S ───────────────────────────────────────────
 *
 * A card or bank receipt collected through Alloy is reached from its collection attempt
 * (`canonical_payment_id`) and that attempt's stored method (`display_brand`, `display_last4`). A
 * card payment RECORDED by hand never went through a collection and has no card details; it reads
 * as its method alone rather than inventing a brand.
 *
 * ── THE ACCOUNT IS THE TENANT'S MAPPING, PER TENDER ────────────────────────────────────────────
 *
 * Settlement is a different accounting fact from revenue: a $75 card receipt is not "Registration
 * Fees". Each payment method has a mapping key (`PAYMENT_METHOD_GL_MAPPING_KEY`) resolved through
 * the same `gl_account_mappings` table charge categories use, and configured on the same
 * Accounting → GL mappings panel. Unmapped is a real state and reads as one. This RESOLVES for
 * display; it writes nothing and posts nothing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Every `payments.payment_method` the schema allows, and the account key that settles it. */
export const PAYMENT_METHOD_GL_MAPPING_KEY = {
    card: "receipts_card",
    ach: "receipts_ach",
    cash: "receipts_cash",
    check: "receipts_check",
    money_order: "receipts_money_order",
    manual: "receipts_manual",
    subsidy: "receipts_subsidy",
    other: "receipts_other",
} as const satisfies Record<string, string>;

export type PaymentMethodKey = keyof typeof PAYMENT_METHOD_GL_MAPPING_KEY;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodKey, string> = {
    card: "Card",
    ach: "Bank transfer",
    cash: "Cash",
    check: "Check",
    money_order: "Money order",
    manual: "Manual",
    subsidy: "Subsidy",
    other: "Other",
};

export function paymentGlMappingKey(method: string | null | undefined): string | null {
    const m = (method ?? "").trim() as PaymentMethodKey;
    return PAYMENT_METHOD_GL_MAPPING_KEY[m] ?? null;
}

export type PaymentLedgerFacts = {
    /** The paying person's name, or null when the receipt names no person. */
    payerName: string | null;
    payerKind: "person" | "agency" | null;
    /** "Visa •••• 4242" for a collected card or bank method; null when there is none. */
    methodDisplay: string | null;
};

const text = (v: unknown) => (v == null ? "" : String(v).trim());

/**
 * Two reads, both keyed by the HOUSEHOLD the request names — so they go out with the card's first
 * wave instead of waiting for payment ids (the card build is held to one wave; see
 * cardBuildRoundDepth). The household's receipts come with their collection attempt and stored
 * method embedded through foreign keys; payer names come from the household's own contacts. A payer
 * who is not one of this household's contacts reads as the household. A failed read is an absence.
 */
export async function readPaymentLedgerFacts(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string | null,
): Promise<Map<string, PaymentLedgerFacts>> {
    const out = new Map<string, PaymentLedgerFacts>();
    if (!orgId || !customerId) return out;
    try {
        const [paymentsRes, contactsRes] = await Promise.all([
            supabase
                .from("payments")
                .select(
                    "id, payer_entity_type, payer_entity_id, "
                    + "payment_collection_attempts!canonical_payment_id(payment_methods!payment_method_id(display_brand, display_last4))",
                )
                .eq("org_id", orgId)
                .eq("customer_id", customerId),
            supabase
                .from("customer_persons")
                .select("person_id, persons(first_name, last_name)")
                .eq("org_id", orgId)
                .eq("customer_id", customerId),
        ]);
        const personName = new Map<string, string>();
        for (const c of (contactsRes.data ?? []) as unknown as Array<Record<string, unknown>>) {
            const p = (Array.isArray(c.persons) ? c.persons[0] : c.persons) as Record<string, unknown> | null;
            const name = p ? [text(p.first_name), text(p.last_name)].filter(Boolean).join(" ") : "";
            if (text(c.person_id) && name) personName.set(text(c.person_id), name);
        }
        for (const p of (paymentsRes.data ?? []) as unknown as Array<Record<string, unknown>>) {
            const attempts = (Array.isArray(p.payment_collection_attempts) ? p.payment_collection_attempts : p.payment_collection_attempts ? [p.payment_collection_attempts] : []) as Array<Record<string, unknown>>;
            const method = attempts
                .map((a) => (Array.isArray(a.payment_methods) ? a.payment_methods[0] : a.payment_methods) as Record<string, unknown> | null)
                .find(Boolean) ?? null;
            const brand = method ? text(method.display_brand) : "";
            const last4 = method ? text(method.display_last4) : "";
            const kind = text(p.payer_entity_type);
            out.set(text(p.id), {
                payerName: kind === "person" ? personName.get(text(p.payer_entity_id)) ?? null : null,
                payerKind: kind === "person" ? "person" : kind === "agency" ? "agency" : null,
                methodDisplay:
                    brand && last4 ? `${brand.charAt(0).toUpperCase()}${brand.slice(1)} •••• ${last4}`
                    : last4 ? `•••• ${last4}`
                    : brand || null,
            });
        }
    } catch {
        /* An unread fact is unknown; the ledger falls back to the household and the method word. */
    }
    return out;
}
