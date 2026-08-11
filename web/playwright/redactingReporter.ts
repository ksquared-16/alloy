import type {
    Reporter,
    TestCase,
    TestResult,
    TestError,
    FullResult,
} from "@playwright/test/reporter";

import { redactSecrets } from "@/lib/security/redactSecrets";

/**
 * Scrub authentication material out of Playwright diagnostics before any other
 * reporter prints them.
 *
 * Playwright attaches a "Call log" to a failed request, and that log includes
 * request headers — so a failing authenticated request prints the session cookie.
 * That is exactly how a live Supabase session reached a transcript during Search
 * V2 certification. No test code logged it.
 *
 * Reporters receive the SAME result objects, and Playwright invokes them in the
 * order they are configured. Listing this one FIRST means the mutation below has
 * already happened by the time `list`/`html` serialize anything.
 *
 * This redacts; it does not suppress. Errors, stacks, snippets and step names are
 * all still printed — only secret values are replaced, and each replacement keeps
 * the shape of what it removed so a failure stays debuggable.
 */
function scrubError(error: TestError | undefined): void {
    if (!error) return;
    if (typeof error.message === "string") error.message = redactSecrets(error.message);
    if (typeof error.stack === "string") error.stack = redactSecrets(error.stack);
    if (typeof error.snippet === "string") error.snippet = redactSecrets(error.snippet);
    if (typeof error.value === "string") error.value = redactSecrets(error.value);
    scrubError(error.cause as TestError | undefined);
}

export default class RedactingReporter implements Reporter {
    onTestEnd(_test: TestCase, result: TestResult): void {
        for (const error of result.errors ?? []) scrubError(error);
        scrubError(result.error);

        for (const step of result.steps ?? []) scrubError(step.error);

        // stdout/stderr the test itself produced.
        const scrubChunks = (chunks: (string | Buffer)[] | undefined) => {
            if (!chunks) return;
            for (let i = 0; i < chunks.length; i += 1) {
                const chunk = chunks[i];
                if (typeof chunk === "string") chunks[i] = redactSecrets(chunk);
            }
        };
        scrubChunks(result.stdout);
        scrubChunks(result.stderr);

        // Text attachments (e.g. error-context.md) are written to disk by
        // Playwright, but the in-memory body is what reporters serialize.
        for (const attachment of result.attachments ?? []) {
            if (attachment.body && attachment.contentType?.startsWith("text/")) {
                attachment.body = Buffer.from(redactSecrets(attachment.body.toString("utf8")), "utf8");
            }
        }
    }

    onError(error: TestError): void {
        scrubError(error);
    }

    onEnd(result: FullResult): void | Promise<void> {
        void result;
    }

    printsToStdio(): boolean {
        // This reporter prints nothing — it only sanitizes what others print.
        return false;
    }
}
