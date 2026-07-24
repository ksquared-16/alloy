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

import { WorkUnitHeader } from "@/components/presentation/workUnit/WorkUnitHeader";
import {
    DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG,
    buildWorkUnitHeaderPresentationForRuntime,
} from "@/lib/presentation/runtime/workUnitHeaderSurfaceConfig";

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

describe("WorkUnitHeader presentation", () => {
    it("renders title, subtitle, and 3 KPI cards with WU runtime labels", () => {
        const model = buildWorkUnitHeaderPresentationForRuntime(
            { ...DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG, title: "Enrollment", subtitle: "Active Pipeline" },
            { fallbackTitle: "Org", fallbackSubtitle: "View", resolved: null },
        );
        const el = render(<WorkUnitHeader model={model} />);
        expect(el.querySelector("[data-work-unit-header-title]")?.textContent).toBe("Enrollment");
        expect(el.querySelector("[data-work-unit-header-subtitle]")?.textContent).toBe("Active Pipeline");
        expect(el.querySelectorAll("[data-work-unit-header-kpi]")).toHaveLength(3);
        expect(el.querySelector("[data-alloy-section='WU.HEADER_CALCULATIONS']")).not.toBeNull();
        expect(el.querySelector("[data-work-unit-header-mode='browse']")).not.toBeNull();
        expect(el.querySelector("[data-adaptive-metric-row]")).not.toBeNull();
    });

    it("KPI icon inherits configured accent color", () => {
        const model = buildWorkUnitHeaderPresentationForRuntime(DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG, {
            fallbackTitle: "Org",
            fallbackSubtitle: null,
            resolved: null,
        });
        const el = render(<WorkUnitHeader model={model} />);
        const goldKpiIcon = el.querySelector("[data-work-unit-header-kpi='2'] [data-work-unit-header-kpi-icon]");
        expect(goldKpiIcon?.getAttribute("class")).toContain("text-alloy-gold-dark");
    });

    it("focus density collapses KPI cards into an inline context strip", () => {
        const model = buildWorkUnitHeaderPresentationForRuntime(
            { ...DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG, title: "Enrollment", subtitle: "Active Pipeline" },
            { fallbackTitle: "Org", fallbackSubtitle: "View", resolved: null },
        );
        const el = render(<WorkUnitHeader model={model} density="focus" />);
        expect(el.querySelector("[data-work-unit-header-mode='focus']")).not.toBeNull();
        expect(el.querySelector("[data-adaptive-metric-row]")).toBeNull();
        expect(el.querySelector("[data-work-unit-header-kpi-inline='true']")).not.toBeNull();
        expect(el.querySelectorAll("[data-work-unit-header-kpi]")).toHaveLength(3);
        expect(el.querySelector("[data-work-unit-header-title]")?.className).toContain("text-[18px]");
    });
});
