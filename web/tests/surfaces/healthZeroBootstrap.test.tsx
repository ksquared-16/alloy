// @vitest-environment jsdom
/**
 * THE HEALTH CARD MAKES NO REQUEST ON MOUNT.
 *
 * The invariant this whole program is for is not "one HTTP request" — explicit detail and
 * post-mutation refresh remain legitimate. It is ZERO INDEPENDENT INITIAL CARD BOOTSTRAP LIFECYCLES:
 * no card may open its own loading state, its own stale guard and its own fetch just to say what it
 * already knows.
 *
 * Attendance and Financials each have this lock. Health did not, which is how a reintroduced
 * `useEffect(() => void load(), [])` would have passed every other gate in the suite.
 *
 * A refusal is covered too: `forbidden` must render as a refusal and NOT as an empty health record,
 * and it must still issue no request — a card that retried on denial would be both a wrong answer
 * and a request loop.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/focusPanel/UniversalCard", () => ({
    default: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
}));
vi.mock("@/components/operationalCards/HealthSafetyCard", () => ({ default: () => <div data-testid="approved" /> }));
vi.mock("@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination", () => ({
    useDismissSignal: () => {},
    useReportPerspective: () => {},
}));

import HealthSafetyCard from "@/components/admin/focusPanel/cards/HealthSafetyCard";

const MEMBER = "bf7bb266-31b3-4cb3-ad9e-77d94fee4d12";
const model = { title: "Health & Safety", iconName: "HeartPulse", tier: "work", archetype: "list", span: "row" } as never;

const vm = {
    participant: { customerMemberId: MEMBER, displayName: "Child A" },
    criticalFacts: [],
    careFacts: [],
    medications: [],
    profileFacts: [],
    documents: [],
    requirements: [],
    emergencyContacts: [],
    gaps: [],
    unavailableReason: null,
    permissionDenied: false,
} as never;

const contextWith = (health: unknown) =>
    ({
        truth: {},
        participantScope: { customerMemberId: MEMBER, displayName: "Child A" },
        operationalProjection: { cards: { health } },
    }) as never;

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
        root.render(<HealthSafetyCard model={model} context={context as never} />);
    });
}

describe("the Health card has no bootstrap lifecycle of its own", () => {
    it("issues ZERO requests on mount when the root supplied the record", async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        await mount(contextWith({ state: "ready", data: vm }));
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("issues ZERO requests when the root refused, and says so rather than showing an empty record", async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        await mount(contextWith({ state: "forbidden", data: null }));
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(container.innerHTML).toContain("permission");
        // The refusal must not read as "this child has no health record".
        expect(container.innerHTML).not.toContain("No health record");
    });

    it("issues ZERO requests while the projection has not arrived, and does not assert an absence", async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        // `cards` present but health not yet in it is the provisioning window.
        await mount({ truth: {}, participantScope: { customerMemberId: MEMBER }, operationalProjection: { cards: {} } } as never);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(container.innerHTML).not.toContain("No health record");
    });
});
