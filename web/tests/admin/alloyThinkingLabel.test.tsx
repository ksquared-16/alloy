/** @vitest-environment jsdom */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import {
    AlloyThinkingLabel,
    THINKING_ELLIPSIS_CYCLE,
    THINKING_ELLIPSIS_INTERVAL_MS,
    useCyclingEllipsis,
} from "@/components/admin/workspace/AlloyThinkingLabel";
import { AlloyOperationalBootShell } from "@/components/admin/workspace/AlloyOperationalBootShell";

function Probe({ onDots }: { onDots: (dots: string) => void }) {
    const dots = useCyclingEllipsis(THINKING_ELLIPSIS_INTERVAL_MS);
    onDots(dots);
    return null;
}

describe("useCyclingEllipsis", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            configurable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: false,
                media: query,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                addListener: vi.fn(),
                removeListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("cycles . → .. → ... → .", () => {
        const seen: string[] = [];
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        act(() => {
            root.render(<Probe onDots={(d) => seen.push(d)} />);
        });
        expect(seen.at(-1)).toBe(".");
        act(() => {
            vi.advanceTimersByTime(THINKING_ELLIPSIS_INTERVAL_MS);
        });
        expect(seen.at(-1)).toBe("..");
        act(() => {
            vi.advanceTimersByTime(THINKING_ELLIPSIS_INTERVAL_MS);
        });
        expect(seen.at(-1)).toBe("...");
        act(() => {
            vi.advanceTimersByTime(THINKING_ELLIPSIS_INTERVAL_MS);
        });
        expect(seen.at(-1)).toBe(".");
        expect(THINKING_ELLIPSIS_CYCLE).toEqual([".", "..", "..."]);
        act(() => root.unmount());
        container.remove();
    });

    it("clears the interval on unmount", () => {
        const clearSpy = vi.spyOn(window, "clearInterval");
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        act(() => {
            root.render(<Probe onDots={() => undefined} />);
        });
        act(() => root.unmount());
        expect(clearSpy).toHaveBeenCalled();
        container.remove();
    });

    it("stays on ... when prefers-reduced-motion is set", () => {
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            configurable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: query.includes("prefers-reduced-motion"),
                media: query,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                addListener: vi.fn(),
                removeListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
        const seen: string[] = [];
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        act(() => {
            root.render(<Probe onDots={(d) => seen.push(d)} />);
        });
        act(() => {
            vi.advanceTimersByTime(THINKING_ELLIPSIS_INTERVAL_MS * 4);
        });
        expect(seen.every((d) => d === "...")).toBe(true);
        act(() => root.unmount());
        container.remove();
    });
});

describe("AlloyThinkingLabel", () => {
    it("renders quieter Thinking copy with reserved ellipsis width", () => {
        const html = renderToStaticMarkup(<AlloyThinkingLabel size="lg" />);
        expect(html).toContain('data-alloy-thinking-label="true"');
        expect(html).toContain('data-alloy-thinking-ellipsis="true"');
        expect(html).toContain("Thinking");
        expect(html).toContain("font-normal");
        expect(html).toContain("text-alloy-midnight/55");
        expect(html).toContain("w-[1.35em]");
        expect(html).not.toContain("font-semibold");
    });

    it("content boot shell uses AlloyThinkingLabel", () => {
        const html = renderToStaticMarkup(
            <AlloyOperationalBootShell variant="workspace" chrome="content" />,
        );
        expect(html).toContain('data-alloy-thinking-label="true"');
        expect(html).toContain('data-alloy-operational-boot-chrome="content"');
    });
});
