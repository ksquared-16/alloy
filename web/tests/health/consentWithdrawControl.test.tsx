// @vitest-environment jsdom
/**
 * FI-03 — recording a consent withdrawal from the Medical card: a reason is required, the
 * operator confirms explicitly, and a refusal from Medical is shown, never swallowed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ConsentWithdrawControl } from "@/components/operationalCards/HealthDetailCard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
});

function mount(withdraw: (id: string, reason: string) => Promise<string | null>) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<ConsentWithdrawControl consentId="c-1" label="Medical records release" withdraw={withdraw} />));
    return host;
}

const q = (el: HTMLElement, sel: string) => el.querySelector(sel) as HTMLElement | null;

function type(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

describe("ConsentWithdrawControl", () => {
    it("asks for a reason and an explicit confirmation before anything is recorded", async () => {
        const withdraw = vi.fn(async () => null);
        const el = mount(withdraw);
        act(() => q(el, '[data-health-consent-withdraw="c-1"]')!.click());
        const confirm = q(el, "[data-health-consent-withdraw-confirm]") as HTMLButtonElement;
        expect(confirm.disabled).toBe(true);
        type(q(el, "[data-health-consent-withdraw-reason]") as HTMLInputElement, "Parent revoked by phone");
        expect(confirm.disabled).toBe(false);
        await act(async () => confirm.click());
        expect(withdraw).toHaveBeenCalledWith("c-1", "Parent revoked by phone");
        expect(q(el, "[data-health-consent-withdraw-form]")).toBeNull();
    });

    it("shows Medical's refusal and keeps the form open", async () => {
        const el = mount(async () => "Only an active authorization can be withdrawn.");
        act(() => q(el, '[data-health-consent-withdraw="c-1"]')!.click());
        type(q(el, "[data-health-consent-withdraw-reason]") as HTMLInputElement, "again");
        await act(async () => (q(el, "[data-health-consent-withdraw-confirm]") as HTMLButtonElement).click());
        expect(q(el, "[data-health-consent-withdraw-error]")?.textContent).toMatch(/Only an active authorization/);
        expect(q(el, "[data-health-consent-withdraw-form]")).not.toBeNull();
    });

    it("cancel records nothing", () => {
        const withdraw = vi.fn(async () => null);
        const el = mount(withdraw);
        act(() => q(el, '[data-health-consent-withdraw="c-1"]')!.click());
        act(() => (Array.from(el.querySelectorAll("button")).find((b) => b.textContent === "Cancel") as HTMLButtonElement).click());
        expect(withdraw).not.toHaveBeenCalled();
        expect(q(el, "[data-health-consent-withdraw-form]")).toBeNull();
    });
});
