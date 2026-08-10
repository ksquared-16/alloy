import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import {
    invalidateOperatorLifecycleLandingCache,
    loadOperatorLifecycleLandingCards,
    peekOperatorLifecycleLandingCards,
} from "@/lib/admin/loadOperatorLifecycleLandingClient";
import { resetWorkspaceAdminFetchDedupeForTests } from "@/lib/workspace/workspaceAdminFetchDedupe";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function visibleCatalogEntry() {
    return {
        id: "dept-1:proc-1",
        config_source: "departments.metadata.lifecycle_builder_v1" as const,
        department_id: "dept-1",
        department_key: "enrollment",
        department_name: "Enrollment",
        process_id: "proc-1",
        process_key: "enrollment",
        lifecycle_name: "Enrollment",
        source: "builder_owned" as const,
        stage_count: 3,
        track_count: 1,
        work_unit_count: 1,
        activation_owned: true,
        can_delete: false,
        can_repair: false,
        workspace: {
            backing_department_exists: true,
            department_is_active: true,
            visible_in_workspace_api: true,
            user_has_access: true,
            name_matches_tile: true,
            runtime_status: "visible" as const,
            tile_name: "Enrollment",
        },
    };
}

describe("loadOperatorLifecycleLandingCards — Workspace Site Filter scope", () => {
    beforeEach(() => {
        invalidateOperatorLifecycleLandingCache();
        resetWorkspaceAdminFetchDedupeForTests();
        vi.unstubAllGlobals();
    });

    afterEach(() => {
        invalidateOperatorLifecycleLandingCache();
        resetWorkspaceAdminFetchDedupeForTests();
        vi.unstubAllGlobals();
    });

    it("wires selectedSiteId through landing client, workspace runtime, and sidebar", () => {
        const client = read("lib/admin/loadOperatorLifecycleLandingClient.ts");
        const runtime = read("lib/presentation/runtime/useWorkspaceSurfaceRuntime.ts");
        const sidebar = read("app/adminV2/components/Sidebar.tsx");

        expect(client).toContain("appendWorkspaceSiteToUrl");
        expect(client).toContain("selectedSiteId?: string | null");
        expect(client).toContain('workspaceViewCacheFingerprint("lifecycle-landing"');
        expect(runtime).toContain("loadOperatorLifecycleLandingCards({ selectedSiteId })");
        expect(runtime).toContain("peekOperatorLifecycleLandingCards(selectedSiteId)");
        expect(runtime).toContain("[refreshNonce, selectedSiteId]");
        expect(sidebar).toContain("loadOperatorLifecycleLandingCards({ selectedSiteId })");
        expect(sidebar).toContain("peekOperatorLifecycleLandingCards(selectedSiteId)");
    });

    it("appends workspace_site_id to queue + summary URLs when a site is selected", async () => {
        const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("/api/admin/lifecycle-catalog")) {
                return jsonResponse({ items: [visibleCatalogEntry()] });
            }
            if (url.includes("/api/admin/work-units")) {
                return jsonResponse({
                    items: [
                        {
                            id: "wu-pipeline",
                            department_id: "dept-1",
                            key: "enrollment_pipeline",
                            name: "Enrollment Pipeline",
                            queue_definition: ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.normalized.raw,
                        },
                    ],
                });
            }
            if (url.includes("/api/admin/departments")) {
                return jsonResponse({ items: [{ id: "dept-1", metadata: {} }] });
            }
            if (url.includes("/work-unit-queue-summaries")) {
                return jsonResponse({ work_units: [] });
            }
            if (url.includes("/api/admin/queues/")) {
                return jsonResponse({ items: [] });
            }
            if (url.includes("/api/admin/status-options")) {
                return jsonResponse({ options: [] });
            }
            return jsonResponse({});
        });
        vi.stubGlobal("fetch", fetchMock);

        await loadOperatorLifecycleLandingCards({ selectedSiteId: "site-north" });

        const urls = fetchMock.mock.calls.map((c) => String(c[0]));
        const scopedQueue = urls.filter(
            (u) => u.includes("/api/admin/queues/") && u.includes("workspace_site_id=site-north"),
        );
        const scopedSummaries = urls.filter(
            (u) => u.includes("/work-unit-queue-summaries") && u.includes("workspace_site_id=site-north"),
        );
        expect(scopedQueue.length).toBeGreaterThan(0);
        expect(scopedSummaries.length).toBeGreaterThan(0);
        expect(urls.filter((u) => u.includes("/api/admin/queues/") && !u.includes("workspace_site_id="))).toHaveLength(
            0,
        );
    });

    it("does not append workspace_site_id for org-wide (all locations) loads", async () => {
        const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ items: [] }));
        vi.stubGlobal("fetch", fetchMock);

        await loadOperatorLifecycleLandingCards({ includeRollups: false, selectedSiteId: null });

        const urls = fetchMock.mock.calls.map((c) => String(c[0]));
        expect(urls.every((u) => !u.includes("workspace_site_id="))).toBe(true);
    });

    it("keys the session cache by site so org-wide and site-scoped peeks do not collide", async () => {
        const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ items: [] }));
        vi.stubGlobal("fetch", fetchMock);

        await loadOperatorLifecycleLandingCards({ includeRollups: false, selectedSiteId: null });
        expect(peekOperatorLifecycleLandingCards(null)).not.toBeNull();
        expect(peekOperatorLifecycleLandingCards("site-empty")).toBeNull();

        resetWorkspaceAdminFetchDedupeForTests();
        await loadOperatorLifecycleLandingCards({ includeRollups: false, selectedSiteId: "site-empty" });
        expect(peekOperatorLifecycleLandingCards("site-empty")).not.toBeNull();
        expect(peekOperatorLifecycleLandingCards(null)).not.toBeNull();
        expect(fetchMock.mock.calls.length).toBe(6);
    });
});
