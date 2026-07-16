/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PriorityRuleOrderEditor } from "@/components/adminV2/settings/PriorityRuleOrderEditor";
import { CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1 } from "@/lib/orchestration/placement/placementPriorityRuleOrder";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfile";

const order = [...CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1];
const fallback = CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.fallback_bucket_key;
let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderEditor(
    enabledKeys: Set<string>,
    onOrderChange = vi.fn(),
    onEnabledKeysChange = vi.fn(),
) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root!.render(
            <PriorityRuleOrderEditor
                order={order}
                enabledKeys={enabledKeys}
                fallbackBucketKey={fallback}
                selectableCatalog
                onOrderChange={onOrderChange}
                onEnabledKeysChange={onEnabledKeysChange}
            />,
        );
    });
    return { element: container, onOrderChange, onEnabledKeysChange };
}

function buttonByLabel(element: HTMLElement, label: string): HTMLButtonElement {
    const button = [...element.querySelectorAll<HTMLButtonElement>("button")].find(
        (candidate) => candidate.getAttribute("aria-label") === label,
    );
    if (!button) throw new Error(`Missing button: ${label}`);
    return button;
}

afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
});

describe("PriorityRuleOrderEditor selectable factors", () => {
    it("adds available factors and removes active factors", () => {
        const enabled = new Set(order);
        enabled.delete("tier_sister_center");
        const { element, onEnabledKeysChange } = renderEditor(enabled);

        act(() => buttonByLabel(element, "Add Siblings enrolled at another location to ranking").click());
        expect(onEnabledKeysChange).toHaveBeenLastCalledWith(
            new Set([...enabled, "tier_sister_center", fallback]),
        );

        act(() => {
            const employee = element.querySelector<HTMLElement>('[data-testid="priority-factor-tier_employee_family"]')!;
            [...employee.querySelectorAll<HTMLButtonElement>("button")]
                .find((button) => button.textContent === "Remove")!
                .click();
        });
        expect(onEnabledKeysChange).toHaveBeenLastCalledWith(
            new Set(order.filter((key) => key !== "tier_employee_family" && key !== "tier_sister_center")),
        );
    });

    it("reorders active factors by drag-and-drop", () => {
        const { element, onOrderChange } = renderEditor(new Set(order));
        const source = element.querySelector<HTMLElement>('[data-testid="priority-factor-tier_sister_center"]')!;
        const target = element.querySelector<HTMLElement>('[data-testid="priority-factor-tier_employee_family"]')!;
        const values = new Map<string, string>();
        const dataTransfer = {
            effectAllowed: "none",
            setData: (type: string, value: string) => values.set(type, value),
            getData: (type: string) => values.get(type) ?? "",
        };

        const dragStart = new Event("dragstart", { bubbles: true, cancelable: true });
        Object.defineProperty(dragStart, "dataTransfer", { value: dataTransfer });
        const drop = new Event("drop", { bubbles: true, cancelable: true });
        Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });
        act(() => {
            source.dispatchEvent(dragStart);
            target.dispatchEvent(drop);
        });

        expect(onOrderChange).toHaveBeenCalledWith([
            "tier_sister_center",
            "tier_employee_family",
            "tier_sibling_enrolled",
            fallback,
        ]);
    });

    it("reorders with keyboard-operable move buttons", () => {
        const { element, onOrderChange } = renderEditor(new Set(order));

        act(() => buttonByLabel(element, "Move Employee families down").click());

        expect(onOrderChange).toHaveBeenCalledWith([
            "tier_sibling_enrolled",
            "tier_employee_family",
            "tier_sister_center",
            fallback,
        ]);
    });
});
