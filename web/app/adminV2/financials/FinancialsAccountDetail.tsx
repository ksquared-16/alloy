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

import { useMemo } from "react";

import FinancialsCard from "@/components/admin/focusPanel/cards/FinancialsCard";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

export default function FinancialsAccountDetail({
    customerId,
    customerMemberId,
    participationId,
    displayName,
}: {
    customerId: string | null;
    customerMemberId: string | null;
    /** `opportunity_customer_members.id` when the selection carries one. */
    participationId: string | null;
    displayName: string | null;
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

    return <FinancialsCard model={model} context={context} />;
}
