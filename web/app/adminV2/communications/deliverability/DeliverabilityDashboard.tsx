"use client";

import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import {
    aggregateDeliverability,
    computeDomainAuthStatus,
    normalizeCarrierStatus,
    type DomainAuth,
} from "@/lib/communications/v2/deliverability";

/**
 * Deliverability dashboard (PKG-16) — DARK (self-gated behind comms_v2_deliverability).
 * Failures/bounce/unsubscribe/spam, domain auth (SPF/DKIM/DMARC), carrier (10DLC) status. Read-only
 * scaffold; live data wiring is a real-gate-validated follow-on.
 */
export default function DeliverabilityDashboard(props: {
    events?: { event_type?: string | null }[];
    domainAuth?: DomainAuth;
    carrierStatusRaw?: string | null;
}) {
    if (!isCommsV2FlagEnabled("comms_v2_deliverability")) return null;

    const m = aggregateDeliverability(props.events ?? []);
    const domain = computeDomainAuthStatus(props.domainAuth ?? {});
    const carrier = normalizeCarrierStatus(props.carrierStatusRaw);

    return (
        <div data-cc-deliverability className="grid grid-cols-3 gap-3 bg-white">
            <div data-cc-metric="delivery-rate" className="rounded-xl border border-alloy-stone/15 p-3 text-sm">
                Delivery rate: {m.deliveryRate === null ? "—" : `${Math.round(m.deliveryRate * 100)}%`}
            </div>
            <div data-cc-metric="bounce-rate" className="rounded-xl border border-alloy-stone/15 p-3 text-sm">
                Bounce rate: {m.bounceRate === null ? "—" : `${Math.round(m.bounceRate * 100)}%`}
            </div>
            <div data-cc-metric="domain-auth" className="rounded-xl border border-alloy-stone/15 p-3 text-sm">
                Domain: {domain} · Carrier: {carrier}
            </div>
        </div>
    );
}
