/**
 * Config/runtime parity — Work View labels, child mission overlay, child-grain row inherit guard.
 */

import { describe, expect, it } from "vitest";
import { overlayChildMissionOntoSettledFocusModel } from "@/lib/adminV2/runtime/focusPanel/overlayChildMissionOntoSettledFocusModel";
import type { FocusPanelCommitCriticalInput } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalInput";
import { normalizeCatchAllWorkViewCompatBinding } from "@/lib/lifecycle/workViewsConfigV1";
import { mergeCompactSlotsInheritDefault } from "@/lib/presentation/runtime/mergeCompactSlotsInheritDefault";
import type { CompactRowSlots } from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import { queueRowVariantRuleMatches } from "@/lib/presentation/runtime/resolveQueueRowVariant";
import { resolveQueueRowSubjectFocus } from "@/lib/presentation/runtime/resolveQueueRowSubjectFocus";
import { resolveLensRowGrain } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { QUEUE_ROW_CONTEXT_CONTRACT_VERSION, type QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { FocusPanelWorkModeModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";

const STAGES: LifecycleBuilderStageRecord[] = [
    { id: "st-lead", key: "lead", label: "Lead", sort_order: 1, is_active: true, grain: "family" },
    { id: "st-waitlist", key: "waitlist", label: "Waitlist", sort_order: 2, is_active: true, grain: "child" },
];

function emptySlots(overrides?: Partial<CompactRowSlots>): CompactRowSlots {
    return {
        subject: { visible: true, label: null, fieldKeys: ["child.name"] },
        status: { visible: false, label: null },
        contact: { visible: false, label: null },
        attention: { visible: false, label: null },
        work: { visible: false, label: null },
        groupCount: { visible: false, label: null },
        ...overrides,
    };
}

describe("Work View label authority", () => {
    it("runtime preserves an operator-renamed catch-all label without code substitution", () => {
        const repaired = normalizeCatchAllWorkViewCompatBinding({
            id: "new_work_view_6",
            label: "Some Operator Label",
            display_order: 1,
            visible_in_runtime: true,
            filters_v1: [],
        });
        expect(repaired.label).toBe("Some Operator Label");
    });

    it("undeclared empty-filter inventory resolves family grain (declaration optional when stage-independent)", () => {
        // Not tied to any operator-facing Work View name. Empty filters_v1 + no row_grain_v1
        // means process inventory at family grain; child inventory must declare row_grain_v1.
        const r = resolveLensRowGrain(view({ id: "inventory_a", label: "Some Operator Label", filters_v1: [] }), STAGES);
        expect(r).toEqual({ ok: true, grain: "family" });
    });

    it("stage-filtered Lead views resolve family from included stages — never via catch-all", () => {
        const r = resolveLensRowGrain(
            view({
                id: "new_leads",
                label: "New Family Leads",
                filters_v1: stageFilter("lead"),
                row_grain_v1: "family",
            }),
            STAGES,
        );
        expect(r).toEqual({ ok: true, grain: "family" });
        expect(lensStageKeys(view({ filters_v1: stageFilter("lead") }))).toEqual(["lead"]);
    });
});

describe("child mission overlay after family Settlement", () => {
    it("replaces family Lead stage work with child Waitlist stage work", () => {
        const familyLeadRuntime = {
            stage_key: "lead",
            stage_label: "Lead",
            purpose: null,
            primary: {
                template_key: "contact_family",
                label: "Contact Family",
                state: "planned",
                work_id: null,
                due_at: null,
                requires_outcome_picker: false,
            },
            additional: [],
        } as unknown as StageWorkRuntimeProjection;

        const childWaitlistRuntime = {
            stage_key: "waitlist",
            stage_label: "Waitlist",
            purpose: "Review waitlist position",
            primary: {
                template_key: "review_waitlist_position",
                label: "Review waitlist position",
                state: "planned",
                work_id: null,
                due_at: null,
                requires_outcome_picker: false,
            },
            additional: [],
        } as unknown as StageWorkRuntimeProjection;

        const settled = {
            source: "drawer_vm",
            phase: "settled",
            mode: "work",
            subject: { id: "opp-1", type: "opportunity", label: "Kurzman Family" },
            context: {
                grain: "case",
                subject: { id: "opp-1", type: "opportunity", label: "Kurzman Family" },
                businessProcess: { key: "lead", label: "Lead", stageKey: "lead" },
                perspective: null,
                truth: {},
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
                        hasSignal: false,
                        balanceDue: null,
                        nextDueAt: null,
                        statusLabel: null,
                    },
                },
                stageWorkRuntime: familyLeadRuntime,
                stageWorkPending: false,
                recordHeaderActions: null,
                publishedStageInputs: { stage_key: "lead", work_templates: [] },
                capabilities: { canMutate: true, maskedChannels: false },
                status: "ready",
            },
            cardModels: new Map([
                [
                    "current_work",
                    {
                        key: "current_work",
                        title: "What's Next",
                        insight: "Contact Family · planned",
                        secondaryInsight: "Next: Contact Family",
                        tier: "work",
                        span: 1,
                        density: "compact",
                        statusChip: null,
                        statusTone: "neutral",
                        visible: true,
                    },
                ],
            ]),
            cardReadiness: new Map([["current_work", "ready"]]),
            commands: [],
            title: "Kurzman Family",
            statusLabel: "Lead",
            canMutate: true,
            perspective: null,
        } as unknown as FocusPanelWorkModeModel;

        const commitCritical: FocusPanelCommitCriticalInput = {
            subjectId: "child-lennon",
            statusKey: null,
            stageWorkRuntime: childWaitlistRuntime,
            publishedStageInputs: {
                stage_key: "waitlist",
                work_templates: [{ template_key: "review_waitlist_position", label: "Review waitlist position" }],
            } as never,
            situation: { stageKey: "waitlist", stageLabel: "Waitlist", purpose: null },
            primaryAction: null,
            actionAbsence: null,
            subjectIdentityTruth: {
                "child.display_name": "Lennon Kurzman",
                "child.family_opportunity_id": "opp-1",
            },
            subjectGrain: { grain: "child", subjectType: "child" },
        };

        const overlaid = overlayChildMissionOntoSettledFocusModel(settled, commitCritical);
        expect(overlaid.context.businessProcess.stageKey).toBe("waitlist");
        expect(overlaid.context.stageWorkRuntime?.primary?.label).toBe("Review waitlist position");
        expect(overlaid.context.stageWorkRuntime?.primary?.label).not.toBe("Contact Family");
        expect(overlaid.title).toBe("Lennon Kurzman");
        expect(overlaid.subject.type).toBe("child");
        expect(overlaid.cardModels.get("current_work")?.insight).toMatch(/waitlist|Review/i);
    });
});

describe("child-grain queue variant inherit guard", () => {
    it("does not inherit Default children.count onto child rows", () => {
        const variant = emptySlots({
            groupCount: { visible: false, label: null },
        });
        const defaults = emptySlots({
            groupCount: { visible: true, label: null, fieldKeys: ["children.names", "children.count"] },
        });
        const merged = mergeCompactSlotsInheritDefault(variant, defaults, { rowGrain: "child" });
        expect(merged.groupCount.fieldKeys ?? []).not.toContain("children.count");
        expect(merged.groupCount.visible).toBe(false);
    });

    it("still inherits Default children onto family/case rows", () => {
        const variant = emptySlots({ groupCount: { visible: false, label: null } });
        const defaults = emptySlots({
            groupCount: { visible: true, label: null, fieldKeys: ["children.names", "children.count"] },
        });
        const merged = mergeCompactSlotsInheritDefault(variant, defaults, { rowGrain: "case" });
        expect(merged.groupCount.fieldKeys).toEqual(["children.names", "children.count"]);
    });

    it("matches candidate grain rules against child grain rows", () => {
        expect(
            queueRowVariantRuleMatches(
                { grain: ["candidate"], stage_key: ["waitlist"] },
                { grain: "child", stageKey: "waitlist" },
            ),
        ).toBe(true);
    });

    it("placement_candidate_child accepts child subject with waitlist_context", () => {
        const context: QueueRowContext = {
            contract_version: QUEUE_ROW_CONTEXT_CONTRACT_VERSION,
            row_presentation_mode: "single_subject",
            row_subject: {
                subject_type: "child",
                subject_id: "cm-1",
                display_name: "Lennon Kurzman",
                stage_key: "waitlist",
            },
            row_stage: "Waitlist",
            lifecycle_key: "enrollment",
            row_status_key: "",
            row_status_label: "",
            case_context: {
                case_id: "opp-1",
                display_name: "Kurzman Family",
                case_type_label: "Enrollment",
                case_status_key: "",
                case_status_label: "",
            },
            primary_contact: null,
            related_subjects_summary: [],
            attention_summary: null,
            work_summary: null,
            current_work_summary: null,
            next_best_action: null,
            drawer_open: { entity_type: "opportunities", entity_id: "opp-1" },
            waitlist_context: {
                position: 2,
                position_label: "#2",
                wait_since_label: "3d",
                program_label: "Infant",
            } as never,
        };
        const focus = resolveQueueRowSubjectFocus(context, "placement_candidate_child");
        expect(focus.focus).toBe("placement_candidate_child");
        expect(focus.primary.display_name).toBe("Lennon Kurzman");
        expect(focus.supportingLines).toContain("#2");
    });
});
