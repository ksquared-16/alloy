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

import { WorkspaceHeader } from "@/components/presentation/workspace/WorkspaceHeader";
import {
    DEFAULT_WORKSPACE_HEADER_SURFACE_CONFIG,
    buildWorkspaceHeaderPresentation,
    normalizeWorkspaceHeaderSurfaceConfig,
} from "@/lib/presentation/runtime/workspaceHeaderSurfaceConfig";

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

describe("WorkspaceHeader presentation", () => {
    it("renders title, subtitle, and 3 KPI cards from config", () => {
        const model = buildWorkspaceHeaderPresentation(
            normalizeWorkspaceHeaderSurfaceConfig({
                title: "Firefly Early Learning",
                subtitle: "Operational Workspace",
            }),
            { fallbackTitle: "Org" },
        );
        const el = render(<WorkspaceHeader model={model} />);
        expect(el.querySelector("[data-workspace-header-title]")?.textContent).toBe("Firefly Early Learning");
        expect(el.querySelector("[data-workspace-header-subtitle]")?.textContent).toBe("Operational Workspace");
        expect(el.querySelectorAll("[data-workspace-header-kpi]")).toHaveLength(3);
        expect(el.querySelector("[data-alloy-section='WS.HEADER_CALCULATIONS']")).not.toBeNull();
    });

    it("omits optional KPI 4/5 when disabled", () => {
        const model = buildWorkspaceHeaderPresentation(DEFAULT_WORKSPACE_HEADER_SURFACE_CONFIG, {
            fallbackTitle: "Org",
        });
        const el = render(<WorkspaceHeader model={model} />);
        expect(el.querySelectorAll("[data-workspace-header-kpi]")).toHaveLength(3);
        expect(el.querySelector("[data-workspace-header-kpi='4']")).toBeNull();
    });

    it("shows optional KPI 4 when enabled", () => {
        const model = buildWorkspaceHeaderPresentation(
            normalizeWorkspaceHeaderSurfaceConfig({
                title: "Org",
                kpis: [
                    ...DEFAULT_WORKSPACE_HEADER_SURFACE_CONFIG.kpis.slice(0, 3),
                    {
                        slot: 4,
                        enabled: true,
                        label: "Open work",
                        icon: "grid",
                        sourceKey: "ops.readiness_gap_count",
                        accent: null,
                    },
                    DEFAULT_WORKSPACE_HEADER_SURFACE_CONFIG.kpis[4],
                ],
            }),
            { fallbackTitle: "Org" },
        );
        const el = render(<WorkspaceHeader model={model} />);
        expect(el.querySelectorAll("[data-workspace-header-kpi]")).toHaveLength(4);
        expect(el.querySelector("[data-workspace-header-kpi='4']")?.textContent).toContain("Open work");
    });

    it("builder and runtime share the same formatter path (title + empty value)", () => {
        const model = buildWorkspaceHeaderPresentation(
            normalizeWorkspaceHeaderSurfaceConfig({ title: "Published Title" }),
            { fallbackTitle: "Default Org" },
        );
        const el = render(<WorkspaceHeader model={model} />);
        expect(el.querySelector("[data-workspace-header-title]")?.textContent).toBe("Published Title");
        for (const value of el.querySelectorAll("[data-workspace-header-kpi-value]")) {
            expect(value.textContent).toBe("—");
        }
    });

    it("KPI icon inherits configured accent color (not neutral gray)", () => {
        const model = buildWorkspaceHeaderPresentation(DEFAULT_WORKSPACE_HEADER_SURFACE_CONFIG, {
            fallbackTitle: "Org",
        });
        const el = render(<WorkspaceHeader model={model} />);
        const goldKpiIcon = el.querySelector("[data-workspace-header-kpi='2'] [data-workspace-header-kpi-icon]");
        expect(goldKpiIcon?.getAttribute("class")).toContain("text-alloy-gold-dark");
    });

    it("workspace KPI glyph sits in a soft Alloy-token icon well", () => {
        const model = buildWorkspaceHeaderPresentation(DEFAULT_WORKSPACE_HEADER_SURFACE_CONFIG, {
            fallbackTitle: "Org",
        });
        const el = render(<WorkspaceHeader model={model} />);
        const well = el.querySelector("[data-workspace-header-kpi='2'] [data-workspace-header-kpi-icon-well]");
        expect(well).not.toBeNull();
        // Gold accent slot → gold token tint (no arbitrary hex, no non-Alloy color).
        expect(well?.getAttribute("class")).toContain("bg-alloy-gold");
    });

    it("work-unit variant KPIs stay compact (no icon well)", () => {
        const model = buildWorkspaceHeaderPresentation(DEFAULT_WORKSPACE_HEADER_SURFACE_CONFIG, {
            fallbackTitle: "Org",
        });
        const el = render(<WorkspaceHeader model={model} variant="work-unit" />);
        expect(el.querySelector("[data-workspace-header-kpi-icon-well]")).toBeNull();
    });
});
