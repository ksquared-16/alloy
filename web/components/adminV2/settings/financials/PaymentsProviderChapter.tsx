"use client";

/**
 * PAYMENTS — can this organization accept payments, what can it accept, and does anything need
 * attention.
 *
 * Three questions, in that order, because that is the order an operator asks them. Everything on
 * this surface is derived from the canonical Provider Merchant through the server; nothing about
 * provider state is decided, cached or inferred in React. A second provider-state cache here would
 * be a second answer to whether a family can be charged.
 *
 * ── OPERATOR LANGUAGE, NOT PROVIDER LANGUAGE ──
 *
 * "Connect payment provider", "Finish setup", "Card payments", "Bank payments". The words
 * `Account`, `Account Link`, `capability`, `PaymentIntent` and `acct_` are the adapter's, and an
 * operator should never need to learn them to run a childcare business. The account reference is
 * shown once, quietly, because it is genuinely useful when somebody is on the phone to support.
 *
 * ── AND NO CONTROL THAT OPENS ONTO NOTHING ──
 *
 * Every button here maps to a registered action the caller may actually execute. When the provider
 * is ready there is nothing to connect, so no Connect button is offered.
 */

import { useCallback, useEffect, useState } from "react";
import { Banknote, CreditCard, Landmark, RefreshCw } from "lucide-react";

import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { executeProviderCommand } from "@/lib/financials/payments/providerCommands";

type ProviderState = {
    connected: boolean;
    processor: string | null;
    readiness: string;
    achReadiness: string | null;
    cardAvailable: boolean;
    bankAvailable: boolean;
    readinessCheckedAt: string | null;
    attention: string | null;
    providerAccountRef: string | null;
    merchantId: string | null;
};

/** The six states the chapter must be able to say out loud. */
function headline(state: ProviderState | null): { label: string; tone: "neutral" | "attention" | "ready" } {
    if (!state || !state.connected) return { label: "Not connected", tone: "neutral" };
    if (state.readiness === "ready") {
        return state.bankAvailable
            ? { label: "Ready — card and bank payments", tone: "ready" }
            : { label: "Ready — card payments", tone: "ready" };
    }
    if (state.readiness === "restricted") return { label: "Needs attention", tone: "attention" };
    return { label: "Setup in progress", tone: "attention" };
}

function railLabel(available: boolean, connected: boolean): string {
    if (!connected) return "Unavailable";
    return available ? "Available" : "Unavailable";
}

function when(iso: string | null): string {
    if (!iso) return "Never";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "Never" : d.toLocaleString();
}

export default function PaymentsProviderChapter({ organizationName }: { organizationName?: string | null }) {
    const [state, setState] = useState<ProviderState | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/financials/provider", { credentials: "include" });
            const json = (await res.json()) as { ok?: boolean; state?: ProviderState; error?: string };
            if (!res.ok || !json.state) {
                setError(json.error || "The payment provider state could not be read.");
                setState(null);
            } else {
                setError(null);
                setState(json.state);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "The payment provider state could not be read.");
        } finally {
            setLoading(false);
        }
    }, []);

    /*
     * RETURNING FROM THE PROVIDER PROVES NOTHING — the operator may have saved for later. So the
     * arrival back on this chapter asks the provider what is actually true, rather than assuming the
     * redirect means success.
     */
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const returned = params.get("provider");
        if (returned === "returned" || returned === "retry") {
            setNotice(
                returned === "retry"
                    ? "That setup link had expired. Continue setup to get a new one."
                    : "Checking with the payment provider…",
            );
            void executeProviderCommand("refresh").then(() => void load());
            return;
        }
        void load();
    }, [load]);

    const run = useCallback(
        async (command: "connect" | "refresh" | "disconnect", payload: Record<string, unknown> = {}) => {
            setBusy(command);
            setError(null);
            setNotice(null);
            const result = await executeProviderCommand(command, payload);
            if (!result.ok) {
                setError(result.error);
                setBusy(null);
                await load();
                return;
            }
            const url = typeof result.detail.onboarding_url === "string" ? result.detail.onboarding_url : "";
            if (url) {
                // The provider's own flow, in its own page. Alloy never renders it.
                window.location.assign(url);
                return;
            }
            if (command === "disconnect") {
                setNotice("Disconnected. Payments already received are unchanged.");
            }
            setBusy(null);
            await load();
        },
        [load],
    );

    const status = headline(state);
    const connected = Boolean(state?.connected);
    const ready = state?.readiness === "ready";

    return (
        <ConfigWorkspaceCard
            title="Payments"
            description="Connect a payment provider so this organization can accept card and bank payments."
            testId="financials-chapter-payments"
        >
            <div className="space-y-4 py-1" data-testid="payments-provider-chapter" data-provider-connected={connected}>
                {error ? (
                    <p
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                        role="alert"
                        data-testid="payments-provider-error"
                    >
                        {error}
                    </p>
                ) : null}
                {notice ? (
                    <p className="rounded-lg border border-alloy-stone/30 bg-alloy-cloud/40 px-3 py-2 text-sm text-alloy-midnight/75">
                        {notice}
                    </p>
                ) : null}

                {/* ── CAN WE ACCEPT PAYMENTS? ───────────────────────────────────────────────── */}
                <div className="flex items-start gap-3">
                    <Banknote className="mt-0.5 h-5 w-5 shrink-0 text-alloy-midnight/60" strokeWidth={1.75} />
                    <div className="min-w-0">
                        <p
                            className="text-sm font-semibold text-alloy-midnight"
                            data-testid="payments-provider-status"
                            data-provider-readiness={state?.readiness ?? "not_connected"}
                        >
                            {loading ? "Checking…" : status.label}
                        </p>
                        <p className="text-sm text-alloy-midnight/65">
                            {connected
                                ? "Stripe is this organization's payment provider."
                                : "No payment provider is connected, so card and bank payments are unavailable."}
                        </p>
                        {state?.attention ? (
                            <p
                                className="mt-1 text-sm text-alloy-midnight/75"
                                data-testid="payments-provider-attention"
                            >
                                {state.attention}
                            </p>
                        ) : null}
                    </div>
                </div>

                {/* ── WHAT CAN WE ACCEPT? ───────────────────────────────────────────────────── */}
                <div className="grid gap-2 sm:grid-cols-2">
                    <div
                        className="rounded-lg border border-alloy-stone/25 px-3 py-2"
                        data-testid="payments-rail-card"
                        data-rail-available={Boolean(state?.cardAvailable)}
                    >
                        <p className="flex items-center gap-2 text-sm font-medium text-alloy-midnight">
                            <CreditCard className="h-4 w-4" strokeWidth={1.75} /> Card payments
                        </p>
                        <p className="text-sm text-alloy-midnight/65">{railLabel(Boolean(state?.cardAvailable), connected)}</p>
                    </div>
                    <div
                        className="rounded-lg border border-alloy-stone/25 px-3 py-2"
                        data-testid="payments-rail-bank"
                        data-rail-available={Boolean(state?.bankAvailable)}
                    >
                        <p className="flex items-center gap-2 text-sm font-medium text-alloy-midnight">
                            <Landmark className="h-4 w-4" strokeWidth={1.75} /> Bank payments
                        </p>
                        <p className="text-sm text-alloy-midnight/65">{railLabel(Boolean(state?.bankAvailable), connected)}</p>
                    </div>
                </div>

                <p className="text-xs text-alloy-midnight/50" data-testid="payments-provider-checked-at">
                    Provider status last checked · {when(state?.readinessCheckedAt ?? null)}
                </p>

                {/* ── WHAT DO I DO NEXT? ─────────────────────────────────────────────────────── */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                    {!connected ? (
                        <button
                            type="button"
                            className="rounded-lg bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                            disabled={busy != null || loading}
                            onClick={() => void run("connect", { display_name: organizationName || "This organization" })}
                            data-testid="payments-provider-connect"
                        >
                            {busy === "connect" ? "Opening…" : "Connect payment provider"}
                        </button>
                    ) : !ready ? (
                        <button
                            type="button"
                            className="rounded-lg bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                            disabled={busy != null || loading}
                            onClick={() => void run("connect", { display_name: organizationName || "This organization" })}
                            data-testid="payments-provider-continue"
                        >
                            {busy === "connect" ? "Opening…" : "Continue setup"}
                        </button>
                    ) : null}

                    {connected ? (
                        <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-alloy-stone/40 px-3 py-1.5 text-sm font-medium text-alloy-midnight disabled:opacity-50"
                            disabled={busy != null || loading}
                            onClick={() => void run("refresh")}
                            data-testid="payments-provider-refresh"
                        >
                            <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
                            {busy === "refresh" ? "Checking…" : "Refresh status"}
                        </button>
                    ) : null}

                    {connected && !confirmingDisconnect ? (
                        <button
                            type="button"
                            className="rounded-lg border border-alloy-stone/40 px-3 py-1.5 text-sm font-medium text-alloy-midnight/75 disabled:opacity-50"
                            disabled={busy != null || loading}
                            onClick={() => setConfirmingDisconnect(true)}
                            data-testid="payments-provider-disconnect"
                        >
                            Disconnect
                        </button>
                    ) : null}
                </div>

                {confirmingDisconnect ? (
                    <div
                        className="rounded-lg border border-alloy-stone/30 bg-alloy-cloud/30 px-3 py-2"
                        data-testid="payments-provider-disconnect-confirm"
                    >
                        <p className="text-sm font-medium text-alloy-midnight">
                            Stop taking card and bank payments?
                        </p>
                        <p className="text-sm text-alloy-midnight/70">
                            New card and bank payments become unavailable. Payments already received, and the account
                            that collected them, are unchanged.
                        </p>
                        <div className="mt-2 flex gap-2">
                            <button
                                type="button"
                                className="rounded-lg bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                                disabled={busy != null}
                                onClick={() => {
                                    setConfirmingDisconnect(false);
                                    void run("disconnect");
                                }}
                                data-testid="payments-provider-disconnect-confirmed"
                            >
                                {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
                            </button>
                            <button
                                type="button"
                                className="rounded-lg border border-alloy-stone/40 px-3 py-1.5 text-sm font-medium text-alloy-midnight"
                                onClick={() => setConfirmingDisconnect(false)}
                            >
                                Keep it connected
                            </button>
                        </div>
                    </div>
                ) : null}

                {state?.providerAccountRef ? (
                    <p className="pt-1 text-xs text-alloy-midnight/40" data-testid="payments-provider-ref">
                        Provider reference · {state.providerAccountRef}
                    </p>
                ) : null}
            </div>
        </ConfigWorkspaceCard>
    );
}
