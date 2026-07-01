import { describe, expect, it } from "vitest";

import { buildBillingPreviewCardEvidence } from "@/lib/adminV2/runtime/focusPanel/billingPreview/buildBillingPreviewCardEvidence";
import type { FinancialConfigEnrollment } from "@/lib/adminV2/runtime/focusPanel/financialConfig/financialConfigTypes";
import type {
    OperationalBillingSignal,
    OperationalContext,
    OperationalContextSignals,
} from "@/lib/adminV2/runtime/operationalContext/types";

// ── Fixtures ────────────────────────────────────────────────────────────────

const EMPTY_SIGNALS: OperationalContextSignals = {
    work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
    attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
    tour: { scheduled: false, startAt: null, statusLabel: null, bookingId: null },
    communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
    billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null },
};

function ctx(
    truth: Record<string, unknown>,
    billing: Partial<OperationalBillingSignal> = {},
): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-test", label: "Test Household" },
        businessProcess: { key: null, label: null, stageKey: null },
        perspective: null,
        truth,
        signals: {
            ...EMPTY_SIGNALS,
            billing: { ...EMPTY_SIGNALS.billing, ...billing },
        },
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
    };
}

const ENROLLMENT_WITH_RATE: FinancialConfigEnrollment = {
    ocmId: "ocm-1",
    childLabel: "Emma Smith",
    programKey: "preschool",
    scheduleKey: "full_time",
    locationId: null,
    resolvedRate: {
        rateId: "rate-1",
        rateCents: 120000,
        billingPeriod: "monthly",
        rateLabel: "$1,200/month",
        isLocationOverride: false,
    },
};

const ENROLLMENT_NO_RATE: FinancialConfigEnrollment = {
    ocmId: "ocm-2",
    childLabel: "Liam Smith",
    programKey: "infant",
    scheduleKey: "part_time",
    locationId: null,
    resolvedRate: null,
};

// ── Evidence shape ───────────────────────────────────────────────────────────

describe("buildBillingPreviewCardEvidence", () => {
    it("returns isConfigured=false and blocked tone when no signals and no truth", () => {
        // Both readiness items (contact + tuition) are unmet → blocked, not neutral
        const ev = buildBillingPreviewCardEvidence(ctx({}));
        expect(ev.isConfigured).toBe(false);
        expect(ev.statusTone).toBe("blocked");
        expect(ev.isEmpty).toBe(false);
    });

    it("shows blocked state when billing contact is missing", () => {
        const ev = buildBillingPreviewCardEvidence(ctx({}, { tuitionRateLabel: "$1,200/month" }));
        expect(ev.statusTone).toBe("blocked");
        expect(ev.statusChip).toMatch(/missing/i);
    });

    it("shows ready state when billingConfigured is true", () => {
        const ev = buildBillingPreviewCardEvidence(ctx({}, { billingConfigured: true, tuitionRateLabel: "$1,200/month" }));
        expect(ev.isConfigured).toBe(true);
        expect(ev.statusTone).toBe("ready");
        expect(ev.statusChip).toBe("Configured");
    });

    it("shows ready when billing contact + tuition rate both present", () => {
        const ev = buildBillingPreviewCardEvidence(ctx({}, {
            billingContactName: "Jane Smith",
            tuitionRateLabel: "$800/month",
        }));
        expect(ev.isConfigured).toBe(true);
        expect(ev.billingContactName).toBe("Jane Smith");
        expect(ev.tuitionRateLabel).toBe("$800/month");
    });

    it("includes billing contact email in readiness detail when name absent", () => {
        const ev = buildBillingPreviewCardEvidence(ctx({}, { billingContactEmail: "jane@example.com" }));
        const contactItem = ev.readinessItems.find((i) => i.label === "Billing contact");
        expect(contactItem?.detail).toBe("jane@example.com");
    });
});

// ── Placement facts ──────────────────────────────────────────────────────────

describe("placement facts from _inquiry_children", () => {
    const childTruth = {
        _inquiry_children: [
            {
                display_name: "Emma Smith",
                desired_program_label: "Preschool",
                program_room_cohort_label: "Room A",
                desired_schedule_label: "Full Time",
            },
            {
                display_name: "Liam Smith",
                desired_program_label: "Infant",
                program_room_cohort_label: null,
                desired_schedule_label: "Part Time",
            },
        ],
    };

    it("maps _inquiry_children to placement facts", () => {
        const ev = buildBillingPreviewCardEvidence(ctx(childTruth));
        expect(ev.placementFacts).toHaveLength(2);
        expect(ev.placementFacts[0]?.childLabel).toBe("Emma Smith");
        expect(ev.placementFacts[0]?.programLabel).toBe("Preschool");
        expect(ev.placementFacts[0]?.roomLabel).toBe("Room A");
        expect(ev.placementFacts[0]?.scheduleLabel).toBe("Full Time");
    });

    it("returns empty placementFacts when no children", () => {
        const ev = buildBillingPreviewCardEvidence(ctx({}));
        expect(ev.placementFacts).toHaveLength(0);
    });
});

// ── Enrollment / tuition rate enrichment ────────────────────────────────────

describe("tuition rate enrichment via enrollments param", () => {
    it("enrollments is null when not provided (pre-API-fetch state)", () => {
        const ev = buildBillingPreviewCardEvidence(ctx({}));
        expect(ev.enrollments).toBeNull();
    });

    it("enrollments reflects passed-in API data", () => {
        const ev = buildBillingPreviewCardEvidence(ctx({}), [ENROLLMENT_WITH_RATE]);
        expect(ev.enrollments).toHaveLength(1);
        expect(ev.enrollments?.[0]?.resolvedRate?.rateLabel).toBe("$1,200/month");
    });

    it("enrollment with no matched rate has resolvedRate null", () => {
        const ev = buildBillingPreviewCardEvidence(ctx({}), [ENROLLMENT_NO_RATE]);
        expect(ev.enrollments?.[0]?.resolvedRate).toBeNull();
    });

    it("can hold multiple enrollments", () => {
        const ev = buildBillingPreviewCardEvidence(ctx({}), [ENROLLMENT_WITH_RATE, ENROLLMENT_NO_RATE]);
        expect(ev.enrollments).toHaveLength(2);
        expect(ev.enrollments?.[0]?.ocmId).toBe("ocm-1");
        expect(ev.enrollments?.[1]?.ocmId).toBe("ocm-2");
    });
});

// ── Responsibility missing-state ─────────────────────────────────────────────

describe("billing responsibility missing-state", () => {
    it("responsibilityConfigured is false when not in truth (default)", () => {
        const ev = buildBillingPreviewCardEvidence(ctx({}));
        expect(ev.responsibilityConfigured).toBe(false);
    });

    it("responsibilityConfigured is true when truth flag is set", () => {
        const ev = buildBillingPreviewCardEvidence(ctx({ billing_responsibility_configured: true }));
        expect(ev.responsibilityConfigured).toBe(true);
    });
});

// ── Balance label ────────────────────────────────────────────────────────────

describe("balance label formatting", () => {
    it("formats positive balance", () => {
        const ev = buildBillingPreviewCardEvidence(ctx({}, { feeBalanceCents: 150050 }));
        expect(ev.balanceLabel).toBe("$1,500.50 due");
    });

    it("returns null balance when zero", () => {
        const ev = buildBillingPreviewCardEvidence(ctx({}, { feeBalanceCents: 0 }));
        expect(ev.balanceLabel).toBeNull();
    });

    it("returns null balance when null", () => {
        const ev = buildBillingPreviewCardEvidence(ctx({}));
        expect(ev.balanceLabel).toBeNull();
    });
});

// ── Invariants ───────────────────────────────────────────────────────────────

describe("hard invariants (no fabrication)", () => {
    it("never fabricates payer data — responsibilityConfigured defaults false", () => {
        const ev = buildBillingPreviewCardEvidence(ctx({}));
        expect(ev.responsibilityConfigured).toBe(false);
    });

    it("never fabricates billing contact when absent", () => {
        const ev = buildBillingPreviewCardEvidence(ctx({}));
        expect(ev.billingContactName).toBeNull();
        expect(ev.billingContactEmail).toBeNull();
    });

    it("never fabricates tuition rate label when absent", () => {
        const ev = buildBillingPreviewCardEvidence(ctx({}));
        expect(ev.tuitionRateLabel).toBeNull();
    });

    it("readinessItems always includes billing_contact and tuition_rate checks", () => {
        const ev = buildBillingPreviewCardEvidence(ctx({}));
        const labels = ev.readinessItems.map((i) => i.label);
        expect(labels).toContain("Billing contact");
        expect(labels).toContain("Tuition rate");
    });
});
