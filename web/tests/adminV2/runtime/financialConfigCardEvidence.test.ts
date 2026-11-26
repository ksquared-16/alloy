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
    tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
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
    it("HOLDS — no verdict — when no authoritative source has answered for tuition", () => {
        // Was: "blocked tone when no signals and no truth". That asserted the fabrication this
        // card shipped with: `tuition_rate_label` / `billing_configured` are written NOWHERE in the
        // platform, so every record reported "N items missing" with a BLOCKED tone — a business
        // conclusion manufactured from unwired plumbing. Unresolved is not unmet.
        const ev = buildBillingPreviewCardEvidence(ctx({}));
        expect(ev.isConfigured).toBe(false);
        expect(ev.statusTone).toBe("neutral");
        expect(ev.statusChip).toBeNull();
        expect(ev.answerLine).not.toMatch(/missing|not configured/i);
        const tuition = ev.readinessItems.find((i) => i.label === "Tuition rate");
        expect(tuition?.resolved).toBe(false);
        // Held, not resolved-empty.
        expect(ev.isEmpty).toBe(false);
    });

    it("reports missing only for items an authoritative source RESOLVED as absent", () => {
        // The financial-config API answered (empty result) → tuition is resolved-and-absent, and
        // the contact is genuinely unset. Now "missing" is truthful.
        const ev = buildBillingPreviewCardEvidence(ctx({}), []);
        const tuition = ev.readinessItems.find((i) => i.label === "Tuition rate");
        expect(tuition?.resolved).toBe(true);
        expect(tuition?.met).toBe(false);
        expect(ev.statusTone).toBe("blocked");
        expect(ev.statusChip).toMatch(/missing/i);
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

    it("never produces payer rows or responsibility data in the evidence shape", () => {
        // The evidence type does not include payer_rows, responsibility_type,
        // payment_method, subsidy, or split_percent. These are deferred.
        const ev = buildBillingPreviewCardEvidence(ctx({}));
        expect("payer_rows" in ev).toBe(false);
        expect("responsibility_type" in ev).toBe(false);
        expect("payment_method" in ev).toBe(false);
        expect("split_percent" in ev).toBe(false);
    });

    it("BillingPreviewCardEvidence has no mutation-related fields", () => {
        // V1 is read-only: no onSave, onEdit, onAssign, or draft fields.
        const ev = buildBillingPreviewCardEvidence(ctx({}));
        expect("onSave" in ev).toBe(false);
        expect("draftBillingContact" in ev).toBe(false);
        expect("editMode" in ev).toBe(false);
    });
});

// ── Hook lazy-fetch contract ──────────────────────────────────────────────────
//
// useFinancialConfig(opportunityId, open) — early-return guard:
//   if (!open || !opportunityId) return;
//
// This ensures the API is never called on summary state (open=false).
// The hook is a "use client" React hook; behavioral tests require renderHook
// from @testing-library/react, which needs a browser-like environment.
// The guard is documented and verified in BillingPreviewCard.tsx — the hook
// is invoked as useFinancialConfig(opportunityId, overlayOpen), where
// overlayOpen starts false and is only set true by user interaction.
//
// Structural verification: evidence.enrollments is null until the hook resolves,
// which is covered by the "enrollments is null when not provided" test above.

// ── Multiple children — end-to-end evidence shape ────────────────────────────

describe("multiple children with mixed enrollment state", () => {
    const twoChildrenTruth = {
        _inquiry_children: [
            {
                display_name: "Emma Smith",
                desired_program_label: "Preschool",
                program_room_cohort_label: "Room A",
                desired_schedule_label: "Full Time",
            },
            {
                display_name: "Liam Smith",
                // No placement set — desired_program_label absent
                desired_program_label: null,
                program_room_cohort_label: null,
                desired_schedule_label: null,
            },
        ],
    };

    it("returns two placement facts for two children", () => {
        const ev = buildBillingPreviewCardEvidence(ctx(twoChildrenTruth));
        expect(ev.placementFacts).toHaveLength(2);
    });

    it("second child has null program/room/schedule labels", () => {
        const ev = buildBillingPreviewCardEvidence(ctx(twoChildrenTruth));
        expect(ev.placementFacts[1]?.programLabel).toBeNull();
        expect(ev.placementFacts[1]?.roomLabel).toBeNull();
        expect(ev.placementFacts[1]?.scheduleLabel).toBeNull();
    });

    it("enrollment array preserves both children with their OCM IDs", () => {
        const enrollments: FinancialConfigEnrollment[] = [
            { ...ENROLLMENT_WITH_RATE, childLabel: "Emma Smith" },
            { ...ENROLLMENT_NO_RATE, childLabel: "Liam Smith" },
        ];
        const ev = buildBillingPreviewCardEvidence(ctx(twoChildrenTruth), enrollments);
        expect(ev.enrollments).toHaveLength(2);
        expect(ev.enrollments?.[0]?.resolvedRate).not.toBeNull();
        expect(ev.enrollments?.[1]?.resolvedRate).toBeNull();
    });
});
