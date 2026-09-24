/**
 * @vitest-environment jsdom
 *
 * jsdom because the settlement diagnostic is a BROWSER ring buffer on `window`, exactly like
 * `__ALLOY_REVEAL_GATE_DIAG__`. Running it under node would silently record nothing and the
 * assertions would be testing the absence of a window, not the diagnostic.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
    registerFrameReady,
    applyFrameSettlement,
    resetFrameLifecycleForTests,
    type ProvisioningNavigation,
} from "@/lib/runtime/kernel/provisioningFrameLifecycle";
import {
    settlementNavigationForRequest,
    type ProvisioningSettlementPatch,
} from "@/lib/runtime/provisioning/provisioningSettlement";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

const COMPOSE = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../lib/runtime/provisioning/composeProvisioningAnswerForRoute.ts"),
    "utf8",
);

const SUBJECT = "11111111-1111-1111-1111-111111111111";
const IMPLIED_VIEW = "22222222-2222-2222-2222-222222222222";
const EXPLICIT_VIEW = "33333333-3333-3333-3333-333333333333";
const SLUG = "new-leads";

/** The frame `page.tsx` registers: its lens is the REQUESTED one from the URL. */
function frameNavigation(requestedLens: string | null): ProvisioningNavigation {
    return { target: SLUG, lens: requestedLens, subject: SUBJECT, cohort: null, aspect: null };
}

/**
 * A composed answer. `contextFrame.workViewId` is the RESOLVED view — the answer legitimately
 * describes the defaulted lens even when the caller requested none.
 */
function answerFor(resolvedView: string | null): ProvisioningAnswer {
    return {
        terminal: "operational",
        recordOfAttention: { id: SUBJECT },
        currentBusinessState: { stageKey: "new" },
        contextFrame: { workViewId: resolvedView },
        focusPanelOperationalProjection: { cards: null },
        resolvedParticipant: null,
    } as unknown as ProvisioningAnswer;
}

/** The settled capability payload: Financials, Attendance and Health ride here. */
function patchFor(navigation: ProvisioningNavigation, resolvedView: string | null): ProvisioningSettlementPatch {
    return {
        navigation,
        identity: { subjectId: SUBJECT, stageKey: "new", workViewId: resolvedView },
        resolvedParticipant: "participant-1",
        resolvedTour: null,
        cards: { financials: { ok: true } },
    } as unknown as ProvisioningSettlementPatch;
}

/**
 * P0-7.6 — THE SETTLEMENT MUST REACH THE FRAME IT BELONGS TO.
 *
 * `page.tsx` registers the frame under the lens the URL asked for, which is null when none was
 * given. The composer reassigned its own `requestedWorkViewId` local to the slug's implied view
 * before building the settlement navigation, so the settlement was addressed under a lens the frame
 * had never been registered with. `navigationKey` includes the lens, so `frames.get` missed and
 * `applyFrameSettlement` returned `no_frame` — silently discarding the patch carrying Financials,
 * Attendance and Health, and leaving Financials at `data-financials-empty="loading"` forever.
 *
 * These are EFFECT-level: each asserts what the lifecycle did with the settlement, not what the
 * source says. The defect reproduction below is the important one — it addresses a settlement with
 * the RESOLVED lens, exactly as the old code did, and requires the lifecycle to miss.
 */
describe("focus panel settlement lens identity", () => {
    beforeEach(() => { resetFrameLifecycleForTests(); });

    it("THE DEFECT: a settlement addressed with the RESOLVED lens never finds the frame", () => {
        registerFrameReady(frameNavigation(null), answerFor(IMPLIED_VIEW));
        // Precisely what the composer used to build: the slug's implied view as navigation identity.
        const wrong = settlementNavigationForRequest({
            rawSlug: SLUG, requestedWorkViewId: IMPLIED_VIEW, requestedSubjectId: SUBJECT,
        });
        const outcome = applyFrameSettlement(patchFor(wrong, IMPLIED_VIEW));
        expect(outcome.applied).toBe(false);
        expect(outcome.applied === false && outcome.reason).toBe("no_frame");
    });

    it("REPAIRED: no explicit lens + slug default — the settlement still reaches the frame", () => {
        registerFrameReady(frameNavigation(null), answerFor(IMPLIED_VIEW));
        // The repair: navigation identity is built from what the caller REQUESTED (null), while the
        // answer and the patch identity still describe the RESOLVED view.
        const nav = settlementNavigationForRequest({
            rawSlug: SLUG, requestedWorkViewId: null, requestedSubjectId: SUBJECT,
        });
        const outcome = applyFrameSettlement(patchFor(nav, IMPLIED_VIEW));
        expect(outcome.applied, "settlement must reach the frame on the ordinary defaulted path").toBe(true);
        // D — the resolved card payload arrives unchanged. Read through the operational shape: the
        // answer is a union and only its operational arm carries these fields.
        const settledAnswer = (outcome.applied === true ? outcome.answer : null) as unknown as {
            resolvedParticipant?: unknown;
            focusPanelOperationalProjection?: { cards?: unknown } | null;
        } | null;
        expect(settledAnswer?.resolvedParticipant).toBe("participant-1");
        expect(settledAnswer?.focusPanelOperationalProjection?.cards).toEqual({ financials: { ok: true } });
    });

    it("A — an EXPLICIT requested lens still reaches its frame", () => {
        registerFrameReady(frameNavigation(EXPLICIT_VIEW), answerFor(EXPLICIT_VIEW));
        const nav = settlementNavigationForRequest({
            rawSlug: SLUG, requestedWorkViewId: EXPLICIT_VIEW, requestedSubjectId: SUBJECT,
        });
        expect(applyFrameSettlement(patchFor(nav, EXPLICIT_VIEW)).applied).toBe(true);
    });

    it("C — a settlement for one navigation cannot apply to another", () => {
        registerFrameReady(frameNavigation(EXPLICIT_VIEW), answerFor(EXPLICIT_VIEW));
        const otherFrameNav = settlementNavigationForRequest({
            rawSlug: SLUG, requestedWorkViewId: null, requestedSubjectId: SUBJECT,
        });
        const outcome = applyFrameSettlement(patchFor(otherFrameNav, EXPLICIT_VIEW));
        expect(outcome.applied).toBe(false);
        // Not a silent no-op: it is refused because it addresses a frame that is not this one.
        expect(outcome.applied === false && outcome.reason).toBe("no_frame");
    });

    it("BINDS THE COMPOSER: both settlement sites pass the requested lens, and it cannot be reassigned", () => {
        /*
         * The effect tests above prove the SEMANTICS. This binds the caller, because the defect was
         * not in the lifecycle — it was the composer handing it the wrong lens, and the lifecycle
         * behaved correctly throughout by refusing a settlement for a frame it had no record of.
         *
         * `const` is the load-bearing part: the original bug was a reassignment of the same local,
         * so a value that cannot be reassigned is the thing that stops it recurring.
         */
        expect(COMPOSE).toContain("const requestedWorkViewId: string | null = input.requestedWorkViewId ?? null;");
        expect(COMPOSE).toContain("let resolvedWorkViewId: string | null = requestedWorkViewId;");
        // Content still defaults from the slug's implied view — the repair must not have changed that.
        expect(COMPOSE).toContain("resolvedWorkViewId = resolution.match.initialWorkViewId;");
        expect(COMPOSE).toContain("requestedWorkViewId: resolvedWorkViewId,");
        // Both settlement navigations go through the one builder, fed the REQUESTED lens.
        const sites = [...COMPOSE.matchAll(/settlementNavigationForRequest\(\{[\s\S]{0,400}?\}\)/g)].map((m) => m[0]);
        expect(sites.length, "both settlement navigation sites must use the shared builder").toBe(2);
        for (const site of sites) {
            expect(site).toContain("requestedWorkViewId,");
            expect(site, "a settlement addressed with the resolved lens is the defect").not.toContain("resolvedWorkViewId");
        }
    });

    it("the builder carries the REQUESTED lens and nothing derived", () => {
        // Identity is the caller's, verbatim. A null stays null rather than acquiring a default.
        expect(settlementNavigationForRequest({
            rawSlug: SLUG, requestedWorkViewId: null, requestedSubjectId: SUBJECT,
        })).toEqual({ target: SLUG, lens: null, subject: SUBJECT, cohort: null, aspect: null });
    });
});

/**
 * THE SETTLEMENT OUTCOME MUST BE VISIBLE IN PRODUCTION.
 *
 * The mounted proof on deployed ed24d807 could not say whether a settlement applied: the outcome is
 * discarded by `ProvisioningSettlementSeed`, and the only observable — Financials at
 * `data-financials-empty="loading"` — has four independent causes. An effect several mechanisms can
 * produce proves none of them, so the outcome itself is recorded.
 */
describe("settlement outcome diagnostic", () => {
    beforeEach(() => {
        resetFrameLifecycleForTests();
        delete (globalThis as unknown as Record<string, unknown>).__ALLOY_SETTLEMENT_DIAG__;
    });

    const buf = () =>
        ((globalThis as unknown as { __ALLOY_SETTLEMENT_DIAG__?: Array<Record<string, unknown>> })
            .__ALLOY_SETTLEMENT_DIAG__ ?? []);

    it("records no_frame with the address and how many frames existed", () => {
        const nav = settlementNavigationForRequest({
            rawSlug: SLUG, requestedWorkViewId: null, requestedSubjectId: SUBJECT,
        });
        applyFrameSettlement(patchFor(nav, IMPLIED_VIEW));
        const last = buf().at(-1);
        expect(last?.outcome).toBe("no_frame");
        // 0 registered frames explains a no_frame immediately, which is the fact the mounted proof
        // could not obtain: "addressed wrongly" and "nothing was ever registered" look identical.
        expect(last?.frames).toBe(0);
        expect(typeof last?.addressed).toBe("string");
    });

    it("records applied when the settlement reaches its frame", () => {
        registerFrameReady(frameNavigation(null), answerFor(IMPLIED_VIEW));
        const nav = settlementNavigationForRequest({
            rawSlug: SLUG, requestedWorkViewId: null, requestedSubjectId: SUBJECT,
        });
        applyFrameSettlement(patchFor(nav, IMPLIED_VIEW));
        expect(buf().at(-1)?.outcome).toBe("applied");
    });

    it("carries NO payload and NO business values", () => {
        registerFrameReady(frameNavigation(null), answerFor(IMPLIED_VIEW));
        const nav = settlementNavigationForRequest({
            rawSlug: SLUG, requestedWorkViewId: null, requestedSubjectId: SUBJECT,
        });
        applyFrameSettlement(patchFor(nav, IMPLIED_VIEW));
        const serialised = JSON.stringify(buf());
        // The patch carried a participant and a Financials card; neither may reach the ring buffer.
        expect(serialised).not.toContain("participant-1");
        expect(serialised).not.toContain("financials");
        expect(Object.keys(buf().at(-1) ?? {}).sort()).toEqual(["addressed", "frames", "outcome", "t"]);
    });

    it("is bounded — a long session cannot grow it without limit", () => {
        const nav = settlementNavigationForRequest({
            rawSlug: SLUG, requestedWorkViewId: null, requestedSubjectId: SUBJECT,
        });
        for (let i = 0; i < 400; i += 1) applyFrameSettlement(patchFor(nav, IMPLIED_VIEW));
        expect(buf().length).toBeLessThanOrEqual(201);
    });
});
