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
export const test = base.extend<Record<string, never>, { redactConsole: void }>({
    redactConsole: [
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

            await use();

            for (const method of methods) {
                const original = originals.get(method);
                if (original) console[method] = original as typeof console.log;
            }
        },
        { scope: "worker", auto: true },
    ],
});

export { expect };
