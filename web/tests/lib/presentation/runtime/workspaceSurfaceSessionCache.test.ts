/**
 * RETAINED-TRUTH §4 — the retained WORKSPACE surface cache. Proves the guarantees a warm return to
 * /workspace depends on: a committed composition is read back synchronously, freshness gates the
 * background reload, the hard TTL evicts, and the key isolates every tenant / principal / scope /
 * site dimension so a retained snapshot can never leak across a boundary.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    WORKSPACE_SURFACE_FRESH_MS,
    buildWorkspaceSurfaceCacheKey,
    clearWorkspaceSurfaceSessionCache,
    peekWorkspaceSurface,
    putWorkspaceSurface,
    type RetainedWorkspaceSurface,
    type WorkspaceSurfaceCacheContext,
} from "@/lib/presentation/runtime/workspaceSurfaceSessionCache";
import { ADMINV2_UI_SESSION_CACHE_TTL_MS } from "@/lib/adminV2/runtime/adminV2UiSessionCacheTtl";
import type { WorkspaceProcessTileSnapshot } from "@/lib/presentation/runtime/workspaceProcessSurfaceAssembly";
import type { WorkspaceHeaderPresentationModel } from "@/lib/presentation/runtime/workspaceHeaderSurfaceConfig";

const CTX: WorkspaceSurfaceCacheContext = {
    orgId: "org-1",
    userId: "user-1",
    scopeFingerprint: "scope:1",
    selectedSiteId: null,
};

function surface(label: string): Omit<RetainedWorkspaceSurface, "committedAt"> {
    return {
        processSnapshot: { processes: [{ processKey: label }], config: {} } as unknown as WorkspaceProcessTileSnapshot,
        headerPresentation: { title: label } as unknown as WorkspaceHeaderPresentationModel,
        rightRailActions: [],
        defaultDepartmentId: "dept-1",
    };
}

beforeEach(() => {
    clearWorkspaceSurfaceSessionCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T00:00:00.000Z"));
});
afterEach(() => {
    vi.useRealTimers();
    clearWorkspaceSurfaceSessionCache();
});

describe("put / peek round-trip", () => {
    it("reads back the committed surface synchronously and marks it fresh", () => {
        putWorkspaceSurface(surface("A"), CTX);
        const read = peekWorkspaceSurface(CTX);
        expect(read?.surface.processSnapshot.processes[0]).toMatchObject({ processKey: "A" });
        expect(read?.fresh).toBe(true);
        expect(read?.surface.committedAt).toBe(Date.parse("2026-07-15T00:00:00.000Z"));
    });

    it("cold peek (nothing committed) returns null", () => {
        expect(peekWorkspaceSurface(CTX)).toBeNull();
    });

    it("no org id → not addressable (cold path, never written)", () => {
        putWorkspaceSurface(surface("A"), { ...CTX, orgId: null });
        expect(peekWorkspaceSurface({ ...CTX, orgId: null })).toBeNull();
    });
});

describe("freshness window", () => {
    it("within the window: fresh (skip the background reload)", () => {
        putWorkspaceSurface(surface("A"), CTX);
        vi.advanceTimersByTime(WORKSPACE_SURFACE_FRESH_MS - 1);
        expect(peekWorkspaceSurface(CTX)?.fresh).toBe(true);
    });

    it("past the window but within TTL: retained but stale (render + revalidate)", () => {
        putWorkspaceSurface(surface("A"), CTX);
        vi.advanceTimersByTime(WORKSPACE_SURFACE_FRESH_MS + 1);
        const read = peekWorkspaceSurface(CTX);
        expect(read).not.toBeNull();
        expect(read?.fresh).toBe(false);
    });

    it("past the hard TTL: evicted", () => {
        putWorkspaceSurface(surface("A"), CTX);
        vi.advanceTimersByTime(ADMINV2_UI_SESSION_CACHE_TTL_MS + 1);
        expect(peekWorkspaceSurface(CTX)).toBeNull();
    });
});

describe("tenant / scope / site isolation (no cross-boundary leakage)", () => {
    it.each([
        ["org", { ...CTX, orgId: "org-2" }],
        ["user", { ...CTX, userId: "user-2" }],
        ["scope", { ...CTX, scopeFingerprint: "scope:2" }],
        ["site", { ...CTX, selectedSiteId: "site-2" }],
    ])("a %s change cannot read the prior surface", (_dim, otherCtx) => {
        putWorkspaceSurface(surface("A"), CTX);
        expect(peekWorkspaceSurface(otherCtx as WorkspaceSurfaceCacheContext)).toBeNull();
    });

    it("the key varies on every isolation dimension", () => {
        const base = buildWorkspaceSurfaceCacheKey(CTX);
        expect(buildWorkspaceSurfaceCacheKey({ ...CTX, orgId: "org-2" })).not.toBe(base);
        expect(buildWorkspaceSurfaceCacheKey({ ...CTX, userId: "user-2" })).not.toBe(base);
        expect(buildWorkspaceSurfaceCacheKey({ ...CTX, scopeFingerprint: "scope:2" })).not.toBe(base);
        expect(buildWorkspaceSurfaceCacheKey({ ...CTX, selectedSiteId: "site-2" })).not.toBe(base);
    });
});
