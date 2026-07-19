import { describe, expect, it } from "vitest";
import {
    buildCommitCriticalOperationalContext,
    focusPanelWorkModeModelFromProvisioningAnswer,
    type FocusPanelWorkModeFromAnswerInput,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer";
import { buildCurrentWorkCardModel } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
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

    it("marks ONLY current_work ready, via the SHARED card-model builder (identical to the enriched card)", () => {
        const model = focusPanelWorkModeModelFromProvisioningAnswer(input());
        expect(model.source).toBe("provisioning_answer");
        expect([...model.cardReadiness.entries()]).toEqual([["current_work", "ready"]]);
        expect(model.cardModels.get("current_work")).toEqual(
            buildCurrentWorkCardModel({ stageWorkRuntime: stageWork, nextActionLabel: "Contact Family" }),
        );
    });

    it("degrades honestly when the answer resolved no Current Work (still ready, empty stage work)", () => {
        const ctx = buildCommitCriticalOperationalContext(input({ stageWorkRuntime: null }));
        expect(ctx.stageWorkRuntime).toBeNull();
        expect(ctx.stageWorkPending).toBe(false);
        expect(ctx.truth._stage_work_runtime).toBeUndefined();
    });
});
