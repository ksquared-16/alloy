// @vitest-environment jsdom
/**
 * THE PAYMENT METHODS SECTION, MOUNTED.
 *
 * The service suites prove what is true; this proves what an OPERATOR is shown and offered. They are
 * different failures: a method can be correctly `blocked` in the database and still be rendered as
 * ready, and a control can be offered for an act the server will refuse.
 *
 * Every case renders the real component against a stubbed route answer and reads the DOM. Nothing is
 * asserted about internal state.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PaymentMethodsSection from "@/components/operationalCards/PaymentMethodsSection";

/* The provider's own fields need a real browser; the section's own states do not. */
vi.mock("@/components/operationalCards/PaymentMethodSetupField", () => ({
    default: ({ rail, authorizationDisclosure }: { rail: string; authorizationDisclosure: string | null }) => (
        <div data-testid="payment-method-setup-field" data-setup-rail={rail}>
            {authorizationDisclosure ? (
                <p data-testid="payment-method-setup-authorization">{authorizationDisclosure}</p>
            ) : null}
        </div>
    ),
}));

const CUSTOMER = "cust-1";

type Method = {
    id: string;
    rail: "card" | "ach";
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
    verificationState: string;
    usabilityState: string;
    isDefault: boolean;
    revokedAt: string | null;
};

function method(over: Partial<Method> = {}): Method {
    return {
        id: "m-1",
        rail: "card",
        brand: "visa",
        last4: "4242",
        expMonth: 8,
        expYear: 2029,
        verificationState: "verified",
        usabilityState: "usable",
        isDefault: false,
        revokedAt: null,
        ...over,
    };
}

let container: HTMLDivElement;
let root: Root;

function mountWith(methods: Method[]) {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, methods }) })) as never,
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
}

async function render(methods: Method[]) {
    mountWith(methods);
    await act(async () => {
        root.render(<PaymentMethodsSection customerId={CUSTOMER} payerEntityId="person-1" />);
    });
    /* Let the route answer settle. */
    await act(async () => { await Promise.resolve(); });
}

const rows = () => Array.from(container.querySelectorAll('[data-testid="payment-method-row"]'));
const text = () => container.textContent ?? "";

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    vi.unstubAllGlobals();
});

describe("the Payment methods section, mounted", () => {
    it("says NO payment method on file when there is none, and offers both ways to add one", async () => {
        await render([]);
        expect(text()).toContain("No payment method on file");
        expect(container.querySelector('[data-testid="payment-method-add-card"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="payment-method-add-bank"]')).toBeTruthy();
        expect(rows()).toHaveLength(0);
    });

    it("names a ready card by brand and last four, with its expiry", async () => {
        await render([method()]);
        expect(text()).toContain("visa •••• 4242");
        expect(text()).toContain("Expires 08/29");
        expect(rows()[0]?.getAttribute("data-method-state")).toBe("Ready");
    });

    it("shows the default as Default, and offers Set as default only on the others", async () => {
        await render([method({ id: "m-1", isDefault: true }), method({ id: "m-2", last4: "1881" })]);
        const [first, second] = rows();
        expect(first.getAttribute("data-method-state")).toBe("Default");
        /* Offering "Set as default" on the method that already is one would do nothing. */
        expect(first.querySelector('[data-testid="payment-method-set-default"]')).toBeNull();
        expect(second.querySelector('[data-testid="payment-method-set-default"]')).toBeTruthy();
    });

    it("says Verification required for a bank account still being verified, and never Ready", async () => {
        await render([
            method({ rail: "ach", brand: "TEST BANK", last4: "6789", expMonth: null, expYear: null, verificationState: "pending", usabilityState: "blocked" }),
        ]);
        expect(text()).toContain("TEST BANK •••• 6789");
        expect(rows()[0]?.getAttribute("data-method-state")).toBe("Verification required");
        expect(text()).not.toContain("Ready");
        /* It cannot be made the default while it cannot be used. */
        expect(container.querySelector('[data-testid="payment-method-set-default"]')).toBeNull();
    });

    it("says Expired for an expired card, and Needs attention for a blocked one", async () => {
        await render([
            method({ id: "m-1", usabilityState: "expired" }),
            method({ id: "m-2", last4: "0005", usabilityState: "blocked", verificationState: "verified" }),
        ]);
        const states = rows().map((r) => r.getAttribute("data-method-state"));
        expect(states).toEqual(["Expired", "Needs attention"]);
    });

    it("keeps a removed method out of the live list and says it is kept for history", async () => {
        await render([
            method({ id: "m-1" }),
            method({ id: "m-2", last4: "0005", usabilityState: "revoked", revokedAt: "2026-09-19T00:00:00Z" }),
        ]);
        expect(rows(), "a removed method is not offered as usable").toHaveLength(1);
        expect(text()).toContain("1 removed method is kept for payment history");
    });

    it("shows card and bank defaults side by side, independently", async () => {
        await render([
            method({ id: "m-1", isDefault: true }),
            method({ id: "m-2", rail: "ach", brand: "TEST BANK", last4: "6789", expMonth: null, expYear: null, isDefault: true }),
        ]);
        const byRail = Object.fromEntries(rows().map((r) => [r.getAttribute("data-method-rail"), r.getAttribute("data-method-default")]));
        expect(byRail).toEqual({ card: "true", ach: "true" });
    });

    it("offers nothing to change when the caller may not manage methods", async () => {
        mountWith([method()]);
        await act(async () => {
            root.render(<PaymentMethodsSection customerId={CUSTOMER} payerEntityId="person-1" canManage={false} />);
        });
        await act(async () => { await Promise.resolve(); });

        expect(container.querySelector('[data-testid="payment-method-add-card"]')).toBeNull();
        expect(container.querySelector('[data-testid="payment-method-remove"]')).toBeNull();
        expect(container.querySelector('[data-testid="payment-method-set-default"]')).toBeNull();
        /* The method itself is still readable — this hides acts, not facts. */
        expect(text()).toContain("visa •••• 4242");
    });

    /**
     * NO PROVIDER VOCABULARY REACHES THE OPERATOR.
     *
     * The adapter's words are a leak, not a style preference: an operator who learns them starts
     * using them with parents, and the next surface copies them.
     */
    it("uses no provider vocabulary anywhere on the surface", async () => {
        await render([
            method(),
            method({ id: "m-2", rail: "ach", brand: "TEST BANK", last4: "6789", expMonth: null, expYear: null, verificationState: "pending", usabilityState: "blocked" }),
        ]);
        for (const word of ["PaymentMethod", "SetupIntent", "us_bank_account", "Financial Connections", "mandate", "pm_", "cus_", "Stripe"]) {
            expect(text(), `the surface must not say "${word}"`).not.toContain(word);
        }
    });

    it("reports a read failure as a failure rather than as an empty account", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: false, json: async () => ({ error: "Payment methods could not be read." }) })) as never,
        );
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        await act(async () => {
            root.render(<PaymentMethodsSection customerId={CUSTOMER} payerEntityId="person-1" />);
        });
        await act(async () => { await Promise.resolve(); });

        expect(container.querySelector('[data-testid="payment-methods-error"]')).toBeTruthy();
        expect(text()).toContain("could not be read");
    });
});
