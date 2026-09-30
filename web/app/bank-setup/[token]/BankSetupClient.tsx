"use client";

/**
 * SETTING UP A BANK ACCOUNT, AS THE PERSON WHOSE ACCOUNT IT IS.
 *
 * ── WHY THE PROVIDER'S OWN FIELDS, AND NOT ALLOY'S ──
 *
 * `PaymentMethodSetupField` is reused unchanged, and its name says "operator" only because the
 * operator's card surface was the first caller. What it actually does is mount the PROVIDER's
 * fields against a client secret and hand back a result — so the routing number, the account
 * number and the bank login are typed into an iframe this application cannot read, on the payer's
 * own device. Writing a second entry component for this surface would be writing the one component
 * that must never exist: a place where Alloy could see those numbers.
 *
 * ── WHY THE MANDATE IS THE PAYER'S TO ACCEPT ──
 *
 * Saving a bank account establishes a standing authorization to debit it, and the provider emails
 * its confirmation to the person named on the account. That is why this page exists rather than a
 * button on the operator's screen: the sentence above the provider's terms is Alloy's own
 * disclosure, shown verbatim, and the person reading it is the one who will be debited.
 *
 * ── WHAT A "PENDING" RESULT MEANS HERE ──
 *
 * It is a SUCCESS. Some banks confirm instantly; the rest send two small deposits that take a day
 * or two, and the payer confirms those with their bank, not here. The account is on file either
 * way, so this page says so and says what happens next rather than showing a failure.
 */

import { useCallback, useEffect, useState } from "react";

import PaymentMethodSetupField from "@/components/operationalCards/PaymentMethodSetupField";

type SavedMethod = {
    id: string;
    rail: "card" | "ach";
    label: string;
    last4: string | null;
    isDefault: boolean;
    status: "ready" | "confirming" | "needs_you" | "unusable";
    statusLabel: string;
    statusDetail: string | null;
};

type View = {
    payer: { personId: string; name: string } | null;
    canAddBankAccount: boolean;
    unavailableReason: string | null;
    authorizationDisclosure: string;
    savedMethods: SavedMethod[];
};

type Pending = { clientSecret: string; setupRef: string; disclosure: string | null };

async function call(token: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/public/bank-setup/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as
        | { ok: true; data: Record<string, unknown> }
        | { ok: false; error?: string }
        | null;
    if (!json) return { ok: false as const, error: "Something went wrong. Please try again." };
    if (!json.ok) return { ok: false as const, error: json.error ?? "Something went wrong." };
    return { ok: true as const, data: json.data };
}

export default function BankSetupClient({ token }: { token: string }) {
    const [view, setView] = useState<View | null>(null);
    /** The link's own refusal — expired, already done, withdrawn. Not an error the payer caused. */
    const [closed, setClosed] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [pending, setPending] = useState<Pending | null>(null);
    const [saved, setSaved] = useState<SavedMethod | null>(null);

    const load = useCallback(async () => {
        const res = await fetch(`/api/public/bank-setup/${encodeURIComponent(token)}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
            | { ok: true; data: { bankSetup: View | null; message?: string } }
            | { ok: false; error?: string }
            | null;
        if (!json || !json.ok) {
            setClosed("This link is not valid.");
            return;
        }
        if (!json.data.bankSetup) {
            setClosed(json.data.message ?? "This link is not valid.");
            return;
        }
        setView(json.data.bankSetup);
    }, [token]);

    useEffect(() => {
        void load();
    }, [load]);

    const begin = useCallback(async () => {
        setError(null);
        setBusy(true);
        const out = await call(token, { action: "begin" });
        setBusy(false);
        if (!out.ok) {
            setError(out.error);
            return;
        }
        setPending({
            clientSecret: String(out.data.clientSecret ?? ""),
            setupRef: String(out.data.setupRef ?? ""),
            disclosure: out.data.authorizationDisclosure ? String(out.data.authorizationDisclosure) : null,
        });
    }, [token]);

    const complete = useCallback(
        async (setupRef: string) => {
            setBusy(true);
            const out = await call(token, { action: "complete", setup_ref: setupRef });
            setBusy(false);
            setPending(null);
            if (!out.ok) {
                setError(out.error);
                return;
            }
            setSaved(out.data.method as SavedMethod);
        },
        [token],
    );

    if (closed) {
        return (
            <Shell>
                <p data-testid="bank-setup-closed" className="text-base text-alloy-midnight/80">{closed}</p>
            </Shell>
        );
    }

    if (saved) {
        return (
            <Shell>
                <h1 className="text-xl font-semibold text-alloy-midnight">Your bank account is on file</h1>
                <p data-testid="bank-setup-saved" className="mt-2 text-base text-alloy-midnight/80">
                    {saved.label}
                    {saved.last4 ? ` ending ${saved.last4}` : ""} — {saved.statusLabel.toLowerCase()}.
                </p>
                {saved.statusDetail ? (
                    <p className="mt-2 text-sm text-alloy-midnight/70">{saved.statusDetail}</p>
                ) : null}
            </Shell>
        );
    }

    if (!view) {
        return (
            <Shell>
                <p className="text-sm text-alloy-midnight/55">Loading…</p>
            </Shell>
        );
    }

    return (
        <Shell>
            <h1 className="text-xl font-semibold text-alloy-midnight">Set up bank payments</h1>
            {view.payer?.name ? (
                <p className="mt-1 text-sm text-alloy-midnight/70">for {view.payer.name}</p>
            ) : null}

            {view.savedMethods.length ? (
                <ul data-testid="bank-setup-existing" className="mt-4 space-y-2">
                    {view.savedMethods.map((m) => (
                        <li key={m.id} className="rounded-md border border-alloy-stone/30 px-3 py-2">
                            <p className="text-sm text-alloy-midnight">
                                {m.label}
                                {m.last4 ? ` ending ${m.last4}` : ""} — {m.statusLabel.toLowerCase()}
                            </p>
                            {m.statusDetail ? (
                                <p className="mt-0.5 text-xs text-alloy-midnight/65">{m.statusDetail}</p>
                            ) : null}
                        </li>
                    ))}
                </ul>
            ) : null}

            {error ? (
                <p data-testid="bank-setup-error" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {error}
                </p>
            ) : null}

            {!view.canAddBankAccount ? (
                <p data-testid="bank-setup-unavailable" className="mt-4 text-sm text-alloy-midnight/70">
                    {view.unavailableReason}
                </p>
            ) : pending ? (
                <div className="mt-4">
                    <PaymentMethodSetupField
                        clientSecret={pending.clientSecret}
                        rail="ach"
                        payerName={view.payer?.name ?? null}
                        authorizationDisclosure={pending.disclosure ?? view.authorizationDisclosure}
                        disabled={busy}
                        onResult={(r) => {
                            if (r.status === "failed") {
                                setPending(null);
                                setError(r.message ?? "That could not be saved. Nothing has been charged.");
                                return;
                            }
                            /*
                             * `pending` and `succeeded` both mean the payer finished their part. Which
                             * one it actually is, is the PROVIDER's to say, and the server asks it —
                             * this only reports that there is now something to read.
                             */
                            void complete(pending.setupRef);
                        }}
                        onCancel={() => setPending(null)}
                    />
                </div>
            ) : (
                <div className="mt-4">
                    <p className="text-sm text-alloy-midnight/75">{view.authorizationDisclosure}</p>
                    <button
                        type="button"
                        data-testid="bank-setup-begin"
                        disabled={busy}
                        onClick={() => void begin()}
                        className="mt-3 inline-flex items-center rounded-md bg-alloy-midnight px-3 py-2 text-sm text-white disabled:opacity-50"
                    >
                        Continue to your bank
                    </button>
                </div>
            )}
        </Shell>
    );
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <main className="mx-auto max-w-lg px-4 py-10">
            <div className="rounded-lg border border-alloy-stone/30 bg-white px-5 py-6">{children}</div>
        </main>
    );
}
