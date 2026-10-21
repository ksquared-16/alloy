"use client";

/**
 * BP V2 Slice 6 — THE EXISTING FINANCIALS CARD, LEADING A HOUSEHOLD RECORD OPENED FROM BILLING.
 *
 * Not a Billing card and not an account-detail experience: it mounts the canonical `FinancialsCard` (the
 * same component the Focus Panel and the Accounts workspace host) for this household, with its own reads,
 * commands and refresh. All this decides is WHERE the card starts, from the record route's verified
 * source (`financialFocus`):
 *
 *   - a charge that belongs to this household → the card's existing Charge Details (`openCharge`);
 *   - an unrecorded collection of this household → the card's Payment surface, that attempt marked
 *     (`openCollection`) — shown in Financials' lifecycle words, never as a payment;
 *   - anything that no longer qualifies → the card at rest, and one sentence saying so. Nothing else is
 *     selected in its place.
 *
 * The household grid (Household card) stays below it: the ordinary record is still the record.
 */

import FinancialsCard from "@/components/admin/focusPanel/cards/FinancialsCard";
import { buildSelfFetchingCardShell } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { focusPanelCardCatalogLabel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardCatalog";
import { buildDurableHouseholdOperationalContext } from "@/lib/adminV2/runtime/focusPanel/durableSubject/focusPanelWorkModeModelFromDurableSubject";
import type { DurableHouseholdSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableHouseholdSubjectModel";
import type { HouseholdFinancialFocus } from "@/lib/runtime/focus/householdFinancialFocusSource";

/** The card's starting point for a verified source — exported for tests. */
export function financialsLeadStart(focus: HouseholdFinancialFocus | null): {
    openCharge: { chargeId: string; label: string } | null;
    openCollection: { attemptId: string } | null;
    notice: string | null;
    status: string;
} {
    if (!focus) return { openCharge: null, openCollection: null, notice: null, status: "none" };
    if (focus.status === "ok" && focus.kind === "charge") {
        return { openCharge: { chargeId: focus.id, label: focus.label ?? "Charge" }, openCollection: null, notice: null, status: "charge" };
    }
    if (focus.status === "ok" && focus.kind === "collection_attempt") {
        return focus.recognized
            ? { openCharge: null, openCollection: null, notice: "This collection has since been recorded by Financials. The view will update.", status: "collection_recorded" }
            : { openCharge: null, openCollection: { attemptId: focus.id }, notice: null, status: "collection" };
    }
    if (focus.status === "forbidden") return { openCharge: null, openCollection: null, notice: null, status: "forbidden" };
    if (focus.status === "unsupported") {
        return { openCharge: null, openCollection: null, notice: "This view's item cannot be shown on the Financials card.", status: "unsupported" };
    }
    return {
        openCharge: null,
        openCollection: null,
        notice: "The financial item this view pointed to is no longer on this household's account. Showing the account.",
        status: focus.status,
    };
}

export default function DurableRecordFinancialsLead({
    household,
    focus,
    onChanged,
}: {
    household: DurableHouseholdSubject;
    focus: HouseholdFinancialFocus | null;
    /** Fired when the operator closes the surfaces the card was opened on (refreshes the Work View). */
    onChanged?: () => void;
}) {
    const start = financialsLeadStart(focus);
    const model = buildSelfFetchingCardShell("financials", focusPanelCardCatalogLabel("financials"));
    // `canMutate` mirrors the record route's household answer; the card authorises every command server-side.
    const context = buildDurableHouseholdOperationalContext(household, false);
    return (
        <div className="mb-3" data-durable-record-lead="financials" data-financial-focus={start.status}>
            {start.notice ? (
                <p className="px-1 pb-2 text-[12px] text-alloy-midnight/60" data-financial-focus-notice={start.status}>
                    {start.notice}
                </p>
            ) : null}
            <FinancialsCard
                model={model}
                context={context}
                openCharge={start.openCharge}
                openCollection={start.openCollection}
                onSurfacesClosed={onChanged}
            />
        </div>
    );
}
