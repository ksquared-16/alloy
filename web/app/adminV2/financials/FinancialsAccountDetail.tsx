"use client";

/**
 * HOSTING THREAD 2 INSIDE THE WORKSPACE — the smallest adapter, and nothing else.
 *
 * The Financials card is a Focus Panel card: it takes a card model and an operational context, and
 * it resolves the household from `context.truth` and the scoped child from
 * `context.participantScope`. The workspace has both of those as plain ids after a queue selection,
 * so this builds the two props and gets out of the way.
 *
 * It deliberately does NOT re-render the card's content, re-fetch its read model, or reshape its
 * numbers. Every figure the operator sees here is `buildFinancialsCardVM`'s, unforked — which is the
 * whole reason the workspace can show account detail without becoming a second account product.
 *
 * ── SCOPE ──
 *
 * The queue above is site-scoped. This is not, and cannot be: Thread 2 answers for a household
 * across every site it is enrolled at, and a site filter applied here would change what its numbers
 * MEAN rather than which of them are shown. The caller labels this zone "Account-wide" for that
 * reason; nothing here narrows it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import FinancialsCard from "@/components/admin/focusPanel/cards/FinancialsCard";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";

export default function FinancialsAccountDetail({
    customerId,
    customerMemberId,
    participationId,
    displayName,
    showDetailsAction = true,
    summaryVariant = "period",
}: {
    customerId: string | null;
    customerMemberId: string | null;
    /** `opportunity_customer_members.id` when the selection carries one. */
    participationId: string | null;
    displayName: string | null;
    /** False where the account's own activity is already on screen beneath this card. */
    showDetailsAction?: boolean;
    /** "account" in Financials → Accounts: balance, due, past due, Payment, Add. */
    summaryVariant?: "period" | "account";
}) {
    const model = useMemo<FocusPanelCardModel>(
        () => ({
            key: "financials" as FocusPanelCardModel["key"],
            archetype: "record" as FocusPanelCardModel["archetype"],
            title: "Financials",
            insight: "",
            tier: "primary" as FocusPanelCardModel["tier"],
            span: "row" as FocusPanelCardModel["span"],
            density: "expanded" as FocusPanelCardModel["density"],
            visible: true,
        }),
        [],
    );

    const context = useMemo<OperationalContext>(
        () =>
            ({
                grain: "case",
                subject: { type: "customer", id: customerId ?? "" },
                businessProcess: { key: "financials", label: "Financials" },
                perspective: "focused",
                /*
                 * `customer.id` is the first binding `householdIdFrom` reads, so the card resolves the
                 * same account the queue row named. Nothing else is fabricated: an empty truth map
                 * would make the card answer about no account, and inventing further keys would be
                 * teaching a workspace to speak for a panel it is only borrowing.
                 */
                truth: { "customer.id": customerId ?? "" },
                signals: {},
                participantScope: customerMemberId
                    ? {
                          participationId: participationId ?? "",
                          customerMemberId,
                          personId: null,
                          displayName,
                          imageUrl: null,
                      }
                    : null,
            }) as unknown as OperationalContext,
        [customerId, customerMemberId, participationId, displayName],
    );

    /*
     * ── BACKDROP AND ESCAPE DISMISS EVERY COMMAND, THROUGH THE PLATFORM'S OWN SIGNAL ────────────
     *
     * `FinancialsCard` already subscribes to `useDismissSignal(coordination, "financials", …)` — the
     * Focus Panel's "return to base" path, which is what closes a command there on a backdrop click
     * or ESC, and which resets the overlay, the pending preview and the command error together.
     * The workspace simply never supplied a coordination object, so the signal had nowhere to come
     * from and its command layers could only be closed from their own Cancel.
     *
     * So this raises that signal rather than inventing a second mechanism. ONE handler covers every
     * command the card can enter — Add Charge, Take Payment, adjustments, moves, reversals — because
     * the card resets its own overlay state, whatever it happened to be in. No per-command document
     * listener, and no Financials-only cancellation rule.
     *
     * A click INSIDE the layer never reaches this: the backdrop element is a sibling behind it.
     */
    const [dismissNonce, setDismissNonce] = useState(0);
    const hostRef = useRef<HTMLDivElement | null>(null);
    const dismiss = useCallback(() => setDismissNonce((n) => n + 1), []);

    const coordination = useMemo<FocusPanelCoordination>(
        () => ({
            request: null,
            requestFocus: () => {},
            dismissed: dismissNonce > 0 ? { card: "financials", nonce: dismissNonce } : null,
            dismiss: () => setDismissNonce((n) => n + 1),
        }),
        [dismissNonce],
    );

    /*
     * ESC, matching the platform: the same return-to-base the Focus Panel gives a focused card.
     *
     * ── AND IT MUST GO NO FURTHER ───────────────────────────────────────────────────────────────
     *
     * This closed the command and let the key keep travelling, so the workspace shell's own Escape
     * handler ran too and tore down the whole account detail. Measured in Financials → Accounts:
     * open a row's Adjust, press Escape, and the command closed AND the selected account, the lens
     * and the filters all went with it — the operator was returned to an empty pane having asked
     * only to back out of one command.
     *
     * Registered in the CAPTURE phase so the stop actually precedes the shell's listener rather
     * than racing it. With no command open nothing is consumed and Escape still means what the
     * workspace says it means.
     */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            const open = hostRef.current?.querySelector("[data-financials-overlay]");
            if (!open) return;
            e.preventDefault();
            e.stopPropagation();
            dismiss();
        };
        document.addEventListener("keydown", onKey, { capture: true });
        return () => document.removeEventListener("keydown", onKey, { capture: true });
    }, [dismiss]);

    return (
        <div ref={hostRef} data-financials-command-scope="true">
            {/*
             * The backdrop is a real element rather than a `::before`, so it can be clicked. It
             * exists only while a command is open — `:has()` in the stylesheet gives it its size and
             * scrim; with no command open it is an inert, zero-area node.
             */}
            <div
                className="alloy-accounts-command-backdrop"
                data-financials-command-backdrop="true"
                aria-hidden="true"
                onClick={dismiss}
            />
            <FinancialsCard
                model={model}
                context={context}
                showDetailsAction={showDetailsAction}
                summaryVariant={summaryVariant}
                coordination={coordination}
            />
        </div>
    );
}
