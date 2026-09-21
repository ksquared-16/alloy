// @vitest-environment jsdom
/**
 * THE CARD MUST NOT PRESENT A CONFLICT AS ORDINARY UNAVAILABILITY.
 *
 * The resolver fails CLOSED when a date carries both an unavailable and an
 * available exception, which is right — offering someone a shift a colleague
 * marked them unavailable for is the worse error. But "Unavailable" on its own
 * hides a disagreement between two operators behind a word that looks routine, and
 * the operator who could fix it never learns there is anything to fix.
 *
 * Also locked: the card never renders without an OPEN employment, and an
 * unavailable exception is submitted with no times, because times stored on such a
 * row would be ignored by the resolver — a record saying something the system does
 * not honour.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/focusPanel/UniversalCard", () => ({
    default: ({ children, statusChip, insight, footerAction }: {
        children?: unknown; statusChip?: string | null; insight?: string; footerAction?: unknown;
    }) => (
        <div>
            <span data-testid="chip">{statusChip ?? ""}</span>
            <span data-testid="insight">{insight ?? ""}</span>
            {children as never}
            {footerAction as never}
        </div>
    ),
}));
vi.mock("@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination", () => ({
    useDismissSignal: () => {}, useReportPerspective: () => {},
}));

import StaffAvailabilityCard from "@/components/admin/focusPanel/cards/StaffAvailabilityCard";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MODEL = {
    key: "staff_availability", archetype: "collection", title: "Availability",
    insight: "", tier: "reference", span: 2, density: "compact", visible: true,
} as unknown as FocusPanelCardModel;

function ctx(currentId: string | null): OperationalContext {
    const employment = {
        is_staff: currentId != null,
        current: currentId ? ({ id: currentId } as never) : null,
        periods: [], configured_facts: [], never_employed: currentId == null,
    };
    const person = { personId: "p-1", personLabel: "A Person", employment };
    return { employment: { primary: person, people: [person], hasEmployment: currentId != null } } as unknown as OperationalContext;
}

function payload(over: Record<string, unknown> = {}) {
    return {
        as_of: "2026-09-28",
        resolved: {
            date: "2026-09-28", weekday: 1, available: true,
            windows: [{ start_time: "07:30:00", end_time: "16:30:00", source: "recurring", sourceId: "w1" }],
            provenance: { kind: "recurring", exceptionId: null, reason: null, supersededRecurringIds: [] },
        },
        recurring: [{ weekday: 1, windows: [{ id: "w1", start_time: "07:30:00", end_time: "16:30:00", effective_start: "2026-01-01", effective_end: null }] }],
        upcoming_exceptions: [],
        exceptions_all: [],
        ...over,
    };
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function render(context: OperationalContext) {
    await act(async () => { root.render(<StaffAvailabilityCard model={MODEL} context={context} />); });
    await act(async () => {});
}
const expand = () => act(async () => {
    container.querySelector<HTMLButtonElement>('[data-staff-availability-action="expand"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
});

beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Staff Availability card", () => {
    it("renders nothing, and asks nothing, without an OPEN employment", async () => {
        const f = vi.fn();
        vi.stubGlobal("fetch", f);
        await render(ctx(null));
        expect(container.querySelector("[data-staff-availability-card]")).toBeNull();
        expect(f).not.toHaveBeenCalled();
    });

    it("reads for the open employment and shows the recurring answer", async () => {
        const f = vi.fn(async (_u: string, _i?: RequestInit) => ({ ok: true, json: async () => payload() }));
        vi.stubGlobal("fetch", f);
        await render(ctx("emp-1"));
        expect(String(f.mock.calls[0]![0])).toContain("employment_id=emp-1");
        const card = container.querySelector("[data-staff-availability-card]")!;
        // The org's day, echoed so a reader can see which day was used.
        expect(card.getAttribute("data-staff-availability-as-of")).toBe("2026-09-28");
        expect(container.querySelector('[data-testid="chip"]')!.textContent).toBe("Available");
        expect(container.querySelector('[data-testid="insight"]')!.textContent).toContain("7:30 AM–4:30 PM");
        await expand();
        expect(container.querySelector("[data-staff-availability-weekday='1']")!.textContent).toContain("Monday");
    });

    it("NAMES a conflict instead of showing plain unavailability", async () => {
        const conflicted = payload({
            resolved: {
                date: "2026-09-28", weekday: 1, available: false, windows: [],
                provenance: { kind: "exception_unavailable", exceptionId: "block", reason: null, supersededRecurringIds: ["w1"] },
            },
            exceptions_all: [
                { id: "block", exception_date: "2026-09-28", exception_kind: "unavailable", start_time: null, end_time: null, reason: null, is_active: true },
                { id: "grant", exception_date: "2026-09-28", exception_kind: "available", start_time: "09:00:00", end_time: "12:00:00", reason: null, is_active: true },
            ],
        });
        vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => conflicted })));
        await render(ctx("emp-1"));
        const card = container.querySelector("[data-staff-availability-card]")!;
        expect(card.getAttribute("data-staff-availability-conflicting")).toBe("true");
        expect(container.querySelector('[data-testid="chip"]')!.textContent).toBe("Conflict");
        await expand();
        // The operator who could fix it must learn there is something to fix.
        expect(container.querySelector("[data-staff-availability-conflict]")!.textContent)
            .toContain("disagree");
    });

    it("a single unavailable exception is NOT a conflict", async () => {
        const blocked = payload({
            resolved: {
                date: "2026-09-28", weekday: 1, available: false, windows: [],
                provenance: { kind: "exception_unavailable", exceptionId: "block", reason: "Family", supersededRecurringIds: ["w1"] },
            },
            exceptions_all: [
                { id: "block", exception_date: "2026-09-28", exception_kind: "unavailable", start_time: null, end_time: null, reason: "Family", is_active: true },
            ],
        });
        vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => blocked })));
        await render(ctx("emp-1"));
        expect(container.querySelector("[data-staff-availability-card]")!
            .getAttribute("data-staff-availability-conflicting")).toBe("false");
        expect(container.querySelector('[data-testid="chip"]')!.textContent).toBe("Unavailable");
        await expand();
        expect(container.querySelector("[data-staff-availability-provenance]")!.textContent).toContain("Family");
    });

    it("submits an unavailable exception with NO times", async () => {
        const posted: Record<string, unknown>[] = [];
        vi.stubGlobal("fetch", vi.fn(async (u: string, i?: RequestInit) => {
            if (i?.method === "POST") { posted.push(JSON.parse(String(i.body))); return { ok: true, json: async () => ({ ok: true }) }; }
            return { ok: true, json: async () => payload() };
        }));
        await render(ctx("emp-1"));
        await expand();
        await act(async () => {
            container.querySelector('[data-staff-availability-command="open-exception"]')!
                .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        const date = container.querySelector<HTMLInputElement>('[data-staff-availability-field="exception_date"]')!;
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(date, "2026-10-05");
            date.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await act(async () => {
            container.querySelector('[data-staff-availability-form="exception"]')!
                .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        });
        await act(async () => {});
        expect(posted[0]!.action_key).toBe("staff_availability.add_exception");
        const p = posted[0]!.payload as Record<string, unknown>;
        expect(p.exception_kind).toBe("unavailable");
        // Times on an unavailable row would be stored and then ignored.
        expect(p.start_time).toBeNull();
        expect(p.end_time).toBeNull();
    });

    it("surfaces a command refusal verbatim", async () => {
        vi.stubGlobal("fetch", vi.fn(async (u: string, i?: RequestInit) => {
            if (i?.method === "POST") return { ok: true, json: async () => ({ ok: false, error: "That employment does not belong to this organization." }) };
            return { ok: true, json: async () => payload({ upcoming_exceptions: [
                { id: "e1", exception_date: "2026-10-05", exception_kind: "unavailable", start_time: null, end_time: null, reason: null, is_active: true },
            ] }) };
        }));
        await render(ctx("emp-1"));
        await expand();
        await act(async () => {
            container.querySelector('[data-staff-availability-command="cancel-exception"]')!
                .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {});
        expect(container.querySelector("[data-staff-availability-error]")!.textContent)
            .toBe("That employment does not belong to this organization.");
    });
});
