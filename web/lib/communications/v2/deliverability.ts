/**
 * Communications V2 — deliverability aggregation (PKG-16). PURE, no I/O, no React.
 *
 * Aggregates provider-neutral communication_delivery_events into operator metrics, computes domain
 * authentication status (SPF/DKIM/DMARC), normalizes carrier (10DLC) status, and evaluates alert
 * thresholds. Feeds the dark deliverability dashboard + GET route.
 */

export type DeliverabilityCounts = { sent: number; delivered: number; bounced: number; failed: number; complaints: number };

export type DeliverabilityMetrics = DeliverabilityCounts & {
    deliveryRate: number | null;
    bounceRate: number | null;
    complaintRate: number | null;
};

export function aggregateDeliverability(events: { event_type?: string | null }[]): DeliverabilityMetrics {
    const c: DeliverabilityCounts = { sent: 0, delivered: 0, bounced: 0, failed: 0, complaints: 0 };
    for (const e of events) {
        switch ((e.event_type ?? "").toLowerCase()) {
            case "sent": c.sent += 1; break;
            case "delivered": c.delivered += 1; break;
            case "bounced": c.bounced += 1; break;
            case "failed": c.failed += 1; break;
            case "complaint": c.complaints += 1; break;
            default: break;
        }
    }
    return {
        ...c,
        deliveryRate: c.sent > 0 ? c.delivered / c.sent : null,
        bounceRate: c.sent > 0 ? c.bounced / c.sent : null,
        complaintRate: c.delivered > 0 ? c.complaints / c.delivered : null,
    };
}

export type DomainAuth = { spf?: boolean; dkim?: boolean; dmarc?: boolean };

export function computeDomainAuthStatus(a: DomainAuth): "verified" | "partial" | "unverified" {
    const n = [a.spf, a.dkim, a.dmarc].filter(Boolean).length;
    return n === 3 ? "verified" : n === 0 ? "unverified" : "partial";
}

export function normalizeCarrierStatus(raw?: string | null): "registered" | "pending" | "unregistered" | "unknown" {
    const s = (raw ?? "").trim().toLowerCase();
    if (["registered", "approved", "active"].includes(s)) return "registered";
    if (["pending", "in_review", "submitted"].includes(s)) return "pending";
    if (["unregistered", "rejected", "none"].includes(s)) return "unregistered";
    return "unknown";
}

export type DeliverabilityThresholds = { maxBounceRate: number; maxComplaintRate: number };

export function evaluateDeliverabilityAlerts(
    metrics: { bounceRate: number | null; complaintRate: number | null },
    thresholds: DeliverabilityThresholds
): string[] {
    const alerts: string[] = [];
    if (metrics.bounceRate !== null && metrics.bounceRate > thresholds.maxBounceRate) alerts.push("bounce_rate_high");
    if (metrics.complaintRate !== null && metrics.complaintRate > thresholds.maxComplaintRate) alerts.push("complaint_rate_high");
    return alerts;
}
