/** @vitest-environment jsdom */

/**
 * PRV2 Final Integration — count refresh. `useWorkViewTotals` must re-resolve its counts when
 * `refreshToken` changes (the nonce the Workspace / Work Unit runtimes bump on a Create Lead
 * broadcast), and must NOT refetch when the token is unchanged. This is the mechanism that makes
 * process-card + pill counts update immediately after a mutation instead of on TTL/reload.
 */

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

import { useWorkViewTotals } from "@/lib/presentation/runtime/useWorkViewTotals";

function jsonResponse(total: number): Response {
    return new Response(JSON.stringify({ total, items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
    });
}

function Probe({ refreshToken }: { refreshToken: number }) {
    useWorkViewTotals({
        targets: [{ viewId: "v1", workUnitId: "wu1", baseQueueKey: "all-records" }],
        selectedSiteId: null,
        enabled: true,
        refreshToken,
    });
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
});

describe("useWorkViewTotals — refreshToken", () => {
    it("refetches when refreshToken changes, and not when it is unchanged", async () => {
        fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(3)));

        await render(<Probe refreshToken={0} />);
        expect(fetchMock).toHaveBeenCalledTimes(1); // initial resolve for the one target

        await rerender(<Probe refreshToken={0} />); // same token → same scope → no refetch
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await rerender(<Probe refreshToken={1} />); // bumped → fresh refetch
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
