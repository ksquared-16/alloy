// @vitest-environment jsdom
/**
 * THE INITIAL WINDOW IS NOT THE DEPTH WINDOW.
 *
 * The root's Attendance producer asks for FIVE days on purpose: carrying a month of history on the
 * critical path to draw a week of it is the cost the single-runtime convergence exists to remove.
 *
 * But `recentDays` bounds the whole fold — `historyDays = recentDays ?? 5` sets `windowStart`, and
 * the VM's `history` comes out of that same window. The card's depth layer opens on "Month" (31 days)
 * and offers "All". So reading depth out of the initial projection silently turns a month into five
 * days: no error, no empty state, just a smaller number beside "days in this view".
 *
 * That is the regression this locks. Opening the record over time is an INTERACTION and may fetch —
 * which is the boundary `focusPanelCardProducers` already states in its own words: initial card truth
 * is the root's, the history a card opens on demand stays with the endpoint. The initial request
 * count stays at zero, which is the property the producer cutover was for.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/focusPanel/UniversalCard", () => ({
    default: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
}));
vi.mock("@/components/operationalCards/AttendanceCard", () => ({
    default: ({ onViewHistory }: { onViewHistory: () => void }) => (
        <button type="button" data-testid="view-history" onClick={onViewHistory}>
            View history
        </button>
    ),
}));
vi.mock("@/components/operationalCards/AttendanceDetailCard", () => ({
    default: ({ history, onClose }: { history: readonly { date: string }[]; onClose: () => void }) => (
        <div data-testid="detail" data-days={history.length}>
            <button type="button" data-testid="close-detail" onClick={onClose} />
        </div>
    ),
}));
vi.mock("@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination", () => ({
    useDismissSignal: () => {},
    useReportPerspective: () => {},
}));
vi.mock("@/lib/adminV2/runtime/focusPanel/attendance/adaptAttendanceVmToAttendanceCard", () => ({
    adaptAttendanceVmToAttendanceCard: () => ({}),
}));

import AttendanceCard from "@/components/admin/focusPanel/cards/AttendanceCard";

const MEMBER = "aa11bb22-0000-4000-8000-0000000memb1";

/** A VM carrying `days` days of history, shaped as the card consumes it. */
const vmWith = (days: number) => ({
    participant: { customerMemberId: MEMBER, displayName: "Child A" },
    unavailableReason: null,
    recentDays: [],
    history: Array.from({ length: days }, (_, i) => ({ date: `2026-09-${String(30 - i).padStart(2, "0")}`, events: [] })),
});

/** The root's projection — always the SHALLOW five-day window. */
const projectedContext = (days = 5) =>
    ({
        participantScope: { customerMemberId: MEMBER, displayName: "Child A" },
        operationalProjection: { cards: { attendance: { state: "ready", data: vmWith(days) } } },
    }) as never;

const model = { title: "Attendance", iconName: "Clock", tier: "work", archetype: "timeline", span: "row" } as never;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
});

async function mount(context: unknown) {
    await act(async () => {
        root.render(<AttendanceCard model={model} context={context as never} />);
    });
}

async function clickViewHistory() {
    const button = container.querySelector<HTMLButtonElement>('[data-testid="view-history"]')!;
    await act(async () => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

describe("the Attendance card's depth layer does not read depth from the initial projection", () => {
    it("makes ZERO requests on mount — the producer already supplied the day", async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        await mount(projectedContext());
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("fetches the FULL window when the operator opens the record over time", async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
            json: async () => ({ ok: true, vm: vmWith(31) }),
        });
        vi.stubGlobal("fetch", fetchSpy);
        await mount(projectedContext());

        await clickViewHistory();

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const url = String(fetchSpy.mock.calls[0]![0]);
        expect(url).toContain("/api/admin/attendance/card");
        // The detail opens on "Month" and offers "All"; five days cannot answer either.
        expect(url).toContain("recent_days=31");
        expect(url).toContain(encodeURIComponent(MEMBER));
    });

    it("renders the depth window once it arrives, not the five days it opened with", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ json: async () => ({ ok: true, vm: vmWith(31) }) }),
        );
        await mount(projectedContext());
        await clickViewHistory();

        const detail = container.querySelector('[data-testid="detail"]');
        expect(detail?.getAttribute("data-days")).toBe("31");
    });

    it("does not re-fetch depth for a child whose full window is already loaded", async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
            json: async () => ({ ok: true, vm: vmWith(31) }),
        });
        vi.stubGlobal("fetch", fetchSpy);
        await mount(projectedContext());

        await clickViewHistory();
        // Close and reopen: the same child, whose full window is already in hand.
        const close = container.querySelector<HTMLButtonElement>('[data-testid="close-detail"]')!;
        await act(async () => close.dispatchEvent(new MouseEvent("click", { bubbles: true })));
        await clickViewHistory();

        // The second open is already at depth — re-reading would be a request the operator's click
        // did not need, which is the bootstrap behaviour this whole migration removed.
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
});
