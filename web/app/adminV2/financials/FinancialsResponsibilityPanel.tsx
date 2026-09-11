"use client";
/**
 * MANAGE RESPONSIBILITY — the intent, over the registered capability that owns it.
 *
 * Thread 6 built the authority to record who contractually bears a family's obligations, and no
 * surface ever offered it. This is that offer, and it is deliberately ONE operator intent rather
 * than a row of technical buttons: the registry holds five responsibility actions at four different
 * grains, and an operator does not think in action keys.
 *
 * ── WHY THIS IS ACCOUNT-GRAIN ──
 *
 * `billing.configure_responsibility` takes a household (or a child) and a set of shares effective
 * from a date. It records an ARRANGEMENT, not a decision about one charge — which is why this panel
 * lives under the account-wide zone and not on a single obligation. Placing it on a charge would
 * tell the operator they were changing that charge, and they would not be.
 *
 * The charge-grain members of the same family — `billing.resolve_responsibility` and
 * `billing.reallocate_responsibility`, both keyed by `charge_id` — belong to a different intent and
 * are deliberately not here.
 *
 * ── NOTHING IS CALCULATED HERE ──
 *
 * The operator names parties and amounts; the registered action decides whether that is a valid
 * arrangement, and its own `buildPreview` says what will change. This component never sums shares,
 * never checks them against an obligation, and never reports success from anything but committed
 * persistence re-read.
 */
import { useCallback, useState } from "react";

import { WS_ACTION_PRIMARY } from "@/components/workspace/workspaceTokens";

export const CONFIGURE_RESPONSIBILITY_ACTION_KEY = "billing.configure_responsibility";

type ShareDraft = {
    responsiblePartyId: string;
    name: string;
    /** Their relationship to the account, shown so the operator knows which person this is. */
    roleLabel: string | null;
    /** Cents the operator is assigning. Empty means they have not said yet. */
    amount: string;
};

type PreviewPayload = { summary?: string; changes?: string[] } | null;

async function callAction(
    mode: "preview" | "execute",
    args: { customerId: string | null; customerMemberId: string | null; effectiveStart: string; shares: ShareDraft[] },
): Promise<{ ok: boolean; preview?: PreviewPayload; error?: string }> {
    const res = await fetch("/api/admin/actions/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
            action_key: CONFIGURE_RESPONSIBILITY_ACTION_KEY,
            entity_type: "child",
            entity_id: args.customerMemberId ?? "",
            mode,
            confirmation: { confirmed: mode === "execute" },
            payload: {
                customer_id: args.customerId,
                customer_member_id: args.customerMemberId,
                effective_start: args.effectiveStart,
                /*
                 * FIXED CENTS, because that is what the operator typed. The action also accepts
                 * percentage and remainder methods; this intent offers the one an operator can
                 * state exactly, and the others stay available to the capability rather than being
                 * approximated here.
                 */
                shares: args.shares
                    .filter((s) => s.amount.trim() !== "")
                    .map((s) => ({
                        responsible_party_id: s.responsiblePartyId,
                        method: "fixed",
                        amount_cents: Math.round(Number(s.amount) * 100),
                    })),
            },
        }),
    });
    /*
     * THE PREVIEW IS THE ACTION'S, AND IT LIVES WHERE THE ACTION PUT IT.
     *
     * A registry-owned command answers `data.execution_result`, and its preview is a field on that
     * — not `data.preview`, which is where this component first looked. The read failed silently:
     * the fetch succeeded, `preview` was undefined, nothing rendered, and Confirm therefore never
     * unlocked. An operator could open the panel, fill it in, press Preview and watch nothing
     * happen, with no error to report. Both shapes are accepted so the older owner keeps working.
     */
    const json = (await res.json()) as {
        ok?: boolean;
        data?: { preview?: PreviewPayload; execution_result?: { preview?: PreviewPayload } };
        error?: { message?: string } | string;
    };
    if (!res.ok || json.ok === false) {
        const error = typeof json.error === "string" ? json.error : json.error?.message;
        return { ok: false, error: error ?? "The arrangement was refused." };
    }
    return { ok: true, preview: json.data?.execution_result?.preview ?? json.data?.preview ?? null };
}

/**
 * WHO MAY BE MADE RESPONSIBLE — asked of the server, not assembled here.
 *
 * The eligibility rule is the arrangement service's: every party must be a `persons` row in this
 * org, and it re-checks that whatever this list said. So the client never decides who is eligible;
 * it asks one canonical read — `resolveResponsibilityPartyCandidates`, behind
 * `/api/admin/financials/responsibility-candidates` — which unions the people attached to the
 * household with anyone already holding a share, and excludes the `child` role by name.
 *
 * A FAILED READ IS NOT AN EMPTY HOUSEHOLD. If the call fails, the parties already on record stand
 * and the panel says the list could not be loaded, rather than showing a blank list an operator
 * would read as "nobody here can be made responsible".
 */
async function loadCandidates(
    customerId: string | null,
    chargeId: string | null,
    existing: { personId: string | null; name: string }[],
): Promise<{ candidates: ShareDraft[]; error: string | null }> {
    const fallback = existing
        .filter((p) => p.personId)
        .map((p) => ({ responsiblePartyId: p.personId as string, name: p.name, roleLabel: null, amount: "" }));
    if (!customerId && !chargeId) return { candidates: fallback, error: null };

    const params = new URLSearchParams();
    if (customerId) params.set("customer_id", customerId);
    if (chargeId) params.set("charge_id", chargeId);
    try {
        const res = await fetch(`/api/admin/financials/responsibility-candidates?${params.toString()}`, {
            credentials: "include",
            cache: "no-store",
        });
        const body = (await res.json()) as {
            ok?: boolean;
            candidates?: Array<{ personId?: unknown; name?: unknown; roleLabel?: unknown }>;
            error?: unknown;
        };
        if (!res.ok || body.ok === false) {
            return {
                candidates: fallback,
                error: typeof body.error === "string" ? body.error : "The people on this account could not be loaded.",
            };
        }
        const candidates = (body.candidates ?? [])
            .map((c) => ({
                responsiblePartyId: c.personId != null ? String(c.personId) : "",
                name: c.name != null ? String(c.name) : "Responsible party",
                roleLabel: c.roleLabel != null ? String(c.roleLabel) : null,
                amount: "",
            }))
            .filter((c) => c.responsiblePartyId !== "");
        return { candidates: candidates.length > 0 ? candidates : fallback, error: null };
    } catch {
        return { candidates: fallback, error: "The people on this account could not be loaded." };
    }
}

export default function FinancialsResponsibilityPanel({
    customerId,
    customerMemberId,
    chargeId,
    arrangement,
    parties,
    onCommitted,
}: {
    customerId: string | null;
    customerMemberId: string | null;
    /** The obligation being looked at — carried so an arrangement in force can still be edited. */
    chargeId?: string | null;
    /*
     * THE ACCOUNT'S ARRANGEMENT, which is not the same fact as this charge's allocation. Without it
     * the panel went on inviting the operator to create an arrangement they had just created.
     */
    arrangement?: { effectiveStart: string | null; shares: { responsiblePartyId: string | null }[] } | null;
    /** The parties already on record, so the operator edits what exists rather than inventing it. */
    parties: { personId: string | null; name: string }[];
    onCommitted: () => Promise<void> | void;
}) {
    const [open, setOpen] = useState(false);
    const [effectiveStart, setEffectiveStart] = useState(() => new Date().toISOString().slice(0, 10));
    const [shares, setShares] = useState<ShareDraft[]>([]);
    const [busy, setBusy] = useState<"preview" | "execute" | null>(null);
    const [preview, setPreview] = useState<PreviewPayload>(null);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);

    const start = useCallback(async () => {
        setPreview(null);
        setError(null);
        setDone(null);
        setOpen(true);
        /*
         * CREATING IS THE POINT. This command is how an arrangement comes to exist, so an account
         * with none is the case that needs it most — the panel opens on the people who could bear
         * it, not only on the people who already do.
         */
        const loaded = await loadCandidates(customerId, chargeId ?? null, parties);
        setShares(loaded.candidates);
        if (loaded.error) setError(loaded.error);
    }, [chargeId, customerId, parties]);

    const run = useCallback(
        async (mode: "preview" | "execute") => {
            setBusy(mode);
            setError(null);
            try {
                const out = await callAction(mode, { customerId, customerMemberId, effectiveStart, shares });
                if (!out.ok) {
                    setError(out.error ?? "Refused.");
                    setPreview(null);
                    return;
                }
                if (mode === "preview") {
                    setPreview(out.preview ?? null);
                } else {
                    /*
                     * Committed truth is re-read; nothing here edits a figure to look successful.
                     *
                     * The panel CLOSES on success, and not merely for tidiness: the confirmation
                     * and the re-read record both live in the closed state, so an execute that left
                     * the form open committed the arrangement and showed the operator nothing at
                     * all. Pressing Confirm and watching nothing happen is indistinguishable from a
                     * failure.
                     */
                    setPreview(null);
                    setShares([]);
                    setOpen(false);
                    setDone("Responsibility updated.");
                    await onCommitted();
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : "The arrangement failed.");
            } finally {
                setBusy(null);
            }
        },
        [customerId, customerMemberId, effectiveStart, onCommitted, shares],
    );

    if (!open) {
        return (
            <div className="mb-3">
                <button
                    type="button"
                    className="text-xs font-medium text-alloy-bend-pine hover:underline"
                    onClick={() => void start()}
                    data-financials-manage-responsibility="open"
                >
                    Manage responsibility →
                </button>
                {parties.filter((p) => p.personId).length === 0 ? (
                    arrangement ? (
                        /*
                         * AN ARRANGEMENT IN FORCE, AND A CHARGE NOT YET DIVIDED UNDER IT. Both are
                         * true at once whenever the charge was billed before the arrangement was
                         * made: Thread 6 refuses to move posted money without an explicit decision.
                         * Saying only the first would claim this charge is divided; saying only the
                         * second told operators their own arrangement did not exist.
                         */
                        <p
                            className="mt-1 text-[11px] text-alloy-midnight/50"
                            data-financials-responsibility-arrangement="in-force"
                        >
                            {arrangement.shares.length === 1
                                ? "1 responsible party"
                                : `${arrangement.shares.length} responsible parties`}
                            {arrangement.effectiveStart ? ` from ${arrangement.effectiveStart}` : ""}. This posted
                            charge is not divided under it.
                        </p>
                    ) : (
                        /* A statement of fact and an invitation — not a reason the control is unusable. */
                        <p className="mt-1 text-[11px] text-alloy-midnight/50" data-financials-responsibility-empty="true">
                            No responsibility arrangement yet.
                        </p>
                    )
                ) : null}
                {done ? (
                    <p className="mt-1 text-[11px] text-alloy-bend-pine" data-financials-responsibility-done="true">
                        {done}
                    </p>
                ) : null}
            </div>
        );
    }

    return (
        <section
            className="mb-3 rounded-md border border-alloy-stone/15 bg-white/60 p-3"
            data-financials-manage-responsibility="open-panel"
        >
            <p className="text-sm font-semibold text-alloy-midnight">Manage responsibility</p>
            <p className="mt-0.5 text-[11px] text-alloy-midnight/55">
                {/* The law this intent obeys, said where the operator is about to act on it. */}
                Who contractually owes this account, from a date. Changing it does not change who has already paid.
            </p>

            <label className="mt-2 block text-[11px] text-alloy-midnight/60">
                Effective from
                <input
                    type="date"
                    value={effectiveStart}
                    onChange={(e) => setEffectiveStart(e.target.value)}
                    data-financials-responsibility-effective="true"
                    className="mt-0.5 block w-full rounded border border-alloy-stone/20 px-2 py-1 text-xs"
                />
            </label>

            {shares.length === 0 ? (
                <p className="mt-2 text-[11px] text-alloy-midnight/55" data-financials-responsibility-no-parties="true">
                    Nobody on this account can be made responsible yet. Add a parent or guardian to the
                    household first.
                </p>
            ) : null}
            {shares.map((share, i) => (
                <label key={share.responsiblePartyId} className="mt-2 block text-[11px] text-alloy-midnight/60">
                    {share.name}
                    {share.roleLabel ? (
                        <span className="ml-1 text-alloy-midnight/40">{share.roleLabel}</span>
                    ) : null}
                    <input
                        type="number"
                        inputMode="decimal"
                        placeholder="Amount"
                        value={share.amount}
                        onChange={(e) =>
                            setShares((prev) =>
                                prev.map((s, j) => (j === i ? { ...s, amount: e.target.value } : s)),
                            )
                        }
                        data-financials-responsibility-share={share.responsiblePartyId}
                        className="mt-0.5 block w-full rounded border border-alloy-stone/20 px-2 py-1 text-xs tabular-nums"
                    />
                </label>
            ))}

            {/*
              * THE ACTION'S OWN PREVIEW, not a guess assembled here. The only change made to it is
              * that a party id is shown as the person's name — the panel supplied those ids, so it
              * can say who they were; an id it does not recognise is left exactly as written.
              */}
            {preview ? (
                <div className="mt-2 rounded border border-alloy-stone/15 bg-alloy-stone/5 p-2" data-financials-responsibility-preview="true">
                    <p className="text-[11px] font-medium text-alloy-midnight">{preview.summary}</p>
                    {(preview.changes ?? []).map((c) => (
                        <p key={c} className="text-[11px] text-alloy-midnight/65">
                            {shares.reduce(
                                (line, share) => line.split(share.responsiblePartyId).join(share.name),
                                c,
                            )}
                        </p>
                    ))}
                </div>
            ) : null}

            {error ? (
                <p className="mt-2 text-[11px] text-alloy-ember" data-financials-responsibility-error="true">
                    {error}
                </p>
            ) : null}

            <div className="mt-3 flex items-center gap-2">
                <button
                    type="button"
                    className="rounded border border-alloy-stone/20 px-2 py-1 text-xs text-alloy-midnight/70"
                    onClick={() => void run("preview")}
                    disabled={busy !== null}
                    data-financials-responsibility-preview-btn="true"
                >
                    {busy === "preview" ? "Checking…" : "Preview"}
                </button>
                <button
                    type="button"
                    className={WS_ACTION_PRIMARY}
                    onClick={() => void run("execute")}
                    disabled={busy !== null || !preview}
                    data-financials-responsibility-confirm="true"
                >
                    {busy === "execute" ? "Saving…" : "Confirm"}
                </button>
                <button
                    type="button"
                    className="text-xs text-alloy-midnight/50 hover:underline"
                    onClick={() => setOpen(false)}
                    disabled={busy !== null}
                >
                    Cancel
                </button>
            </div>
        </section>
    );
}
