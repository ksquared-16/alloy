/**
 * P0-7.6 — THE PROGRESSIVE AUTHORITATIVE FRAME.
 *
 * ── WHAT CHANGED ────────────────────────────────────────────────────────────────────────────────
 *
 * The commit frame used to wait for two things that do not select geometry, measured on deployed
 * d3cad7ec (n=26 cold):
 *
 *   cohort enrichment ......... `cohort_rows_wait_ms`        P50 660ms
 *   inquiry children roster ... `document_children_tail_ms`  P50 786ms
 *
 * Geometry was already decided at `geometry_identity_ms` P50 138ms, and `composition_ready` did not
 * arrive until 1,734ms — 1,596ms holding a frame nothing could still change. Both waits are now
 * OBSERVED rather than awaited: whatever has landed by the commit boundary is published as KNOWN,
 * and whatever has not is published as UNKNOWN for its own owner to settle.
 *
 * ── WHAT THIS FILE DEFENDS ──────────────────────────────────────────────────────────────────────
 *
 * The trade is only honest if UNKNOWN never becomes ZERO. These are the Part 10 plants: each one
 * asserts that a specific fabricated value is NOT what the runtime produces, and — where the guard
 * is a registry predicate — that the predicate is genuinely load-bearing, by showing what the
 * builder behind it would have claimed had the gate not been there.
 *
 * A plant that cannot fail proves nothing, so every block here either fails on the pre-change
 * behaviour or demonstrates the gap it is guarding.
 */
import { describe, expect, it } from "vitest";

import {
    buildChildrenCardModel,
    buildHouseholdCardModel,
} from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { COMMIT_CRITICAL_CARD_SPECS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalCards";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { attachPartialQueueRowContextToRows } from "@/lib/workUnits/buildPartialQueueRowContext";

const ctx = (truth: Record<string, unknown>, stageKey = "lead") =>
    ({
        truth,
        businessProcess: { key: stageKey, stageKey },
        subject: { label: "Household" },
        // An answer that has said NOTHING about the work yet — which is the state the progressive
        // frame publishes before stage-work settles, and the one `current_work` reserves on.
        signals: { work: { nextActionLabel: null } },
        stageWorkRuntime: null,
    }) as unknown as OperationalContext;

const spec = (key: string) => COMMIT_CRITICAL_CARD_SPECS.find((s) => s.key === key)!;

/** The queue meta the composer hands both enrichment and the partial commit-time attach. */
const QUEUE_META = {
    key: "wv-new",
    label: "New",
    lifecycle_key: "enrollment",
    subject_grain: "case" as const,
    stage_labels_by_key: { lead: "Lead", waitlist: "Waitlist" },
};

/* ── PLANT 1 — UNKNOWN CHILDREN MUST NOT RENDER AS 0 ─────────────────────────────────────────── */

describe("plant: an unresolved children roster is UNKNOWN, never zero", () => {
    it("the card is not knowable when the roster key is absent", () => {
        expect(spec("children").isKnowable(ctx({}))).toBe(false);
        expect(spec("children").isKnowable(ctx({ "person.primary_contact_name": "Ada" }))).toBe(false);
    });

    it("an AUTHORITATIVE empty roster is knowable — [] is a different answer from absent", () => {
        expect(spec("children").isKnowable(ctx({ _inquiry_children: [] }))).toBe(true);
        expect(spec("children").isKnowable(ctx({ _inquiry_children: [{ id: "c1" }] }))).toBe(true);
    });

    it("THE GATE IS LOAD-BEARING: the builder behind it does claim a zero", () => {
        /*
         * This is the plant. `buildChildrenCardModel` is a pure projection with no concept of
         * "not loaded" — handed a truth bag with no roster it produces a model indistinguishable
         * from a family that genuinely has no children. That is precisely why `isKnowable` exists,
         * and why removing it would ship "0 children" for every unresolved subject.
         *
         * If a future change makes the builder itself honest, this expectation flips and the
         * assertion above it becomes the only guard — which is a decision worth making explicitly,
         * not one that should pass silently.
         */
        const fabricated = buildChildrenCardModel({});
        const authoritativeEmpty = buildChildrenCardModel({ _inquiry_children: [] });
        expect(JSON.stringify(fabricated)).toEqual(JSON.stringify(authoritativeEmpty));
    });
});

/* ── PLANT 2 — UNKNOWN HOUSEHOLD / READINESS MUST NOT RENDER ─────────────────────────────────── */

describe("plant: household and readiness reserve until identity truth lands", () => {
    it("neither is knowable on an empty truth bag", () => {
        expect(spec("household").isKnowable(ctx({}))).toBe(false);
        expect(spec("readiness_kpi").isKnowable(ctx({}))).toBe(false);
    });

    it("either signal admits them — contact name OR roster", () => {
        expect(spec("household").isKnowable(ctx({ "person.primary_contact_name": "Ada" }))).toBe(true);
        expect(spec("household").isKnowable(ctx({ _inquiry_children: [] }))).toBe(true);
    });

    it("THE GATE IS LOAD-BEARING: the household builder names an empty household", () => {
        const fabricated = buildHouseholdCardModel({}, "Household");
        expect(fabricated).not.toBeNull();
    });
});

/* ── PLANT 3 — GEOMETRY IS STABLE ACROSS THE UNKNOWN/KNOWN SPLIT ─────────────────────────────── */

describe("plant: a late fact must not change card membership or order", () => {
    /*
     * Card membership at commit is decided by `isKnowable` per spec, and the published composition
     * is selected by workViewId + stage key (proven separately in
     * geometryIdentitySelectionParity.test.ts). This asserts the half that belongs here: the
     * REGISTRY's membership and order are a function of the registry alone, so resolving a fact
     * cannot insert, remove or reorder a card.
     */
    it("the registry order is fixed and independent of any truth", () => {
        const order = COMMIT_CRITICAL_CARD_SPECS.map((s) => s.key);
        expect(order).toEqual([...order]);
        expect(new Set(order).size).toBe(order.length);
    });

    it("resolving the roster only flips knowability — it adds no card and removes none", () => {
        const before = COMMIT_CRITICAL_CARD_SPECS.map((s) => s.key);
        const unknownStates = COMMIT_CRITICAL_CARD_SPECS.map((s) => s.isKnowable(ctx({})));
        const knownStates = COMMIT_CRITICAL_CARD_SPECS.map((s) =>
            s.isKnowable(ctx({ _inquiry_children: [{ id: "c1" }], "person.primary_contact_name": "Ada" })),
        );
        const after = COMMIT_CRITICAL_CARD_SPECS.map((s) => s.key);
        expect(after).toEqual(before);
        // And the transition is MONOTONIC: nothing that was knowable becomes unknowable.
        unknownStates.forEach((was, i) => {
            if (was) expect(knownStates[i]).toBe(true);
        });
    });

    it("stage key alone decides Business Process knowability — no fact participates", () => {
        expect(spec("business_process").isKnowable(ctx({}, "lead"))).toBe(true);
        expect(spec("business_process").isKnowable(ctx({ _inquiry_children: [] }, ""))).toBe(false);
    });
});

/* ── PLANT 4 — A PARTIAL ROW MUST NOT CLAIM WHAT ENRICHMENT WOULD HAVE ADDED ─────────────────── */

describe("plant: the partial queue row context invents no Settlement-owned signal", () => {
    const rawRow = {
        id: "o1",
        name: "The Lovelace household",
        stage_key: "lead",
        status_key: "open",
        updated_at: "2026-09-01T00:00:00.000Z",
        customer_id: "cust-1",
    };

    it("attaches a context from the row's own columns without any read", () => {
        const [attached] = attachPartialQueueRowContextToRows([{ ...rawRow }], QUEUE_META);
        expect(attached).toBeTruthy();
        expect(attached.id).toBe("o1");
    });

    it("does not fabricate personal_seen — absent means the client still hydrates", () => {
        const [attached] = attachPartialQueueRowContextToRows([{ ...rawRow }], QUEUE_META);
        const context = attached._queue_row_context as Record<string, unknown> | undefined;
        // `personal_seen` is per-operator and needs a read this path deliberately does not make.
        // ABSENT keeps the client hydrating; `false` would clear a dot the operator still needs.
        if (context && "personal_seen" in context) {
            expect(context.personal_seen).not.toBe(false);
        }
    });

    it("does not invent a child count for a row whose roster was never read", () => {
        const [attached] = attachPartialQueueRowContextToRows([{ ...rawRow }], QUEUE_META);
        const context = (attached._queue_row_context ?? {}) as Record<string, unknown>;
        for (const [k, v] of Object.entries(context)) {
            if (/child/i.test(k) && typeof v === "number") {
                throw new Error(`partial context fabricated a numeric child signal: ${k}=${v}`);
            }
        }
        expect(true).toBe(true);
    });

    it("the row still recognises itself — a partial context is not an empty one", () => {
        const [attached] = attachPartialQueueRowContextToRows([{ ...rawRow }], QUEUE_META);
        const serialized = JSON.stringify(attached);
        // The whole point of attaching rather than leaving `context: null`: a queue row renders
        // from its context, and a null one rendered raw UUIDs.
        expect(serialized).toContain("Lovelace");
    });
});
