import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { FocusOwner } from "@/lib/runtime/kernel/focus";
import type { PreparationTerminal } from "@/lib/runtime/kernel/provisioning";
import type { AttentionRef } from "@/lib/runtime/kernel/attention";
import { ATTENTION_SCOPE } from "@/lib/runtime/kernel/attention";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../");
const KERNEL_CTX = readFileSync(join(webRoot, "lib/runtime/kernel/RuntimeKernelContext.tsx"), "utf8");

/*
 * A queue-row switch is a SUBJECT-scope move. The scope is not decoration: `supersedes` compares it,
 * so a ref carrying an undefined scope makes every supersession check silently return false and the
 * staleness assertions below would pass against a fixture rather than against the kernel.
 */
const REF = (version: number, subject: string): AttentionRef => ({
    scope: ATTENTION_SCOPE.SUBJECT,
    target: "new-leads",
    tenant: "t1",
    principal: "u1",
    lens: null,
    cohort: null,
    version,
    subject,
} as unknown as AttentionRef);

function terminal(ref: AttentionRef, snapshot: Record<string, unknown>): PreparationTerminal {
    return {
        key: `k:${ref.version}`,
        outcome: "operational",
        snapshot: Object.freeze(snapshot) as never,
        attentionVersion: ref.version,
        durationMs: 1,
    } as unknown as PreparationTerminal;
}

function owner() {
    const commits: number[] = [];
    const f = new FocusOwner(
        { onCommitCompleted: () => commits.push(1) },
        () => "/adminV2/workspace/work-unit/new-leads",
    );
    return { f, commits };
}

/**
 * P076 / OX SLICE 8 — AN EMIT WITHOUT A CONSUMER IS NOT DELIVERY.
 *
 * Phase 2 was computed, emitted and dropped. Focus was fed only from
 * `onAttentionMoved(...).then(...)`, and that promise resolves on the FIRST terminal, so a settled
 * snapshot emitted afterwards reached `emit`, reached `onTerminal` for timing, and never reached the
 * committed surface. Measured on deployed ed24d807: the capability cards stayed unresolved on BOTH
 * the route-load and queue-switch paths, and the earlier Slice-8 actionable measurement was flat
 * (~2,559ms vs ~2,677ms) for the same reason.
 *
 * The first test is the regression guard the failure actually needed: it asserts a SECOND terminal
 * commits. The old wiring passes every other test in this file and fails only this one.
 */
describe("settlement reaches the surface", () => {
    it("A SECOND TERMINAL COMMITS — the inert-second-emit regression", () => {
        const { f, commits } = owner();
        const ref = REF(1, "B");
        f.onAttentionMoved(ref);
        expect(f.onPreparationTerminal(terminal(ref, { terminal: "operational", cards: null }))).toBe(true);
        const afterFrame = commits.length;
        // Phase 2: the same navigation, a richer snapshot.
        expect(
            f.onPreparationTerminal(terminal(ref, { terminal: "operational", cards: { financials: 1 } })),
            "a settled snapshot for the SAME attention must be able to commit",
        ).toBe(true);
        expect(commits.length).toBeGreaterThan(afterFrame);
        expect((f.get().current?.snapshot as unknown as { cards?: unknown })?.cards).toEqual({ financials: 1 });
    });

    it("LATE B CANNOT REPAINT C — the settlement is refused once attention moves on", () => {
        const { f } = owner();
        const b = REF(1, "B");
        f.onAttentionMoved(b);
        f.onPreparationTerminal(terminal(b, { terminal: "operational", cards: null }));
        // Attention moves to C, and C commits.
        const c = REF(2, "C");
        f.onAttentionMoved(c);
        f.onPreparationTerminal(terminal(c, { terminal: "operational", cards: { c: true } }));
        // B's settlement arrives late.
        expect(f.onPreparationTerminal(terminal(b, { terminal: "operational", cards: { financials: 1 } }))).toBe(false);
        expect((f.get().current?.snapshot as unknown as { cards?: unknown })?.cards).toEqual({ c: true });
    });

    it("a settlement for a superseded attention fails closed", () => {
        const { f } = owner();
        const b = REF(1, "B");
        f.onAttentionMoved(b);
        f.onPreparationTerminal(terminal(b, { terminal: "operational", cards: null }));
        f.onAttentionMoved(REF(2, "C"));
        // Desired is now C; B's late settlement must not commit.
        expect(f.onPreparationTerminal(terminal(b, { terminal: "operational", cards: { financials: 1 } }))).toBe(false);
    });

    it("the kernel wires EVERY terminal to K3, not only the awaited one", () => {
        // The defect was structural: Focus was fed from the promise, which resolves once.
        expect(KERNEL_CTX).toContain("onTerminal: (terminal) => {");
        expect(KERNEL_CTX).toContain("focus.onPreparationTerminal(terminal);");
        // The awaited path must no longer be the delivery route, or phase 1 commits twice.
        expect(KERNEL_CTX).not.toContain("if (terminal) focus.onPreparationTerminal(terminal);");
    });

    it("no new delivery mechanism was introduced — one canonical commit entry point", () => {
        for (const forbidden of ["new EventTarget", "addEventListener(\"settlement", "new BroadcastChannel", "settlementBus"]) {
            expect(KERNEL_CTX.includes(forbidden), `must not introduce ${forbidden}`).toBe(false);
        }
    });
});
