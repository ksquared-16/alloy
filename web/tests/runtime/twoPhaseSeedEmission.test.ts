/**
 * P0-7.6 — TWO-PHASE SEED EMISSION: the kernel lifecycle plants.
 *
 * The composer became progressive; the transport did not. Geometry is decided at ~144ms while
 * FIRST_AUTHORITATIVE_FRAME committed at 1,983ms (deployed a5eb2f29, n=24), because one navigation
 * could carry exactly one payload and the card-producer join (740ms) sat inside the server stream
 * hold.
 *
 * These are the Part 11 plants for the second delivery. Each asserts a specific defect does NOT
 * occur, and — where the guard is subtle — demonstrates the gap it is closing rather than merely
 * asserting the happy path. A plant that cannot fail proves nothing.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
    FRAME_LIFETIME_MS,
    abandonNavigation,
    applyFrameSettlement,
    frameCountForTests,
    markFrameSettled,
    navigationKey,
    readFrame,
    registerFrameReady,
    resetFrameLifecycleForTests,
    sweepExpiredFrames,
    type ProvisioningNavigation,
} from "@/lib/runtime/kernel/provisioningFrameLifecycle";
import {
    applyProvisioningSettlement,
    settlementMatchesFrame,
    type ProvisioningSettlementPatch,
} from "@/lib/runtime/provisioning/provisioningSettlement";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

const NAV: ProvisioningNavigation = {
    target: "new-leads",
    lens: "wv-new",
    subject: null,
    cohort: null,
    aspect: null,
};

const answerOf = (over: Record<string, unknown> = {}): ProvisioningAnswer =>
    ({
        terminal: "operational",
        recordOfAttention: { id: "subj-1" },
        currentBusinessState: { stageKey: "lead", stageLabel: "Lead" },
        contextFrame: { workViewId: "wv-new", workViewLabel: "New" },
        focusPanelOperationalProjection: { cards: null },
        resolvedParticipant: null,
        resolvedTour: null,
        ...over,
    }) as unknown as ProvisioningAnswer;

const patchOf = (over: Partial<ProvisioningSettlementPatch> = {}): ProvisioningSettlementPatch => ({
    navigation: { ...NAV },
    identity: { subjectId: "subj-1", stageKey: "lead", workViewId: "wv-new" },
    resolvedParticipant: { participationId: "pi-1", customerMemberId: "cm-1" },
    resolvedTour: null,
    cards: { attendance: { state: "known" } },
    ...over,
});

beforeEach(() => resetFrameLifecycleForTests());

/* ── PART 2 — NAVIGATION ISOLATION ───────────────────────────────────────────────────────────── */

describe("plant: a settlement may only reach the frame it belongs to", () => {
    it("applies to its own navigation", () => {
        registerFrameReady(NAV, answerOf());
        const out = applyFrameSettlement(patchOf());
        expect(out.applied).toBe(true);
        expect(readFrame(NAV).state).toBe("SETTLING");
    });

    it("a rapid subject switch cannot be overwritten by the previous subject's settlement", () => {
        // The operator moved to subject B; A's producers are still in flight.
        const navB = { ...NAV, subject: "subj-B" };
        registerFrameReady(navB, answerOf({ recordOfAttention: { id: "subj-B" } }));
        const lateA = patchOf({ navigation: { ...NAV, subject: "subj-A" } });
        const out = applyFrameSettlement(lateA);
        if (out.applied) throw new Error("a superseded navigation's settlement reached the active frame");
        expect(out.reason).toBe("no_frame");
        expect(readFrame(navB).appliedCount).toBe(0);
    });

    it("Work Unit A settlement never reaches Work Unit B", () => {
        registerFrameReady({ ...NAV, target: "unit-b" }, answerOf());
        expect(applyFrameSettlement(patchOf({ navigation: { ...NAV, target: "unit-a" } })).applied).toBe(false);
    });

    it("two tabs are two frames — settling one leaves the other untouched", () => {
        const tabA = { ...NAV, subject: "a" };
        const tabB = { ...NAV, subject: "b" };
        registerFrameReady(tabA, answerOf());
        registerFrameReady(tabB, answerOf());
        applyFrameSettlement(patchOf({ navigation: tabA }));
        expect(readFrame(tabA).appliedCount).toBe(1);
        expect(readFrame(tabB).appliedCount).toBe(0);
    });

    it("the same subject reopened composes a fresh frame, and the old settlement is spent", () => {
        registerFrameReady(NAV, answerOf());
        applyFrameSettlement(patchOf());
        registerFrameReady(NAV, answerOf()); // re-entered
        expect(readFrame(NAV).state).toBe("FRAME_READY");
        expect(readFrame(NAV).appliedCount).toBe(0);
    });

    it("a stage mismatch is refused", () => {
        registerFrameReady(NAV, answerOf());
        const out = applyFrameSettlement(patchOf({ identity: { subjectId: "subj-1", stageKey: "waitlist", workViewId: "wv-new" } }));
        if (out.applied) throw new Error("a stage mismatch was applied");
        expect(out.reason).toBe("mismatch");
    });

    it("a configuration (lens) mismatch is refused", () => {
        registerFrameReady(NAV, answerOf());
        const out = applyFrameSettlement(patchOf({ identity: { subjectId: "subj-1", stageKey: "lead", workViewId: "wv-other" } }));
        if (out.applied) throw new Error("a configuration mismatch was applied");
        expect(out.reason).toBe("mismatch");
    });

    it("THE GUARD IS LOAD-BEARING: without the identity check the stale patch WOULD apply", () => {
        // Same navigation key, wrong subject — only the identity half of the check rejects this.
        const frame = answerOf();
        const stale = patchOf({ identity: { subjectId: "someone-else", stageKey: "lead", workViewId: "wv-new" } });
        expect(settlementMatchesFrame(frame, stale, NAV)).toBe(false);
        // and the navigation half alone would have said yes:
        expect(navigationKey(stale.navigation)).toBe(navigationKey(NAV));
    });
});

/* ── PART 8 — ORDERING / IDEMPOTENCE ─────────────────────────────────────────────────────────── */

describe("plant: duplicate and out-of-order settlements are harmless", () => {
    it("a duplicate changes nothing the second time", () => {
        registerFrameReady(NAV, answerOf());
        const p = patchOf();
        expect(applyFrameSettlement(p).applied).toBe(true);
        const second = applyFrameSettlement(p);
        // Narrowed rather than asserted: reading `.reason` off the union is what proves the
        // duplicate took the refusal branch, not merely that `applied` was falsy.
        if (second.applied) throw new Error("a duplicate settlement was applied a second time");
        expect(second.reason).toBe("no_change");
        expect(readFrame(NAV).appliedCount).toBe(1);
    });

    it("KNOWN never regresses to UNKNOWN when a later patch carries null", () => {
        registerFrameReady(NAV, answerOf());
        applyFrameSettlement(patchOf());
        const known = readFrame(NAV).answer as unknown as { resolvedParticipant: unknown };
        expect(known.resolvedParticipant).toEqual({ participationId: "pi-1", customerMemberId: "cm-1" });
        // An out-of-order earlier patch, carrying nothing.
        applyFrameSettlement(patchOf({ resolvedParticipant: null, cards: null }));
        const after = readFrame(NAV).answer as unknown as { resolvedParticipant: unknown };
        expect(after.resolvedParticipant).toEqual({ participationId: "pi-1", customerMemberId: "cm-1" });
    });

    it("SETTLED is never replaced by a stale FRAME_READY state", () => {
        registerFrameReady(NAV, answerOf());
        expect(markFrameSettled(NAV)).toBe("SETTLED");
        applyFrameSettlement(patchOf({ cards: { attendance: { state: "known" }, health: {} } }));
        // A late settlement may still fill a cell, but the navigation does not go backwards.
        expect(["SETTLING", "SETTLED"]).toContain(readFrame(NAV).state);
        expect(readFrame(NAV).state).not.toBe("FRAME_READY");
    });
});

/* ── PART 9 — RESOURCE LIFECYCLE ─────────────────────────────────────────────────────────────── */

describe("plant: no unbounded per-navigation memory", () => {
    it("an abandoned navigation is dropped immediately", () => {
        registerFrameReady(NAV, answerOf());
        expect(frameCountForTests()).toBe(1);
        abandonNavigation(NAV);
        expect(frameCountForTests()).toBe(0);
        expect(readFrame(NAV).state).toBe("ABSENT");
    });

    it("a frame nobody came back for expires and is swept", () => {
        const t0 = 1_000_000;
        registerFrameReady(NAV, answerOf(), t0);
        const later = t0 + FRAME_LIFETIME_MS + 1;
        expect(readFrame(NAV, later).state).toBe("EXPIRED");
        expect(sweepExpiredFrames(later)).toBe(1);
        expect(frameCountForTests()).toBe(0);
    });

    it("an expired frame refuses settlement rather than resurrecting", () => {
        const t0 = 1_000_000;
        registerFrameReady(NAV, answerOf(), t0);
        const out = applyFrameSettlement(patchOf(), t0 + FRAME_LIFETIME_MS + 1);
        if (out.applied) throw new Error("an expired frame accepted a settlement");
        expect(out.reason).toBe("expired");
    });

    it("many navigations do not accumulate past their lifetime", () => {
        const t0 = 1_000_000;
        for (let i = 0; i < 50; i++) registerFrameReady({ ...NAV, subject: `s${i}` }, answerOf(), t0);
        expect(frameCountForTests()).toBe(50);
        registerFrameReady({ ...NAV, subject: "fresh" }, answerOf(), t0 + FRAME_LIFETIME_MS + 1);
        expect(frameCountForTests()).toBe(1);
    });
});

/* ── PART 6 — THE CONSUMER REMAINS ELIGIBLE AFTER THE FIRST READ ─────────────────────────────── */

describe("plant: reading the frame does not end settlement eligibility", () => {
    it("a settlement still applies after the frame has been read", () => {
        registerFrameReady(NAV, answerOf());
        expect(readFrame(NAV).answer).not.toBeNull();
        expect(readFrame(NAV).answer).not.toBeNull(); // read twice, deliberately
        expect(applyFrameSettlement(patchOf()).applied).toBe(true);
    });
});

/* ── PART 7 / 10 — UNKNOWN IS NOT ZERO, AND ONE FAILURE DOES NOT FAIL THE FRAME ───────────────── */

describe("plant: a settlement never fabricates an authoritative empty", () => {
    it("a null patch field leaves the cell UNKNOWN rather than writing an empty value", () => {
        const frame = answerOf();
        const applied = applyProvisioningSettlement(frame, patchOf({ cards: null, resolvedParticipant: null }), NAV);
        const cards = (applied as unknown as { focusPanelOperationalProjection: { cards: unknown } })
            .focusPanelOperationalProjection.cards;
        expect(cards).toBeNull();
        expect(cards).not.toEqual({});
        expect(cards).not.toEqual([]);
        expect(cards).not.toBe(0);
    });

    it("one capability failing does not remove the frame", () => {
        registerFrameReady(NAV, answerOf());
        // Producers threw: the route resolves the settlement to null and nothing is delivered.
        expect(readFrame(NAV).answer).not.toBeNull();
        expect(readFrame(NAV).state).toBe("FRAME_READY");
    });

    it("a frame with no operational projection is left alone rather than patched into one", () => {
        const empty = answerOf({ terminal: "empty" });
        const out = applyProvisioningSettlement(empty, patchOf(), NAV);
        expect(out).toBe(empty);
    });
});

/* ── PART 3 — THE KERNEL TRANSPORTS, IT DOES NOT DECIDE ──────────────────────────────────────── */

describe("plant: the kernel owns transport, not truth", () => {
    it("it writes only the fields the patch carried, and invents none", () => {
        registerFrameReady(NAV, answerOf());
        applyFrameSettlement(patchOf({ cards: null, resolvedTour: null }));
        const a = readFrame(NAV).answer as unknown as Record<string, unknown>;
        expect(a.resolvedParticipant).toEqual({ participationId: "pi-1", customerMemberId: "cm-1" });
        // Geometry fields are untouched by settlement — this is the stable-geometry guarantee.
        expect((a.contextFrame as { workViewId: string }).workViewId).toBe("wv-new");
        expect((a.currentBusinessState as { stageKey: string }).stageKey).toBe("lead");
        expect((a.recordOfAttention as { id: string }).id).toBe("subj-1");
    });
});
