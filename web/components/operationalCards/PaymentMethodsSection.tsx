"use client";

/**
 * PAYMENT METHODS — what this family can be collected from, and what an operator may do about it.
 *
 * Lives inside Focus Panel → Financials → Details, beside the ledger, because administering a
 * family's stored instruments is part of looking after their account. There is deliberately no
 * Payment Methods workspace: a standalone surface would make this a product rather than a property
 * of an account, and an operator would have to leave the family to change their card.
 *
 * ── OPERATOR LANGUAGE, NOT PROVIDER LANGUAGE ──
 *
 * "Visa •••• 4242", "Expires 08/29", "Bank account •••• 6789", "Verification required". The words
 * `PaymentMethod`, `SetupIntent`, `us_bank_account`, `Financial Connections`, `mandate` and `pm_`
 * are the adapter's, and nobody running a childcare business should need to learn them.
 *
 * ── AN INTENTIONAL SURFACE, NOT AN EDITABLE FORM ──
 *
 * Methods are not fields. There is nothing here to type into and nothing that saves as you go: each
 * act is a named command with a consequence, and removal asks first. Everything rendered comes from
 * the server's canonical answer — this component decides nothing about whether a method may be used.
 */

import { useCallback, useEffect, useState } from "react";
import { CreditCard, Landmark, Plus, RefreshCw } from "lucide-react";

import { executePaymentMethodCommand } from "@/lib/financials/payments/paymentMethodCommands";

export type StoredMethod = {
    id: string;
    rail: "card" | "ach";
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
    verificationState: "unverified" | "pending" | "verified" | "failed";
    usabilityState: "usable" | "blocked" | "expired" | "revoked";
    isDefault: boolean;
    revokedAt: string | null;
};

/**
 * The one line under a method that says what it is — never what Stripe calls it.
 *
 * A card names its brand; a bank account names the bank. Both end in the last four, which is the
 * thing a parent will say on the phone.
 */
export function methodLabel(m: StoredMethod): string {
    const name = m.brand?.trim() || (m.rail === "ach" ? "Bank account" : "Card");
    const tail = m.last4 ? ` •••• ${m.last4}` : "";
    return `${name}${tail}`;
}

/**
 * THE SIX STATES A STORED METHOD CAN BE IN, as an operator would say them.
 *
 * `Verification required` is the one that earns its place: the family HAS given their bank details
 * and a deposit is in the post, which is a different situation from having done nothing and from
 * anything being wrong.
 */
export function methodState(m: StoredMethod): { label: string; tone: "ready" | "attention" | "muted" } {
    if (m.usabilityState === "revoked") return { label: "Removed", tone: "muted" };
    if (m.usabilityState === "expired") return { label: "Expired", tone: "attention" };
    if (m.verificationState === "pending") return { label: "Verification required", tone: "attention" };
    if (m.usabilityState === "blocked") return { label: "Needs attention", tone: "attention" };
    if (m.isDefault) return { label: "Default", tone: "ready" };
    return { label: "Ready", tone: "ready" };
}

export function expiryLine(m: StoredMethod): string | null {
    if (m.rail !== "card" || !m.expMonth || !m.expYear) return null;
    return `Expires ${String(m.expMonth).padStart(2, "0")}/${String(m.expYear).slice(-2)}`;
}

export default function PaymentMethodsSection({
    customerId,
    payerEntityId,
    payerName,
    payerEmail,
    canManage = true,
}: {
    customerId: string;
    /** Who the instrument belongs to. Ownership, not responsibility — see the service. */
    payerEntityId?: string | null;
    payerName?: string | null;
    payerEmail?: string | null;
    /** False hides the controls. The server refuses regardless; this only avoids offering them. */
    canManage?: boolean;
}) {
    const [methods, setMethods] = useState<StoredMethod[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!customerId) return;
        try {
            const res = await fetch(
                `/api/admin/financials/payment-methods?customer_id=${encodeURIComponent(customerId)}`,
                { credentials: "include" },
            );
            const json = (await res.json()) as { ok?: boolean; methods?: StoredMethod[]; error?: string };
            if (!res.ok || json.ok === false) {
                setError(json.error || "Payment methods could not be read.");
                setMethods([]);
                return;
            }
            setError(null);
            setMethods(json.methods ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Payment methods could not be read.");
            setMethods([]);
        }
    }, [customerId]);

    useEffect(() => {
        void load();
    }, [load]);

    const run = useCallback(
        async (key: string, command: "add" | "setDefault" | "revoke", payload: Record<string, unknown>) => {
            setBusy(key);
            setError(null);
            const out = await executePaymentMethodCommand(command, payload);
            if (!out.ok) setError(out.error);
            await load();
            setBusy(null);
            return out;
        },
        [load],
    );

    /*
     * ADDING opens the provider's own collection. This begins it; the provider's browser component
     * takes over from the client secret, and the canonical row is written only when the server has
     * read the provider back. Nothing is stored because somebody clicked here.
     */
    const startAdd = useCallback(
        async (rail: "card" | "ach") => {
            const out = await run(`add:${rail}`, "add", {
                stage: "begin",
                customer_id: customerId,
                rail,
                payer_entity_id: payerEntityId ?? "",
                payer_name: payerName ?? "",
                payer_email: payerEmail ?? "",
            });
            if (out.ok) {
                const disclosure = out.detail.authorization_disclosure;
                if (typeof disclosure === "string" && disclosure) {
                    /* Rendered to the payer before they authorize — Stripe requires it for cloning. */
                    setPendingDisclosure(disclosure);
                }
            }
        },
        [customerId, payerEntityId, payerName, payerEmail, run],
    );

    const [pendingDisclosure, setPendingDisclosure] = useState<string | null>(null);

    const live = (methods ?? []).filter((m) => m.usabilityState !== "revoked");
    const removed = (methods ?? []).filter((m) => m.usabilityState === "revoked");

    return (
        <div className="space-y-3" data-testid="payment-methods-section" data-method-count={live.length}>
            <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/60">
                    Payment methods
                </h4>
                {canManage ? (
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            data-testid="payment-method-add-card"
                            disabled={busy !== null}
                            onClick={() => void startAdd("card")}
                            className="inline-flex items-center gap-1 rounded-md border border-alloy-stone/40 px-2 py-1 text-xs text-alloy-midnight/80 hover:bg-alloy-cloud/50 disabled:opacity-50"
                        >
                            <Plus className="h-3 w-3" strokeWidth={2} /> Add card
                        </button>
                        <button
                            type="button"
                            data-testid="payment-method-add-bank"
                            disabled={busy !== null}
                            onClick={() => void startAdd("ach")}
                            className="inline-flex items-center gap-1 rounded-md border border-alloy-stone/40 px-2 py-1 text-xs text-alloy-midnight/80 hover:bg-alloy-cloud/50 disabled:opacity-50"
                        >
                            <Plus className="h-3 w-3" strokeWidth={2} /> Add bank account
                        </button>
                    </div>
                ) : null}
            </div>

            {error ? (
                <p
                    data-testid="payment-methods-error"
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                >
                    {error}
                </p>
            ) : null}

            {pendingDisclosure ? (
                <p
                    data-testid="payment-methods-authorization"
                    className="rounded-lg border border-alloy-stone/30 bg-alloy-cloud/40 px-3 py-2 text-xs text-alloy-midnight/75"
                >
                    {pendingDisclosure}
                </p>
            ) : null}

            {methods === null ? (
                <p className="flex items-center gap-2 text-sm text-alloy-midnight/55">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> Reading payment methods…
                </p>
            ) : live.length === 0 ? (
                <p data-testid="payment-methods-empty" className="text-sm text-alloy-midnight/65">
                    No payment method on file.
                </p>
            ) : (
                <ul className="space-y-2">
                    {live.map((m) => {
                        const state = methodState(m);
                        const expiry = expiryLine(m);
                        return (
                            <li
                                key={m.id}
                                data-testid="payment-method-row"
                                data-method-rail={m.rail}
                                data-method-state={state.label}
                                data-method-default={m.isDefault ? "true" : "false"}
                                className="flex items-start justify-between gap-3 rounded-lg border border-alloy-stone/30 px-3 py-2"
                            >
                                <div className="flex min-w-0 items-start gap-2">
                                    {m.rail === "ach" ? (
                                        <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-alloy-midnight/55" strokeWidth={1.75} />
                                    ) : (
                                        <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-alloy-midnight/55" strokeWidth={1.75} />
                                    )}
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-alloy-midnight">{methodLabel(m)}</p>
                                        {expiry ? <p className="text-xs text-alloy-midnight/55">{expiry}</p> : null}
                                        <p
                                            data-testid="payment-method-state"
                                            className={
                                                state.tone === "attention"
                                                    ? "text-xs text-amber-700"
                                                    : state.tone === "muted"
                                                        ? "text-xs text-alloy-midnight/45"
                                                        : "text-xs text-emerald-700"
                                            }
                                        >
                                            {state.label}
                                        </p>
                                    </div>
                                </div>

                                {canManage ? (
                                    <div className="flex shrink-0 items-center gap-2">
                                        {/* Offered only when it would do something: a default cannot be set twice. */}
                                        {!m.isDefault && m.usabilityState === "usable" ? (
                                            <button
                                                type="button"
                                                data-testid="payment-method-set-default"
                                                disabled={busy !== null}
                                                onClick={() => void run(`default:${m.id}`, "setDefault", { payment_method_id: m.id })}
                                                className="rounded-md border border-alloy-stone/40 px-2 py-1 text-xs text-alloy-midnight/80 hover:bg-alloy-cloud/50 disabled:opacity-50"
                                            >
                                                Set as default
                                            </button>
                                        ) : null}
                                        <button
                                            type="button"
                                            data-testid="payment-method-remove"
                                            disabled={busy !== null}
                                            onClick={() => {
                                                /* Removal is not undone by adding the card again. */
                                                if (!window.confirm(`Remove ${methodLabel(m)}? Payments already made with it keep naming it.`)) return;
                                                void run(`revoke:${m.id}`, "revoke", { payment_method_id: m.id });
                                            }}
                                            className="rounded-md border border-alloy-stone/40 px-2 py-1 text-xs text-alloy-midnight/70 hover:bg-red-50 hover:text-red-800 disabled:opacity-50"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}

            {removed.length ? (
                <p data-testid="payment-methods-removed" className="text-xs text-alloy-midnight/45">
                    {removed.length === 1
                        ? "1 removed method is kept for payment history."
                        : `${removed.length} removed methods are kept for payment history.`}
                </p>
            ) : null}
        </div>
    );
}
