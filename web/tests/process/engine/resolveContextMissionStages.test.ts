/**
 * Context Mission resolution — Effective Process Position drives What's Next.
 */

import { describe, expect, it } from "vitest";

import {
    effectiveParticipantStageKeysFromRow,
    resolveContextMissionStages,
} from "@/lib/process/engine/resolveContextMissionStages";
import { overlayContextMissionOntoSettledFocusModel } from "@/lib/adminV2/runtime/focusPanel/overlayContextMissionOntoSettledFocusModel";
import type { FocusPanelCommitCriticalInput } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalInput";
import type { FocusPanelWorkModeModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import { buildWhatsNextContextFacts } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildWhatsNextCardPresentation";
import type { CurrentWorkSurfaceVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

describe("resolveContextMissionStages", () => {
    it("A. homogeneous inherited Lead — Mission Lead from participants", () => {
        const r = resolveContextMissionStages({
            contextStageKey: "lead",
            effectiveParticipantStageKeys: ["lead", "lead"],
            workViewLensStageKeys: [],
        });
        expect(r.missionStageKeys).toEqual(["lead"]);
        expect(r.homogeneous).toBe(true);
        expect(r.primaryMissionStageKey).toBe("lead");
        expect(r.derivedFromEffectiveParticipants).toBe(true);
        expect(r.source).toBe("effective_participants");
    });

    it("B. raw family Lead + both child Waitlist → Waitlist Mission (no Contact Family fallback)", () => {
        const r = resolveContextMissionStages({
            contextStageKey: "lead",
            effectiveParticipantStageKeys: ["waitlist", "waitlist"],
            workViewLensStageKeys: [], // inventory / catch-all
        });
        expect(r.missionStageKeys).toEqual(["waitlist"]);
        expect(r.primaryMissionStageKey).toBe("waitlist");
        expect(r.missionStageKeys).not.toContain("lead");
        expect(r.derivedFromEffectiveParticipants).toBe(true);
        expect(r.contributingParticipantCount).toBe(2);
    });

    it("C. mixed Lead + Waitlist → both tracks", () => {
        const r = resolveContextMissionStages({
            contextStageKey: "lead",
            effectiveParticipantStageKeys: ["waitlist", "lead"],
            workViewLensStageKeys: [],
        });
        expect(r.missionStageKeys).toEqual(["waitlist", "lead"]);
        expect(r.homogeneous).toBe(false);
        expect(r.primaryMissionStageKey).toBe("waitlist");
    });

    it("D. shared Tour + explicit Waitlist → Tour · Waitlist Mission", () => {
        const r = resolveContextMissionStages({
            contextStageKey: "tour",
            effectiveParticipantStageKeys: ["waitlist", "tour"],
            workViewLensStageKeys: [],
        });
        expect(r.missionStageKeys).toEqual(["waitlist", "tour"]);
        expect(r.homogeneous).toBe(false);
        expect(r.missionStageKeys).toContain("tour");
        expect(r.missionStageKeys).toContain("waitlist");
    });

    it("inventory Work View (empty lens) does not impose stage Mission from context alone when participants diverge", () => {
        const r = resolveContextMissionStages({
            contextStageKey: "lead",
            effectiveParticipantStageKeys: ["waitlist", "waitlist"],
            workViewLensStageKeys: [],
        });
        expect(r.source).toBe("effective_participants");
        expect(r.primaryMissionStageKey).toBe("waitlist");
    });

    it("stage-scoped Work View supplies strong Mission context via lens intersection", () => {
        const r = resolveContextMissionStages({
            contextStageKey: "tour",
            effectiveParticipantStageKeys: ["waitlist", "tour"],
            workViewLensStageKeys: ["tour"],
        });
        expect(r.source).toBe("work_view_lens");
        expect(r.missionStageKeys).toEqual(["tour"]);
        expect(r.primaryMissionStageKey).toBe("tour");
    });

    it("no participants → shared context stage still matters", () => {
        const r = resolveContextMissionStages({
            contextStageKey: "lead",
            effectiveParticipantStageKeys: [],
            workViewLensStageKeys: [],
        });
        expect(r.source).toBe("context_stage");
        expect(r.primaryMissionStageKey).toBe("lead");
        expect(r.derivedFromEffectiveParticipants).toBe(false);
    });

    it("access/location filtering is upstream — empty authorized set falls back to context", () => {
        // Callers pass already-filtered participant keys; empty means no authorized tracks.
        const r = resolveContextMissionStages({
            contextStageKey: "lead",
            effectiveParticipantStageKeys: [],
            workViewLensStageKeys: ["waitlist"],
        });
        expect(r.primaryMissionStageKey).toBe("lead");
        expect(r.source).toBe("context_stage");
    });

    it("reads _effective_participant_stage_keys from row", () => {
        expect(
            effectiveParticipantStageKeysFromRow({
                _effective_participant_stage_keys: ["waitlist", "waitlist", "lead"],
            }),
        ).toEqual(["waitlist", "lead"]);
    });
});

describe("overlayContextMissionOntoSettledFocusModel", () => {
    it("replaces Settlement Lead Mission with commit-critical Waitlist Mission", () => {
        const settledRuntime = {
            stage_key: "lead",
            stage_label: "Lead",
            purpose: null,
            journey_segment: "family",
            template_keys: ["contact_family"],
            primary: {
                template_key: "contact_family",
                label: "Contact Family",
                role: "primary",
                state: "open",
                requires_outcome_picker: false,
                work_id: "task-lead",
                due_at: null,
                due_urgency: null,
                attempt_count: 0,
                last_outcome: null,
                completed_at: null,
                outcomes: [],
                completion_policy_summary: null,
                completion_policy_min_attempts: null,
                completion_policy_max_attempts: null,
                outcome_automation_preview: [],
            },
            additional: [],
            execution: { requires_outcome_picker: false },
        } as unknown as StageWorkRuntimeProjection;

        const waitlistRuntime = {
            stage_key: "waitlist",
            stage_label: "Waitlist",
            purpose: "Manage waitlist",
            journey_segment: "child",
            template_keys: ["review_waitlist_position"],
            primary: {
                template_key: "review_waitlist_position",
                label: "Review waitlist position",
                role: "primary",
                state: "planned",
                requires_outcome_picker: false,
                work_id: null,
                due_at: null,
                due_urgency: null,
                attempt_count: 0,
                last_outcome: null,
                completed_at: null,
                outcomes: [],
                completion_policy_summary: null,
                completion_policy_min_attempts: null,
                completion_policy_max_attempts: null,
                outcome_automation_preview: [],
            },
            additional: [],
            execution: { requires_outcome_picker: false },
        } as unknown as StageWorkRuntimeProjection;

        const settled = {
            source: "drawer_vm",
            phase: "settled",
            mode: "work",
            subject: { id: "opp-1", type: "opportunity", label: "Kurzman Family" },
            context: {
                grain: "case",
                subject: { type: "opportunity", id: "opp-1", label: "Kurzman Family" },
                businessProcess: { key: "lead", label: "Lead", stageKey: "lead" },
                perspective: null,
                truth: { id: "opp-1", _stage_work_runtime: settledRuntime },
                signals: {
                    work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: "Contact Family" },
                    attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
                    tour: { scheduled: false, startAt: null, statusLabel: null, bookingId: null },
                    communications: {
                        scheduledSendCount: 0,
                        nextFollowUpAt: null,
                        hasOutreach: false,
                        nextScheduledSendId: null,
                    },
                    billing: {
                        feeBalanceCents: null,
                        tuitionRateLabel: null,
                        pastDue: false,
                        nextInvoiceAt: null,
                    },
                },
                stageWorkRuntime: settledRuntime,
                publishedStageInputs: null,
                capabilities: { canMutate: true, maskedChannels: false },
                status: "ready",
            },
            cardModels: new Map(),
            cardReadiness: new Map(),
            commands: [],
            title: "Kurzman Family",
            statusLabel: "Lead",
            canMutate: true,
            perspective: null,
        } as unknown as FocusPanelWorkModeModel;

        const commitCritical: FocusPanelCommitCriticalInput = {
            subjectId: "opp-1",
            statusKey: "open",
            stageWorkRuntime: waitlistRuntime,
            publishedStageInputs: null,
            situation: { stageKey: "waitlist", stageLabel: "Waitlist", purpose: "Manage waitlist" },
            primaryAction: null,
            actionAbsence: { code: "work_template_has_no_action", message: "…" },
            subjectIdentityTruth: {
                _mission_stage_keys: ["waitlist"],
                _mission_homogeneous: true,
                _mission_participant_count: 2,
            },
            subjectGrain: { grain: "case", subjectType: "opportunity" },
        };

        const overlaid = overlayContextMissionOntoSettledFocusModel(settled, commitCritical);
        expect(overlaid.context.businessProcess.stageKey).toBe("waitlist");
        expect(overlaid.context.stageWorkRuntime?.stage_key).toBe("waitlist");
        expect(overlaid.context.stageWorkRuntime?.primary?.label).toBe("Review waitlist position");
        expect(overlaid.context.stageWorkRuntime?.primary?.label).not.toBe("Contact Family");
        expect(overlaid.statusLabel).toBe("Waitlist");
    });
});

describe("What's Next mission aggregation facts", () => {
    it("surfaces participant count and multi-track facts without stage-name branches", () => {
        const surface = {
            title: "Review waitlist position",
            statusLabel: "In progress",
            description: null,
            operatorGuidance: null,
            primaryWorkItem: null,
            readiness: { requirements: { items: [] } },
        } as unknown as CurrentWorkSurfaceVM;

        const facts = buildWhatsNextContextFacts({
            surface,
            context: {
                truth: {
                    _mission_homogeneous: false,
                    _mission_stage_keys: ["waitlist", "tour"],
                    _mission_participant_count: 2,
                    "person.primary_contact_name": "Alex",
                },
                signals: undefined as never,
            },
        });
        expect(facts.some((f) => f.value === "2 active tracks")).toBe(true);
        expect(facts.some((f) => f.value === "2 children")).toBe(true);
    });
});
