/**
 * @vitest-environment jsdom
 *
 * C1b — layout runtime overview body Error Boundary render fallback tests.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import OpportunityDrawerLayoutRuntimeBodyErrorBoundary from "@/components/admin/vmDrawer/OpportunityDrawerLayoutRuntimeBodyErrorBoundary";
import { logLayoutRuntimeBodyRenderFailure } from "@/lib/layout/runtime/logLayoutRuntimeBodyRenderFailure";

function assertLayoutRuntimeBodyErrorState(error: Error): { hasError: boolean } {
    const derive = OpportunityDrawerLayoutRuntimeBodyErrorBoundary as unknown as {
        getDerivedStateFromError: (err: Error) => { hasError: boolean };
    };
    return derive.getDerivedStateFromError(error);
}

function ThrowOnRender(): React.ReactElement {
    throw new Error("layout render boom");
}

describe("OpportunityDrawerLayoutRuntimeBodyErrorBoundary", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it("getDerivedStateFromError enters fallback state", () => {
        expect(assertLayoutRuntimeBodyErrorState(new Error("boom"))).toEqual({ hasError: true });
    });

    it("renders VM fallback when a layout body child throws during render", () => {
        const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});

        act(() => {
            root.render(
                <OpportunityDrawerLayoutRuntimeBodyErrorBoundary
                    fallback={<div data-drawer-vm-runtime-overview="true">VM overview fallback</div>}
                    logContext={{ opportunityId: "opp-1", layoutSource: "default" }}
                >
                    <ThrowOnRender />
                </OpportunityDrawerLayoutRuntimeBodyErrorBoundary>,
            );
        });

        expect(container.querySelector('[data-drawer-vm-runtime-overview="true"]')).not.toBeNull();
        expect(container.textContent).toContain("VM overview fallback");
        expect(consoleSpy).toHaveBeenCalledWith(
            "[layout_runtime_body:render_error]",
            expect.objectContaining({
                entityId: "opp-1",
                layoutSource: "default",
                message: "layout render boom",
            }),
        );

        consoleSpy.mockRestore();
    });

    it("renders layout body when no render error occurs", () => {
        act(() => {
            root.render(
                <OpportunityDrawerLayoutRuntimeBodyErrorBoundary
                    fallback={<div data-drawer-vm-runtime-overview="true">VM</div>}
                >
                    <div data-drawer-layout-runtime-overview="true">Layout body</div>
                </OpportunityDrawerLayoutRuntimeBodyErrorBoundary>,
            );
        });

        expect(container.querySelector('[data-drawer-layout-runtime-overview="true"]')).not.toBeNull();
        expect(container.textContent).toContain("Layout body");
    });
});

describe("logLayoutRuntimeBodyRenderFailure", () => {
    it("logs diagnostic info without throwing", () => {
        const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
        logLayoutRuntimeBodyRenderFailure(new Error("test failure"), {
            opportunityId: "opp-2",
            layoutSource: "org",
        });
        expect(consoleSpy).toHaveBeenCalledWith(
            "[layout_runtime_body:render_error]",
            expect.objectContaining({
                entityId: "opp-2",
                layoutSource: "org",
                message: "test failure",
            }),
        );
        consoleSpy.mockRestore();
    });
});
