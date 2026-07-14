import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    CORE_SURFACE_PRELOAD_REGISTRY,
    resetCoreSurfacePreloadForTests,
    runCoreSurfacePreload,
} from "@/lib/adminV2/coreSurfacePreloadRegistry";

/**
 * /workspace boot request ownership — a REAL-invocation request-plan test (not a source-string
 * assertion). It runs the actual core-surface preload with `fetch` spied and asserts the boot warm
 * set is bounded to the ALLOWED classes and initiates NONE of the forbidden resources.
 *
 * Allowed on boot: persistent navigation (workspace/work-unit nav tree). Everything else — inbox
 * threads, communications templates/status-options/announcements/bindings, provider bindings,
 * processing queue, operational task details, AI capabilities, the full analytics metric set,
 * inactive Work Unit payloads, per-WU enriched summaries, full catalogs — must be idle-on-open,
 * interaction-, or destination-triggered, NOT initiated by the boot preload.
 */

const FORBIDDEN_URL_FRAGMENTS = [
    "/api/admin/operational-tasks",
    "/api/admin/communications/templates",
    "/api/admin/communications/status-options",
    "/api/admin/communications/announcements",
    "/api/admin/communications/audience",
    "/api/admin/communications/provider",
    "/api/admin/inbox/threads",
    "/api/admin/processing",
    "/api/admin/ai/",
    "resolved-metrics", // the analytics all-keys warm hits the resolved-metrics batch
];

function isNavTreeUrl(url: string): boolean {
    return /work-units|departments|lifecycle-catalog|nav/i.test(url);
}

describe("/workspace boot request ownership", () => {
    let requested: string[];

    beforeEach(() => {
        requested = [];
        resetCoreSurfacePreloadForTests();
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL) => {
                const url = typeof input === "string" ? input : input.toString();
                requested.push(url);
                return new Response(JSON.stringify({ items: [], data: [] }), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                });
            }),
        );
        // Idle scheduler in some helpers uses requestIdleCallback — provide a synchronous shim.
        vi.stubGlobal("requestIdleCallback", (cb: (deadline: unknown) => void) => {
            cb({ didTimeout: false, timeRemaining: () => 50 });
            return 1 as unknown as number;
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        resetCoreSurfacePreloadForTests();
    });

    it("the boot preload registry warms ONLY nav-tree surfaces (no forbidden boot warm entries)", () => {
        // work_items / communications / processing must carry NO boot warm — they are interaction-triggered.
        const withWarm = CORE_SURFACE_PRELOAD_REGISTRY.filter((e) => typeof e.warm === "function").map((e) => e.key);
        expect(withWarm.sort()).toEqual(["work_units", "workspace"]);
        for (const key of ["communications", "work_items", "processing"] as const) {
            const entry = CORE_SURFACE_PRELOAD_REGISTRY.find((e) => e.key === key);
            expect(entry?.warm, `${key} must not warm on boot`).toBeUndefined();
        }
    });

    it("running the boot preload initiates none of the forbidden resources", async () => {
        runCoreSurfacePreload({ force: true });
        // Let any microtasks from the warm helpers settle.
        await Promise.resolve();
        await Promise.resolve();

        for (const fragment of FORBIDDEN_URL_FRAGMENTS) {
            const hit = requested.find((u) => u.includes(fragment));
            expect(hit, `boot initiated a forbidden request: ${fragment} (${hit ?? "none"})`).toBeUndefined();
        }
    });

    it("every request the boot preload DOES initiate is a persistent-navigation warm", async () => {
        runCoreSurfacePreload({ force: true });
        await Promise.resolve();
        await Promise.resolve();

        for (const url of requested) {
            expect(isNavTreeUrl(url), `unexpected boot request (not nav-tree): ${url}`).toBe(true);
        }
    });
});
