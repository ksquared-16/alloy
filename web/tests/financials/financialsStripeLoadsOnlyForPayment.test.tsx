// @vitest-environment jsdom
/**
 * STRIPE.JS LOADS FOR A PAYMENT, NEVER FOR AN IMPORT.
 *
 * Measured, not theorised: the QA workflow verifier opened the fixture child's durable record — a route with no
 * payment on it — and the page requested `https://js.stripe.com` (`foreign origin=https://js.stripe.com
 * class=third_party count=1`). The path was static: record page → `DurableRecordSurface` →
 * `DurableRecordFinancialsLead` → `FinancialsCard` → `CardCollectionField` / `PaymentMethodsSection` →
 * `PaymentMethodSetupField`, each field importing `loadStripe` from `@stripe/stripe-js`. That entry injects the
 * Stripe script AS A SIDE EFFECT OF BEING IMPORTED (2.x `dist/stripe.esm.js`), so any route that merely imported
 * Financials contacted Stripe. `@stripe/stripe-js/pure` is the same `loadStripe` without the side effect.
 *
 * jsdom here is configured without a resource loader, so an injected `<script>` is observed in the document and
 * never fetched: nothing in this file reaches the network.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const WEB = path.resolve(__dirname, "../..");
const ROUTE_PAGE = "app/adminV2/workspace/record/[subjectType]/[subjectId]/page.tsx";
const PAYMENT_FIELDS = ["components/admin/focusPanel/cards/CardCollectionField.tsx", "components/operationalCards/PaymentMethodSetupField.tsx"];

const stripeScripts = () => document.querySelectorAll('script[src^="https://js.stripe.com"]').length;
/** The default entry schedules its injection on a resolved promise; a macrotask is past it. */
const drain = async () => {
    for (let i = 0; i < 3; i += 1) await new Promise((r) => setTimeout(r, 0));
};

afterEach(() => {
    for (const s of Array.from(document.querySelectorAll("script"))) s.remove();
    vi.unstubAllEnvs();
});

/** Value (runtime) imports of exactly `spec` in one source text. Type-only imports and specifiers are erased. */
export function valueImportsOf(source: string, spec: string, fileName = "x.tsx"): number {
    const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
    let hits = 0;
    for (const st of sf.statements) {
        if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || st.moduleSpecifier.text !== spec) continue;
        const clause = st.importClause;
        if (!clause) {
            hits += 1; // `import "x"` — a side-effect import is the most value-ful import there is
            continue;
        }
        if (clause.isTypeOnly) continue;
        const named = clause.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : null;
        if (clause.name || (clause.namedBindings && !named) || (named && named.some((e) => !e.isTypeOnly))) hits += 1;
    }
    return hits;
}

/** Every module statically reachable from `entry` through `@/` and relative specifiers (plus literal `import()`). */
function reachable(entry: string): Map<string, string> {
    const exts = ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx", "/index.js"];
    const resolve = (from: string, spec: string): string | null => {
        const base = spec.startsWith("@/") ? path.join(WEB, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
        if (!base) return null;
        for (const e of exts) if (existsSync(base + e) && statSync(base + e).isFile()) return base + e;
        return null;
    };
    const seen = new Map<string, string>();
    const queue = [path.join(WEB, entry)];
    while (queue.length) {
        const file = queue.pop()!;
        if (seen.has(file) || !/\.(tsx?|m?js)$/.test(file)) continue;
        const text = readFileSync(file, "utf8");
        seen.set(file, text);
        for (const spec of ts.preProcessFile(text, true, true).importedFiles.map((f) => f.fileName)) {
            const next = resolve(file, spec);
            if (next && !seen.has(next)) queue.push(next);
        }
    }
    return seen;
}

describe("Stripe.js on the durable record's Financials route", () => {
    it("no module the route reaches imports Stripe's self-injecting entry; the payment fields use `/pure`", () => {
        const graph = reachable(ROUTE_PAGE);
        const rel = (f: string) => path.relative(WEB, f);
        expect(graph.size).toBeGreaterThan(100); // the walk really crossed the route, not just the page
        const defaultEntry = [...graph].filter(([, t]) => valueImportsOf(t, "@stripe/stripe-js") > 0).map(([f]) => rel(f));
        const pure = [...graph].filter(([, t]) => valueImportsOf(t, "@stripe/stripe-js/pure") > 0).map(([f]) => rel(f)).sort();
        expect(defaultEntry).toEqual([]);
        // Real payments still load Stripe — through the side-effect-free entry, from the two fields that take money.
        expect(pure).toEqual([...PAYMENT_FIELDS].sort());
    });

    it("the detector is not vacuous: it sees a value import of the default entry and ignores type-only ones", () => {
        expect(valueImportsOf('import { loadStripe, type Stripe } from "@stripe/stripe-js";', "@stripe/stripe-js")).toBe(1);
        expect(valueImportsOf('import "@stripe/stripe-js";', "@stripe/stripe-js")).toBe(1);
        expect(valueImportsOf('import * as S from "@stripe/stripe-js";', "@stripe/stripe-js")).toBe(1);
        expect(valueImportsOf('import type { Stripe } from "@stripe/stripe-js";', "@stripe/stripe-js")).toBe(0);
        expect(valueImportsOf('import { type Stripe } from "@stripe/stripe-js";', "@stripe/stripe-js")).toBe(0);
        expect(valueImportsOf('import { loadStripe } from "@stripe/stripe-js/pure";', "@stripe/stripe-js")).toBe(0);
        // Restoring the old import in a real field is caught.
        const restored = readFileSync(path.join(WEB, PAYMENT_FIELDS[0]), "utf8").replace('"@stripe/stripe-js/pure"', '"@stripe/stripe-js"');
        expect(valueImportsOf(restored, "@stripe/stripe-js")).toBe(1);
    });

    it("importing the real Financials modules on that route injects no Stripe script", async () => {
        vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_local_contract_only");
        await import("@/components/presentation/durableRecord/DurableRecordSurface");
        await import("@/components/admin/focusPanel/cards/FinancialsCard");
        await import("@/components/admin/focusPanel/cards/CardCollectionField");
        await import("@/components/operationalCards/PaymentMethodSetupField");
        await drain();
        expect(stripeScripts()).toBe(0);
    });

    it("mounting the payment-method field — a real payment surface — still loads Stripe.js, once", async () => {
        vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_local_contract_only");
        const { default: PaymentMethodSetupField } = await import("@/components/operationalCards/PaymentMethodSetupField");
        await drain();
        expect(stripeScripts()).toBe(0);
        const host = document.createElement("div");
        document.body.appendChild(host);
        const root = createRoot(host);
        await act(async () => {
            root.render(
                <PaymentMethodSetupField clientSecret="seti_local_secret_contract" rail="card" authorizationDisclosure={null} onResult={() => {}} onCancel={() => {}} />,
            );
        });
        await drain();
        expect(stripeScripts()).toBe(1);
        act(() => root.unmount());
        host.remove();
    });

    it("without a publishable key the field loads nothing and says payment processing is unavailable", async () => {
        vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");
        vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE", "");
        const { default: PaymentMethodSetupField } = await import("@/components/operationalCards/PaymentMethodSetupField");
        const host = document.createElement("div");
        document.body.appendChild(host);
        const root = createRoot(host);
        await act(async () => {
            root.render(
                <PaymentMethodSetupField clientSecret="seti_local_secret_contract" rail="card" authorizationDisclosure={null} onResult={() => {}} onCancel={() => {}} />,
            );
        });
        await drain();
        expect(stripeScripts()).toBe(0);
        expect(host.querySelector('[data-testid="payment-method-setup-unavailable"]')).not.toBeNull();
        act(() => root.unmount());
        host.remove();
    });

    it("negative control: the default entry DOES inject on import — the observation above is the fix, not a blind detector", async () => {
        expect(stripeScripts()).toBe(0);
        await import("@stripe/stripe-js");
        await drain();
        expect(stripeScripts()).toBe(1);
    });
});
