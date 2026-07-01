/**
 * Layout runtime queue row error boundary.
 */

import { describe, expect, it } from "vitest";
import LayoutRuntimeQueueRowErrorBoundary from "@/components/layout/LayoutRuntimeQueueRowErrorBoundary";

describe("LayoutRuntimeQueueRowErrorBoundary", () => {
    it("enters fallback state on render error", () => {
        const derive = LayoutRuntimeQueueRowErrorBoundary as unknown as {
            getDerivedStateFromError: (err: Error) => { hasError: boolean };
        };
        expect(derive.getDerivedStateFromError(new Error("boom"))).toEqual({ hasError: true });
    });
});
