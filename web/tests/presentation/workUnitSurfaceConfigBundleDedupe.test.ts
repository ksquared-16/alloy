/** @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    clearWorkUnitSurfaceConfigBundleInflightForTests,
    fetchWorkUnitSurfaceConfigBundle,
} from "@/lib/presentation/runtime/workUnitSurfaceConfigFetch";
import { resetWorkspaceAdminFetchDedupeForTests } from "@/lib/workspace/workspaceAdminFetchDedupe";

/**
 * WORK UNIT surface config bundle — one resolution per (department, work unit) in flight.
 *
 * The module's contract is that "the runtime config effect and the navigation prewarm both
 * resolve the SAME config through this one function". That held for the three parallel reads,
 * which `dedupeAdminFetch` coalesces, but NOT for the queue-row-layout read: it runs after those
 * resolve, so two callers a few hundred milliseconds apart had both cleared the parallel block
 * before either issued it.
 *
 * Observed on the running app: `GET /api/admin/queue-row-layout/...` twice with a byte-identical
 * URL on every Work Unit entry.
 *
 * Counted evidence, not timing.
 */

let calls: string[];
let release: (() => void) | null;

function countOf(fragment: string): number {
    return calls.filter((u) => u.includes(fragment)).length;
}

beforeEach(() => {
    calls = [];
    release = null;
    clearWorkUnitSurfaceConfigBundleInflightForTests();
    resetWorkspaceAdminFetchDedupeForTests();
    vi.stubGlobal("window", {} as unknown as Window);
    vi.stubGlobal("fetch", ((input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        const body: Record<string, unknown> = url.includes("/departments/")
            ? { metadata: {} }
            : url.includes("/work-units?")
              ? { items: [] }
              : url.includes("/queue-row-layout/")
                ? { envelope: { layout: { columns: [] } } }
                : { queue_definition: {} };
        // dedupeAdminFetch hands each caller an independent clone, so the mock must supply one.
        const respond = () => {
            const r: Record<string, unknown> = {
                ok: true,
                status: 200,
                headers: { get: () => null },
                json: async () => body,
            };
            r.clone = () => respond();
            return r;
        };
        if (release && url.includes("/departments/")) {
            return new Promise((res) => {
                release = () => res(respond());
            });
        }
        return Promise.resolve(respond());
    }) as unknown as typeof fetch);
});

afterEach(() => {
    vi.unstubAllGlobals();
    clearWorkUnitSurfaceConfigBundleInflightForTests();
    resetWorkspaceAdminFetchDedupeForTests();
});

describe("work unit surface config bundle", () => {
    it("resolves each endpoint exactly once for a single caller", async () => {
        const bundle = await fetchWorkUnitSurfaceConfigBundle({ departmentId: "d1", workUnitId: "w1" });
        expect(bundle.ok).toBe(true);
        expect(countOf("/queue-row-layout/")).toBe(1);
        expect(countOf("/api/admin/departments/")).toBe(1);
    });

    it("two concurrent callers share ONE resolution — including the serial tail", async () => {
        const a = fetchWorkUnitSurfaceConfigBundle({ departmentId: "d1", workUnitId: "w1" });
        const b = fetchWorkUnitSurfaceConfigBundle({ departmentId: "d1", workUnitId: "w1" });
        expect(a).toBe(b);
        const [ra, rb] = await Promise.all([a, b]);
        expect(ra).toBe(rb);
        // The regression: this was 2 before, because the layout read starts after the parallel
        // block and the two callers no longer overlapped by then.
        expect(countOf("/queue-row-layout/")).toBe(1);
    });

    it("a caller arriving mid-flight still joins the same resolution", async () => {
        release = () => {};
        const first = fetchWorkUnitSurfaceConfigBundle({ departmentId: "d1", workUnitId: "w1" });
        // Second caller arrives while the department read is still pending.
        const second = fetchWorkUnitSurfaceConfigBundle({ departmentId: "d1", workUnitId: "w1" });
        expect(second).toBe(first);
        release?.();
        await Promise.all([first, second]);
        expect(countOf("/queue-row-layout/")).toBe(1);
    });

    it("different work units do NOT share a resolution", async () => {
        const a = fetchWorkUnitSurfaceConfigBundle({ departmentId: "d1", workUnitId: "w1" });
        const b = fetchWorkUnitSurfaceConfigBundle({ departmentId: "d1", workUnitId: "w2" });
        expect(a).not.toBe(b);
        await Promise.all([a, b]);
        // Each work unit is read on its own; the queue-row LAYOUT is deliberately shared, because
        // both units resolve the same surface id from the same department.
        expect(countOf("/api/admin/work-units/w1")).toBe(1);
        expect(countOf("/api/admin/work-units/w2")).toBe(1);
    });

    it("the entry is released so a later navigation re-resolves", async () => {
        await fetchWorkUnitSurfaceConfigBundle({ departmentId: "d1", workUnitId: "w1" });
        calls = [];
        await fetchWorkUnitSurfaceConfigBundle({ departmentId: "d1", workUnitId: "w1" });
        // Coalescing is IN-FLIGHT only — it must never become a stale cache of config.
        expect(countOf("/queue-row-layout/")).toBe(1);
    });
});
