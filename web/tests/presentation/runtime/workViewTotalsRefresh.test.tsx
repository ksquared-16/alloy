/** @vitest-environment jsdom */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.fn();
vi.mock("@/lib/workspace/workspaceAdminFetchDedupe", () => ({
    dedupeAdminFetch: (...args: unknown[]) => fetchMock(...args),
}));
vi.mock("@/lib/workspace/workspaceDataFetch", () => ({
    workspaceDataFetchInit: () => ({}),
}));

import { useWorkViewTotalsState } from "@/lib/presentation/runtime/useWorkViewTotals";

function jsonResponse(total: number): Response {
    return new Response(JSON.stringify({ total, items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
    });
}

let latestTotals: Map<string, number | null> = new Map();

function Probe({ refreshToken }: { refreshToken: number }) {
    const { totals } = useWorkViewTotalsState({
        targets: [{ viewId: "v1", workUnitId: "wu1", baseQueueKey: "all-records" }],
        selectedSiteId: null,
        enabled: true,
        refreshToken,
    });
    latestTotals = totals;
    return null;
}

let container: HTMLElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
async function render(node: ReactNode): Promise<void> {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(node);
    });
}
async function rerender(node: ReactNode): Promise<void> {
    await act(async () => {
        root!.render(node);
    });
}
afterEach(() => {
    fetchMock.mockReset();
    if (root) act(() => root!.unmount());
    root = null;
    if (container) container.remove();
    container = null;
    latestTotals = new Map();
});

describe("useWorkViewTotals — refreshToken", () => {
    it("refetches when refreshToken changes, and not when it is unchanged", async () => {
        fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(3)));

        await render(<Probe refreshToken={0} />);
        await act(async () => {
            await Promise.resolve();
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await rerender(<Probe refreshToken={0} />);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await rerender(<Probe refreshToken={1} />);
        await act(async () => {
            await Promise.resolve();
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("retains the last settled count during same-population refresh", async () => {
        let resolveSecond: (value: Response) => void = () => {};
        fetchMock
            .mockImplementationOnce(() => Promise.resolve(jsonResponse(2)))
            .mockImplementationOnce(
                () =>
                    new Promise<Response>((resolve) => {
                        resolveSecond = resolve;
                    }),
            );

        await render(<Probe refreshToken={0} />);
        await act(async () => {
            await Promise.resolve();
        });
        expect(latestTotals.get("wu1::v1")).toBe(2);

        await rerender(<Probe refreshToken={1} />);
        expect(latestTotals.get("wu1::v1")).toBe(2);

        await act(async () => {
            resolveSecond(jsonResponse(3));
            await Promise.resolve();
        });
        expect(latestTotals.get("wu1::v1")).toBe(3);
    });
});
