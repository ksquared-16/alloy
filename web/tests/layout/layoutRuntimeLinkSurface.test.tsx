// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

import LayoutRuntimeLinkSurface from "@/components/layout/LayoutRuntimeLinkSurface";
import type { LayoutItem } from "@/lib/layout/layoutV2";
import { isQueueRowInteractiveControlTarget } from "@/lib/layout/runtime/layoutRuntimeAdornmentClick";

function mount(container: HTMLElement, ui: ReturnType<typeof createElement>) {
    const root = createRoot(container);
    act(() => {
        root.render(ui);
    });
    return () => {
        act(() => root.unmount());
    };
}

const childItem: LayoutItem = {
    id: "child-name",
    refKey: "child.name",
    label: "Child",
    kind: "field",
};

describe("LayoutRuntimeLinkSurface click isolation", () => {
    it("child link in drawer calls handler and isolates click", () => {
        const onAction = vi.fn();
        const onRowOpen = vi.fn();

        const host = document.createElement("div");
        document.body.appendChild(host);

        const childRow = {
            id: "person-child-1",
            person_id: "person-child-1",
            "child.id": "person-child-1",
            "child.name": "Alex",
        };

        const unmount = mount(
            host,
            createElement(
                "div",
                {
                    className: "operational-queue-row",
                    onClick: (e: MouseEvent) => {
                        if (isQueueRowInteractiveControlTarget(e.target)) return;
                        onRowOpen();
                    },
                },
                createElement(LayoutRuntimeLinkSurface, {
                    componentName: "test",
                    surface: "drawer",
                    entityType: "child",
                    item: childItem,
                    display: "Alex",
                    onAction,
                    rowRecord: childRow,
                    anchorRecord: { id: "opp-1", "opportunity.id": "opp-1" },
                }),
            ),
        );

        const link = host.querySelector("[data-layout-runtime-child-link]") as HTMLButtonElement;
        expect(link).toBeTruthy();
        act(() => {
            link.click();
        });
        expect(onAction).toHaveBeenCalledTimes(1);
        expect(onRowOpen).not.toHaveBeenCalled();
        unmount();
        host.remove();
    });
});
