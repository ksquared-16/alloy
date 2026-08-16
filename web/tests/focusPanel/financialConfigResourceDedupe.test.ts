/** @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    clearFinancialConfigForTests,
    invalidateFinancialConfig,
    loadFinancialConfig,
} from "@/lib/adminV2/runtime/focusPanel/financialConfig/financialConfigResource";

/**
 * Three consumers wanted the opportunity financial config and each issued its own fetch:
 * `useFinancialConfig` (no dedupe), `SchedulingCard`, `AssignmentProposalControls`. Two mounting
 * together produced a byte-identical GET twice — observed on Firefly's family subject while
 * opening the Focus Panel edit path.
 *
 * Counts, not timings.
 */
let calls: string[];
beforeEach(() => {
    calls = [];
    clearFinancialConfigForTests();
    vi.stubGlobal("fetch", ((u: RequestInfo | URL) => {
        calls.push(String(u));
        return Promise.resolve({ ok: true, json: async () => ({ enrollments: [] }) });
    }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); clearFinancialConfigForTests(); });

describe("financial config — one request per opportunity", () => {
    it("concurrent consumers share ONE request", async () => {
        await Promise.all([loadFinancialConfig("opp-1"), loadFinancialConfig("opp-1"), loadFinancialConfig("opp-1")]);
        expect(calls).toHaveLength(1);
    });

    it("a later consumer inside the TTL costs nothing", async () => {
        await loadFinancialConfig("opp-1", 0);
        calls = [];
        await loadFinancialConfig("opp-1", 1_000);
        expect(calls).toHaveLength(0);
    });

    it("re-fetches once the TTL lapses", async () => {
        await loadFinancialConfig("opp-1", 0);
        calls = [];
        await loadFinancialConfig("opp-1", 30_001);
        expect(calls).toHaveLength(1);
    });

    it("different opportunities do not share an entry", async () => {
        await loadFinancialConfig("opp-1");
        calls = [];
        await loadFinancialConfig("opp-2");
        expect(calls).toHaveLength(1);
    });

    it("a failure is not cached", async () => {
        vi.stubGlobal("fetch", (() => Promise.resolve({ ok: false, status: 500 })) as unknown as typeof fetch);
        await expect(loadFinancialConfig("opp-x")).rejects.toThrow("HTTP 500");
        vi.stubGlobal("fetch", ((u: RequestInfo | URL) => {
            calls.push(String(u));
            return Promise.resolve({ ok: true, json: async () => ({ enrollments: [] }) });
        }) as unknown as typeof fetch);
        calls = [];
        await loadFinancialConfig("opp-x");
        expect(calls).toHaveLength(1);
    });

    it("invalidation retires the entry", async () => {
        await loadFinancialConfig("opp-1", 0);
        invalidateFinancialConfig("opp-1");
        calls = [];
        await loadFinancialConfig("opp-1", 10);
        expect(calls).toHaveLength(1);
    });

    it("no consumer fetches this endpoint itself", () => {
        // The counts hold only while every consumer goes through the seam.
        for (const rel of [
            "lib/adminV2/runtime/focusPanel/financialConfig/useFinancialConfig.ts",
            "components/admin/focusPanel/cards/SchedulingCard.tsx",
            "components/admin/focusPanel/cards/AssignmentProposalControls.tsx",
        ]) {
            const code = readFileSync(join(__dirname, "..", "..", rel), "utf8")
                .replace(/\/\*[\s\S]*?\*\//g, "")
                .replace(/\/\/.*$/gm, "");
            expect(code, `${rel} must load through financialConfigResource`).not.toContain(
                "fetch(`/api/admin/financial-config",
            );
            expect(code).toContain("loadFinancialConfig(");
        }
    });
});
