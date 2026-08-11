import { test as base, expect } from "@playwright/test";

import { redactSecrets } from "@/lib/security/redactSecrets";

/**
 * Playwright `test`, with console output redacted at the source.
 *
 * Two leak vectors exist, and they need two different fixes:
 *
 *   1. Framework-generated output — Playwright's "Call log" on a failed request
 *      includes request headers, so a failing authenticated call prints the
 *      session cookie. That is handled by `redactingReporter.ts`, which scrubs
 *      errors, steps, attachments and captured stdio before any reporter prints.
 *
 *   2. A spec's OWN `console.log`, which Playwright streams live to the terminal
 *      as it happens — before `onTestEnd`, so a reporter cannot catch it. That is
 *      handled here.
 *
 * Import `test` from this module instead of `@playwright/test` in any spec that
 * touches an authenticated session.
 *
 * This redacts; it does not silence. Console output still appears, with only
 * secret values replaced.
 */
// Generics follow Playwright's documented worker-fixture form: an EMPTY object for
// the test-scoped args. `Record<string, never>` looks equivalent but makes every
// fixture value resolve to `never`, so the worker fixture below fails to typecheck.
// The value is `boolean` rather than `void` for the same reason — Fixtures<> has no
// representation for a void-valued fixture.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export const test = base.extend<{}, { redactConsole: boolean }>({
    redactConsole: [
        // Playwright inspects this signature at RUNTIME and rejects anything that
        // is not an object-destructuring pattern ("First argument must use the
        // object destructuring pattern"), so the empty pattern is required — a
        // named `_fixtures` parameter typechecks and then fails on execution.
        // eslint-disable-next-line no-empty-pattern
        async ({}, use) => {
            const methods = ["log", "info", "warn", "error", "debug"] as const;
            const originals = new Map<string, (...args: unknown[]) => void>();

            for (const method of methods) {
                const original = console[method].bind(console) as (...args: unknown[]) => void;
                originals.set(method, original);
                console[method] = ((...args: unknown[]) => {
                    original(
                        ...args.map((arg) => {
                            if (typeof arg === "string") return redactSecrets(arg);
                            if (arg instanceof Error) {
                                arg.message = redactSecrets(arg.message);
                                if (arg.stack) arg.stack = redactSecrets(arg.stack);
                                return arg;
                            }
                            return arg;
                        })
                    );
                }) as typeof console.log;
            }

            await use(true);

            for (const method of methods) {
                const original = originals.get(method);
                if (original) console[method] = original as typeof console.log;
            }
        },
        { scope: "worker", auto: true },
    ],
});

export { expect };
