/**
 * Ownership / request-graph guards for communications status-options and inbox threads.
 *
 * These prove the smallest ownership correction: the workspace warm cache is the single owner of
 * status-options + audience metadata; the Work Unit first-paint runtime loads NEITHER full inbox
 * threads NOR status-options; and the idle inbox warm is a compact preview, not the full panel load.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const web = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(web, rel), "utf8");

describe("communications status-options ownership", () => {
    it("AnnouncementsWorkspace consumes the warm cache and issues NO fetch on a warm hit", () => {
        const ws = read("app/adminV2/communications/AnnouncementsWorkspace.tsx");
        // Both option loaders early-return when the single warm owner already resolved.
        const guards = ws.match(/if \(getCommunicationsWarmAudienceMetadata\(\) !== null\) return;/g) ?? [];
        expect(guards.length).toBeGreaterThanOrEqual(2); // loadStatusOptions + loadAudienceOptions
    });
});

describe("Work Unit first paint does not load communications", () => {
    const runtime = read("lib/presentation/runtime/useWorkUnitSurfaceRuntime.ts");
    const surface = read("components/presentation/workUnit/WorkUnitSurface.tsx");

    it("the WU surface runtime never requests inbox threads or status-options", () => {
        for (const src of [runtime, surface]) {
            expect(src).not.toContain("/api/admin/inbox/threads");
            expect(src).not.toContain("communications/status-options");
        }
    });

    it("the WU surface does not mount the full InboxPanel", () => {
        expect(surface).not.toContain("InboxPanel");
        expect(runtime).not.toContain("InboxPanel");
    });
});

describe("idle inbox warm is a compact preview, not the full panel load", () => {
    it("the warm-load cache fetches compact (limit 20), distinct from the panel's full threads", () => {
        const warm = read("lib/adminV2/inboxWarmLoadCache.ts");
        expect(warm).toContain("compact=1");
        expect(warm).toMatch(/MODAL_THREAD_LIMIT\s*=\s*20/); // compact preview count, not the panel's full 50
        // The core preload schedules the warm on idle (schedule*), it is not an eager first-paint fetch.
        const registry = read("lib/adminV2/coreSurfacePreloadRegistry.ts");
        expect(registry).toContain("scheduleInboxWarmLoad");
        expect(registry).toContain("scheduleCommunicationsWorkspaceWarm");
    });
});
