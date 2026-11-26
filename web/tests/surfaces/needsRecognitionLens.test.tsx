// @vitest-environment jsdom
/**
 * NEEDS RECOGNITION, MOUNTED.
 *
 * The service suites prove what is true; this proves what an operator is shown and offered. The
 * failures are different: a queue can be correct and still show a provider id where a family's name
 * belongs, or hide the reason a repair refused, or leave a recognized row on screen.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NeedsRecognitionLens from "@/app/adminV2/financials/sections/NeedsRecognitionLens";

vi.mock("@/components/workspace/WorkspaceEmptyState", () => ({
    default: ({ title, body }: { title: string; body: string }) => (
        <div data-testid="empty">{title} {body}</div>
    ),
}));

type Row = Record<string, unknown>;

function row(over: Row = {}): Row {
    return {
        attemptId: "att-1",
        customerId: "cust-1",
        amountCents: 30_000,
        currency: "USD",
        rail: "card",
        payerPersonId: "person-1",
        providerState: "succeeded",
        providerStateAt: "2026-09-20T10:00:00Z",
        expectedSettlementOn: null,
        methodBrand: "visa",
        methodLast4: "4242",
        lastReason: null,
        ...over,
    };
}

let container: HTMLDivElement;
let root: Root;
let executed: string[];

function mount(rows: Row[], executeResult: Record<string, unknown> = { ok: true, data: { execution_result: { detail: { recognized_now: true } } } }) {
    executed = [];
    let served = rows;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("/actions/execute")) {
            executed.push(String(init?.body ?? ""));
            /* Only a SUCCESSFUL recognition removes the row; a refusal leaves it to be retried. */
            if (executeResult.ok !== false) served = [];
            return { ok: executeResult.ok !== false, json: async () => executeResult };
        }
        return { ok: true, json: async () => ({ ok: true, rows: served }) };
    }) as never);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
}

async function render(rows: Row[], executeResult?: Record<string, unknown>) {
    mount(rows, executeResult);
    await act(async () => { root.render(<NeedsRecognitionLens scopeLabel="All sites" />); });
    await act(async () => { await Promise.resolve(); });
}

const rows = () => Array.from(container.querySelectorAll('[data-testid="needs-recognition-row"]'));
const text = () => container.textContent ?? "";

beforeEach(() => vi.restoreAllMocks());
afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    vi.unstubAllGlobals();
});

describe("the Needs Recognition lens, mounted", () => {
    it("says all collected money is recorded when the queue is empty", async () => {
        await render([]);
        expect(text()).toContain("All collected money is recorded");
        expect(rows()).toHaveLength(0);
    });

    it("shows the business meaning needed to act, not a provider identifier", async () => {
        await render([row({ rail: "ach", methodBrand: "TEST BANK", methodLast4: "6789", expectedSettlementOn: "2026-09-24" })]);
        expect(text()).toContain("Provider collected");
        expect(text()).toContain("Bank payment");
        expect(text()).toContain("TEST BANK •••• 6789");
        expect(text()).toContain("Expected");
        /* The provider's own words and ids never reach the operator. */
        for (const leak of ["pi_", "acct_", "pm_", "succeeded", "us_bank_account", "Stripe"]) {
            expect(text(), `the row must not say "${leak}"`).not.toContain(leak);
        }
    });

    it("surfaces the reason a previous repair refused", async () => {
        await render([row({ lastReason: "The provider collected a different amount than this collection authorized." })]);
        expect(container.querySelector('[data-testid="needs-recognition-reason"]')?.textContent)
            .toMatch(/different amount/i);
    });

    it("offers Recognize payment on every row, and names the collection it acts on", async () => {
        await render([row()]);
        const button = container.querySelector('[data-testid="needs-recognition-recognize"]') as HTMLButtonElement;
        expect(button).toBeTruthy();
        await act(async () => { button.click(); });
        await act(async () => { await Promise.resolve(); });

        expect(executed).toHaveLength(1);
        const sent = JSON.parse(executed[0]) as { action_key: string; payload: { collection_attempt_id: string } };
        expect(sent.action_key).toBe("payment.recognize");
        expect(sent.payload.collection_attempt_id).toBe("att-1");
    });

    it("the row leaves the queue once the money is recognized", async () => {
        await render([row()]);
        expect(rows()).toHaveLength(1);
        await act(async () => {
            (container.querySelector('[data-testid="needs-recognition-recognize"]') as HTMLButtonElement).click();
        });
        await act(async () => { await Promise.resolve(); });
        expect(rows(), "completion is the row disappearing").toHaveLength(0);
    });

    /** Losing a race is a success. The operator is told, not shown an error. */
    it("says so plainly when somebody else recognized it first", async () => {
        await render([row()], { ok: true, data: { execution_result: { detail: { recognized_now: false } } } });
        await act(async () => {
            (container.querySelector('[data-testid="needs-recognition-recognize"]') as HTMLButtonElement).click();
        });
        await act(async () => { await Promise.resolve(); });

        expect(container.querySelector('[data-testid="needs-recognition-note"]')?.textContent)
            .toMatch(/already been recognized/i);
        expect(container.querySelector('[data-testid="needs-recognition-error"]'), "that is not an error").toBeNull();
    });

    it("reports a refusal as an error and keeps the row", async () => {
        await render([row()], { ok: false, error: "The provider does not report this collection as settled." });
        await act(async () => {
            (container.querySelector('[data-testid="needs-recognition-recognize"]') as HTMLButtonElement).click();
        });
        await act(async () => { await Promise.resolve(); });

        expect(container.querySelector('[data-testid="needs-recognition-error"]')?.textContent)
            .toMatch(/does not report this collection as settled/i);
        expect(rows(), "the row stays so the operator can see and retry it").toHaveLength(1);
    });

    it("reports a failed read as a failure rather than as an empty queue", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ error: "The recognition queue could not be read." }) })) as never);
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        await act(async () => { root.render(<NeedsRecognitionLens scopeLabel="All sites" />); });
        await act(async () => { await Promise.resolve(); });

        expect(container.querySelector('[data-testid="needs-recognition-error"]')).toBeTruthy();
        expect(text()).not.toContain("All collected money is recorded");
    });
});
