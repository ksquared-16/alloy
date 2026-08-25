/**
 * PE3 harness conventions, in one place so every probe agrees.
 *
 * Environment (PE3_*, same names the earlier PE3 probes established):
 *   PE3_SLOT     managed slot; the port defaults to 3010 + slot
 *   PE3_PORT     explicit port override
 *   PE3_BASE     explicit base URL override
 *   PE3_STORAGE  Playwright storage state captured by `alloy-agent-login <slot>`
 *
 * Three rules these harnesses do not get to opt out of:
 *
 *  1. REFUSE A STALE BUILD. A probe that measures a server running a build other than the one on
 *     disk reports a number for code nobody has. `assertFreshBuild` proves the served document's
 *     own `/_next/static` assets still exist in this worktree's `.next` — a rebuild renames them,
 *     so a server left running across a build fails here instead of quietly answering.
 *  2. REDACT. Ids are masked wherever they appear, including INSIDE a path segment, and query
 *     VALUES never survive. An earlier revision of this harness persisted 93 operator email
 *     addresses, a phone number and 18 raw subject ids to /tmp; nothing here writes to disk at all.
 *  3. CLOSE IN `finally`. The browser is released whether the probe passes, fails, or throws.
 */
import { chromium } from "playwright";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** `web/` — this file lives in `web/scripts`. */
export const WEB_DIR = join(HERE, "..");

export const SLOT = process.env.PE3_SLOT ?? "5";
export const PORT = process.env.PE3_PORT ?? String(3010 + Number(SLOT));
export const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${PORT}`;
export const STORAGE =
    process.env.PE3_STORAGE ?? join(homedir(), `.local/state/alloy-dev/auth/slot${SLOT}/storage-state.json`);

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * A URL or path, safe to print. Ids are masked anywhere in the path — they are also EMBEDDED in
 * segments (`/queue-row-<uuid>-<uuid>`), which a whole-segment rule walks straight past — and every
 * query value is dropped while the KEYS are kept, because which parameters were sent is the part
 * that carries meaning here.
 */
export function redact(value) {
    const raw = String(value ?? "");
    const [path, ...rest] = raw.replace(BASE, "").split("?");
    const safePath = path.replace(UUID, "<id>");
    if (!rest.length) return safePath;
    let keys = [];
    try {
        keys = [...new URL(raw, BASE).searchParams.keys()];
    } catch {
        /* not parseable — the path alone is enough */
    }
    return keys.length ? `${safePath}?${keys.map((k) => `${k}=<redacted>`).join("&")}` : `${safePath}?<redacted>`;
}

/** True when the storage state exists; a probe without one can only measure a logged-out shell. */
export function assertAuthState() {
    if (!existsSync(STORAGE)) {
        throw new Error(
            `no Playwright storage state at ${STORAGE} — run: alloy-agent-login ${SLOT} (PE3_STORAGE overrides)`,
        );
    }
}

/**
 * Refuse to measure a server that is not serving THIS worktree's build.
 *
 * Asserts a production build exists on disk, then asks the server for the document and checks every
 * `/_next/static` asset it references still resolves. Chunk filenames are content-addressed per
 * build, so a server started before a rebuild advertises assets the current `.next` no longer holds
 * and this throws rather than returning a measurement of code that is no longer in the tree.
 */
export async function assertFreshBuild(page, route = "/login") {
    const buildIdPath = join(WEB_DIR, ".next", "BUILD_ID");
    if (!existsSync(buildIdPath)) {
        throw new Error(`no production build at ${redact(buildIdPath)} — run: vac run build`);
    }
    const res = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    if (!res || !res.ok()) throw new Error(`${redact(route)} did not serve (status ${res ? res.status() : "none"})`);
    const assets = await page.evaluate(
        `Array.from(document.querySelectorAll('script[src^="/_next/static/"], link[href^="/_next/static/"]'))
            .map((el) => el.getAttribute("src") || el.getAttribute("href")).slice(0, 12)`,
    );
    if (!assets.length) throw new Error("served document referenced no /_next/static assets — cannot prove the build");
    const stale = [];
    for (const asset of assets) {
        const r = await page.request.get(`${BASE}${asset}`).catch(() => null);
        if (!r || !r.ok()) stale.push(redact(asset));
    }
    if (stale.length) {
        throw new Error(
            `STALE SERVER: ${stale.length}/${assets.length} served assets are absent from this worktree's build ` +
                `(${stale.slice(0, 3).join(", ")}). Restart the server on the current build before measuring.`,
        );
    }
}

/**
 * Run `fn(page, ctx)` against an authenticated page and ALWAYS release the browser.
 * Nothing is written to disk; callers print, and printing goes through `redact`.
 */
export async function withOperatorPage(fn, opts = {}) {
    assertAuthState();
    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({
            storageState: STORAGE,
            viewport: { width: 1512, height: 950 },
        });
        const page = await context.newPage();
        if (opts.assertFreshBuild !== false) await assertFreshBuild(page);
        return await fn(page, context);
    } finally {
        await browser.close().catch(() => {});
    }
}
