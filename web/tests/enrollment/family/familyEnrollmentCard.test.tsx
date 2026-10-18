// @vitest-environment jsdom
/**
 * The participant's family view, rendered from the family endpoint's own answer.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import FamilyEnrollmentCard from "@/app/forms/embed/[token]/FamilyEnrollmentCard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.unstubAllGlobals());

async function render(family: unknown) {
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ ok: true, data: { family } }) }) as Response);
    const host = document.createElement("div");
    await act(async () => createRoot(host).render(<FamilyEnrollmentCard token="tok" />));
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    return host;
}

const family = (childCount: number) => ({
    familyName: "Test Family",
    headline: "Test Family Enrollment",
    childCount,
    complete: false,
    focusedCustomerMemberId: "cy",
    children: [
        { customerMemberId: "ava", displayName: "Ava", participantPath: null, state: "enrolled" },
        { customerMemberId: "ben", displayName: "Ben", participantPath: "/forms/embed/ben-token", state: "waitlisted" },
        { customerMemberId: "cy", displayName: "Charlie", participantPath: "/forms/embed/cy-token", state: "in_progress" },
    ].slice(0, childCount),
    progress: [
        { key: "family_information", label: "Family information", detail: "Complete", complete: true },
        { key: "child:ava", label: "Ava", detail: "Enrolled", complete: true, customerMemberId: "ava" },
        { key: "child:ben", label: "Ben", detail: "On the waitlist", complete: false, customerMemberId: "ben" },
        { key: "child:cy", label: "Charlie", detail: "1 of 2 complete", complete: false, customerMemberId: "cy" },
    ],
});

describe("the family enrollment card", () => {
    it("a single-child family sees no sibling rows — only the way to ask about another child", async () => {
        const host = await render(family(1));
        expect(host.querySelector('[data-family-enrollment="rows"]')).toBeNull();
        expect(host.querySelector('[data-family-enrollment="add-child"]')?.textContent).toBe("+ Add another child");
    });

    it("renders nothing when there is no family journey", async () => {
        expect((await render(null)).innerHTML).toBe("");
    });

    it("shows each child's own state, marks where the parent is, and links only to links the server returned", async () => {
        const host = await render(family(3));
        const rows = [...host.querySelectorAll('[data-family-enrollment-row="child"]')].map((r) => r.textContent);
        expect(rows).toEqual(["Ava — Enrolled", "Ben — On the waitlist · Open", "Charlie — 1 of 2 complete · You are here"]);
        const links = [...host.querySelectorAll('[data-family-enrollment="open"]')].map((a) => a.getAttribute("href"));
        expect(links).toEqual(["/forms/embed/ben-token"]);
        // No internal identifiers reach the page.
        expect(host.textContent).not.toMatch(/pi-|process|session|packet|enrolling/i);
    });
});

describe("+ Add another child", () => {
    it("lists the household's children; only an available child can be asked about, and the family is told it is a request", async () => {
        const calls: Array<{ url: string; method: string; body?: string }> = [];
        vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
            calls.push({ url, method: init?.method ?? "GET", body: init?.body as string | undefined });
            if (url.endsWith("/family-enrollment")) return { ok: true, json: async () => ({ ok: true, data: { family: family(1) } }) } as Response;
            if ((init?.method ?? "GET") === "POST") return { ok: true, json: async () => ({ ok: true, data: { requested: true } }) } as Response;
            return {
                ok: true,
                json: async () => ({ ok: true, data: { canRequest: true, children: [
                    { customerMemberId: "ava", displayName: "Ava", status: "in_progress" },
                    { customerMemberId: "eve", displayName: "Eve", status: "available" },
                    { customerMemberId: "cy", displayName: "Cy", status: "enrolled" },
                ] } }),
            } as Response;
        });
        const host = document.createElement("div");
        await act(async () => createRoot(host).render(<FamilyEnrollmentCard token="tok" />));
        await act(async () => new Promise((r) => setTimeout(r, 0)));
        await act(async () => (host.querySelector('[data-family-enrollment="add-child"]') as HTMLButtonElement).click());
        await act(async () => new Promise((r) => setTimeout(r, 0)));

        const items = [...host.querySelectorAll("[data-household-child-status]")].map((li) => li.textContent);
        expect(items).toEqual(["Ava — Enrollment in progress", "EveAsk the school to enroll Eve", "Cy — Enrolled"]);
        const buttons = host.querySelectorAll('[data-family-enrollment="request-child"]');
        expect(buttons).toHaveLength(1);

        await act(async () => (buttons[0] as HTMLButtonElement).click());
        await act(async () => new Promise((r) => setTimeout(r, 0)));
        const post = calls.find((c) => c.method === "POST")!;
        expect(JSON.parse(post.body!)).toEqual({ customer_member_id: "eve" });
        expect(host.querySelector('[data-family-enrollment="request-sent"]')?.textContent).toMatch(/asked the school to consider Eve.*isn't an enrollment yet/);
    });
});
