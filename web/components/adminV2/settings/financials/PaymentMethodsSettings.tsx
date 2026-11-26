"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AlloySelect } from "@/components/workspace/AlloySelect";

/**
 * PAYMENT METHODS — ONE ROW PER WAY MONEY ARRIVES (W7-F047).
 *
 * Each row states the three facts an operator configures about a method, side by side:
 *
 *   Accepted      may staff take or record money this way (`/api/admin/financials/accepted-payment-methods`);
 *   Processor     card and bank are collected through Stripe, so the provider's readiness — shown
 *                 above this table — decides whether they can actually collect; the rest are
 *                 recorded by staff and need no processor;
 *   Destination   the ASSET account the money lands in (`/api/admin/financials/gl-mappings`, which
 *                 refuses any other account type). Each payment records the destination in force
 *                 when it arrives, so changing it never relabels history.
 *
 * It lives in the Payments chapter, beside the processor it depends on, rather than as an
 * Accounting tool: "how do we take money" is one question, and the destination is part of its
 * answer. Accounting keeps the chart of accounts and where CHARGES post.
 */

type MethodRow = { method: string; label: string; accepted: boolean; processor: "stripe" | null; mappingKey: string };
type GlAccount = { id: string; code: string; name: string; type: string; is_active: boolean };
type MappingRow = { mappingKey: string; glAccountId: string | null; group?: "charge" | "payment" };

const HINTS: Record<string, string> = {
    card: "Collected through Stripe — a card on file, or a new card entered in Stripe's own fields",
    ach: "Bank-account debits collected through Stripe",
    cash: "Cash received at the front desk",
    check: "Paper checks — the check number is recorded",
    money_order: "Money orders received",
    manual: "Paid outside Alloy and recorded here",
    other: "Anything else, recorded by staff",
};

export default function PaymentMethodsSettings({
    providerConnected,
    cardAvailable,
    bankAvailable,
}: {
    providerConnected: boolean;
    cardAvailable: boolean;
    bankAvailable: boolean;
}) {
    const [methods, setMethods] = useState<MethodRow[]>([]);
    const [accounts, setAccounts] = useState<GlAccount[]>([]);
    const [mappings, setMappings] = useState<MappingRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [m, g] = await Promise.all([
                fetch("/api/admin/financials/accepted-payment-methods", { cache: "no-store", credentials: "include" }),
                fetch("/api/admin/financials/gl-mappings", { cache: "no-store", credentials: "include" }),
            ]);
            const mj = (await m.json()) as { methods?: MethodRow[]; error?: string };
            const gj = (await g.json()) as { accounts?: GlAccount[]; mappings?: MappingRow[]; error?: string };
            if (!m.ok) throw new Error(mj.error || "Payment methods could not be read.");
            if (!g.ok) throw new Error(gj.error || "Payment destinations could not be read.");
            setMethods(mj.methods ?? []);
            setAccounts((gj.accounts ?? []).filter((a) => a.is_active && a.type === "asset"));
            setMappings((gj.mappings ?? []).filter((r) => r.group === "payment"));
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Payment methods could not be read.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const destinationOptions = useMemo(
        () => accounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
        [accounts],
    );
    const destinationOf = (key: string) => mappings.find((r) => r.mappingKey === key)?.glAccountId ?? "";

    const setAccepted = async (method: string, accepted: boolean) => {
        setSaving(`accepted:${method}`);
        try {
            const res = await fetch("/api/admin/financials/accepted-payment-methods", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ method, accepted }),
            });
            const json = (await res.json()) as { accepted?: boolean; error?: string };
            if (!res.ok) throw new Error(json.error || "The setting could not be saved.");
            setMethods((rows) => rows.map((r) => (r.method === method ? { ...r, accepted: Boolean(json.accepted) } : r)));
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "The setting could not be saved.");
        } finally {
            setSaving(null);
        }
    };

    const setDestination = async (mappingKey: string, glAccountId: string) => {
        setSaving(`destination:${mappingKey}`);
        try {
            const res = await fetch("/api/admin/financials/gl-mappings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ mappingKey, glAccountId }),
            });
            const json = (await res.json()) as { error?: string };
            if (!res.ok) throw new Error(json.error || "The destination could not be saved.");
            setMappings((rows) => rows.map((r) => (r.mappingKey === mappingKey ? { ...r, glAccountId: glAccountId || null } : r)));
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "The destination could not be saved.");
        } finally {
            setSaving(null);
        }
    };

    const processorState = (row: MethodRow): { text: string; tone: "ready" | "attention" | "none" } => {
        if (!row.processor) return { text: "Recorded by staff — no processor", tone: "none" };
        if (!providerConnected) return { text: "Stripe · not connected", tone: "attention" };
        const available = row.method === "ach" ? bankAvailable : cardAvailable;
        return available ? { text: "Stripe · ready", tone: "ready" } : { text: "Stripe · not enabled for this account", tone: "attention" };
    };

    return (
        <section className="rounded-xl border border-alloy-stone/25 bg-white p-4" data-testid="payment-methods-settings">
            <header>
                <h3 className="text-[15px] font-semibold text-alloy-midnight">Payment methods</h3>
                <p className="mt-0.5 text-[12px] text-alloy-midnight/60">
                    Which ways of paying staff can use, whether a processor collects them, and the asset account each
                    one lands in. Each payment records the destination in force when it arrives — changing it later
                    never relabels past payments, and payments from before destinations were set stay Unmapped.
                </p>
            </header>
            {error ? (
                <p className="mt-3 text-[12px] text-alloy-ember" role="alert" data-testid="payment-methods-error">{error}</p>
            ) : null}
            {loading ? (
                <p className="mt-3 text-[12px] text-alloy-midnight/50">Reading payment methods…</p>
            ) : (
                <>
                    <div className="mt-3 hidden grid-cols-[minmax(0,1.6fr)_7rem_minmax(0,1.2fr)_16rem] gap-3 border-b border-alloy-stone/15 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-alloy-midnight/45 md:grid">
                        <span>Method</span>
                        <span>Accepted</span>
                        <span>Processor</span>
                        <span>Destination account</span>
                    </div>
                    <ul className="divide-y divide-alloy-stone/12" data-testid="payment-methods-list">
                        {methods.map((row) => {
                            const proc = processorState(row);
                            const destination = destinationOf(row.mappingKey);
                            return (
                                <li
                                    key={row.method}
                                    className="grid grid-cols-1 items-center gap-2 py-2 md:grid-cols-[minmax(0,1.6fr)_7rem_minmax(0,1.2fr)_16rem] md:gap-3"
                                    data-testid={`payment-method-row-${row.method}`}
                                    data-payment-method-accepted={row.accepted ? "true" : "false"}
                                    data-payment-method-destination={destination ? "mapped" : "unmapped"}
                                >
                                    <span className="min-w-0">
                                        <span className="block text-[13px] font-medium text-alloy-midnight">{row.label}</span>
                                        <span className="block text-[11.5px] text-alloy-midnight/55">{HINTS[row.method] ?? ""}</span>
                                    </span>
                                    <label className="inline-flex items-center gap-2 text-[12px] text-alloy-midnight/75">
                                        <input
                                            type="checkbox"
                                            role="switch"
                                            checked={row.accepted}
                                            aria-label={`Accept ${row.label}`}
                                            data-testid={`payment-method-accepted-${row.method}`}
                                            disabled={saving === `accepted:${row.method}`}
                                            onChange={(e) => void setAccepted(row.method, e.target.checked)}
                                        />
                                        {row.accepted ? "On" : "Off"}
                                    </label>
                                    <span
                                        className={`text-[12px] ${proc.tone === "ready" ? "text-alloy-bend-pine" : proc.tone === "attention" ? "text-amber-700" : "text-alloy-midnight/55"}`}
                                        data-testid={`payment-method-processor-${row.method}`}
                                    >
                                        {proc.text}
                                    </span>
                                    <span className="w-full md:w-[16rem]">
                                        {destinationOptions.length ? (
                                            <AlloySelect
                                                value={destination}
                                                onChange={(v) => void setDestination(row.mappingKey, v)}
                                                options={destinationOptions}
                                                placeholder="Unmapped"
                                                density="compact"
                                                aria-label={`Destination account for ${row.label}`}
                                                testId={`payment-method-destination-${row.method}`}
                                                disabled={saving === `destination:${row.mappingKey}`}
                                            />
                                        ) : (
                                            <span className="text-[12px] text-amber-700">Unmapped</span>
                                        )}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                    {!destinationOptions.length ? (
                        <p className="mt-2 text-[12px] text-alloy-midnight/60" data-testid="payment-methods-no-asset-accounts">
                            No asset accounts exist yet. Add accounts of type Asset — for example Cash on hand, Undeposited
                            funds, Stripe clearing — in Accounting → GL Codes, then choose where each method lands.
                        </p>
                    ) : null}
                </>
            )}
        </section>
    );
}
