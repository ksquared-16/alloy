/** @vitest-environment jsdom */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

import { WorkViewList } from "@/components/presentation/workspace/WorkViewList";
import { ProcessSummaryCard } from "@/components/presentation/workspace/ProcessSummaryCard";
import type { ProcessTileModel, WorkViewLinkModel } from "@/lib/presentation/runtime";
import { DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";

let container: HTMLElement | null = null;
function render(node: ReactNode): HTMLElement {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(node));
    return container;
}
afterEach(() => {
    if (container) {
        container.remove();
        container = null;
    }
});

function view(over: Partial<WorkViewLinkModel>): WorkViewLinkModel {
    return {
        id: "v",
        label: "View",
        isActive: false,
        count: null,
        href: "/workspace/work-unit/view",
        attentionCount: null,
        overdueCount: null,
        ...over,
    };
}

describe("WorkViewList — per-view context + showCounts", () => {
    it("renders label + count, ember attention only when attentionCount > 0", () => {
        const el = render(
            <WorkViewList
                workViews={[
                    view({ id: "new_leads", label: "New Leads", count: 3, attentionCount: 2 }),
                    view({ id: "all_leads", label: "All Leads", count: 5, attentionCount: null }),
                ]}
            />,
        );
        expect(el.textContent).toContain("New Leads");
        expect(el.textContent).toContain("3"); // live count
        const embers = el.querySelectorAll(".text-alloy-ember");
        expect(embers).toHaveLength(1);
    });

    it("showCounts=false hides the count slot (config)", () => {
        const withCounts = render(<WorkViewList workViews={[view({ id: "p", label: "P", count: 7 })]} />);
        expect(withCounts.textContent).toContain("7");
        withCounts.remove();
        const noCounts = render(
            <WorkViewList workViews={[view({ id: "p", label: "P", count: 7 })]} showCounts={false} />,
        );
        expect(noCounts.textContent).not.toContain("7");
    });
});

function process(over: Partial<ProcessTileModel>): ProcessTileModel {
    return {
        id: "enrollment",
        label: "Enrollment Pipeline",
        description: "Leads through tour",
        entryHref: "/workspace/work-unit/new-leads",
        activeRecordCount: 142,
        needsAttentionCount: 11,
        workViews: [
            view({ id: "new_leads", label: "New Leads", count: 24, attentionCount: 6 }),
            view({ id: "waitlist", label: "Waitlist", count: 9 }),
        ],
        performanceMetrics: [{ label: "Pipeline health", value: "82%", status: "On track", target: "80%" }],
        ...over,
    };
}

describe("ProcessSummaryCard — fixed grammar + live data", () => {
    const cfg = DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG;

    it("renders Identity, Operational Answer, Evidence, Today's Work (live counts), CTA", () => {
        const el = render(<ProcessSummaryCard process={process({})} config={cfg} />);
        // Identity
        expect(el.textContent).toContain("Enrollment Pipeline");
        // Operational Answer (figure + label from the primary metric)
        const answer = el.querySelector("[data-process-answer]");
        expect(answer?.textContent).toContain("82%");
        expect(answer?.textContent).toContain("Pipeline health");
        // Evidence — text only, no <svg> sparkline fabricated
        expect(el.querySelector("[data-process-evidence]")?.textContent).toContain("On track");
        expect(el.querySelectorAll("svg")).toHaveLength(0);
        // Today's Work — the live work-view rows with counts
        const tw = el.querySelector("[data-process-todays-work]");
        expect(tw?.textContent).toContain("New Leads");
        expect(tw?.textContent).toContain("24"); // live count
        // CTA
        expect(el.textContent).toContain("Open process");
        // Card section marker
        expect(el.querySelectorAll('[data-alloy-section="WS.PROCESS_SUMMARY_CARD"]')).toHaveLength(1);
    });

    it("Today's Work visible=false hides the section", () => {
        const el = render(
            <ProcessSummaryCard
                process={process({})}
                config={{ ...cfg, todaysWork: { ...cfg.todaysWork, visible: false } }}
            />,
        );
        expect(el.querySelector("[data-process-todays-work]")).toBeNull();
    });

    it("maxRows truncates Today's Work to the configured count", () => {
        const el = render(
            <ProcessSummaryCard
                process={process({})}
                config={{ ...cfg, todaysWork: { ...cfg.todaysWork, maxRows: 1 } }}
            />,
        );
        expect(el.querySelectorAll("[data-process-todays-work] [data-work-view-id]")).toHaveLength(1);
    });

    it("falls back to an attention answer when there is no primary metric", () => {
        const el = render(
            <ProcessSummaryCard process={process({ performanceMetrics: [], needsAttentionCount: 5 })} config={cfg} />,
        );
        expect(el.querySelector("[data-process-answer]")?.textContent).toContain("5");
        expect(el.querySelectorAll("svg")).toHaveLength(0); // still no fabricated trend
    });
});
