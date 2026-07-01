import { describe, expect, it } from "vitest";
import {
    aggregateDeliverability,
    computeDomainAuthStatus,
    normalizeCarrierStatus,
    evaluateDeliverabilityAlerts,
} from "@/lib/communications/v2/deliverability";

describe("aggregateDeliverability", () => {
    it("counts events and computes rates", () => {
        const m = aggregateDeliverability([
            { event_type: "sent" }, { event_type: "sent" }, { event_type: "sent" }, { event_type: "sent" },
            { event_type: "delivered" }, { event_type: "delivered" }, { event_type: "delivered" },
            { event_type: "bounced" }, { event_type: "complaint" },
        ]);
        expect(m.sent).toBe(4);
        expect(m.delivered).toBe(3);
        expect(m.bounced).toBe(1);
        expect(m.deliveryRate).toBeCloseTo(0.75);
        expect(m.bounceRate).toBeCloseTo(0.25);
        expect(m.complaintRate).toBeCloseTo(1 / 3);
    });
    it("null rates when no sends", () => {
        const m = aggregateDeliverability([]);
        expect(m.deliveryRate).toBeNull();
        expect(m.bounceRate).toBeNull();
        expect(m.complaintRate).toBeNull();
    });
});

describe("domain auth + carrier + alerts", () => {
    it("domain auth status", () => {
        expect(computeDomainAuthStatus({ spf: true, dkim: true, dmarc: true })).toBe("verified");
        expect(computeDomainAuthStatus({ spf: true })).toBe("partial");
        expect(computeDomainAuthStatus({})).toBe("unverified");
    });
    it("carrier normalization", () => {
        expect(normalizeCarrierStatus("approved")).toBe("registered");
        expect(normalizeCarrierStatus("in_review")).toBe("pending");
        expect(normalizeCarrierStatus("rejected")).toBe("unregistered");
        expect(normalizeCarrierStatus("???")).toBe("unknown");
    });
    it("alert thresholds", () => {
        expect(evaluateDeliverabilityAlerts({ bounceRate: 0.2, complaintRate: 0.01 }, { maxBounceRate: 0.1, maxComplaintRate: 0.05 })).toEqual(["bounce_rate_high"]);
        expect(evaluateDeliverabilityAlerts({ bounceRate: 0.05, complaintRate: 0.1 }, { maxBounceRate: 0.1, maxComplaintRate: 0.05 })).toEqual(["complaint_rate_high"]);
        expect(evaluateDeliverabilityAlerts({ bounceRate: null, complaintRate: null }, { maxBounceRate: 0.1, maxComplaintRate: 0.05 })).toEqual([]);
    });
});
