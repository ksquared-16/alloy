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
import { useCallback, useEffect, useState } from "react";

import { AlloySelect } from "@/components/workspace/AlloySelect";
import { WS_ACTION_PRIMARY } from "@/components/workspace/workspaceTokens";
import { formatDisplayDate } from "@/lib/presentation/presentationDateFormat";
import { isPostedStatus } from "@/lib/financials/billableSource";

export const CONFIGURE_RESPONSIBILITY_ACTION_KEY = "billing.configure_responsibility";

/**
 * HOUSEHOLD IS A VALUE, NOT AN ABSENCE. A select whose empty option meant "the whole account"
 * would let an operator who chose nothing commit money for everyone — the defect class this
 * product already removed from Add Charge, on the surface that decides who owes.
 */
export const HOUSEHOLD_SCOPE = "__household__";

/** Cents as the operator reads them. Formatting only — no figure is derived here. */
function money(cents: number): string {
    return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

type ScopeArrangement = {
    arrangement: {
        id: string;
        customerMemberId: string | null;
        effectiveStart: string | null;
        effectiveEnd: string | null;
        shares: { id: string; name: string; amountCents: number | null; method: string | null }[];
    } | null;
    /** False when the household's arrangement is merely REACHING this child. */
    authoredAtRequestedScope: boolean;
};

/**
 * What already governs the scope the operator has selected.
 *
 * Specificity is not decided here. The route asks the one grain-aware reader every other consumer
 * asks, and this renders its answer — because a management card that computed precedence itself
 * would be the second opinion this thread just finished removing from the read path.
 */
async function readScopeArrangement(
    customerId: string | null,
    customerMemberId: string | null,
): Promise<ScopeArrangement | null> {
    if (!customerId) return null;
    const qs = new URLSearchParams({ customer_id: customerId });
    if (customerMemberId) qs.set("customer_member_id", customerMemberId);
    try {
        const res = await fetch(`/api/admin/financials/responsibility-arrangement?${qs.toString()}`, {
            credentials: "include",
        });
        if (!res.ok) return null;
        return (await res.json()) as ScopeArrangement;
    } catch {
        return null;
    }
}

type ShareMethod = "percentage" | "fixed" | "remainder";

const SHARE_METHOD_OPTIONS: ReadonlyArray<{ value: ShareMethod; label: string }> = [
    { value: "percentage", label: "Percentage" },
    { value: "fixed", label: "Fixed amount" },
    { value: "remainder", label: "Remainder" },
];

/**
 * WHETHER THIS ARRANGEMENT RECONCILES, said in the operator's terms before they press Confirm.
 *
 * The canonical service refuses a total over 100%, a second remainder, and a duplicate party — so
 * this is not a second rulebook, it is the same rules stated early enough to be useful. A form
 * that let an operator fill in 70/40 and then showed them a server error would be making them
 * discover a rule the product already knew.
 */
function reconcileShares(shares: readonly ShareDraft[]): { ok: boolean; message: string | null } {
    const used = shares.filter((s) => s.method === "remainder" || s.amount.trim() !== "");
    if (used.length === 0) return { ok: false, message: "Name at least one responsible party." };

    const remainders = used.filter((s) => s.method === "remainder");
    if (remainders.length > 1) return { ok: false, message: "Only one party can take the remainder." };

    const percentTotal = used
        .filter((s) => s.method === "percentage")
        .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    if (percentTotal > 100) {
        return { ok: false, message: `The percentages total ${percentTotal}%.` };
    }
    if (used.some((s) => s.method !== "remainder" && !(Number(s.amount) >= 0))) {
        return { ok: false, message: "Every share needs a number." };
    }

    const hasPercent = used.some((s) => s.method === "percentage");
    if (hasPercent && percentTotal < 100 && remainders.length === 0) {
        return { ok: true, message: `${100 - percentTotal}% is not assigned to anyone.` };
    }
    return { ok: true, message: null };
}

type ShareDraft = {
    responsiblePartyId: string;
    name: string;
    /** Their relationship to the account, shown so the operator knows which person this is. */
    roleLabel: string | null;
    /**
     * How this party's share is expressed. The canonical authority has always accepted all three;
     * what was missing was anywhere for an operator to say which one they meant.
     */
    method: ShareMethod;
    /**
     * What the operator typed: cents for `fixed`, whole percent for `percentage`, ignored for
     * `remainder` — a remainder is defined by the others, so there is nothing to type.
     */
    amount: string;
};

type PreviewPayload = { summary?: string; changes?: string[] } | null;

async function callAction(
    mode: "preview" | "execute",
    args: {
        customerId: string | null;
        customerMemberId: string | null;
        /** Null for the account, a child id for a child-scoped arrangement. */
        arrangementMemberId: string | null;
        effectiveStart: string;
        shares: ShareDraft[];
    },
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
                /*
                 * NULL, AND DELIBERATELY SO — this is the account's arrangement.
                 *
                 * `configureResponsibilityArrangement` reads `customerMemberId` as "one child, or
                 * null for the whole account". The panel used to pass the child whose charge the
                 * operator happened to be looking at, which recorded a CHILD-grain arrangement while
                 * telling them "who contractually owes this account". On a household with two
                 * children that is simply wrong: the sibling's tuition stayed outside it.
                 *
                 * The child still travels as the action's entity — that is which subject the
                 * operator is acting from — but the arrangement is about the household.
                 */
                customer_member_id: args.arrangementMemberId,
                effective_start: args.effectiveStart,
                /*
                 * FIXED CENTS, because that is what the operator typed. The action also accepts
                 * percentage and remainder methods; this intent offers the one an operator can
                 * state exactly, and the others stay available to the capability rather than being
                 * approximated here.
                 */
                /*
                 * EACH SHARE IN THE METHOD THE OPERATOR CHOSE. This used to send `fixed` for
                 * everything, because fixed was the only method the surface offered — the action
                 * accepted all three the whole time. A remainder carries no number: it is defined
                 * by what the others leave.
                 */
                shares: args.shares
                    .filter((s) => s.method === "remainder" || s.amount.trim() !== "")
                    .map((s) =>
                        s.method === "remainder"
                            ? { responsible_party_id: s.responsiblePartyId, method: "remainder" }
                            : s.method === "percentage"
                              ? {
                                    responsible_party_id: s.responsiblePartyId,
                                    method: "percentage",
                                    percent_basis_points: Math.round(Number(s.amount) * 100),
                                }
                              : {
                                    responsible_party_id: s.responsiblePartyId,
                                    method: "fixed",
                                    amount_cents: Math.round(Number(s.amount) * 100),
                                },
                    ),
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
        .map((p) => ({ responsiblePartyId: p.personId as string, name: p.name, roleLabel: null, method: "fixed" as ShareMethod, amount: "" }));
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
                method: "fixed" as ShareMethod,
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
    chargeStatus,
    subjectLabel,
    arrangement,
    parties,
    memberOptions,
    defaultScopeMemberId,
    hostedOpen,
    onHostedClose,
    onCommitted,
}: {
    customerId: string | null;
    customerMemberId: string | null;
    /** The obligation being looked at — carried so an arrangement in force can still be edited. */
    chargeId?: string | null;
    /**
     * WHETHER THIS CHARGE HAS POSTED, because the sentence below used to assert that it had.
     *
     * The undivided-charge note read "This posted charge is not divided under it" on every charge
     * the arrangement had not allocated — including DRAFTS, which the same screen was labelling
     * "Draft" two lines above. The reason it gives is only true of posted money: Thread 6 refuses
     * to move money that has already posted. A draft is not protected by that rule, it simply has
     * no allocation yet, and telling an operator otherwise explains a restriction that is not there.
     */
    chargeStatus?: string | null;
    /** The child this obligation is for, so a child-scoped arrangement can be named out loud. */
    subjectLabel?: string | null;
    /*
     * THE ACCOUNT'S ARRANGEMENT, which is not the same fact as this charge's allocation. Without it
     * the panel went on inviting the operator to create an arrangement they had just created.
     */
    arrangement?: { effectiveStart: string | null; shares: { responsiblePartyId: string | null }[] } | null;
    /** The parties already on record, so the operator edits what exists rather than inventing it. */
    parties: { personId: string | null; name: string }[];
    /*
     * ── EVERY CHILD THE ACCOUNT MAY ARRANGE FOR ───────────────────────────────────────────────
     *
     * Charge detail has ONE child in view and the scope control offers Household or that child,
     * which is the whole truth there. Account administration has no such context: the operator is
     * choosing which scope to govern, so the choice must be the household's actual children.
     *
     * Absent, the panel behaves exactly as it always has. Given, APPLIES TO becomes the first
     * question and lists Household plus these members.
     */
    memberOptions?: { customerMemberId: string; label: string }[];
    /*
     * The scope this host means by default. Assignment already has a child in hand and means that
     * child; Financials Details is administering the account and means the household. Neither is
     * a write — the operator still confirms — and neither is an absence: the value is stated.
     */
    defaultScopeMemberId?: string | null;
    /** Opened by an external control — the Manage responsibility gear — instead of its own button. */
    hostedOpen?: boolean;
    onHostedClose?: () => void;
    onCommitted: () => Promise<void> | void;
}) {
    const [selfOpen, setSelfOpen] = useState(false);
    /*
     * ── WHO OWNS THE TRIGGER ──────────────────────────────────────────────────────────────────
     *
     * Charge detail gives the panel its own button and the panel owns its open state. Account
     * administration puts the trigger elsewhere — the Manage responsibility gear beside the
     * responsible-party filter — so the host owns it there. One component, two hosts; not a
     * second panel.
     */
    const hosted = hostedOpen !== undefined;
    const open = hosted ? Boolean(hostedOpen) : selfOpen;
    const setOpen = useCallback(
        (next: boolean) => {
            if (hosted) {
                if (!next) onHostedClose?.();
                return;
            }
            setSelfOpen(next);
        },
        [hosted, onHostedClose],
    );
    const [effectiveStart, setEffectiveStart] = useState(() => new Date().toISOString().slice(0, 10));
    const [shares, setShares] = useState<ShareDraft[]>([]);
    /* The same rules the service enforces, stated early enough for the operator to act on. */
    const reconciliation = reconcileShares(shares);
    /*
     * ── WHICH SCOPE THIS ARRANGEMENT GOVERNS ──────────────────────────────────────────────────
     *
     * The runtime has always preferred the MOST SPECIFIC arrangement — a child-scoped one beats an
     * account-wide one — and this panel could author only the account-wide kind. So a child-grain
     * arrangement could exist in canonical data, decide who owed a child's charges, and be
     * impossible for an operator to create or supersede. Household stays the default because it is
     * the common case and the one this panel has always written.
     */
    const [scope, setScope] = useState<"household" | "child">("household");
    /*
     * ── WHICH CHILD, WHEN THERE IS MORE THAN ONE ──────────────────────────────────────────────
     *
     * `scope` answers household-or-child and is what charge detail has always used. Account
     * administration also has to say WHICH child, and the honest default is none: an operator who
     * has not chosen a scope has not chosen Household either. `HOUSEHOLD_SCOPE` is an explicit
     * value, never the absence of one — an empty selection meaning Household is the exact defect
     * class this product removed from Add Charge.
     */
    const administering = (memberOptions?.length ?? 0) > 0;
    const [scopeMemberId, setScopeMemberId] = useState<string>(defaultScopeMemberId ?? HOUSEHOLD_SCOPE);
    const [scopeArrangement, setScopeArrangement] = useState<ScopeArrangement | null>(null);
    const [scopeLoading, setScopeLoading] = useState(false);
    /** The grain actually being written: account administration reads it from the member choice. */
    const effectiveMemberId = administering
        ? (scopeMemberId === HOUSEHOLD_SCOPE ? null : scopeMemberId)
        : (scope === "child" ? customerMemberId : null);
    const [busy, setBusy] = useState<"preview" | "execute" | null>(null);
    const [preview, setPreview] = useState<PreviewPayload>(null);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);

    /*
     * A HOSTED OPEN STILL HAS TO LOAD. `start()` is the self-hosted button's path; when the gear
     * opens the card there is no click here to run it, and a card with no candidates would invite
     * the operator to arrange responsibility between nobody.
     */
    useEffect(() => {
        if (!hosted || !open || shares.length > 0) return;
        let cancelled = false;
        void loadCandidates(customerId, chargeId ?? null, parties).then((loaded) => {
            if (cancelled) return;
            setShares(loaded.candidates);
            if (loaded.error) setError(loaded.error);
        });
        return () => {
            cancelled = true;
        };
    }, [hosted, open, shares.length, customerId, chargeId, parties]);

    /*
     * CHANGING THE SCOPE IS CHANGING THE SUBJECT. The arrangement shown must be the one governing
     * the scope now selected, never the last one looked at — an operator reading Certa's figures
     * under "Household" would supersede the wrong arrangement.
     */
    useEffect(() => {
        if (!administering || !open) return;
        let cancelled = false;
        setScopeLoading(true);
        setScopeArrangement(null);
        void readScopeArrangement(customerId, effectiveMemberId).then((r) => {
            if (cancelled) return;
            setScopeArrangement(r);
            setScopeLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [administering, open, customerId, effectiveMemberId]);

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
                const out = await callAction(mode, {
                    customerId,
                    customerMemberId,
                    /* The arrangement's own grain — not the charge's, which never changes here. */
                    arrangementMemberId: effectiveMemberId,
                    effectiveStart,
                    shares,
                });
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
        [customerId, customerMemberId, scope, effectiveStart, onCommitted, shares],
    );

    if (!open) {
        /* The gear is the trigger when hosted; a second one here would be two ways in. */
        if (hosted) return null;
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
                            {/* "from 2026-09-06" — a raw ISO date in operator prose, which the
                                presentation doctrine forbids as plainly as it forbids one in a
                                ledger cell. Through the platform's formatter like every other date. */}
                            {arrangement.effectiveStart
                                ? ` from ${formatDisplayDate(arrangement.effectiveStart)}`
                                : ""}.{" "}
                            {chargeStatus == null || isPostedStatus(chargeStatus)
                                ? "This posted charge is not divided under it."
                                : "This charge is not divided under it yet."}
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

    /*
     * The card is focusable (-1) so that IT, not the workspace behind it, is what Escape reaches,
     * and so a keyboard operator who opened it with Enter is already inside it. -1 keeps it
     * reachable by script and click without adding a stop to the tab order.
     */
    return (
        <section
            className="mb-3 rounded-md border border-alloy-stone/15 bg-white/60 p-3"
            data-financials-manage-responsibility="open-panel"
            tabIndex={-1}
            ref={(el) => el?.focus({ preventScroll: true })}
        >
            {/*
              * THE TITLE BELONGS TO THE OUTERMOST SURFACE. Hosted as a depth card, the card's own
              * header already says "Responsibility", and repeating "Manage responsibility" beneath
              * it made the card look like it contained a second, smaller card. Inline on Accounts
              * there is no outer header, so the heading is what names the section.
              */}
            {hosted ? null : (
                <p className="text-sm font-semibold text-alloy-midnight">Manage responsibility</p>
            )}
            {/*
              * ── THE QUESTION, NOT THE DOCTRINE ────────────────────────────────────────────
              *
              * This was two sentences: what the card decides, and the warning that it does not
              * move money already paid. The second is real and must not be lost — an operator who
              * reads "change who owes" as "move that receipt" will come here to fix a misapplied
              * payment and it will not do that.
              *
              * But a doctrine paragraph at the top of a form is read once and skipped after, and
              * the warning belongs where the mechanism is: the EFFECTIVE DATE is precisely why
              * paid money is unaffected, so it is said there, quietly, beside the field that
              * causes it.
              */}
            {/*
              * THE TITLE ALREADY SAYS IT. "Who owes for this account?" restated the card's own
              * header in a sentence, which is a line of gray between the operator and the first
              * control. What the card cannot say through labels alone is the reconciliation
              * truth, and that lives with the effective date where it is acted on.
              */}

            {/*
              * APPLIES TO — the arrangement's scope, stated before the date it takes effect.
              * Offered only where a child is actually in view; on an account-wide charge there is
              * no second scope to choose and a control with one option divides nothing.
              */}
            {/*
              * ── ACCOUNT ADMINISTRATION ASKS THE SCOPE FIRST ───────────────────────────────
              *
              * Charge detail already knows whose charge it is, so scope is a qualifier there.
              * Here the operator is choosing which scope to govern, and every field below —
              * the party, the amount, the date, and what is already in force — means something
              * different depending on the answer. So it is the first question, and it is
              * answered explicitly: HOUSEHOLD_SCOPE is a value, never an empty selection.
              */}
            {administering ? (
                <label
                    className="mt-2 block text-[11px] text-alloy-midnight/60"
                    data-financials-arrangement-scope={effectiveMemberId ? "child" : "household"}
                    data-financials-arrangement-member={effectiveMemberId ?? "household"}
                >
                    Applies to
                    <AlloySelect
                        testId="responsibility-scope"
                        aria-label="Applies to"
                        density="compact"
                        allowEmpty={false}
                        value={scopeMemberId}
                        options={[
                            { value: HOUSEHOLD_SCOPE, label: "Household — the whole account" },
                            ...(memberOptions ?? []).map((m) => ({
                                value: m.customerMemberId,
                                label: m.label,
                            })),
                        ]}
                        onChange={(next) => {
                            setScopeMemberId(next);
                            /* A different scope is a different arrangement; its preview is not this one's. */
                            setPreview(null);
                        }}
                    />
                    {/*
                      * WHAT ALREADY GOVERNS THIS SCOPE, and whether it belongs to this scope.
                      * Inherited household money shown as though the child had been given it
                      * deliberately is the misreading this sentence exists to prevent.
                      */}
                    {scopeLoading ? (
                        <span className="mt-1 block text-[11px] text-alloy-midnight/45">Reading what applies…</span>
                    ) : scopeArrangement?.arrangement ? (
                        <>
                        {/*
                          * ── WHAT STANDS TODAY, AS A LABELLED FACT ──────────────────────────
                          *
                          * This was one sentence carrying five things — the grain, the parties,
                          * the amounts, the dates and a warning that saving supersedes it — and
                          * it sat in the middle of a form as running prose, so the operator had
                          * to parse it to learn what they were about to replace.
                          *
                          * Same truths, given a label and a shape. Nothing is dropped: the grain
                          * still distinguishes an arrangement authored AT this scope from the
                          * household's reaching a child that has none, because showing inherited
                          * money as deliberately given is the misreading this exists to prevent.
                          */}
                        <span
                            className="mt-1 block"
                            data-financials-scope-arrangement={scopeArrangement.authoredAtRequestedScope ? "authored" : "inherited"}
                            data-financials-scope-arrangement-id={scopeArrangement.arrangement.id}
                        >
                            <span className="alloy-os-depthcard__section block">
                                {scopeArrangement.authoredAtRequestedScope
                                    ? effectiveMemberId
                                        ? "Current · this child"
                                        : "Current"
                                    : "Current · inherited from the household"}
                            </span>
                            <span className="alloy-os-depthcard__value block">
                                {scopeArrangement.arrangement.shares
                                    .map((sh) => `${sh.name}${sh.amountCents != null ? ` · ${money(sh.amountCents)}` : ""}`)
                                    .join(" · ")}
                                {scopeArrangement.arrangement.effectiveStart
                                    ? ` · since ${formatDisplayDate(scopeArrangement.arrangement.effectiveStart)}`
                                    : ""}
                                {scopeArrangement.arrangement.effectiveEnd
                                    ? ` · until ${formatDisplayDate(scopeArrangement.arrangement.effectiveEnd)}`
                                    : ""}
                            </span>
                            {/*
                              * SAVING REPLACES IT — said only when it is true. An inherited
                              * arrangement is not superseded by authoring one here; a new
                              * child-scoped arrangement sits beneath it, which is a different
                              * outcome and must not wear the same warning.
                              */}
                            {scopeArrangement.authoredAtRequestedScope ? (
                                <span className="alloy-os-depthcard__hint block" data-financials-scope-supersedes="true">
                                    Saving replaces this arrangement.
                                </span>
                            ) : null}
                        </span>
                        </>
                    ) : (
                        <span className="mt-1 block text-[11px] text-alloy-midnight/55" data-financials-scope-arrangement="none">
                            Nothing governs this scope yet — saving creates the first arrangement.
                        </span>
                    )}
                </label>
            ) : customerMemberId ? (
                <label className="mt-2 block text-[11px] text-alloy-midnight/60" data-financials-arrangement-scope={scope}>
                    Applies to
                    <AlloySelect
                        testId="responsibility-scope"
                        aria-label="Applies to"
                        density="compact"
                        allowEmpty={false}
                        value={scope}
                        options={[
                            { value: "household", label: "Household — the whole account" },
                            { value: "child", label: subjectLabel ? `${subjectLabel} only` : "This child only" },
                        ]}
                        onChange={(next) => {
                            setScope(next === "child" ? "child" : "household");
                            /* A different scope is a different arrangement; its preview is not this one's. */
                            setPreview(null);
                        }}
                    />
                </label>
            ) : null}

            <label className="mt-2 block text-[11px] text-alloy-midnight/60">
                Effective from
                <input
                    type="date"
                    value={effectiveStart}
                    onChange={(e) => setEffectiveStart(e.target.value)}
                    data-financials-responsibility-effective="true"
                    className="mt-0.5 block w-full rounded border border-alloy-stone/20 px-2 py-1 text-xs"
                />
                {/*
                  * THE DOCTRINE, SAID WHERE THE MECHANISM IS. Effective dating is exactly why a
                  * new arrangement cannot disturb what has already been paid, so the warning that
                  * used to open the card lives here instead — next to the field that causes it,
                  * read at the moment it matters rather than skipped at the top.
                  */}
                <span className="alloy-os-depthcard__hint mt-0.5 block" data-financials-responsibility-effective-note="true">
                    Applies from this date onward. Money already paid is not moved.
                </span>
            </label>

            {/*
              * THE ONE PIECE OF HIERARCHY THE CARD WAS MISSING. Below "Effective from" came a
              * run of labelled rows with no statement of what they collectively are, so the
              * arrangement's shares read as more fields rather than as the division itself.
              *
              * There is deliberately no "add a party" control beside it: every party on the
              * account is already a row. A party who is not on the account cannot be made
              * responsible from here, and a control that could only offer someone already listed
              * would be a button that does nothing.
              */}
            {shares.length > 0 ? (
                <p className="alloy-os-depthcard__section" data-financials-responsibility-shares-head="true">
                    Responsible parties
                </p>
            ) : null}
            {shares.length === 0 ? (
                <p className="alloy-os-depthcard__label mt-2" data-financials-responsibility-no-parties="true">
                    Nobody on this account can be made responsible yet. Add a parent or guardian to the
                    household first.
                </p>
            ) : null}
            {shares.map((share, i) => (
                <label key={share.responsiblePartyId} className="mt-2 block">
                    {/* A responsible party is a person, named at a person's weight. */}
                    <span className="alloy-os-depthcard__identity-name">{share.name}</span>
                    {share.roleLabel ? (
                        <span className="alloy-os-depthcard__hint ml-1">{share.roleLabel}</span>
                    ) : null}
                    <span className="mt-0.5 flex items-center gap-1.5">
                        <AlloySelect
                            value={share.method}
                            onChange={(next) =>
                                setShares((prev) =>
                                    prev.map((s, j) =>
                                        j === i
                                            ? { ...s, method: next as ShareMethod, amount: next === "remainder" ? "" : s.amount }
                                            : s,
                                    ),
                                )
                            }
                            options={SHARE_METHOD_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                            allowEmpty={false}
                            density="compact"
                            aria-label={`How ${share.name} shares`}
                            testId={`responsibility-share-method-${share.responsiblePartyId}`}
                            className="min-w-0 flex-1"
                        />
                        {/*
                          * A REMAINDER HAS NOTHING TO TYPE. It is defined by what the other shares
                          * leave, so offering an amount box beside it would invite a number the
                          * authority would then ignore.
                          */}
                        {share.method === "remainder" ? (
                            <span
                                className="flex-1 text-[11px] text-alloy-midnight/45"
                                data-financials-responsibility-share={share.responsiblePartyId}
                                data-share-method="remainder"
                            >
                                whatever the others leave
                            </span>
                        ) : (
                            <input
                                type="number"
                                inputMode="decimal"
                                placeholder={share.method === "percentage" ? "%" : "Amount"}
                                value={share.amount}
                                onChange={(e) =>
                                    setShares((prev) =>
                                        prev.map((s, j) => (j === i ? { ...s, amount: e.target.value } : s)),
                                    )
                                }
                                data-financials-responsibility-share={share.responsiblePartyId}
                                data-share-method={share.method}
                                className="mt-0 block w-full flex-1 rounded border border-alloy-stone/20 px-2 py-1 text-xs tabular-nums"
                            />
                        )}
                    </span>
                </label>
            ))}

            {/* Whether it reconciles, before Confirm rather than after it. */}
            {reconciliation.message ? (
                <p
                    className={`mt-1.5 text-[11px] ${reconciliation.ok ? "text-alloy-midnight/50" : "text-alloy-ember"}`}
                    data-financials-responsibility-reconciliation={reconciliation.ok ? "ok" : "invalid"}
                >
                    {reconciliation.message}
                </p>
            ) : null}

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

            {/*
              * THE FAMILY'S ACTION ROW. Every centred card in this family ends the same way —
              * a ruled row with its actions in it — so an operator learns one place to look for
              * "how do I finish, and how do I get out" and it is the same place on all of them.
              */}
            <div className="alloy-os-depthcard__actions" data-financials-card-actions="true">
                <button
                    type="button"
                    className="rounded border border-alloy-stone/20 px-2 py-1 text-xs text-alloy-midnight/70"
                    onClick={() => void run("preview")}
                    disabled={busy !== null || !reconciliation.ok}
                    data-financials-responsibility-preview-btn="true"
                >
                    {busy === "preview" ? "Checking…" : "Preview"}
                </button>
                <button
                    type="button"
                    className={WS_ACTION_PRIMARY}
                    onClick={() => void run("execute")}
                    /*
                     * AN ARRANGEMENT THAT CANNOT RECONCILE CANNOT BE CONFIRMED. The service would
                     * refuse it anyway; refusing here means the operator learns it while they can
                     * still see what they typed.
                     */
                    disabled={busy !== null || !preview || !reconciliation.ok}
                    data-financials-responsibility-confirm="true"
                >
                    {busy === "execute" ? "Saving…" : "Confirm"}
                </button>
                <button
                    type="button"
                    className="alloy-os-depthcard__close"
                    data-financials-responsibility-cancel="true"
                    onClick={() => setOpen(false)}
                    disabled={busy !== null}
                >
                    Cancel
                </button>
            </div>
        </section>
    );
}
