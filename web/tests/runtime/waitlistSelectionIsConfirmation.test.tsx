// @vitest-environment jsdom
/**
 * E2E-05 — MOVE TO WAITLIST ASKED THE SAME QUESTION TWICE.
 *
 * Human QA: Move to Waitlist → select child → Continue → a "Moving: Alpha / Destination: Waitlist"
 * screen → Move to Waitlist. The second screen repeated the selection and asked nothing new. The
 * selection is now the confirmation boundary: one primary button that names who moves and where,
 * and pressing it is the confirmation the command records.
 *
 * Renders the real panel and counts the real execute calls, so the test fails on the two-screen
 * version (one press never reaches the command there).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";

import CurrentWorkSubjectSelectorPanel from "@/components/admin/focusPanel/cards/CurrentWorkSubjectSelectorPanel";
import { clearEligibleEnrollmentChildrenWarmCacheForTests } from "@/lib/adminV2/runtime/focusPanel/currentWork/eligibleEnrollmentChildrenWarmCache";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ALPHA = { id: "ocm-alpha", label: "Alpha ZZQA · New Lead" };
const BRAVO = { id: "ocm-bravo", label: "Bravo ZZQA · New Lead" };

let executes: Array<Record<string, unknown>> = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
    executes = [];
    clearEligibleEnrollmentChildrenWarmCacheForTests();
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("eligible-enrollment-children")) {
            return new Response(
                JSON.stringify({ ok: true, data: { status: "multiple", subjects: [ALPHA, BRAVO] } }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
        }
        if (url.includes("/api/admin/actions/execute")) {
            executes.push(JSON.parse(String(init?.body ?? "{}")));
            return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
        }
        return new Response("", { status: 404 });
    }) as typeof fetch;
});

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.innerHTML = "";
});

async function mount() {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
        root.render(
            createElement(CurrentWorkSubjectSelectorPanel, {
                action: { key: "waitlist_child", handlerKey: "waitlist_child" } as unknown as CurrentWorkActionVM,
                opportunityId: "opp-1",
                onClose: () => {},
                onComplete: () => {},
            }),
        );
    });
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
    const q = (sel: string) => host.querySelector<HTMLElement>(sel);
    const primary = () => q('[data-testid="current-work-subject-selector-confirm"]') as HTMLButtonElement | null;
    return { host, q, primary, root };
}

describe("Move to Waitlist — the selection is the confirmation", () => {
    it("one press on the selection view moves the chosen child — no second screen", async () => {
        const v = await mount();
        // Only Alpha.
        await act(async () => v.q(`[data-testid="current-work-subject-option-${BRAVO.id}"] input`)!.click());
        expect(v.primary()?.textContent).toBe("Move Alpha ZZQA to Waitlist");

        await act(async () => {
            v.primary()!.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(v.q('[data-testid="current-work-subject-preview"]')).toBeNull();
        expect(executes).toHaveLength(1);
        expect(executes[0]).toMatchObject({
            action_key: "waitlist_child",
            entity_type: "opportunity_customer_member",
            entity_id: ALPHA.id,
            confirmation: { confirmed: true },
        });
        act(() => v.root.unmount());
    });

    it("the button names every child it will move, and moves only those", async () => {
        const v = await mount();
        expect(v.primary()?.textContent).toBe("Move Alpha ZZQA and Bravo ZZQA to Waitlist");
        await act(async () => {
            v.primary()!.click();
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(executes.map((e) => e.entity_id).sort()).toEqual([ALPHA.id, BRAVO.id]);
        act(() => v.root.unmount());
    });

    it("with nobody selected there is nothing to confirm", async () => {
        const v = await mount();
        await act(async () => v.q(`[data-testid="current-work-subject-option-${ALPHA.id}"] input`)!.click());
        await act(async () => v.q(`[data-testid="current-work-subject-option-${BRAVO.id}"] input`)!.click());
        expect(v.primary()?.disabled).toBe(true);
        expect(executes).toHaveLength(0);
        act(() => v.root.unmount());
    });
});
