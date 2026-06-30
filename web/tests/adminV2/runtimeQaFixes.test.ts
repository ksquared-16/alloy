import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { resolveOperationalModeEntrySnapshot } from "@/lib/adminV2/runtime/operationalSubject/useOperationalModeEntryController";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

// ── P2: "Preparing operational surface…" must not appear in a normal (loaded) work-unit reveal ──
describe("Runtime QA — no 'Preparing operational surface…' on a loaded queue", () => {
    const items = (n: number): QueuePreviewItemVm[] =>
        Array.from({ length: n }, (_, i) => ({ id: `o-${i}` }) as unknown as QueuePreviewItemVm);

    it("rows painted + no drawer = ready, empty message (browsing a loaded queue is ready)", () => {
        const snap = resolveOperationalModeEntrySnapshot({
            enabled: true,
            workUnitId: "wu-1",
            activeQueueKey: "lane-1",
            laneMayPaint: true,
            queueItemsLoading: false,
            displayItemsRef: { current: items(5) },
            routeRecordId: null,
            drawerType: null,
            drawerId: null,
            queueRevision: 0,
        });
        expect(snap.phase).toBe("ready");
        expect(snap.message).toBe("");
    });

    it("the prep message constant is only reachable while loading / deep-link catch-up", () => {
        // genuinely loading → preparing
        expect(
            resolveOperationalModeEntrySnapshot({
                enabled: true,
                workUnitId: "wu-1",
                activeQueueKey: "lane-1",
                laneMayPaint: false,
                queueItemsLoading: true,
                displayItemsRef: { current: [] },
                routeRecordId: null,
                drawerType: null,
                drawerId: null,
                queueRevision: 0,
            }).phase,
        ).toBe("preparing");
    });
});

// ── P1: header KPI region reveals as a complete unit — no placeholder value that morphs ──
describe("Runtime QA — workspace KPI strip does not render a placeholder value then morph", () => {
    const src = read("components/admin/workspace/layout/WorkspaceOperationalPulseStrip.tsx");
    it("loading renders a layout-reserving skeleton, not an em-dash placeholder value", () => {
        expect(src).toContain('data-workspace-pulse-skeleton="true"');
        // the old '—' placeholder value (which visibly morphed into the real number) is gone
        expect(src).not.toContain('loading ? "—" : value');
    });
});

// ── P3: workspace tile click navigates immediately (commit-first) + prewarms on intent ──
describe("Runtime QA — workspace tile click is instant (commit-first) with hover prewarm", () => {
    const src = read("components/admin/workspace/WorkspaceRootDepartmentGrid.tsx");
    it("department tile click commits the route first (does not wait on prefetch)", () => {
        expect(src).toContain("commitFirst: true");
        expect(src).toMatch(/commit:\s*\(\)\s*=>\s*\{\s*router\.push\(href\)/);
    });
    it("tile prewarms the dept bootstrap on hover/intent", () => {
        expect(src).toContain("prefetchDeptAboveFoldOnIntent");
    });
});

// ── P5: lifecycle landing client dedups its admin fetches (no raw fetch duplication) ──
describe("Runtime QA — lifecycle landing client dedups admin requests", () => {
    const src = read("lib/admin/loadOperatorLifecycleLandingClient.ts");
    it("uses dedupeAdminFetch for departments / work-units / catalog / queue-summaries", () => {
        expect(src).toContain('import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe"');
        expect(src).toContain('dedupeAdminFetch("/api/admin/departments"');
        expect(src).toContain('dedupeAdminFetch("/api/admin/work-units"');
        expect(src).toContain('dedupeAdminFetch("/api/admin/lifecycle-catalog"');
        expect(src).toContain("dedupeAdminFetch(\n");
        // no remaining raw fetch( for these admin endpoints
        expect(src).not.toMatch(/await fetch\(\s*\n?\s*`\/api\/admin\/departments\/\$\{/);
        expect(src).not.toContain('fetch("/api/admin/departments"');
    });
});
