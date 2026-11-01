/**
 * THE REAL DRIVER for the shared QA workflow verifier (`qaWorkflowVerifier.mjs`): headless Chromium through the
 * repository's own `@playwright/test`. It is loaded only inside an executor-run fixture child, never by a lane,
 * and never by tests (they use a fake driver over the same interface).
 *
 * It does exactly what the verifier's policy says and reports everything back so the verifier can re-judge it:
 *   · one context from the executor-bound storage state; no downloads; service workers blocked (a worker could
 *     issue requests the route handler never sees);
 *   · EVERY request (page, fetch, XHR, websocket upgrade, subresource) passes `policy.judge` — a refused one is
 *     aborted and still logged, so an attempted write or foreign request fails the verification;
 *   · the only interaction is clicking the adapter's REVEAL selectors (disclosure toggles);
 *   · the snapshot is only the adapter's capture specs: attribute values and trimmed text of named parts.
 *
 * Identity is the application's own answer (`userEmail` in the server payload, then the session claim) — the same
 * reading the toolkit's `agent-verify.mjs` uses — never the storage file.
 */

const EMAIL = "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}";
const IDENTITY_PATTERNS = [
    new RegExp(`userEmail\\\\*"\\s*:\\s*\\\\*"(${EMAIL})`),
    new RegExp(`"aud\\\\*"\\s*:\\s*\\\\*"authenticated[\\s\\S]{0,400}?email\\\\*"\\s*:\\s*\\\\*"(${EMAIL})`),
];

/** The page's own statement of who is signed in, or null. */
export function identityFromHtml(html) {
    for (const re of IDENTITY_PATTERNS) {
        const m = re.exec(String(html || ""));
        if (m) return m[1];
    }
    return null;
}

/** @param {{ loadPlaywright?: () => Promise<{ chromium: any }>, timeoutMs?: number }} [opts] */
export function createPlaywrightWorkflowDriver({ loadPlaywright = () => import("@playwright/test"), timeoutMs = 60_000 } = {}) {
    return {
        kind: "playwright",
        async open(policy) {
            const { chromium } = await loadPlaywright();
            const browser = await chromium.launch({ headless: true });
            const context = await browser.newContext({ storageState: policy.storageStatePath, acceptDownloads: false, serviceWorkers: "block" });
            /** @type {{ method: string, url: string, blocked: boolean }[]} */
            let log = [];
            await context.route("**/*", (route) => {
                const req = route.request();
                const verdict = policy.judge(req.method(), req.url());
                log.push({ method: req.method(), url: req.url(), blocked: !verdict.ok });
                return verdict.ok ? route.continue() : route.abort("blockedbyclient");
            });
            if (typeof context.routeWebSocket === "function") {
                await context.routeWebSocket(/.*/, (ws) => {
                    const verdict = policy.judge("GET", ws.url());
                    log.push({ method: "GET", url: ws.url(), blocked: !verdict.ok });
                    if (verdict.ok) ws.connectToServer();
                    else ws.close();
                });
            }
            return {
                async visit(path) {
                    log = [];
                    const page = await context.newPage();
                    try {
                        await page.goto(new URL(path, policy.baseOrigin).href, { waitUntil: "networkidle", timeout: timeoutMs });
                        for (const selector of policy.reveal) {
                            for (const handle of await page.$$(selector)) await handle.click({ timeout: timeoutMs });
                        }
                        if (policy.reveal.length) await page.waitForLoadState("networkidle", { timeout: timeoutMs });
                        const snapshot = {};
                        for (const spec of policy.capture) {
                            snapshot[spec.name] = await page.$$eval(spec.selector, (els, s) => els.map((el) => ({
                                attrs: Object.fromEntries((s.attrs || []).map((a) => [a, el.getAttribute(a)])),
                                text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200),
                                parts: Object.fromEntries(Object.entries(s.parts || {}).map(([k, p]) => {
                                    const node = el.querySelector(p.selector);
                                    const v = !node ? null : p.attr ? node.getAttribute(p.attr) : (node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200);
                                    return [k, v];
                                })),
                            })), spec);
                        }
                        return { finalUrl: page.url(), identity: identityFromHtml(await page.content()), requests: [...log], snapshot };
                    } finally {
                        await page.close();
                    }
                },
                async close() {
                    await context.close();
                    await browser.close();
                },
            };
        },
    };
}
