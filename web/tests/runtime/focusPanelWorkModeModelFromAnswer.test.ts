import { describe, expect, it } from "vitest";
import {
    buildCommitCriticalOperationalContext,
    focusPanelWorkModeModelFromProvisioningAnswer,
    type FocusPanelWorkModeFromAnswerInput,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer";
import {
    buildCurrentWorkCardModel,
    buildReadinessCardModel,
} from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";

const stageWork = {
    primary: { template_key: "contact_family", label: "Contact Family", state: "open", due_at: null },
    additional: [],
} as unknown as StageWorkRuntimeProjection;

function input(overrides: Partial<FocusPanelWorkModeFromAnswerInput> = {}): FocusPanelWorkModeFromAnswerInput {
    return {
        mode: "summary",
        subjectId: "opp-1",
        title: "Wenc Family",
        statusLabel: "New Lead",
        statusKey: "open",
        canMutate: true,
        perspective: null,
        stageWorkRuntime: stageWork,
        publishedStageInputs: null,
        situation: { stageKey: "lead", stageLabel: "New Lead", purpose: "Reach the family" },
        primaryAction: { actionRef: "contact_family", label: "Contact Family" },
        // Generic subject identity truth bag (as the DOMAIN composer declares it) — the platform builder
        // spreads it into context.truth opaquely; it no longer knows the primaryContact/inquiryChildren shape.
        subjectIdentityTruth: {
            "person.primary_contact_name": "Taryn Wenc",
            "person.primary_phone": "(408) 885-9652",
            "person.primary_email": "tarynw@hotmail.com",
            _inquiry_children: [{ display_name: "Ava Wenc", outcome_status_key: "new", age: "3" }],
        },
        ...overrides,
    };
}

describe("focusPanelWorkModeModelFromProvisioningAnswer (A — commit-critical producer)", () => {
    it("builds a REAL context from authoritative answer fields — Current Work ready, no Tier-2 pending", () => {
        const ctx = buildCommitCriticalOperationalContext(input());
        expect(ctx.status).toBe("ready");
        expect(ctx.subject).toEqual({ type: "opportunity", id: "opp-1", label: "Wenc Family" });
        expect(ctx.businessProcess.stageKey).toBe("lead");
        expect(ctx.stageWorkRuntime).toBe(stageWork); // the answer's own runtime, not a copy/placeholder
        expect(ctx.stageWorkPending).toBe(false); // the answer OWNS Current Work — never pending
        expect(ctx.capabilities.canMutate).toBe(true);
    });

    it("leaves every settlement-owned signal at its honest empty state (reserved, never fabricated)", () => {
        const ctx = buildCommitCriticalOperationalContext(input());
        expect(ctx.signals.attention).toEqual({ needsAttention: false, primaryReason: null, reasonCount: 0 });
        expect(ctx.signals.tour.scheduled).toBe(false);
        expect(ctx.signals.communications.hasOutreach).toBe(false);
        expect(ctx.signals.billing.billingConfigured).toBe(false);
        // The authoritative next-action label IS carried (it is answer-owned, not settlement).
        expect(ctx.signals.work.nextActionLabel).toBe("Contact Family");
        expect(ctx.recordHeaderActions).toBeNull();
    });

    it("builds current_work via the SHARED card-model builder (byte-identical to the enriched card)", () => {
        const model = focusPanelWorkModeModelFromProvisioningAnswer(input());
        expect(model.source).toBe("provisioning_answer");
        expect(model.cardReadiness.get("current_work")).toBe("ready");
        expect(model.cardModels.get("current_work")).toEqual(
            buildCurrentWorkCardModel({ stageWorkRuntime: stageWork, nextActionLabel: "Contact Family" }),
        );
    });

    it("renders Household + Children READY at commit from the subject snapshot (not blank reserved cells)", () => {
        const model = focusPanelWorkModeModelFromProvisioningAnswer(input());
        // Preparation completeness: Household + Children are commit-critical, sourced from the answer.
        expect(model.cardReadiness.get("household")).toBe("ready");
        expect(model.cardReadiness.get("children")).toBe("ready");
        expect(model.cardModels.get("household")?.key).toBe("household");
        expect(model.cardModels.get("children")?.key).toBe("children");
        // The evidence keys the cards read are present in truth.
        expect(model.context.truth["person.primary_contact_name"]).toBe("Taryn Wenc");
        expect(model.context.truth._inquiry_children).toBeTruthy();
        // Genuinely settlement cards stay reserved (absent from readiness → grid reserves them).
        expect(model.cardReadiness.get("tour_summary")).toBeUndefined();
        expect(model.cardReadiness.get("communications")).toBeUndefined();
    });

    it("renders Readiness READY at commit — a pure derivation over the same commit-critical truth", () => {
        const model = focusPanelWorkModeModelFromProvisioningAnswer(input());
        expect(model.cardReadiness.get("readiness_kpi")).toBe("ready");
        // Built through the SHARED builder over the SAME context — byte-identical to the enriched card.
        expect(model.cardModels.get("readiness_kpi")).toEqual(buildReadinessCardModel(model.context));
        // Honest factor completion: contact + child present, program/schedule/start not yet → "almost".
        expect(model.cardModels.get("readiness_kpi")?.statusChip).toBe("Almost");
    });

    it("reserves Household + Children + Readiness when the answer carries no subject snapshot (honest, not fabricated)", () => {
        const model = focusPanelWorkModeModelFromProvisioningAnswer(input({ subjectIdentityTruth: null }));
        expect(model.cardReadiness.get("household")).toBeUndefined();
        expect(model.cardReadiness.get("children")).toBeUndefined();
        expect(model.cardReadiness.get("readiness_kpi")).toBeUndefined();
        expect(model.cardReadiness.get("current_work")).toBe("ready");
    });

    it("degrades honestly when the answer resolved no Current Work (still ready, empty stage work)", () => {
        const ctx = buildCommitCriticalOperationalContext(input({ stageWorkRuntime: null }));
        expect(ctx.stageWorkRuntime).toBeNull();
        expect(ctx.stageWorkPending).toBe(false);
        expect(ctx.truth._stage_work_runtime).toBeUndefined();
    });
});
