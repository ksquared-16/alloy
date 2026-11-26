/**
 * POST-DEPLOYMENT REPAIR SLICE 4 — P0-2 ADMISSION.
 *
 * ── WHY THIS FILE EXISTS, AND WHY IT IS NOT THE SLICE 2 FILE ──
 *
 * `businessProcessCommitMeaning.test.ts` (Repair Slice 2) passed on every commit while the deployed
 * behaviour stayed exactly as broken: Business Process absent until 20,113 ms with first cards at
 * 13,551 ms. It proved the card's FALLBACK produces meaning over a committed context — which was
 * true, and unreachable, because `business_process` was in neither admission registry, so the grid
 * defaulted its cell to `reserved` and never mounted the component the fallback lives in.
 *
 * The lesson is the contract this file holds: a transitional component-state repair is not certified
 * by rendering the component. It is certified by proving the component is ADMITTED during the runtime
 * phase in question. So every test here drives the REAL composition producer —
 * `focusPanelWorkModeModelFromProvisioningAnswer` — and asserts on what the grid would actually read.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    buildCommitCriticalOperationalContext,
    focusPanelWorkModeModelFromProvisioningAnswer,
    type FocusPanelWorkModeFromAnswerInput,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer";
import { COMMIT_CRITICAL_CARD_SPECS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalCards";
import { MOUNTABLE_CARD_SPECS } from "@/lib/adminV2/runtime/focusPanel/focusPanelMountableCards";
import { buildBusinessProcessCardModel } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { buildBusinessProcessCardEvidence } from "@/lib/adminV2/runtime/focusPanel/businessProcess/buildBusinessProcessCardEvidence";
import { ENROLLMENT_DEFAULT_VISIBLE_CARD_KEYS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardVisibility";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

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
        subjectIdentityTruth: {
            "person.primary_contact_name": "Taryn Wenc",
            _inquiry_children: [{ display_name: "Ava Wenc", outcome_status_key: "new", age: "3" }],
        },
        ...overrides,
    };
}

/** What the GRID reads for a cell: it mounts on `ready`/`self_loading` AND a model being present. */
function gridWouldMount(model: ReturnType<typeof focusPanelWorkModeModelFromProvisioningAnswer>, key: string) {
    const readiness = model.cardReadiness.get(key as never) ?? "reserved";
    return (readiness === "ready" || readiness === "self_loading") && model.cardModels.has(key as never);
}

describe("1 — commit-critical admission includes business_process when the stage is knowable", () => {
    it("the registry declares it", () => {
        expect(COMMIT_CRITICAL_CARD_SPECS.map((s) => s.key)).toContain("business_process");
    });

    it("its isKnowable answers yes for a committed stage", () => {
        const spec = COMMIT_CRITICAL_CARD_SPECS.find((s) => s.key === "business_process")!;
        expect(spec.isKnowable(buildCommitCriticalOperationalContext(input()))).toBe(true);
    });

    it("it is admitted as CONTENT-ready, not as an identity-only mount", () => {
        // The two registries mean different things; this card composes its own content from context
        // and fetches nothing, so it must not be smuggled in as `self_loading`.
        expect(MOUNTABLE_CARD_SPECS.map((s) => s.key)).not.toContain("business_process");
        expect(focusPanelWorkModeModelFromProvisioningAnswer(input()).cardReadiness.get("business_process"))
            .toBe("ready");
    });
});

describe("2 — the card is MOUNTED in the commit-frame composition, before any settlement", () => {
    const model = focusPanelWorkModeModelFromProvisioningAnswer(input());

    it("the composition is the commit frame, not a settled one", () => {
        expect(model.phase).toBe("commit");
        expect(model.source).toBe("provisioning_answer");
    });

    it("THE GATE: the grid would mount the card from this model alone", () => {
        // This is the assertion Slice 2 never made, and the only one that tracks the deployed defect.
        expect(gridWouldMount(model, "business_process")).toBe(true);
    });

    it("it carries a real model, so the cell cannot fall through to ReservedFocusPanelCell", () => {
        expect(model.cardModels.get("business_process")?.title).toBe("Business Process");
        expect(model.cardModels.get("business_process")?.visible).toBe(true);
    });

    it("the card it admits is the one the composition actually places", () => {
        expect(ENROLLMENT_DEFAULT_VISIBLE_CARD_KEYS).toContain("business_process");
    });
});

describe("3 — the mounted commit-frame card renders Repair Slice 2's stage meaning", () => {
    const context = buildCommitCriticalOperationalContext(input());
    const evidence = buildBusinessProcessCardEvidence(context);

    it("states the committed stage", () => {
        expect(evidence.caseStageKey).toBe("lead");
        expect(evidence.caseStageLabel).toBe("New Lead");
    });

    it("names the process for the operator", () => {
        expect(evidence.processLabel).toBe("New Lead");
    });

    /*
     * PINNED, NOT ACCEPTED SILENTLY.
     *
     * The commit card carries the STAGE, which is the question P0-2 is about and the meaning the
     * operator was missing for 6.5 s. It does NOT carry the current-work line: `safeCurrentWork`
     * catches a throw out of `buildCurrentWorkCardEvidence` and degrades to null, so the card is
     * thin at commit and gains that line at settlement. Reproduced with a production-shaped
     * `StageWorkRuntimeProjection`, so it is not a minimal-fixture artifact — but attributing it is a
     * Current Work question, not an admission one, and Repair Slice 4 repairs admission only.
     *
     * This assertion exists so the gap is a stated fact with a test on it rather than something a
     * later reader has to rediscover. If a Current Work repair makes the line available at commit,
     * this test fails and is updated deliberately — which is the point.
     */
    it("does NOT yet carry the current-work line — degraded safely, and reported", () => {
        expect(evidence.currentWork).toBeNull();
    });

    it("claims no rail it was not given", () => {
        expect(evidence.stages).toEqual([]);
    });
});

describe("4 — settlement enriches the SAME mounted cell; it does not replace it", () => {
    const settled = {
        ...buildCommitCriticalOperationalContext(input()),
        businessProcess: {
            key: "lead", label: "New Lead", stageKey: "lead", name: "Enrollment",
            stages: [
                { key: "lead", label: "New Lead" },
                { key: "tour", label: "Tour" },
            ],
        },
    } as unknown as OperationalContext;

    it("the frame is byte-identical across the transition — one builder, so it cannot drift", () => {
        // The grid keys cells by card key; an enrichment that changed identity would remount, not enrich.
        const committed = focusPanelWorkModeModelFromProvisioningAnswer(input()).cardModels.get("business_process");
        expect(committed).toEqual(buildBusinessProcessCardModel());
    });

    it("stage identity survives settlement unchanged", () => {
        const before = buildBusinessProcessCardEvidence(buildCommitCriticalOperationalContext(input()));
        const after = buildBusinessProcessCardEvidence(settled);
        expect(after.caseStageKey).toBe(before.caseStageKey);
        expect(after.caseStageLabel).toBe(before.caseStageLabel);
    });

    it("MONOTONIC: settlement only adds — the rail and process name arrive, nothing meaningful is lost", () => {
        const before = buildBusinessProcessCardEvidence(buildCommitCriticalOperationalContext(input()));
        const after = buildBusinessProcessCardEvidence(settled);
        expect(after.stages.length).toBeGreaterThan(before.stages.length);
        expect(after.processName).toBe("Enrollment");
        expect(before.processName).toBeNull();
        for (const k of ["caseStageKey", "caseStageLabel", "processLabel"] as const) {
            if (before[k] != null) expect(after[k]).not.toBeNull();
        }
    });
});

describe("5 — no stage key means no fabricated process meaning", () => {
    const noStage = input({ situation: null, statusLabel: null, statusKey: null });

    it("isKnowable says no", () => {
        const spec = COMMIT_CRITICAL_CARD_SPECS.find((s) => s.key === "business_process")!;
        expect(spec.isKnowable(buildCommitCriticalOperationalContext(noStage))).toBe(false);
    });

    it("the grid would NOT mount it — the honest reserve is preserved", () => {
        expect(gridWouldMount(focusPanelWorkModeModelFromProvisioningAnswer(noStage), "business_process")).toBe(false);
    });

    it("a blank stage key is an ABSENT stage, not an empty one", () => {
        const blank = input({ situation: { stageKey: "   ", stageLabel: "  ", purpose: null }, statusLabel: null });
        const spec = COMMIT_CRITICAL_CARD_SPECS.find((s) => s.key === "business_process")!;
        expect(spec.isKnowable(buildCommitCriticalOperationalContext(blank))).toBe(false);
    });
});

describe("6 — admission waits for the stage and nothing else", () => {
    const spec = COMMIT_CRITICAL_CARD_SPECS.find((s) => s.key === "business_process")!;
    const knowable = (over: Partial<FocusPanelWorkModeFromAnswerInput>) =>
        spec.isKnowable(buildCommitCriticalOperationalContext(input(over)));

    it("does not wait for the configured stage rail", () => {
        // The commit context always sets `stages: []`; if the rail were required nothing would admit.
        expect(buildCommitCriticalOperationalContext(input()).businessProcess.stages).toEqual([]);
        expect(knowable({})).toBe(true);
    });

    it("does not wait for participants", () => {
        expect(knowable({ subjectIdentityTruth: null })).toBe(true);
    });

    it("does not wait for current work or a next action", () => {
        expect(knowable({ stageWorkRuntime: null, primaryAction: null })).toBe(true);
    });

    it("does not wait for the settlement projection", () => {
        expect(buildCommitCriticalOperationalContext(input()).operationalProjection).toBeNull();
        expect(knowable({})).toBe(true);
    });
});

describe("7/8 — no new fetch, no new loader, cache or readiness owner", () => {
    const root = process.cwd();
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const specs = strip(readFileSync(join(root, "lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalCards.ts"), "utf8"));

    it("the admission owner performs no I/O", () => {
        for (const forbidden of ["fetch(", "useEffect", "useState", "await ", "Promise", "localStorage", "setTimeout"]) {
            expect(specs).not.toContain(forbidden);
        }
    });

    it("admission is decided from the context alone — no second readiness source", () => {
        expect(specs).not.toMatch(/import .*(useQuery|swr|Cache|Store|Loader)/);
    });

    it("the card itself was not touched again for mounting", () => {
        const cardSrc = strip(readFileSync(join(root, "components/admin/focusPanel/cards/BusinessProcessCard.tsx"), "utf8"));
        expect(cardSrc).not.toMatch(/cardReadiness|COMMIT_CRITICAL|MOUNTABLE_CARD_SPECS/);
    });
});

describe("9 — every other card's admission is unchanged", () => {
    const model = focusPanelWorkModeModelFromProvisioningAnswer(input());

    it("the commit-critical set is exactly the prior four plus business_process", () => {
        expect([...COMMIT_CRITICAL_CARD_SPECS.map((s) => s.key)].sort()).toEqual(
            ["business_process", "children", "current_work", "household", "readiness_kpi"].sort(),
        );
    });

    it("the prior four still resolve exactly as before", () => {
        for (const key of ["current_work", "household", "children", "readiness_kpi"] as const) {
            expect(model.cardReadiness.get(key)).toBe("ready");
        }
    });

    it("the mountable registry is untouched", () => {
        expect([...MOUNTABLE_CARD_SPECS.map((s) => s.key)].sort()).toEqual(
            ["attendance", "financials", "health_safety"].sort(),
        );
    });

    it("mountable cards still resolve self_loading, not ready", () => {
        const withParticipant = input({
            subjectIdentityTruth: { "child.customer_member_id": "cm-1", "person.primary_contact_name": "Taryn Wenc" },
        });
        expect(focusPanelWorkModeModelFromProvisioningAnswer(withParticipant).cardReadiness.get("attendance"))
            .toBe("self_loading");
    });
});
