import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");
const SEED = read("components/admin/workspace/ProvisioningSettlementSeed.tsx");
const KERNEL_CTX = read("lib/runtime/kernel/RuntimeKernelContext.tsx");
const LIFECYCLE = read("lib/runtime/kernel/provisioningFrameLifecycle.ts");

/**
 * P076 — ONE CANONICAL SETTLEMENT OWNER.
 *
 * Measured on deployed f3c9e139: the settlement classified `applied` with one registered frame, and
 * the Focus Panel still showed `data-financials-empty="loading"`. Applying is not consuming. A
 * source census found why — `readFrame` and `markFrameSettled` have ZERO production callers, so the
 * frame lifecycle had two writers and no reader, and the only thing reading a settled answer was
 * the test suite. That is how a write-only store stays green: tests prove the write happened and
 * nothing proves anyone consumed it.
 *
 * The mounted surface reads exactly one thing — the committed Focus snapshot. These pin that BOTH
 * settlement paths converge on it, and that neither of them invents a second authority.
 */
describe("settlement consumer ownership", () => {
    it("the RSC settlement commits through K3, not into the lifecycle alone", () => {
        expect(SEED).toContain("applyFrameSettlement(patch)");
        expect(SEED).toContain("kernel.focus.onPreparationTerminal({");
        expect(SEED).toContain("snapshot: outcome.answer");
    });

    it("the kernel settlement commits through the SAME entry point", () => {
        // Both paths land on K3's only commit entry point. One owner, two producers.
        expect(KERNEL_CTX).toContain("focus.onPreparationTerminal(terminal);");
        expect(KERNEL_CTX).toContain("onTerminal: (terminal) => {");
    });

    it("A ROUTE-LOAD SETTLEMENT CANNOT COMMIT UNDER A SUBJECT THE OPERATOR CLICKED TO", () => {
        /*
         * The failure this prevents: the producers finish after the operator has already clicked a
         * queue row, and the route-load facts commit under the clicked subject's identity. Focus's
         * own guard keys on attention VERSION, which a differently-addressed settlement can share,
         * so the navigation itself is compared before committing.
         */
        expect(SEED).toContain("const sameNavigation =");
        expect(SEED).toContain("nav.target === current.ref.target");
        expect(SEED).toContain("if (!sameNavigation) return;");
        // Abandoned, never reshaped to fit the current subject.
        expect(SEED).not.toMatch(/sameNavigation[\s\S]{0,200}subject:\s*current/);
    });

    it("it commits against the CURRENT committed version, not an invented one", () => {
        expect(SEED).toContain("attentionVersion: current.ref.version");
        // No fabricated version that would bypass Focus's staleness rules.
        expect(SEED).not.toMatch(/attentionVersion:\s*(0|-1|Date\.now|Number\.MAX)/);
    });

    it("no second authority was introduced", () => {
        for (const forbidden of ["new Map(", "new EventTarget", "BroadcastChannel", "localStorage", "useState"]) {
            expect(SEED.includes(forbidden), `settlement seed must not contain ${forbidden}`).toBe(false);
        }
    });

    it("the lifecycle keeps its refusal guard — it stops being the terminus, not the gate", () => {
        // The guard that makes a wrong-key or stale settlement fail closed must remain.
        expect(LIFECYCLE).toContain('return { applied: false, reason: "no_frame", state: "ABSENT" };');
        expect(LIFECYCLE).toContain("settlementMatchesFrame(rec.answer, patch, rec.navigation)");
        // And the diagnostic that let this be classified at all.
        expect(LIFECYCLE).toContain("recordSettlementOutcome(addressed, \"applied\", frames.size);");
    });

    it("WRITE-ONLY REGRESSION: a settlement that only writes the lifecycle is not delivery", () => {
        /*
         * The exact shape of the deployed defect. If the seed ever returns to calling
         * `applyFrameSettlement` and nothing else, the settlement is once again correct and
         * invisible — and every other test in the suite would still pass.
         */
        const body = SEED.slice(SEED.indexOf("useMemo(() => {"));
        expect(body).toContain("onPreparationTerminal");
    });
});
