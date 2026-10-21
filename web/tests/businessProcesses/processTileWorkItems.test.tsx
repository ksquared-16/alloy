/** @vitest-environment jsdom */

/**
 * BP V2 Slice 7 — the /workspace process tile's Work Items line: server scope decision, card states,
 * request shape, and the rendered tile (existing ProcessSummaryCard, unchanged otherwise).
 */
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { applyLandingWorkItems, fetchLandingWorkItems, landingWorkItemsText } from "@/lib/admin/landingWorkItems";
import { resolveTaskSummaryScope } from "@/lib/admin/operationalTasksService";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("resolveTaskSummaryScope — the server decides, never the request", () => {
    it("a restricted actor's requested departments outside access are dropped (not answered)", () => {
        const r = resolveTaskSummaryScope({ departmentScope: "restricted", allowedDepartmentIds: ["d-1"], siteScope: "all" }, ["d-1", "d-2", " ", "d-1"], null);
        expect(r).toEqual({ departmentIds: ["d-1"], siteIds: null });
    });
    it("sites: org scope = null; selection narrows; restricted ∩ selection; outside → none", () => {
        expect(resolveTaskSummaryScope({ siteScope: "all" }, ["d"], null).siteIds).toBeNull();
        expect(resolveTaskSummaryScope({ siteScope: "all" }, ["d"], "s-1").siteIds).toEqual(["s-1"]);
        expect(resolveTaskSummaryScope({ siteScope: "restricted", allowedSiteLocationIds: ["s-1", "s-2"] }, ["d"], null).siteIds).toEqual(["s-1", "s-2"]);
        expect(resolveTaskSummaryScope({ siteScope: "restricted", allowedSiteLocationIds: ["s-1"] }, ["d"], "s-1").siteIds).toEqual(["s-1"]);
        expect(resolveTaskSummaryScope({ siteScope: "restricted", allowedSiteLocationIds: ["s-1"] }, ["d"], "s-9").siteIds).toEqual([]);
    });
});

describe("applyLandingWorkItems — truthful states, never a false zero", () => {
    const cards = [
        { id: "enrollment", departmentId: "d-enr" },
        { id: "assignments", departmentId: "d-asg" },
        { id: "billing", departmentId: "d-bil" },
        { id: "shared-a", departmentId: "d-shared" },
        { id: "shared-b", departmentId: "d-shared" },
        { id: "hidden", departmentId: "d-hidden" },
    ];
    const response = { ok: true, by_department: { "d-enr": { open: 7, overdue: 2 }, "d-asg": { open: 0, overdue: 0 }, "d-bil": { open: 3, overdue: 9 }, "d-shared": { open: 4, overdue: 1 } } };

    it("counted, zero, shared department, impossible counts, and departments the server did not answer", () => {
        const by = Object.fromEntries(applyLandingWorkItems(cards, response).map((c) => [c.id, c.workItems]));
        expect(by.enrollment).toEqual({ state: "ok", open: 7, overdue: 2 });
        expect(by.assignments).toEqual({ state: "ok", open: 0, overdue: 0 }); // a real zero
        expect(by.billing).toEqual({ state: "unavailable" }); // overdue > open cannot be a subset → not shown as numbers
        expect(by["shared-a"]).toEqual({ state: "shared_department" });
        expect(by["shared-b"]).toEqual({ state: "shared_department" });
        expect(by.hidden).toBeNull(); // outside access → no line at all
    });

    it("a failed or timed-out read is unavailable on every attributable card", () => {
        const by = Object.fromEntries(applyLandingWorkItems(cards, null).map((c) => [c.id, c.workItems]));
        expect(by.enrollment).toEqual({ state: "unavailable" });
        expect(by.hidden).toEqual({ state: "unavailable" });
    });

    it("one request for every tile's department, with the workspace selection", async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 }));
        await fetchLandingWorkItems(cards, {}, "site-r", fetchImpl as never);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const url = new URL(String((fetchImpl.mock.calls[0] as unknown[])[0]), "http://x");
        expect(url.pathname).toBe("/api/admin/operational-tasks");
        expect(url.searchParams.get("summary")).toBe("by_department");
        expect(url.searchParams.get("department_ids")!.split(",").sort()).toEqual(["d-asg", "d-bil", "d-enr", "d-hidden", "d-shared"]);
        expect(url.searchParams.get("workspace_site_id")).toBe("site-r");
        const failed = await fetchLandingWorkItems(cards, {}, null, (async () => new Response("x", { status: 500 })) as never);
        expect(failed[0]!.workItems).toEqual({ state: "unavailable" });
    });

    it("the sentence", () => {
        expect(landingWorkItemsText({ state: "ok", open: 7, overdue: 2 })).toBe("7 open work items · 2 overdue");
        expect(landingWorkItemsText({ state: "ok", open: 1, overdue: 0 })).toBe("1 open work item");
        expect(landingWorkItemsText({ state: "ok", open: 0, overdue: 0 })).toBe("No open work items");
        expect(landingWorkItemsText({ state: "unavailable" })).toBe("Work items unavailable");
        expect(landingWorkItemsText({ state: "shared_department" })).toBe("Work items shared with another process");
    });
});

/* ── The existing tile, rendered (same harness and model as the tile's own suite) ─────────────── */
vi.mock("next/link", () => ({
    default: ({ href, children, ...rest }: { href: unknown; children: ReactNode }) => (
        <a href={typeof href === "string" ? href : "#"} {...rest}>
            {children}
        </a>
    ),
}));
vi.mock("@/lib/admin/operatorWorkUnitEntryWarm", () => ({
    parseOperatorWorkUnitEntryHref: () => ({ workUnitSlug: "new-leads" }),
    warmWorkUnitSlugRoute: vi.fn(),
}));
import { ProcessSummaryCard } from "@/components/presentation/workspace/ProcessSummaryCard";
import { DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import type { ProcessTileModel } from "@/lib/presentation/runtime";

let container: HTMLElement | null = null;
function render(node: ReactNode): HTMLElement {
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => createRoot(container!).render(node));
    return container;
}
afterEach(() => {
    container?.remove();
    container = null;
});
const tile = (workItems: unknown): ProcessTileModel =>
    ({
        id: "enrollment",
        processKey: "enrollment",
        label: "Enrollment Pipeline",
        description: "Leads through tour",
        entryHref: "/workspace/work-unit/new-leads",
        activeRecordCount: 142,
        needsAttentionCount: 11,
        workViews: [{ id: "new_leads", label: "New Leads", href: "/workspace/work-unit/new-leads?work_view_id=new_leads", count: 24, attentionCount: 6 }],
        primarySignal: { key: "enrollment.tour_conversion_rate", label: "Conversion", answer: "Conversion on track", state: "healthy", value: "31%", supportingContext: "Target 80%", trend: null, drillHref: "/workspace/work-unit/enrollment-tours" },
        supportingSignal: null,
        workItems,
    }) as unknown as ProcessTileModel;

describe("ProcessSummaryCard renders the line in its supporting-text area — and nothing else changes", () => {
    it("ok with overdue: one line, overdue emphasised, attributes carry the counts", () => {
        const el = render(<ProcessSummaryCard process={tile({ state: "ok", open: 7, overdue: 2 })} config={DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG} />);
        const line = el.querySelector("[data-process-work-items]")!;
        expect(line.getAttribute("data-process-work-items")).toBe("ok");
        expect(line.getAttribute("data-process-work-items-open")).toBe("7");
        expect(line.getAttribute("data-process-work-items-overdue")).toBe("2");
        expect(line.textContent).toBe("7 open work items · 2 overdue");
        expect(line.querySelector("a")).toBeNull(); // informational: no filtered Work Items destination exists
    });

    it("zero, unavailable and shared are said in words; no line when not counted", () => {
        expect(render(<ProcessSummaryCard process={tile({ state: "ok", open: 0, overdue: 0 })} config={DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG} />).querySelector("[data-process-work-items]")!.textContent).toBe("No open work items");
        expect(render(<ProcessSummaryCard process={tile({ state: "unavailable" })} config={DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG} />).querySelector("[data-process-work-items]")!.textContent).toBe("Work items unavailable");
        expect(render(<ProcessSummaryCard process={tile(null)} config={DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG} />).querySelector("[data-process-work-items]")).toBeNull();
    });

    it("the rest of the card is byte-identical with and without the line", () => {
        const without = render(<ProcessSummaryCard process={tile(null)} config={DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG} />).innerHTML;
        const withLine = render(<ProcessSummaryCard process={tile({ state: "ok", open: 3, overdue: 1 })} config={DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG} />);
        withLine.querySelector("[data-process-work-items]")!.remove();
        expect(withLine.innerHTML).toBe(without);
    });
});
