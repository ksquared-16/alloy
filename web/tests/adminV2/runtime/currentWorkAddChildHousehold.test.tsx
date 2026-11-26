// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * E2E-04 — the process card's Add Child could never add a child.
 *
 * Measured on deployed staging (79c2ef76), on a lead freshly committed by Create Lead with its household
 * in place: Add Child → Continue → Add Child answered "This family has no household yet. Refresh and try
 * again.", every time. The panel looked the household up with `GET /api/admin/opportunities/{id}`, a
 * route with no GET handler (it answers 405), so the household was never found on any lead.
 *
 * The household is already on the record the Focus Panel holds — `truth.customer_id`, which the
 * Household card and the panel's own mutations read. The panel takes it from there.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { mockSubmit, mockFetchFields } = vi.hoisted(() => ({ mockSubmit: vi.fn(), mockFetchFields: vi.fn() }));

vi.mock("@/lib/admin/actions/submitAddInquiryChildFromDrawer", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/actions/submitAddInquiryChildFromDrawer")>(
        "@/lib/admin/actions/submitAddInquiryChildFromDrawer",
    );
    return { ...actual, submitAddInquiryChildFromDrawer: (...a: unknown[]) => mockSubmit(...a) };
});
vi.mock("@/lib/admin/actions/entityCreateFormFieldLoader", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/actions/entityCreateFormFieldLoader")>(
        "@/lib/admin/actions/entityCreateFormFieldLoader",
    );
    return { ...actual, fetchEntityCreateFormFields: (...a: unknown[]) => mockFetchFields(...a) };
});
vi.mock("@/lib/admin/opportunityDrawerTargetedRefresh", () => ({ dispatchOpportunityDrawerScopedUpdate: vi.fn() }));

import CurrentWorkAddChildPanel from "@/components/admin/focusPanel/cards/CurrentWorkAddChildPanel";

const OPP = "22222222-2222-4222-8222-222222222222";
const HOUSEHOLD = "44444444-4444-4444-8444-444444444444";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const fetchSpy = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    mockFetchFields.mockResolvedValue([]);
    mockSubmit.mockResolvedValue(undefined);
    fetchSpy.mockResolvedValue(new Response("", { status: 405 }));
    vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    vi.unstubAllGlobals();
});

async function mount(householdId: string | null) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
        root!.render(
            <CurrentWorkAddChildPanel
                action={{ key: "add_child", label: "Add Child" } as never}
                opportunityId={OPP}
                householdId={householdId}
                onClose={() => {}}
                onComplete={() => {}}
            />,
        );
        await Promise.resolve();
    });
}

function type(testId: string, value: string) {
    const input = host!.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`);
    if (!input) throw new Error(`no ${testId}`);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

async function addAlpha() {
    type("configured-create-input-first_name", "Alpha");
    type("configured-create-input-last_name", "ZZQA");
    type("configured-create-input-date_of_birth", "2023-03-01");
    act(() => host!.querySelector<HTMLButtonElement>('[data-testid="current-work-add-child-continue"]')!.click());
    await act(async () => {
        host!.querySelector<HTMLButtonElement>('[data-testid="current-work-add-child-confirm"]')!.click();
        await Promise.resolve();
    });
}

describe("process-card Add Child", () => {
    it("adds the child to the family's household, taken from the Focus Panel's record", async () => {
        await mount(HOUSEHOLD);
        await addAlpha();
        expect(host!.textContent).not.toContain("no household yet");
        expect(mockSubmit).toHaveBeenCalledTimes(1);
        expect(mockSubmit.mock.calls[0]![0]).toMatchObject({ opportunityId: OPP, customerId: HOUSEHOLD });
    });

    it("does not ask a route that has no GET for the household", async () => {
        await mount(HOUSEHOLD);
        const asked = fetchSpy.mock.calls.map((c) => String(c[0]));
        expect(asked.some((u) => u.endsWith(`/api/admin/opportunities/${OPP}`))).toBe(false);
    });

    it("still refuses honestly when the family genuinely has no household", async () => {
        await mount(null);
        await addAlpha();
        expect(host!.textContent).toContain("no household yet");
        expect(mockSubmit).not.toHaveBeenCalled();
    });
});
