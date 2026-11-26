/** @vitest-environment jsdom */

/**
 * PRV2 LEFT_NAV — canonical Work View counts in the persistent sidebar.
 *
 * The sidebar builds `WorkViewTotalTarget[]` from each lifecycle card's `workQueues`
 * entries that carry a canonical location (host_work_unit_id + work_view_id +
 * base_queue_key) and renders the count from `useWorkViewTotals` — the SAME source the
 * Workspace tile list and Work Unit pill strip use — in a FIXED-WIDTH slot. A pending
 * (null) count renders a stable placeholder, never a blank/collapsed slot.
 */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";
import type { WorkViewTotalTarget } from "@/lib/presentation/runtime/useWorkViewTotals";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── Boundary mocks ────────────────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
    usePathname: () => "/workspace",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

// Capture the targets the sidebar builds + drive the returned totals map from the test.
const totalsSpy = vi.fn();
let totalsMap = new Map<string, number | null>();
vi.mock("@/lib/presentation/runtime/useWorkViewTotals", async () => {
    const actual = await vi.importActual<
        typeof import("@/lib/presentation/runtime/useWorkViewTotals")
    >("@/lib/presentation/runtime/useWorkViewTotals");
    return {
        ...actual,
        useWorkViewTotals: (args: { targets: readonly WorkViewTotalTarget[] }) => {
            totalsSpy(args.targets);
            return totalsMap;
        },
    };
});

// Lifecycle cards: warm peek returns our fixture synchronously (no async load state).
let fixtureCards: OperatorLifecycleLandingCard[] = [];
vi.mock("@/lib/admin/loadOperatorLifecycleLandingClient", () => ({
    peekOperatorLifecycleLandingCards: () => fixtureCards,
    loadOperatorLifecycleLandingCards: () => Promise.resolve(fixtureCards),
    invalidateOperatorLifecycleLandingCache: vi.fn(),
}));

vi.mock("@/lib/admin/operatorWorkUnitEntryWarm", () => ({
    warmOperatorWorkUnitEntryFromHref: vi.fn(),
}));

// No WorkspaceSiteFilterProvider in the test tree → hook returns null → sticky-nav fallback.
vi.mock("@/lib/adminV2/workspaceSiteFilterClient", async () => {
    const actual = await vi.importActual<
        typeof import("@/lib/adminV2/workspaceSiteFilterClient")
    >("@/lib/adminV2/workspaceSiteFilterClient");
    return { ...actual, readStickyWorkspaceSiteIdForNavigation: () => null };
});

import Sidebar from "@/app/adminV2/components/Sidebar";

function card(over: Partial<OperatorLifecycleLandingCard> = {}): OperatorLifecycleLandingCard {
    return {
        id: "enrollment",
        departmentId: "dept",
        processKey: "enrollment",
        label: "Enrollment",
        description: "",
        entryHref: "/workspace/work-unit/new-leads",
        stageCount: 1,
        activeRecordCount: null,
        needsAttentionCount: null,
        workQueues: [],
        ...over,
    };
}

function queueEntry(over: Record<string, unknown> = {}) {
    return {
        label: "New Leads",
        platformKey: "new_work_view_1",
        href: "/workspace/work-unit/new-leads",
        work_view_id: "new_work_view_1",
        host_work_unit_id: "wu-leads",
        base_queue_key: "leads_base",
        route_key: "new-leads",
        ...over,
    };
}

let container: HTMLElement | null = null;
async function render(node: ReactNode): Promise<HTMLElement> {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(node);
    });
    // Flush the async lifecycle load (auto-expands the single card) + resulting effects.
    await act(async () => {
        await Promise.resolve();
    });
    return container;
}

beforeEach(() => {
    totalsSpy.mockClear();
    totalsMap = new Map();
    fixtureCards = [];
});
afterEach(() => {
    if (container) {
        container.remove();
        container = null;
    }
    vi.clearAllMocks();
});

import {
    workViewTotalKey,
} from "@/lib/presentation/runtime/useWorkViewTotals";

describe("Sidebar — canonical Work View counts (LEFT_NAV)", () => {
    it("builds WorkViewTotalTargets from lifecycle workQueues carrying a canonical location", async () => {
        fixtureCards = [
            card({
                workQueues: [
                    queueEntry({
                        work_view_id: "v1",
                        host_work_unit_id: "wu-1",
                        base_queue_key: "base_1",
                    }),
                    // Duplicate (same host+view) → deduped by workViewTotalKey.
                    queueEntry({
                        label: "New Leads (dup)",
                        platformKey: "dup",
                        work_view_id: "v1",
                        host_work_unit_id: "wu-1",
                        base_queue_key: "base_1",
                    }),
                    // Label-only entry (no canonical location) → excluded from targets.
                    queueEntry({
                        label: "All Leads",
                        platformKey: "all",
                        work_view_id: null,
                        host_work_unit_id: null,
                        base_queue_key: null,
                    }),
                ],
            }),
        ];

        await render(<Sidebar collapsed={false} onToggle={() => {}} />);

        expect(totalsSpy).toHaveBeenCalled();
        const targets = totalsSpy.mock.calls.at(-1)![0] as WorkViewTotalTarget[];
        expect(targets).toEqual([
            { viewId: "v1", workUnitId: "wu-1", baseQueueKey: "base_1" },
        ]);
    });

    it("renders the resolved count in a fixed-width slot", async () => {
        fixtureCards = [
            card({
                workQueues: [
                    queueEntry({
                        work_view_id: "v1",
                        host_work_unit_id: "wu-1",
                        base_queue_key: "base_1",
                    }),
                ],
            }),
        ];
        totalsMap = new Map([[workViewTotalKey("wu-1", "v1"), 7]]);

        const el = await render(<Sidebar collapsed={false} onToggle={() => {}} />);

        const slot = el.querySelector(
            '[data-work-view-id="v1"] .adminv2-sidebar-queue-count',
        );
        expect(slot).not.toBeNull();
        expect(slot!.textContent).toContain("7");
        // Resolved → no pending placeholder in the slot.
        expect(
            el.querySelector('[data-work-view-id="v1"] .adminv2-sidebar-queue-count-pending'),
        ).toBeNull();
    });

    it("renders a stable placeholder (never blank) while a count is pending (null)", async () => {
        fixtureCards = [
            card({
                workQueues: [
                    queueEntry({
                        work_view_id: "v1",
                        host_work_unit_id: "wu-1",
                        base_queue_key: "base_1",
                    }),
                ],
            }),
        ];
        totalsMap = new Map(); // unresolved → null

        const el = await render(<Sidebar collapsed={false} onToggle={() => {}} />);

        const slot = el.querySelector(
            '[data-work-view-id="v1"] .adminv2-sidebar-queue-count',
        );
        // Slot still reserved (fixed-width class present) even with no number.
        expect(slot).not.toBeNull();
        const pending = el.querySelector(
            '[data-work-view-id="v1"] .adminv2-sidebar-queue-count-pending',
        );
        expect(pending).not.toBeNull();
        expect(pending!.className).toContain("animate-pulse");
    });
});
