/** @vitest-environment jsdom */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// next/link → plain anchor (jsdom has no router).
vi.mock("next/link", () => ({
    default: ({ href, children, ...rest }: { href: unknown; children: ReactNode }) => (
        <a href={typeof href === "string" ? href : "#"} {...rest}>
            {children}
        </a>
    ),
}));
// The tile warms the slug route on pointer intent — inert in a render test.
vi.mock("@/lib/admin/operatorWorkUnitEntryWarm", () => ({
    parseOperatorWorkUnitEntryHref: () => ({ workUnitSlug: "new-leads" }),
    warmWorkUnitSlugRoute: vi.fn(),
}));

import { WorkViewList } from "@/components/presentation/workspace/WorkViewList";
import { ProcessTile } from "@/components/presentation/workspace/ProcessTile";
import type { ProcessTileModel, WorkViewLinkModel } from "@/lib/presentation/runtime";

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

const EMBER = ".text-alloy-ember";

describe("WorkViewList — per-view operational context (config-driven)", () => {
    it("renders label + secondary count, and an ember attention indicator only when attentionCount > 0", () => {
        const el = render(
            <WorkViewList
                workViews={[
                    view({ id: "new_leads", label: "New Leads", count: 3, attentionCount: 2 }),
                    view({ id: "waitlist", label: "Waitlist", count: 0, attentionCount: 0 }),
                    view({ id: "all_leads", label: "All Leads", count: 5, attentionCount: null }),
                ]}
            />,
        );

        // Configured labels present; the raw counts still render (secondary).
        expect(el.textContent).toContain("New Leads");
        expect(el.textContent).toContain("Waitlist");
        expect(el.textContent).toContain("All Leads");

        // Exactly one attention indicator — the view with attentionCount > 0 (2). A view with
        // attentionCount 0 or null shows none (no fabricated / noisy "0 need attention").
        const embers = el.querySelectorAll(EMBER);
        expect(embers).toHaveLength(1);
        expect(embers[0]!.textContent).toContain("2");

        // The attention row carries an accessible "need attention" name.
        const newLeadsRow = el.querySelector('[data-work-view-id="new_leads"] a');
        expect(newLeadsRow?.getAttribute("aria-label")).toContain("2 need attention");

        // Section marker + single ownership.
        expect(el.querySelectorAll('[data-alloy-section="WS.PROCESS_TILE_WORK_VIEWS"]')).toHaveLength(1);
    });

    it("shows ONE secondary signal per row: attention takes priority over overdue", () => {
        const el = render(
            <WorkViewList
                workViews={[
                    // Attention wins even when the view is also overdue.
                    view({ id: "a", label: "A", count: 4, attentionCount: 2, overdueCount: 3 }),
                    // No attention → overdue is the signal.
                    view({ id: "b", label: "B", count: 4, attentionCount: 0, overdueCount: 1 }),
                    // Clear → no signal chip.
                    view({ id: "c", label: "C", count: 4, attentionCount: 0, overdueCount: 0 }),
                ]}
            />,
        );
        expect(el.querySelector('[data-work-view-id="a"] a')?.getAttribute("aria-label")).toContain(
            "2 need attention",
        );
        expect(el.querySelector('[data-work-view-id="b"] a')?.getAttribute("aria-label")).toContain(
            "1 overdue",
        );
        const clear = el.querySelector('[data-work-view-id="c"] a')?.getAttribute("aria-label") ?? "";
        expect(clear).not.toContain("attention");
        expect(clear).not.toContain("overdue");
    });

    it("keeps a stable count slot: a placeholder when the count is pending, the number when resolved", () => {
        const pending = render(<WorkViewList workViews={[view({ id: "p", label: "P", count: null })]} />);
        // Pending count renders a placeholder (never blank / collapsed) so the slot width holds.
        expect(pending.querySelector('[data-work-view-id="p"] .animate-pulse')).not.toBeNull();
        pending.remove();

        const resolved = render(<WorkViewList workViews={[view({ id: "p", label: "P", count: 7 })]} />);
        expect(resolved.querySelector('[data-work-view-id="p"] .animate-pulse')).toBeNull();
        expect(resolved.textContent).toContain("7");
    });
});

function tile(over: Partial<ProcessTileModel>): ProcessTileModel {
    return {
        id: "p",
        label: "Enrollment",
        description: "Enrollment",
        entryHref: "/workspace/work-unit/new-leads",
        activeRecordCount: 12,
        needsAttentionCount: null,
        workViews: [view({ id: "new_leads", label: "New Leads", count: 3, attentionCount: 2 })],
        performanceMetrics: [],
        ...over,
    };
}

describe("ProcessTile — launchpad, not dashboard", () => {
    it("is an inert <article> (no link/button role) with an Open control and a work-views section", () => {
        const el = render(<ProcessTile process={tile({})} />);
        const root = el.querySelector('[data-runtime-label="WS.PROCESS_TILE"]')!;
        expect(root.tagName).toBe("ARTICLE");
        expect(root.getAttribute("role")).toBeNull();
        expect(root.hasAttribute("onclick")).toBe(false);
        // Exactly one Open control, and it links to the process entry.
        const open = [...el.querySelectorAll("a")].find((a) => (a.textContent ?? "").includes("Open"));
        expect(open?.getAttribute("href")).toBe("/workspace/work-unit/new-leads");
        expect(el.querySelector('[data-alloy-section="WS.PROCESS_TILE_WORK_VIEWS"]')).not.toBeNull();
    });

    it("leads with the operational STATE: ember 'need attention' when work is waiting", () => {
        const el = render(<ProcessTile process={tile({ needsAttentionCount: 3 })} />);
        const ember = el.querySelector(EMBER);
        expect(ember?.textContent).toContain("3 need attention");
    });

    it("ALWAYS shows an operational summary — calm 'no urgent work' when clear OR unresolved", () => {
        // Requirement: the summary area never collapses; a calm default beats a fabricated
        // number when the attention rollup is zero or unavailable.
        const clear = render(<ProcessTile process={tile({ needsAttentionCount: 0 })} />);
        expect(clear.textContent).toContain("No urgent work in this process");
        expect(clear.textContent).not.toContain("need attention");
        clear.remove();

        const unresolved = render(<ProcessTile process={tile({ needsAttentionCount: null })} />);
        expect(unresolved.textContent).toContain("No urgent work in this process");
        expect(unresolved.textContent).not.toContain("need attention");
    });

    it("does not render a dashboard-style performance-metric list", () => {
        const el = render(
            <ProcessTile
                process={tile({
                    performanceMetrics: [{ label: "Tour conversion rate", value: "42%" }],
                })}
            />,
        );
        // Performance rates belong to the header/analytics surfaces, not the launchpad tile.
        expect(el.textContent).not.toContain("Tour conversion rate");
        expect(el.textContent).not.toContain("42%");
    });
});
