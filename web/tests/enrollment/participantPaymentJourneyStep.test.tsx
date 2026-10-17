// @vitest-environment jsdom
/**
 * PAYMENT AS A STEP OF THE JOURNEY — the participant card, rendered.
 *
 * The card is placed on the post-submit screens (the fee realises at submit, so that is where it is
 * due). These tests drive the real component against a scripted `/enrollment-payment`:
 *
 *   - no fee → nothing rendered (the journey simply proceeds);
 *   - not due → no Pay button;
 *   - partial → what was received, what remains, and "Pay remainder";
 *   - a bank rail is offered only when the server reports it, and choosing it re-reads the payer's
 *     own methods for that rail and collects on it;
 *   - a decline leaves the same intent open to retry; nothing is created by rendering.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const confirmPayment = vi.fn();
vi.mock("@stripe/stripe-js", () => ({
    loadStripe: async () => ({
        elements: () => ({ create: () => ({ mount: () => undefined }) }),
        confirmPayment: (...a: unknown[]) => confirmPayment(...a),
    }),
}));

import ParticipantPaymentCard from "@/app/forms/embed/[token]/ParticipantPaymentCard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type View = Record<string, unknown>;
const view = (over: Partial<View> = {}): View => ({
    state: "DUE",
    label: "Enrollment fee",
    explanation: "",
    currencyCode: "USD",
    grossCents: 15000,
    collectibleNowCents: 15000,
    appliedCents: 0,
    outstandingCents: 15000,
    payable: true,
    payer: { personId: "p1", name: "Pat Parent" },
    lines: [{ chargeId: "chg-ava", subjectName: "Ava", label: "Ava — enrollment fee", collectibleNowCents: 15000, state: "DUE" }],
    methods: [
        { id: "pm-card", rail: "card", brand: "visa", last4: "4242", isDefault: true },
    ],
    rails: ["card"],
    unpayableReason: null,
    ...over,
});

type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[];
let script: (c: Call) => { status: number; json: unknown };

beforeEach(() => {
    calls = [];
    confirmPayment.mockReset();
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
        const c: Call = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null };
        calls.push(c);
        const r = script(c);
        return { ok: r.status < 300, status: r.status, json: async () => r.json } as Response;
    });
});
afterEach(() => vi.unstubAllGlobals());

async function mount(): Promise<{ host: HTMLElement; root: Root }> {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<ParticipantPaymentCard token="tok" />));
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    return { host, root };
}
const q = (host: HTMLElement, k: string) => host.querySelector(`[data-participant-payment="${k}"]`) as HTMLElement | null;
const gets = () => calls.filter((c) => c.method === "GET");
const posts = () => calls.filter((c) => c.method === "POST");
const ok = (payment: View) => ({ status: 200, json: { ok: true, data: { payment, publishableKey: "pk_test" } } });

describe("the payment step after paperwork", () => {
    it("renders nothing when no fee applies, so the journey simply proceeds", async () => {
        script = () => ok(view({ state: "NOT_APPLICABLE", payable: false, lines: [] }));
        const { host } = await mount();
        expect(host.innerHTML).toBe("");
        expect(posts()).toHaveLength(0);
    });

    it("before the fee is due there is no Pay button, and rendering creates nothing", async () => {
        script = () => ok(view({ state: "NOT_DUE", payable: false, unpayableReason: "Not due until the paperwork is complete." }));
        const { host } = await mount();
        expect(q(host, "headline")?.textContent).toMatch(/not due yet/);
        expect(q(host, "pay")).toBeNull();
        expect(posts()).toHaveLength(0);
    });

    it("a partial payment shows what was received and what remains, and offers the remainder", async () => {
        script = () =>
            ok(view({
                state: "PARTIALLY_SATISFIED",
                appliedCents: 5000,
                outstandingCents: 10000,
                collectibleNowCents: 10000,
                lines: [{ chargeId: "chg-ava", subjectName: "Ava", label: "Ava — enrollment fee", collectibleNowCents: 10000, state: "PARTIALLY_SATISFIED" }],
            }));
        const { host } = await mount();
        expect(q(host, "headline")?.textContent).toMatch(/\$50\.00 received · \$100\.00 remaining/);
        expect(q(host, "pay")?.textContent).toMatch(/Pay remainder · \$100\.00/);
        expect((q(host, "amount") as HTMLInputElement).value).toBe("100.00");
    });

    it("each child's fee is its own line, and paying one never merges it with another", async () => {
        script = () =>
            ok(view({
                collectibleNowCents: 25000,
                lines: [
                    { chargeId: "chg-ava", subjectName: "Ava", label: "Ava — enrollment fee", collectibleNowCents: 15000, state: "DUE" },
                    { chargeId: "chg-ben", subjectName: "Ben", label: "Ben — enrollment fee", collectibleNowCents: 10000, state: "DUE" },
                ],
            }));
        const { host } = await mount();
        expect(q(host, "headline")?.textContent).toMatch(/\$250\.00 due/);
        const lines = [...(q(host, "lines")?.querySelectorAll("li") ?? [])].map((l) => l.textContent);
        expect(lines).toEqual(["Ava — enrollment fee — $150.00", "Ben — enrollment fee — $100.00"]);
        const options = [...(q(host, "charge") as HTMLSelectElement).options].map((o) => o.value);
        expect(options).toEqual(["chg-ava", "chg-ben"]);
    });

    it("offers no bank option when the merchant cannot take ACH", async () => {
        script = () => ok(view());
        const { host } = await mount();
        expect(q(host, "rail")).toBeNull();
    });

    it("a bank rail, when available, re-reads the payer's own bank methods and collects on ACH", async () => {
        script = (c) => {
            if (c.method === "POST") {
                return { status: 200, json: { ok: true, data: { attemptId: "att-1", clientSecret: "cs_1", connectedAccountRef: "acct_1", publishableKey: "pk_test", reused: false } } };
            }
            const ach = c.url.includes("rail=ach");
            return ok(view({
                rails: ["card", "ach"],
                methods: ach ? [{ id: "pm-bank", rail: "ach", brand: null, last4: "6789", isDefault: false }] : view().methods,
            }));
        };
        const { host } = await mount();
        expect(gets()[0].url).toContain("rail=card");
        const rail = q(host, "rail") as HTMLSelectElement;
        expect([...rail.options].map((o) => o.textContent)).toEqual(["Card", "Bank account (ACH)"]);

        await act(async () => {
            rail.value = "ach";
            rail.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await act(async () => new Promise((r) => setTimeout(r, 0)));
        expect(gets().at(-1)?.url).toContain("rail=ach");
        const methods = [...(q(host, "method") as HTMLSelectElement).options].map((o) => o.textContent);
        expect(methods).toEqual(["Bank account •••• 6789", "Use a new bank account for this payment"]);

        // A new bank account: Stripe's own fields (verification + mandate) are mounted.
        const method = q(host, "method") as HTMLSelectElement;
        await act(async () => {
            method.value = "";
            method.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await act(async () => q(host, "pay")!.click());
        await act(async () => new Promise((r) => setTimeout(r, 0)));
        expect(posts()[0].body).toMatchObject({ action: "collect", charge_id: "chg-ava", rail: "ach", amount_cents: 15000 });
        expect(posts()[0].body).not.toHaveProperty("payment_method_id");
        expect(q(host, "notice")?.textContent).toMatch(/Connect your bank account/);
        expect(q(host, "stripe-element")).not.toBeNull();
    });

    it("a decline keeps the same intent open; the retry confirms it rather than starting another", async () => {
        let collects = 0;
        let recognised = false;
        script = (c) => {
            if (c.method === "POST" && c.body?.action === "collect") {
                collects += 1;
                return { status: 200, json: { ok: true, data: { attemptId: "att-1", clientSecret: "cs_1", connectedAccountRef: "acct_1", publishableKey: "pk_test", reused: false } } };
            }
            if (c.method === "POST" && c.body?.action === "recognize") {
                recognised = true;
                return { status: 200, json: { ok: true, data: { recognized: true } } };
            }
            return ok(recognised ? view({ state: "SATISFIED", payable: false, appliedCents: 15000, outstandingCents: 0, collectibleNowCents: 0 }) : view({ methods: [] }));
        };
        const { host } = await mount();
        await act(async () => q(host, "pay")!.click());
        await act(async () => new Promise((r) => setTimeout(r, 20)));

        confirmPayment.mockResolvedValueOnce({ error: { message: "Your card was declined." } });
        await act(async () => q(host, "confirm")!.click());
        expect(q(host, "error")?.textContent).toMatch(/declined/);
        expect(q(host, "confirm")).not.toBeNull();

        confirmPayment.mockResolvedValueOnce({ paymentIntent: { status: "succeeded" } });
        await act(async () => q(host, "confirm")!.click());
        await act(async () => new Promise((r) => setTimeout(r, 0)));

        expect(collects).toBe(1);
        expect(posts().filter((c) => c.body?.action === "recognize")).toEqual([
            expect.objectContaining({ body: { action: "recognize", attempt_id: "att-1" } }),
        ]);
        expect(q(host, "headline")?.textContent).toBe("Enrollment fee complete");
        expect(q(host, "pay")).toBeNull();
    });
});

describe("placement: Payment is part of the journey, not a footer of the form", () => {
    const SRC = readFileSync(resolve(__dirname, "../../app/forms/embed/[token]/FormEmbedClient.tsx"), "utf8");
    const BODY = SRC.slice(SRC.indexOf("export function FormEmbedClient"));

    it("every enrollment post-submit screen carries the payment step", () => {
        for (const guard of ["if (packetAlreadyDone", "if (packetFinalThankYou", "if (submitted"]) {
            const start = BODY.indexOf(guard);
            expect(start, guard).toBeGreaterThan(0);
            const block = BODY.slice(start, BODY.indexOf("\n    }\n", start));
            expect(block, guard).toMatch(/enrollmentObjective \? \([\s\S]*<ParticipantPaymentCard token=\{token\} \/>[\s\S]*\) : \(/);
        }
    });
});
