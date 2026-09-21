"use client";

/**
 * AUTOPAY ADMINISTRATION — inside Financials, in Financials' own language.
 *
 * This is the first surface in the product that authorizes money to move with nobody present, and
 * it is deliberately not dramatic about it. It reads as the section above it reads: the same card
 * grammar, the same stone borders, the same midnight type scale. Bend Pine carries the primary act
 * and nothing else. There is no provider chrome here — Stripe is how the money moves, not what the
 * operator is using.
 *
 * ── WHAT IT WILL NOT DO ──
 *
 * It renders no amount it was not given, and it never computes one. "Amount due" comes from the
 * same live resolution the handler performs; a figure this component derived would be a third
 * opinion about what a family owes.
 */
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Pause, Play, RefreshCw, ShieldCheck, X } from "lucide-react";

type Arrangement = {
    id: string;
    status: "active" | "paused" | "revoked" | "failed";
    payerEntityId: string;
    paymentMethodId: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    maxAmountCents: number | null;
    timingOffsetDays: number;
    lastAttemptAt: string | null;
    lastFailureReason: string | null;
};

type StoredMethod = { id: string; brand: string | null; last4: string | null; rail: "card" | "ach"; usabilityState: string };
type PayerOption = { personId: string; name: string };

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** The one sentence at the top. Mirrors `autopayPresentation` on the server, for the same states. */
export function autopayHeadline(a: Arrangement | null): { text: string; tone: "on" | "paused" | "attention" | "off" } {
    if (!a) return { text: "No Autopay", tone: "off" };
    if (a.status === "failed") return { text: a.lastFailureReason || "Autopay needs attention", tone: "attention" };
    if (a.status === "paused") return { text: "Autopay paused", tone: "paused" };
    if (a.status === "revoked") return { text: "No Autopay", tone: "off" };
    if (a.lastFailureReason) return { text: a.lastFailureReason, tone: "attention" };
    return { text: "Autopay on", tone: "on" };
}

function timingLine(a: Arrangement): string {
    if (a.timingOffsetDays === 0) return "Collects on the due date";
    const days = Math.abs(a.timingOffsetDays);
    const unit = days === 1 ? "day" : "days";
    return a.timingOffsetDays > 0
        ? `Collects ${days} ${unit} after the due date`
        : `Collects ${days} ${unit} before the due date`;
}

export default function AutopaySection({
    customerId,
    payerEntityId,
    payerName,
    canManage = true,
}: {
    customerId: string;
    /** Who the instrument belongs to. Ownership, not responsibility — the same distinction W2 draws. */
    payerEntityId?: string | null;
    payerName?: string | null;
    /** False hides the controls. The server refuses regardless; this only avoids offering them. */
    canManage?: boolean;
}) {
    const [methods, setMethods] = useState<StoredMethod[]>([]);
    const [arrangement, setArrangement] = useState<Arrangement | null>(null);
    const [amountDueCents, setAmountDueCents] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    /*
     * TWO ERROR SLOTS, NOT ONE. A failed read and a refused action are different facts, and sharing
     * one slot means the reload after an action wipes the refusal the operator needed to read —
     * the exact defect mounted certification found in W3's recognition lens.
     */
    const [readError, setReadError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [setupOpen, setSetupOpen] = useState(false);

    const usable = methods.filter((m) => m.usabilityState === "usable");
    const payers: PayerOption[] = payerEntityId
        ? [{ personId: payerEntityId, name: payerName?.trim() || "Payer on file" }]
        : [];

    const load = useCallback(async () => {
        if (!customerId) return;
        setLoading(true);
        try {
            /*
             * The methods come from W2's own route rather than a copy of that query here. One
             * authority decides what is on file and whether it may be charged; a second read shaped
             * differently would eventually offer an instrument W2 considers unusable.
             */
            const [autopayRes, methodsRes] = await Promise.all([
                fetch(`/api/admin/financials/autopay?customer_id=${encodeURIComponent(customerId)}`, { credentials: "include" }),
                fetch(`/api/admin/financials/payment-methods?customer_id=${encodeURIComponent(customerId)}`, { credentials: "include" }),
            ]);
            const body = await autopayRes.json();
            if (!autopayRes.ok) {
                setReadError(typeof body?.error === "string" ? body.error : "Autopay could not be read.");
                setArrangement(null);
                return;
            }
            if (methodsRes.ok) {
                const mBody = await methodsRes.json();
                setMethods(Array.isArray(mBody?.methods) ? (mBody.methods as StoredMethod[]) : []);
            }
            setReadError(null);
            setArrangement((body?.arrangement as Arrangement) ?? null);
            setAmountDueCents(typeof body?.amountDueCents === "number" ? body.amountDueCents : null);
        } catch {
            setReadError("Autopay could not be read.");
        } finally {
            setLoading(false);
        }
    }, [customerId, payerEntityId, payerName]);

    useEffect(() => { void load(); }, [load]);

    const run = useCallback(
        async (actionKey: string, payload: Record<string, unknown>) => {
            setBusy(actionKey);
            setActionError(null);
            try {
                const res = await fetch("/api/admin/actions/execute", {
                    method: "POST",
                    credentials: "include",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        action_key: actionKey,
                        entity_type: "opportunity_customer_member",
                        entity_id: customerId,
                        payload,
                    }),
                });
                const body = await res.json();
                if (!res.ok || body?.ok === false) {
                    setActionError(
                        typeof body?.error === "string" ? body.error : "That could not be done.",
                    );
                    return false;
                }
                await load();
                return true;
            } catch {
                setActionError("That could not be done.");
                return false;
            } finally {
                setBusy(null);
            }
        },
        [customerId, load],
    );

    const headline = autopayHeadline(arrangement);
    const toneClass =
        headline.tone === "attention"
            ? "text-amber-700"
            : headline.tone === "on"
              ? "text-alloy-bend-pine"
              : "text-alloy-midnight/65";

    return (
        <div className="space-y-3" data-testid="autopay-section" data-autopay-status={arrangement?.status ?? "none"}>
            <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/60">
                    Autopay
                </h4>
                {canManage && !arrangement && !setupOpen && usable.length > 0 ? (
                    <button
                        type="button"
                        onClick={() => setSetupOpen(true)}
                        data-testid="autopay-setup-open"
                        className="inline-flex items-center gap-1 rounded-md bg-alloy-bend-pine px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                        <ShieldCheck className="h-3 w-3" strokeWidth={2} /> Set up Autopay
                    </button>
                ) : null}
            </div>

            {readError ? (
                <p data-testid="autopay-read-error" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {readError}
                </p>
            ) : null}
            {actionError ? (
                <p data-testid="autopay-action-error" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {actionError}
                </p>
            ) : null}

            {loading ? (
                <p className="flex items-center gap-2 text-sm text-alloy-midnight/55">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> Reading Autopay…
                </p>
            ) : arrangement ? (
                <div className="rounded-lg border border-alloy-stone/30 px-3 py-2">
                    <p data-testid="autopay-headline" className={`text-sm font-medium ${toneClass}`}>
                        {headline.text}
                    </p>
                    <dl className="mt-1.5 space-y-0.5 text-xs text-alloy-midnight/65">
                        <div className="flex gap-1.5">
                            <dt className="text-alloy-midnight/45">Payer</dt>
                            <dd>{payers.find((p) => p.personId === arrangement.payerEntityId)?.name ?? "On file"}</dd>
                        </div>
                        <div className="flex gap-1.5">
                            <dt className="text-alloy-midnight/45">Method</dt>
                            <dd>
                                {(() => {
                                    const m = methods.find((x) => x.id === arrangement.paymentMethodId);
                                    if (!m) return "On file";
                                    return [m.brand, m.last4 ? `•••• ${m.last4}` : null].filter(Boolean).join(" ")
                                        || (m.rail === "ach" ? "Bank account" : "Card");
                                })()}
                            </dd>
                        </div>
                        {amountDueCents != null ? (
                            <div className="flex gap-1.5">
                                <dt className="text-alloy-midnight/45">Amount due</dt>
                                <dd data-testid="autopay-amount-due">
                                    {amountDueCents > 0 ? money(amountDueCents) : "Nothing due"}
                                </dd>
                            </div>
                        ) : null}
                        <div className="flex gap-1.5">
                            <dt className="text-alloy-midnight/45">Timing</dt>
                            <dd className="inline-flex items-center gap-1">
                                <CalendarClock className="h-3 w-3" strokeWidth={1.75} /> {timingLine(arrangement)}
                            </dd>
                        </div>
                        {arrangement.maxAmountCents != null ? (
                            <div className="flex gap-1.5">
                                <dt className="text-alloy-midnight/45">Maximum</dt>
                                <dd>{money(arrangement.maxAmountCents)} per collection</dd>
                            </div>
                        ) : null}
                        {arrangement.lastAttemptAt ? (
                            <div className="flex gap-1.5">
                                <dt className="text-alloy-midnight/45">Last attempt</dt>
                                <dd>{new Date(arrangement.lastAttemptAt).toLocaleDateString()}</dd>
                            </div>
                        ) : null}
                    </dl>

                    {canManage ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            {arrangement.status === "active" ? (
                                <button
                                    type="button"
                                    disabled={busy != null}
                                    onClick={() => void run("autopay.pause", { arrangement_id: arrangement.id })}
                                    data-testid="autopay-pause"
                                    className="inline-flex items-center gap-1 rounded-md border border-alloy-stone/40 px-2 py-1 text-xs text-alloy-midnight/80 hover:bg-alloy-cloud/50 disabled:opacity-50"
                                >
                                    <Pause className="h-3 w-3" strokeWidth={2} /> Pause
                                </button>
                            ) : null}
                            {arrangement.status === "paused" ? (
                                <button
                                    type="button"
                                    disabled={busy != null}
                                    onClick={() => void run("autopay.resume", { arrangement_id: arrangement.id })}
                                    data-testid="autopay-resume"
                                    className="inline-flex items-center gap-1 rounded-md border border-alloy-stone/40 px-2 py-1 text-xs text-alloy-midnight/80 hover:bg-alloy-cloud/50 disabled:opacity-50"
                                >
                                    <Play className="h-3 w-3" strokeWidth={2} /> Resume
                                </button>
                            ) : null}
                            {arrangement.status !== "revoked" ? (
                                <button
                                    type="button"
                                    disabled={busy != null}
                                    onClick={() => void run("autopay.revoke", { arrangement_id: arrangement.id })}
                                    data-testid="autopay-revoke"
                                    className="inline-flex items-center gap-1 rounded-md border border-alloy-stone/40 px-2 py-1 text-xs text-alloy-midnight/80 hover:bg-alloy-cloud/50 disabled:opacity-50"
                                >
                                    <X className="h-3 w-3" strokeWidth={2} /> Turn off Autopay
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : setupOpen ? (
                <AutopaySetupForm
                    methods={usable}
                    payers={payers}
                    busy={busy != null}
                    onCancel={() => setSetupOpen(false)}
                    onSubmit={async (values) => {
                        const ok = await run("autopay.enroll", { customer_id: customerId, ...values });
                        if (ok) setSetupOpen(false);
                    }}
                />
            ) : (
                <p data-testid="autopay-empty" className="text-sm text-alloy-midnight/65">
                    {usable.length === 0
                        ? "Add a usable payment method before setting up Autopay."
                        : "No Autopay on this account."}
                </p>
            )}
        </div>
    );
}

/**
 * The enrollment form.
 *
 * Every field is part of the AUTHORIZATION, which is why they are recorded together and why none of
 * them can be edited afterwards. Changing the payer or the method means a different person
 * authorized a different instrument, so it is a new consent rather than an edit.
 */
function AutopaySetupForm({
    methods, payers, busy, onCancel, onSubmit,
}: {
    methods: StoredMethod[];
    payers: PayerOption[];
    busy: boolean;
    onCancel: () => void;
    onSubmit: (values: Record<string, unknown>) => void | Promise<void>;
}) {
    const [payerEntityId, setPayer] = useState(payers[0]?.personId ?? "");
    const [paymentMethodId, setMethod] = useState(methods[0]?.id ?? "");
    const [effectiveFrom, setFrom] = useState(new Date().toISOString().slice(0, 10));
    const [maxAmount, setMax] = useState("");
    const [offset, setOffset] = useState("0");

    const field = "w-full rounded-md border border-alloy-stone/40 px-2 py-1 text-xs text-alloy-midnight";

    return (
        <form
            data-testid="autopay-setup-form"
            className="space-y-2 rounded-lg border border-alloy-stone/30 px-3 py-2"
            onSubmit={(e) => {
                e.preventDefault();
                void onSubmit({
                    payer_entity_id: payerEntityId,
                    payment_method_id: paymentMethodId,
                    effective_from: effectiveFrom,
                    max_amount_cents: maxAmount.trim() ? Math.round(Number(maxAmount) * 100) : null,
                    timing_offset_days: Number(offset) || 0,
                });
            }}
        >
            <label className="block text-xs text-alloy-midnight/65">
                Payer
                <select className={field} value={payerEntityId} onChange={(e) => setPayer(e.target.value)} data-testid="autopay-payer">
                    {payers.map((p) => <option key={p.personId} value={p.personId}>{p.name}</option>)}
                </select>
            </label>
            <label className="block text-xs text-alloy-midnight/65">
                Payment method
                <select className={field} value={paymentMethodId} onChange={(e) => setMethod(e.target.value)} data-testid="autopay-method">
                    {methods.map((m) => (
                        <option key={m.id} value={m.id}>
                            {[m.brand, m.last4 ? `•••• ${m.last4}` : null].filter(Boolean).join(" ")
                                || (m.rail === "ach" ? "Bank account" : "Card")}
                        </option>
                    ))}
                </select>
            </label>
            <label className="block text-xs text-alloy-midnight/65">
                Starts
                <input type="date" className={field} value={effectiveFrom} onChange={(e) => setFrom(e.target.value)} data-testid="autopay-from" />
            </label>
            <label className="block text-xs text-alloy-midnight/65">
                Maximum per collection (optional)
                <input
                    type="number" min="0" step="0.01" placeholder="No maximum"
                    className={field} value={maxAmount} onChange={(e) => setMax(e.target.value)} data-testid="autopay-max"
                />
            </label>
            <label className="block text-xs text-alloy-midnight/65">
                Days relative to the due date
                <input type="number" min="-30" max="30" className={field} value={offset} onChange={(e) => setOffset(e.target.value)} data-testid="autopay-offset" />
            </label>
            <p className="text-[11px] leading-snug text-alloy-midnight/55">
                Whatever is owed on the day is collected. Nothing is collected if the family has already paid.
            </p>
            <div className="flex items-center gap-2 pt-1">
                <button
                    type="submit" disabled={busy || !payerEntityId || !paymentMethodId}
                    data-testid="autopay-setup-submit"
                    className="inline-flex items-center gap-1 rounded-md bg-alloy-bend-pine px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                    <ShieldCheck className="h-3 w-3" strokeWidth={2} /> Authorize Autopay
                </button>
                <button
                    type="button" onClick={onCancel}
                    className="rounded-md border border-alloy-stone/40 px-2 py-1 text-xs text-alloy-midnight/80 hover:bg-alloy-cloud/50"
                >
                    Cancel
                </button>
            </div>
        </form>
    );
}
