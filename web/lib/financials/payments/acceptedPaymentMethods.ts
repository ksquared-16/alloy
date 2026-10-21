/**
 * WHICH PAYMENT METHODS THIS ORGANIZATION ACCEPTS (W7-F047).
 *
 * A payment method is three facts an operator configures in one place — Organization → Financials
 * → Payments:
 *
 *   ACCEPTED      whether staff may take or record money this way at all (this module);
 *   PROCESSOR     for card and bank, whether the connected provider (Stripe) can collect it — the
 *                 provider's own readiness, never a setting here;
 *   DESTINATION   the asset account the money lands in — `gl_account_mappings` under the method's
 *                 `receipts_*` key, stamped on each receipt as it arrives (W7-F042).
 *
 * Acceptance is policy over FUTURE intake only. It lives in `org_settings.metadata` (the existing
 * per-organization configuration record) as the list of methods turned OFF, so a method the
 * platform adds later is accepted until someone decides otherwise, and an organization that never
 * opened this screen accepts everything it always did. Turning a method off changes no payment
 * already received, relabels nothing and posts nothing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { PAYMENT_METHOD_GL_MAPPING_KEY, PAYMENT_METHOD_LABELS } from "@/lib/financials/payments/paymentLedgerFacts";

/** The methods staff take or record from the Payment command, in the order the chooser lists them. */
export const OPERATOR_PAYMENT_METHODS = ["card", "ach", "cash", "check", "money_order", "manual", "other"] as const;
export type OperatorPaymentMethod = (typeof OPERATOR_PAYMENT_METHODS)[number];

/** Card and bank are collected THROUGH the provider; the rest record money that already arrived. */
export const PROCESSOR_METHODS: ReadonlySet<string> = new Set(["card", "ach"]);

export const ACCEPTED_METHODS_METADATA_KEY = "financials_payment_methods";

export function isOperatorPaymentMethod(v: unknown): v is OperatorPaymentMethod {
    return typeof v === "string" && (OPERATOR_PAYMENT_METHODS as readonly string[]).includes(v);
}

/** The disabled list, read defensively: anything unrecognised is ignored, never trusted. */
export function disabledMethodsFrom(metadata: unknown): Set<OperatorPaymentMethod> {
    const bag = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>)[ACCEPTED_METHODS_METADATA_KEY] : null;
    const list = bag && typeof bag === "object" ? (bag as Record<string, unknown>).disabled : null;
    return new Set(Array.isArray(list) ? list.filter(isOperatorPaymentMethod) : []);
}

/**
 * The methods turned off for an organization. A failed read is "none turned off" — the server-side
 * refusal is a policy courtesy, and failing closed here would stop a front desk taking cash because
 * a settings row could not be read.
 */
export async function readDisabledPaymentMethods(supabase: SupabaseClient, orgId: string): Promise<Set<OperatorPaymentMethod>> {
    try {
        const { data } = await supabase.from("org_settings").select("metadata").eq("org_id", orgId).maybeSingle();
        return disabledMethodsFrom((data as { metadata?: unknown } | null)?.metadata);
    } catch {
        return new Set();
    }
}

/** Turn one method on or off, preserving every other key in the organization's metadata. */
export async function setPaymentMethodAccepted(
    supabase: SupabaseClient,
    orgId: string,
    method: OperatorPaymentMethod,
    accepted: boolean,
): Promise<Set<OperatorPaymentMethod>> {
    const { data, error } = await supabase.from("org_settings").select("metadata").eq("org_id", orgId).maybeSingle();
    if (error) throw new Error(error.message);
    const raw = (data as { metadata?: unknown } | null)?.metadata;
    const metadata: Record<string, unknown> = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
    const disabled = disabledMethodsFrom(metadata);
    if (accepted) disabled.delete(method);
    else disabled.add(method);
    const prior = metadata[ACCEPTED_METHODS_METADATA_KEY];
    metadata[ACCEPTED_METHODS_METADATA_KEY] = {
        ...(prior && typeof prior === "object" ? (prior as Record<string, unknown>) : {}),
        disabled: OPERATOR_PAYMENT_METHODS.filter((m) => disabled.has(m)),
    };
    const { error: writeError } = await supabase.from("org_settings").upsert({ org_id: orgId, metadata }, { onConflict: "org_id" });
    if (writeError) throw new Error(writeError.message);
    return disabled;
}

/** The refusal a writer returns when a method is turned off. */
export function methodNotAcceptedMessage(method: string): string {
    const label = PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS] ?? method;
    return `${label} is turned off for this organization (Organization → Financials → Payments).`;
}

export { PAYMENT_METHOD_GL_MAPPING_KEY, PAYMENT_METHOD_LABELS };
