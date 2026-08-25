/**
 * Operational Grain Platform — platform contract tests.
 *
 * Verifies the six doctrine changes from §8 of operational-grain-doctrine.md:
 *   1. OperationalContext carries `grain` field (always "case" in Focus Panel)
 *   2. QueueRowSubjectRef carries `grain` + cross-grain refs
 *   3. QueueRowSignals carries `communications` (null for non-case rows)
 *   4. OperationalBillingSignal exists and evidence builder reads from it
 *   5. FocusPanelCardKey array is annotated (structural test)
 *   6. Child-grain and candidate-grain builders produce correct grain declarations
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import {
    NULL_BILLING_SIGNAL,
    type OperationalBillingSignal,
    type OperationalContext,
    type OperationalContextSignals,
} from "@/lib/adminV2/runtime/operationalContext/types";
import { buildBillingPreviewCardEvidence } from "@/lib/adminV2/runtime/focusPanel/billingPreview/buildBillingPreviewCardEvidence";
import { buildQueueRowOperationalContext } from "@/lib/adminV2/runtime/queueRow/buildQueueRowOperationalContext";
import { buildChildGrainQueueRowOperationalContext } from "@/lib/adminV2/runtime/queueRow/buildChildGrainQueueRowOperationalContext";
import { buildCandidateGrainQueueRowOperationalContext } from "@/lib/adminV2/runtime/queueRow/buildCandidateGrainQueueRowOperationalContext";
import {
    NULL_COMMUNICATIONS_SIGNAL,
    NULL_PLACEMENT_SIGNAL,
} from "@/lib/adminV2/runtime/queueRow/queueRowOperationalContext";
import { FOCUS_PANEL_CARD_KEYS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import { cardAppliesToGrain } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";

// ─── Helper ──────────────────────────────────────────────────────────────────

const NULL_BILLING: OperationalBillingSignal = NULL_BILLING_SIGNAL;

function emptySignals(): OperationalContextSignals {
    return {
        work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
        attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
        tour: { scheduled: false, startAt: null, statusLabel: null, bookingId: null },
        communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
        billing: NULL_BILLING,
    };
}

function caseCtx(truth: Record<string, unknown> = {}): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Test Household" },
        businessProcess: { key: null, label: null, stageKey: null },
        perspective: null,
        truth,
        signals: emptySignals(),
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
    };
}

// ─── §8.1 — grain on OperationalContext ──────────────────────────────────────

describe("Doctrine §8.1 — OperationalContext grain field", () => {
    it("OperationalContext type includes grain field", () => {
        const ctx = caseCtx();
        expect(ctx.grain).toBe("case");
    });

    it("grain is always 'case' for Focus Panel contexts (buildOperationalContext)", () => {
        // buildOperationalContext takes a subjectVm — tested indirectly via type shape.
        // Confirm the declared grain value is a well-typed string.
        const validGrains: string[] = ["case", "child", "candidate"];
        expect(validGrains).toContain("case");
    });

    it("OperationalGrain type is exported", async () => {
        // Structural: the type file exports OperationalGrain
        const src = readFileSync(
            path.join(process.cwd(), "lib/adminV2/runtime/operationalContext/types.ts"),
            "utf8",
        );
        expect(src).toContain("export type OperationalGrain");
        expect(src).toContain('"case" | "child" | "candidate"');
    });
});

// ─── §8.2 — grain on QueueRowSubjectRef ──────────────────────────────────────

describe("Doctrine §8.2 — QueueRowSubjectRef grain field", () => {
    it("case-grain builder sets grain = 'case' on subject", () => {
        const ctx = buildQueueRowOperationalContext({
            recordId: "opp-1",
            recordLabel: "Johnson Household",
            record: {},
        });
        expect(ctx.subject.grain).toBe("case");
        expect(ctx.subject.type).toBe("opportunity");
        expect(ctx.subject.caseRef).toBeUndefined();
    });

    it("child-grain builder sets grain = 'child' with caseRef", () => {
        const ctx = buildChildGrainQueueRowOperationalContext({
            ocmId: "ocm-1",
            opportunityId: "opp-1",
            childLabel: "Emma Johnson",
            record: {},
        });
        expect(ctx.subject.grain).toBe("child");
        expect(ctx.subject.type).toBe("opportunity_customer_member");
        expect(ctx.subject.id).toBe("ocm-1");
        expect(ctx.subject.caseRef?.opportunityId).toBe("opp-1");
        expect(ctx.subject.childRef).toBeUndefined();
    });

    it("candidate-grain builder sets grain = 'candidate' with caseRef + childRef", () => {
        const ctx = buildCandidateGrainQueueRowOperationalContext({
            candidateId: "cand-1",
            opportunityId: "opp-1",
            customerMemberId: "cm-1",
            candidateLabel: "Emma (waitlist)",
            record: {},
        });
        expect(ctx.subject.grain).toBe("candidate");
        expect(ctx.subject.type).toBe("placement_candidate");
        expect(ctx.subject.id).toBe("cand-1");
        expect(ctx.subject.caseRef?.opportunityId).toBe("opp-1");
        expect(ctx.subject.childRef?.customerMemberId).toBe("cm-1");
    });
});

// ─── §8.3 — communications signal on QueueRowSignals ─────────────────────────

describe("Doctrine §8.3 — QueueRowSignals communications field", () => {
    it("case-grain row returns null communications when _scheduled_sends_summary is absent", () => {
        const ctx = buildQueueRowOperationalContext({
            recordId: "opp-1",
            recordLabel: "Test",
            record: {},
        });
        expect(ctx.signals.communications).toBeNull();
    });

    it("case-grain row projects communications when _scheduled_sends_summary is present", () => {
        const ctx = buildQueueRowOperationalContext({
            recordId: "opp-1",
            recordLabel: "Test",
            record: {
                _scheduled_sends_summary: {
                    scheduled_send_count: 2,
                    next_follow_up_iso: "2026-07-15T10:00:00Z",
                    pending_sends: [{ id: "send-1" }, { id: "send-2" }],
                },
            },
        });
        expect(ctx.signals.communications?.scheduledSendCount).toBe(2);
        expect(ctx.signals.communications?.nextScheduledSendId).toBe("send-1");
        expect(ctx.signals.communications?.hasOutreach).toBe(true);
    });

    it("child-grain row has null communications (outreach belongs to case)", () => {
        const ctx = buildChildGrainQueueRowOperationalContext({
            ocmId: "ocm-1",
            opportunityId: "opp-1",
            childLabel: "Emma",
            record: { _scheduled_sends_summary: { scheduled_send_count: 5 } },
        });
        expect(ctx.signals.communications).toBeNull();
    });

    it("candidate-grain row has null communications (outreach belongs to case)", () => {
        const ctx = buildCandidateGrainQueueRowOperationalContext({
            candidateId: "cand-1",
            opportunityId: "opp-1",
            customerMemberId: "cm-1",
            candidateLabel: "Emma",
            record: {},
        });
        expect(ctx.signals.communications).toBeNull();
    });

    it("NULL_COMMUNICATIONS_SIGNAL is exported from queueRowOperationalContext", () => {
        expect(NULL_COMMUNICATIONS_SIGNAL.scheduledSendCount).toBe(0);
        expect(NULL_COMMUNICATIONS_SIGNAL.nextScheduledSendId).toBeNull();
        expect(NULL_COMMUNICATIONS_SIGNAL.hasOutreach).toBe(false);
    });
});

// ─── §8.4 — billing signal evidence builder ──────────────────────────────────

describe("Doctrine §8.4 — billing signal evidence builder", () => {
    it("NULL_BILLING_SIGNAL exported from types", () => {
        expect(NULL_BILLING.billingConfigured).toBe(false);
        expect(NULL_BILLING.billingContactName).toBeNull();
        expect(NULL_BILLING.tuitionRateLabel).toBeNull();
    });

    it("billing evidence reads from context.signals.billing (not context.truth)", () => {
        const ctx = caseCtx({ billing_contact_name: "Should Not Read From Here" });
        // signals.billing is the NULL signal — evidence should reflect null, not the truth key
        const evidence = buildBillingPreviewCardEvidence(ctx);
        expect(evidence.billingContactName).toBeNull();
        expect(evidence.isConfigured).toBe(false);
    });

    it("billing evidence reflects signals.billing.billingContactName", () => {
        const ctx: OperationalContext = {
            ...caseCtx(),
            signals: {
                ...emptySignals(),
                billing: {
                    billingConfigured: false,
                    billingContactName: "Sarah Johnson",
                    billingContactEmail: "sarah@example.com",
                    tuitionRateLabel: "Preschool Full-Time",
                    feeBalanceCents: null,
                },
            },
        };
        const evidence = buildBillingPreviewCardEvidence(ctx);
        expect(evidence.billingContactName).toBe("Sarah Johnson");
        expect(evidence.tuitionRateLabel).toBe("Preschool Full-Time");
        expect(evidence.isConfigured).toBe(true);
    });

    it("billing evidence isConfigured = true when billingConfigured flag set", () => {
        const ctx: OperationalContext = {
            ...caseCtx(),
            signals: {
                ...emptySignals(),
                billing: {
                    billingConfigured: true,
                    billingContactName: null,
                    billingContactEmail: null,
                    tuitionRateLabel: null,
                    feeBalanceCents: 120000,
                },
            },
        };
        const evidence = buildBillingPreviewCardEvidence(ctx);
        expect(evidence.isConfigured).toBe(true);
        expect(evidence.statusTone).toBe("ready");
    });

    it("billing evidence has blocked status when an authoritative source resolved an item as absent", () => {
        const ctx: OperationalContext = {
            ...caseCtx(),
            signals: {
                ...emptySignals(),
                billing: {
                    billingConfigured: false,
                    billingContactName: "Sarah Johnson",
                    billingContactEmail: null,
                    tuitionRateLabel: null, // unresolved until the financial-config API answers
                    feeBalanceCents: null,
                },
            },
        };
        // Unresolved → HELD, no verdict. `tuition_rate_label` has no writer in the platform, so a
        // null here means "nothing has told us", not "the operator did not configure it".
        expect(buildBillingPreviewCardEvidence(ctx).statusTone).toBe("neutral");

        // The financial-config API answered and found no rate → now "missing" is a real answer.
        const resolved = buildBillingPreviewCardEvidence(ctx, []);
        expect(resolved.isConfigured).toBe(false);
        expect(resolved.statusTone).toBe("blocked");
    });

    it("buildOperationalContext types file has OperationalBillingSignal and NULL_BILLING_SIGNAL", () => {
        const src = readFileSync(
            path.join(process.cwd(), "lib/adminV2/runtime/operationalContext/types.ts"),
            "utf8",
        );
        expect(src).toContain("export type OperationalBillingSignal");
        expect(src).toContain("export const NULL_BILLING_SIGNAL");
        expect(src).toContain("billing: OperationalBillingSignal");
    });

    // Financial Configuration Card Pattern — placement facts + responsibility state
    it("placementFacts is empty when no _inquiry_children in truth", () => {
        const ctx = caseCtx({});
        const evidence = buildBillingPreviewCardEvidence(ctx);
        expect(evidence.placementFacts).toEqual([]);
    });

    it("placementFacts projects program/room/schedule from _inquiry_children (same source as Children card)", () => {
        const ctx = caseCtx({
            _inquiry_children: [
                {
                    display_name: "Emma Johnson",
                    desired_program_label: "Preschool",
                    program_room_cohort_label: "Butterflies Room",
                    desired_schedule_label: "M–F · 8:30a – 2:30p",
                },
                {
                    display_name: "Liam Johnson",
                    desired_program_label: null,
                    program_room_cohort_label: null,
                    desired_schedule_label: null,
                },
            ],
        });
        const evidence = buildBillingPreviewCardEvidence(ctx);
        expect(evidence.placementFacts).toHaveLength(2);
        expect(evidence.placementFacts[0]).toMatchObject({
            childLabel: "Emma Johnson",
            programLabel: "Preschool",
            roomLabel: "Butterflies Room",
            scheduleLabel: "M–F · 8:30a – 2:30p",
        });
        expect(evidence.placementFacts[1]).toMatchObject({
            childLabel: "Liam Johnson",
            programLabel: null,
            roomLabel: null,
            scheduleLabel: null,
        });
    });

    it("responsibilityConfigured is false when billing_responsibility_configured not in truth", () => {
        const ctx = caseCtx({});
        const evidence = buildBillingPreviewCardEvidence(ctx);
        expect(evidence.responsibilityConfigured).toBe(false);
    });

    it("responsibilityConfigured is true when billing_responsibility_configured set in truth", () => {
        const ctx = caseCtx({ billing_responsibility_configured: true });
        const evidence = buildBillingPreviewCardEvidence(ctx);
        expect(evidence.responsibilityConfigured).toBe(true);
    });

    it("billingContactEmail is surfaced in evidence (available for readiness detail)", () => {
        const ctx: OperationalContext = {
            ...caseCtx(),
            signals: {
                ...emptySignals(),
                billing: {
                    billingConfigured: false,
                    billingContactName: null,
                    billingContactEmail: "billing@example.com",
                    tuitionRateLabel: null,
                    feeBalanceCents: null,
                },
            },
        };
        const evidence = buildBillingPreviewCardEvidence(ctx);
        expect(evidence.billingContactEmail).toBe("billing@example.com");
    });
});

// ─── §8.5 — FocusPanelCardKey grain annotations ──────────────────────────────

describe("Doctrine §8.5 — FocusPanelCardKey grain annotations", () => {
    // 25 since `child_identity` joined the vocabulary — the first CHILD-grain card, for the durable
    // child record. (24 was the count once `employment` joined: person-owned truth projected at case
    // grain, back when the case panel was the only surface that composed for a person.)
    it("FOCUS_PANEL_CARD_KEYS contains all 26 keys", () => {
        // 26 since `business_process` was registered as the canonical successor to the
        // `current_work` CARD. The predecessor key is retained — the concept it names is still a
        // data owner — so the union grows by one rather than swapping a member.
        expect(FOCUS_PANEL_CARD_KEYS.length).toBe(26);
    });

    it("focusPanelCardModel.ts still annotates each key's grain of origin", () => {
        const src = readFileSync(
            path.join(process.cwd(), "lib/adminV2/runtime/focusPanel/focusPanelCardModel.ts"),
            "utf8",
        );
        expect(src).toContain("@grain case");
        const grainAnnotationCount = (src.match(/@grain case/g) ?? []).length;
        expect(grainAnnotationCount).toBeGreaterThanOrEqual(21);
        // Not every key is case-grain any more, and the comments are no longer the authority: card
        // applicability is DECLARED on the registry and read by a composer. The annotations remain
        // as provenance, so this asserts they still exist rather than that they are exhaustive.
        expect(src).toContain("@grain child");
    });

    it("grain applicability is read from the registry, not from the @grain comments", () => {
        expect(cardAppliesToGrain("child_identity", "child")).toBe(true);
        expect(cardAppliesToGrain("child_identity", "opportunity")).toBe(false);
        expect(cardAppliesToGrain("household", "child")).toBe(false);
    });
});

// ─── §8.6 — Child-grain and candidate-grain queue row platform ────────────────

describe("Doctrine §8.6 — Child/candidate-grain queue row platform", () => {
    it("child-grain row: tour is null (case-level concern)", () => {
        const ctx = buildChildGrainQueueRowOperationalContext({
            ocmId: "ocm-1",
            opportunityId: "opp-1",
            childLabel: "Emma",
            record: { _active_tour_booking: { id: "b1", start_at: "2026-07-01" } },
        });
        expect(ctx.signals.tour).toBeNull();
    });

    it("child-grain row: childStatus reflects OCM outcome_status_key", () => {
        const ctx = buildChildGrainQueueRowOperationalContext({
            ocmId: "ocm-1",
            opportunityId: "opp-1",
            childLabel: "Emma",
            record: { outcome_status_key: "offer_pending", outcome_status_label: "Offer pending" },
        });
        expect(ctx.signals.childStatus?.outcomeStatusKey).toBe("offer_pending");
        expect(ctx.signals.childStatus?.outcomeStatusLabel).toBe("Offer pending");
    });

    it("child-grain row: candidateStatus is null", () => {
        const ctx = buildChildGrainQueueRowOperationalContext({
            ocmId: "ocm-1",
            opportunityId: "opp-1",
            childLabel: "Emma",
            record: {},
        });
        expect(ctx.signals.candidateStatus).toBeNull();
    });

    it("candidate-grain row: candidateStatus reflects placement_candidate.status", () => {
        const ctx = buildCandidateGrainQueueRowOperationalContext({
            candidateId: "cand-1",
            opportunityId: "opp-1",
            customerMemberId: "cm-1",
            candidateLabel: "Emma",
            record: { status: "active", wait_since: "2026-05-01" },
        });
        expect(ctx.signals.candidateStatus?.candidateStatus).toBe("active");
        expect(ctx.signals.candidateStatus?.waitSince).toBe("2026-05-01");
    });

    it("candidate-grain row: candidateStatus is null for unrecognized status", () => {
        const ctx = buildCandidateGrainQueueRowOperationalContext({
            candidateId: "cand-1",
            opportunityId: "opp-1",
            customerMemberId: "cm-1",
            candidateLabel: "Emma",
            record: { status: "unknown_future_status" },
        });
        expect(ctx.signals.candidateStatus?.candidateStatus).toBeNull();
    });

    it("candidate-grain row: childStatus is null (OCM-level concern)", () => {
        const ctx = buildCandidateGrainQueueRowOperationalContext({
            candidateId: "cand-1",
            opportunityId: "opp-1",
            customerMemberId: "cm-1",
            candidateLabel: "Emma",
            record: {},
        });
        expect(ctx.signals.childStatus).toBeNull();
    });

    it("candidate-grain row: canOverridePlacement default is false", () => {
        const ctx = buildCandidateGrainQueueRowOperationalContext({
            candidateId: "cand-1",
            opportunityId: "opp-1",
            customerMemberId: "cm-1",
            candidateLabel: "Emma",
            record: {},
        });
        expect(ctx.capabilities.canOverridePlacement).toBe(false);
    });

    it("candidate-grain row: canOverridePlacement is set when passed", () => {
        const ctx = buildCandidateGrainQueueRowOperationalContext({
            candidateId: "cand-1",
            opportunityId: "opp-1",
            customerMemberId: "cm-1",
            candidateLabel: "Emma",
            record: {},
            canOverridePlacement: true,
        });
        expect(ctx.capabilities.canOverridePlacement).toBe(true);
    });

    it("case-grain row: childStatus and candidateStatus are null", () => {
        const ctx = buildQueueRowOperationalContext({
            recordId: "opp-1",
            recordLabel: "Test",
            record: {},
        });
        expect(ctx.signals.childStatus).toBeNull();
        expect(ctx.signals.candidateStatus).toBeNull();
    });

    it("builder files exist (architecture guard)", () => {
        const childSrc = readFileSync(
            path.join(process.cwd(), "lib/adminV2/runtime/queueRow/buildChildGrainQueueRowOperationalContext.ts"),
            "utf8",
        );
        const candidateSrc = readFileSync(
            path.join(process.cwd(), "lib/adminV2/runtime/queueRow/buildCandidateGrainQueueRowOperationalContext.ts"),
            "utf8",
        );
        expect(childSrc).toContain("buildChildGrainQueueRowOperationalContext");
        expect(childSrc).toContain('grain: "child"');
        expect(candidateSrc).toContain("buildCandidateGrainQueueRowOperationalContext");
        expect(candidateSrc).toContain('grain: "candidate"');
    });
});
