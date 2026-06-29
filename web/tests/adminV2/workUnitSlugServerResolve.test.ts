import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

/**
 * Runtime convergence Phase 2 — Slice 3 (server-resolve work-unit slug).
 * Resolving `/workspace/work-unit/:slug` identity on the server removes the
 * `WorkUnitWorkspaceColdShell` + client slug-resolution waterfall so the surface reveals once
 * (Operational Runtime Doctrine Laws 1/5). The client resolution stays as a graceful fallback.
 */
describe("work-unit slug server resolution", () => {
    it("server loader is server-only and reuses the same resolution helpers as the API route", () => {
        const src = read("lib/admin/loadWorkUnitSlugRouteServer.ts");
        expect(src).toContain('import "server-only"');
        expect(src).toContain("fetchWorkUnitsForSlugResolution");
        expect(src).toContain("resolveWorkUnitByRouteSlug");
    });

    it("server loader falls back safely (null) on non-resolved / error", () => {
        const src = read("lib/admin/loadWorkUnitSlugRouteServer.ts");
        // not_found / ambiguous → null (client renders the precise message)
        expect(src).toContain('if (result.status !== "resolved") return null;');
        // any throw → null (client fallback + runtime-flag rollback path preserved)
        expect(src).toMatch(/catch\s*{\s*return null;\s*}/);
    });

    it("canonical work-unit layout resolves metadata server-side and passes it to the host", () => {
        const layout = read("app/adminV2/workspace/work-unit/[workUnitSlug]/layout.tsx");
        expect(layout).toContain("loadWorkUnitSlugRouteMetaServer(workUnitSlug)");
        expect(layout).toContain("initialRouteMeta={initialRouteMeta}");
    });

    it("client host consumes server metadata for initial state (no client fetch when present)", () => {
        const host = read("components/admin/workspace/WorkUnitSlugRouteHost.tsx");
        expect(host).toContain("initialRouteMeta");
        // initial state prefers cache, else the server seed (so the cold shell is skipped)
        expect(host).toContain("peekWorkUnitSlugRouteCache(workUnitSlug) ?? initialRouteMeta");
        // server identity is seeded into the module cache so the fallback fetch is skipped
        expect(host).toContain("putWorkUnitSlugRouteCache(workUnitSlug, initialRouteMeta)");
    });

    it("cold shell is the fallback only — reached when neither cache nor server seed exists", () => {
        const host = read("components/admin/workspace/WorkUnitSlugRouteHost.tsx");
        // The cold shell still exists for the client-fallback path...
        expect(host).toContain("WorkUnitWorkspaceColdShell");
        // ...but it only renders in the loading phase, which the server seed skips (initialCache → ready).
        expect(host).toContain('if (state.phase === "loading")');
        expect(host).toContain("initialRouteMeta = null");
    });
});
