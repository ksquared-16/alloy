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
import { MOUNTABLE_CARD_SPECS } from "@/lib/adminV2/runtime/focusPanel/focusPanelMountableCards";
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

/**
 * MOUNTABILITY, AT THE PRODUCER — one declaration per identity SHAPE, asserted generically.
 *
 * The registry now carries two shapes: a card that addresses a PARTICIPANT and a card that addresses
 * an ACCOUNT. These read the specs rather than naming cards, so a third shape added later is tested
 * by this file the day it is declared.
 */
describe("mountability at the commit producer", () => {
    const identityFor = (spec: { identityTruthKeys: readonly string[] }, value: string) =>
        Object.fromEntries(spec.identityTruthKeys.map((key) => [key, value]));

    it("a spec whose declared identity the answer carries resolves to self_loading — never ready", () => {
        for (const spec of MOUNTABLE_CARD_SPECS) {
            const model = focusPanelWorkModeModelFromProvisioningAnswer(
                input({ subjectIdentityTruth: identityFor(spec, "id_1") }),
            );
            expect(model.cardReadiness.get(spec.key), `${spec.key} should mount`).toBe("self_loading");
            expect(model.cardReadiness.get(spec.key)).not.toBe("ready");
            // A mounted card asserts NO content — that is what keeps `ready` honest.
            expect(model.cardModels.get(spec.key)?.insight).toBe("");
        }
    });

    it("a spec whose identity the answer does NOT carry stays absent, so its cell reserves", () => {
        const model = focusPanelWorkModeModelFromProvisioningAnswer(input({ subjectIdentityTruth: null }));
        for (const spec of MOUNTABLE_CARD_SPECS) {
            expect(model.cardReadiness.get(spec.key), `${spec.key} must not mount`).toBeUndefined();
        }
    });

    it("identity shapes are INDEPENDENT — one card's identity never mounts another's", () => {
        // The account-scoped card must not ride in on a participant binding, nor the reverse. With one
        // shared predicate this test would be impossible to fail; with per-card predicates it is the
        // thing that proves each is read for itself.
        for (const spec of MOUNTABLE_CARD_SPECS) {
            const model = focusPanelWorkModeModelFromProvisioningAnswer(
                input({ subjectIdentityTruth: identityFor(spec, "id_1") }),
            );
            for (const other of MOUNTABLE_CARD_SPECS) {
                const sharesAKey = other.identityTruthKeys.some((k) => spec.identityTruthKeys.includes(k));
                if (sharesAKey) continue;
                expect(
                    model.cardReadiness.get(other.key),
                    `${other.key} mounted on ${spec.key}'s identity`,
                ).toBeUndefined();
            }
        }
    });

    it("the participant SCOPE a mounted card resolves its read against is stated at commit too", () => {
        // Mounting without a scope is the measured failure this pairs with: the card mounted at ~1350ms
        // and still did not fetch until ~3313ms, because it addresses `participantScope`, not raw truth.
        const ctx = buildCommitCriticalOperationalContext(
            input({
                subjectIdentityTruth: {
                    "child.customer_member_id": "cm_1",
                    "child.process_instance_id": "pi_1",
                },
            }),
        );
        expect(ctx.participantScope?.customerMemberId).toBe("cm_1");
    });
});
