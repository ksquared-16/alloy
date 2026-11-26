/**
 * THE CARD READINESS CONTRACT — enforced where every current and future card consumes it.
 *
 * A card is admitted to the ready set by ONE generic rule: `isKnowable(context)`, asked of each
 * registered spec in turn. Nothing in that loop names a card. The defect this pins was a single
 * spec opting out of the rule — `current_work` carried `isKnowable: () => true` while every sibling
 * gated on truth it could actually see — so the card was admitted with a null runtime, contributed
 * no reserved cell, and rendered its content perspective over nothing: a header reported as ready.
 *
 * These tests drive the SPEC TABLE, not the card, and case 9 registers a synthetic card to prove a
 * new one inherits the contract without adding a runtime branch.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    COMMIT_CRITICAL_CARD_SPECS,
    type CommitCriticalCardSpec,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalCards";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

/** Minimal context: only the fields the readiness rules read. */
function ctx(over: Record<string, unknown> = {}): OperationalContext {
    return {
        subject: { type: "opportunity", id: "subject-A", label: "A" },
        truth: {},
        stageWorkRuntime: null,
        signals: { work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null } },
        ...over,
    } as unknown as OperationalContext;
}

/** The production admission loop, verbatim in shape: no card is named here. */
function readySet(context: OperationalContext, specs: readonly CommitCriticalCardSpec[] = COMMIT_CRITICAL_CARD_SPECS) {
    const ready = new Set<string>();
    for (const spec of specs) if (spec.isKnowable(context)) ready.add(spec.key);
    return ready;
}
const IDENTITY = { "person.primary_contact_name": "Kelly Kurzman" };
const RUNTIME = { items: [] } as unknown as OperationalContext["stageWorkRuntime"];

describe("card readiness contract", () => {
    it("1 — a card whose truth is available synchronously is ready at commit", () => {
        expect(readySet(ctx({ truth: IDENTITY }))).toContain("household");
    });

    it("2 — a deferred card reserves until its own truth arrives, then readies", () => {
        // No projection and no next action: the answer has said nothing about the work yet.
        expect(readySet(ctx())).not.toContain("current_work");
        expect(readySet(ctx({ stageWorkRuntime: RUNTIME }))).toContain("current_work");
        // The next-action label alone is also a resolved answer.
        expect(readySet(ctx({ signals: { work: { nextActionLabel: "Review waitlist position" } } })))
            .toContain("current_work");
    });

    it("3 — a legitimately empty result is READY, not pending", () => {
        // An answer that resolved and found no active work carries a projection with no items.
        // That is a resolved empty, and it must not be demoted to loading.
        expect(readySet(ctx({ stageWorkRuntime: RUNTIME }))).toContain("current_work");
    });

    it("5 — two cards resolve in either order, independently", () => {
        const workFirst = readySet(ctx({ stageWorkRuntime: RUNTIME }));
        expect(workFirst).toContain("current_work");
        expect(workFirst).not.toContain("household");

        const identityFirst = readySet(ctx({ truth: IDENTITY }));
        expect(identityFirst).toContain("household");
        expect(identityFirst).not.toContain("current_work");
    });

    it("6 — rapid A → B → C: each subject's readiness is computed from its own context only", () => {
        const A = readySet(ctx({ subject: { type: "opportunity", id: "A", label: "A" }, stageWorkRuntime: RUNTIME }));
        const B = readySet(ctx({ subject: { type: "opportunity", id: "B", label: "B" } }));
        const C = readySet(ctx({ subject: { type: "opportunity", id: "C", label: "C" }, truth: IDENTITY }));
        expect(A).toContain("current_work");
        expect(B.size).toBe(0);           // B resolved nothing yet — everything reserves
        expect(C).toContain("household");
        expect(C).not.toContain("current_work");
    });

    it("7 — stale A truth cannot satisfy readiness for C", () => {
        // Readiness is a pure function of the context handed in. A's resolved runtime is not
        // reachable from C's context, so it cannot admit C's card.
        const cCtx = ctx({ subject: { type: "opportunity", id: "C", label: "C" } });
        expect(readySet(cCtx)).not.toContain("current_work");
        expect(cCtx.subject.id).toBe("C");
    });

    it("8 — one card unresolved while another is ready", () => {
        const set = readySet(ctx({ truth: IDENTITY }));
        expect(set).toContain("household");
        expect(set).not.toContain("current_work");
    });

    it("9 — a newly registered synthetic card inherits the contract with no runtime branch", () => {
        const synthetic: CommitCriticalCardSpec = {
            key: "synthetic_future_card" as CommitCriticalCardSpec["key"],
            isKnowable: (c) => (c.truth as Record<string, unknown>).future_fact != null,
            build: () => ({ key: "synthetic_future_card", visible: true } as never),
        };
        const specs = [...COMMIT_CRITICAL_CARD_SPECS, synthetic];
        expect(readySet(ctx(), specs)).not.toContain("synthetic_future_card");
        expect(readySet(ctx({ truth: { future_fact: 1 } }), specs)).toContain("synthetic_future_card");
        // The loop that admitted it names no card — that is what makes it inheritable.
        const producer = readFileSync(
            join(process.cwd(), "lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer.ts"),
            "utf8",
        );
        const loop = producer.slice(producer.indexOf("for (const spec of COMMIT_CRITICAL_CARD_SPECS"));
        const body = loop.slice(0, loop.indexOf("\n    }") + 6);
        for (const named of ["current_work", "household", "children", "readiness_kpi", "scheduling", "billing"]) {
            expect(body).not.toContain(`"${named}"`);
        }
    });

    it("REGRESSION — no spec may opt out of the rule with an unconditional isKnowable", () => {
        // `isKnowable: () => true` is the exact shape of the defect: admission without evidence.
        const src = readFileSync(
            join(process.cwd(), "lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalCards.ts"),
            "utf8",
        ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        expect(src).not.toMatch(/isKnowable:\s*\(\s*\)\s*=>\s*true/);
        // And every registered spec must actually consult its context.
        for (const spec of COMMIT_CRITICAL_CARD_SPECS) {
            expect(spec.isKnowable.length, `${spec.key} ignores the context`).toBeGreaterThan(0);
        }
    });

    it("MUTATION — restoring the unconditional rule readmits the card with no truth", () => {
        // Proves these tests can fail: this is the pre-fix spec, and it is admitted on an empty context.
        const preFix: CommitCriticalCardSpec = {
            ...COMMIT_CRITICAL_CARD_SPECS.find((s) => s.key === "current_work")!,
            isKnowable: () => true,
        };
        expect(readySet(ctx(), [preFix])).toContain("current_work");
        expect(readySet(ctx())).not.toContain("current_work");
    });
});
