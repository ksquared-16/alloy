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
        processKey: "enrollment",
        label: "Enrollment Pipeline",
        description: "Leads through tour",
        entryHref: "/workspace/work-unit/new-leads",
        activeRecordCount: 142,
        needsAttentionCount: 11,
        workViews: [
            view({ id: "new_leads", label: "New Leads", count: 24, attentionCount: 6 }),
            view({ id: "waitlist", label: "Waitlist", count: 9 }),
        ],
        // The one configured Primary Signal — a resolved Operational Calculation.
        primarySignal: {
            key: "enrollment.tour_conversion_rate",
            label: "Conversion",
            answer: "Conversion on track",
            state: "healthy",
            value: "31%",
            supportingContext: "Target 80%",
            trend: null,
            drillHref: "/workspace/work-unit/enrollment-tours",
        },
        supportingSignal: null,
        ...over,
    };
}

describe("ProcessSummaryCard — fixed grammar + Primary Signal", () => {
    const cfg = DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG;

    it("renders Identity, Primary Signal (answer hero + value), Supporting Context, Today's Work, Open Process", () => {
        const el = render(<ProcessSummaryCard process={process({})} config={cfg} />);
        // Identity
        expect(el.textContent).toContain("Enrollment Pipeline");
        // Primary Signal — the answer is the hero (state-framed), value supports it. Domain-neutral.
        const answer = el.querySelector("[data-process-answer]");
        expect(answer?.textContent).toContain("Conversion on track"); // answer hero (not "Pipeline Health")
        expect(answer?.textContent).toContain("31%"); // value supports
        // State word localized from the signal's canonical state.
        expect(el.querySelector("[data-process-status]")?.textContent).toContain("On track");
        // Supporting Context — text only, no fabricated <svg> sparkline.
        expect(el.querySelector("[data-process-context]")?.textContent).toContain("Target 80%");
        expect(el.querySelectorAll("svg")).toHaveLength(0);
        // Today's Work — live work-view rows with counts
        const tw = el.querySelector("[data-process-todays-work]");
        expect(tw?.textContent).toContain("New Leads");
        expect(tw?.textContent).toContain("24");
        // Open Process → drills to the signal's target
        const open = Array.from(el.querySelectorAll("a")).find((a) => a.textContent?.includes("Open process"));
        expect(open?.getAttribute("href")).toBe("/workspace/work-unit/enrollment-tours");
        expect(el.querySelectorAll('[data-alloy-section="WS.PROCESS_SUMMARY_CARD"]')).toHaveLength(1);
    });

    it("is domain-neutral: renders a currency Primary Signal without branching or health assumptions", () => {
        const el = render(
            <ProcessSummaryCard
                process={process({
                    label: "Revenue Performance",
                    primarySignal: {
                        key: "financial.revenue_vs_plan",
                        label: "Revenue vs plan",
                        answer: "Revenue vs plan on track",
                        state: "healthy",
                        value: "$41.2k",
                        supportingContext: null,
                        trend: null,
                        drillHref: null,
                    },
                })}
                config={cfg}
            />,
        );
        const answer = el.querySelector("[data-process-answer]");
        expect(answer?.textContent).toContain("Revenue vs plan on track");
        expect(answer?.textContent).toContain("$41.2k");
        // No hardcoded "Health"/"Pipeline Health" anywhere.
        expect(el.textContent).not.toContain("Pipeline Health");
        expect(el.textContent).not.toContain("Operational Health");
    });

    it("maps the signal's state to the state word (caution → Needs attention, critical → Action required)", () => {
        const warn = render(
            <ProcessSummaryCard process={process({ primarySignal: { ...process({}).primarySignal!, state: "caution" } })} config={cfg} />,
        );
        expect(warn.querySelector("[data-process-status]")?.textContent).toContain("Needs attention");
        warn.remove();
        const crit = render(
            <ProcessSummaryCard process={process({ primarySignal: { ...process({}).primarySignal!, state: "critical" } })} config={cfg} />,
        );
        expect(crit.querySelector("[data-process-status]")?.textContent).toContain("Action required");
    });

    it("Today's Work visible=false hides the section", () => {
        const el = render(
            <ProcessSummaryCard process={process({})} config={{ ...cfg, todaysWork: { ...cfg.todaysWork, visible: false } }} />,
        );
        expect(el.querySelector("[data-process-todays-work]")).toBeNull();
    });

    it("maxRows truncates Today's Work to the configured count", () => {
        const el = render(
            <ProcessSummaryCard process={process({})} config={{ ...cfg, todaysWork: { ...cfg.todaysWork, maxRows: 1 } }} />,
        );
        expect(el.querySelectorAll("[data-process-todays-work] [data-work-view-id]")).toHaveLength(1);
    });

    it("no primary signal → neutral no-signal; never fabricates a value/state from counts", () => {
        const el = render(
            <ProcessSummaryCard process={process({ primarySignal: null, needsAttentionCount: 5 })} config={cfg} />,
        );
        const answer = el.querySelector("[data-process-answer]");
        expect(answer?.textContent).not.toContain("5");
        expect(answer?.textContent).toContain("No signal configured");
        const status = el.querySelector("[data-process-status]")?.textContent ?? "";
        expect(status).toContain("No signal");
        expect(status).not.toContain("Needs attention");
        expect(el.querySelectorAll("svg")).toHaveLength(0);
    });
});

describe("ProcessSummaryCard — operator-owned card identity (Surface Builder)", () => {
    // cardByProcess is keyed by business process; "enrollment" resolves from processKey "enrollment".
    function cfgWithCard(card: Record<string, unknown>) {
        return {
            ...DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG,
            cardByProcess: { enrollment: card },
        } as typeof DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG;
    }

    it("title + subtitle overrides replace the runtime label/description", () => {
        const el = render(
            <ProcessSummaryCard process={process({})} config={cfgWithCard({ title: "Family Enrollment", subtitle: "Inquiry → enrolled" })} />,
        );
        expect(el.querySelector("[data-process-title]")?.textContent).toBe("Family Enrollment");
        expect(el.querySelector("[data-process-subtitle]")?.textContent).toBe("Inquiry → enrolled");
        expect(el.textContent).not.toContain("Enrollment Pipeline");
    });

    it("no override → falls back to the runtime label/description (no identity chip)", () => {
        const el = render(<ProcessSummaryCard process={process({})} config={DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG} />);
        expect(el.querySelector("[data-process-title]")?.textContent).toBe("Enrollment Pipeline");
        expect(el.querySelector("[data-process-identity-chip]")).toBeNull();
    });

    it("accent + icon render an identity chip (Alloy token) WITHOUT touching the semantic state rail", () => {
        const el = render(<ProcessSummaryCard process={process({})} config={cfgWithCard({ accent: "pine", icon: "leads" })} />);
        const chip = el.querySelector("[data-process-identity-chip]");
        expect(chip).not.toBeNull();
        expect(chip?.getAttribute("data-process-accent")).toBe("pine");
        expect(chip?.getAttribute("data-process-icon")).toBe("leads");
        expect(chip?.className).toContain("text-alloy-pine"); // Alloy token, not a new color
        // The state rail stays the operational signal (healthy), not the accent.
        expect(el.querySelector('[data-alloy-section="WS.PROCESS_SUMMARY_CARD"]')?.className).toContain("border-l-alloy-juniper/70");
    });

    it("supporting signal renders a text-only second line (label: value)", () => {
        const el = render(
            <ProcessSummaryCard
                process={process({
                    supportingSignal: {
                        key: "enrollment.tours_scheduled",
                        label: "Tours scheduled",
                        answer: "Tours scheduled",
                        state: "neutral",
                        value: "12",
                        supportingContext: null,
                        trend: null,
                        drillHref: null,
                    },
                })}
                config={DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG}
            />,
        );
        expect(el.querySelector("[data-process-supporting-signal]")?.textContent).toBe("Tours scheduled: 12");
    });

    it("CTA label override changes the label; the target (href) stays canonical", () => {
        const el = render(<ProcessSummaryCard process={process({})} config={cfgWithCard({ ctaLabel: "Work leads" })} />);
        const cta = el.querySelector("[data-process-cta]");
        expect(cta?.textContent).toContain("Work leads");
        expect(cta?.getAttribute("href")).toBe("/workspace/work-unit/enrollment-tours"); // unchanged canonical drill
    });
});
