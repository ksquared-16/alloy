/**
 * Reset-password write boundary — in a real browser, against the PRODUCT modules.
 *
 * What runs is the app's own code, bundled from source with the installed esbuild: the shared browser client
 * (`lib/supabaseClient`, `@supabase/ssr`), recovery-link establishment and the private writer
 * (`lib/auth/passwordRecoveryRequest`: `createRecoverySessionCache`, `recoveryWriterFactory`,
 * `updatePasswordWithCredential`) and `browserSupabaseUrl`. The only code here that is not the product's is
 * the three-line adapter `app/reset-password/page.tsx` hands to `recoveryWriterFactory`, reproduced below —
 * the page's React rendering itself is NOT exercised (it needs a running Next server).
 *
 * Wholly local: every request from the browser context is intercepted. Pages and the bundle are served from
 * memory; the auth endpoint is a recorder on a fake host; anything else is aborted and fails the test.
 * Every token and password is synthetic. Nothing reaches a provider.
 */
import { join } from "node:path";
import { build } from "esbuild";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const ORIGIN = "https://alloy.test";
const SUPA = "https://project.supabase.test";
const SHARED_CHANNEL = "sb-project-auth-token";
const PRIVATE_CHANNEL = "alloy-recovery-write-account-a";
const WEB = join(__dirname, "..", "..");

const b64u = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (sub: string) =>
    `${b64u({ alg: "none", typ: "JWT" })}.${b64u({ sub, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, session_id: `synthetic-${sub}` })}.c3ludGhldGlj`;
const TOKEN = { a: jwt("account-a"), b: jwt("account-b") };
const who = (bearer: string | null | undefined) => (bearer === TOKEN.a ? "A" : bearer === TOKEN.b ? "B" : bearer ? "OTHER" : "NONE");

/** The product modules, bundled once. `process.env` carries synthetic values only. */
let bundle = "";
test.beforeAll(async () => {
    const out = await build({
        stdin: {
            contents: `
                import { createClient as createSharedClient } from "@/lib/supabaseClient";
                import { createClient as createIsolatedClient } from "@supabase/supabase-js";
                import { browserSupabaseUrl } from "@/lib/supabase/browserTransport";
                import { createRecoverySessionCache, recoveryWriterFactory, updatePasswordWithCredential, withoutRecoveryLink } from "@/lib/auth/passwordRecoveryRequest";
                // app/reset-password/page.tsx's adapter, verbatim in shape.
                const writeClientFor = recoveryWriterFactory(
                    (supabaseUrl, anonKey, options) => {
                        const supabase = createIsolatedClient(supabaseUrl, anonKey, options);
                        return { auth: { setSession: (tokens) => supabase.auth.setSession(tokens), updateUser: (attributes) => supabase.auth.updateUser(attributes) } };
                    },
                    browserSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, window.location.origin),
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
                );
                window.__reset = { createSharedClient, createRecoverySessionCache, updatePasswordWithCredential, withoutRecoveryLink, writeClientFor };
            `,
            resolveDir: WEB,
            sourcefile: "reset-write-boundary-entry.ts",
            loader: "ts",
        },
        bundle: true,
        write: false,
        format: "iife",
        platform: "browser",
        tsconfig: join(WEB, "tsconfig.json"),
        define: {
            "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(SUPA),
            "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": JSON.stringify(`eyJ${"synthetic".repeat(12)}`),
            "process.env.NODE_ENV": JSON.stringify("test"),
        },
        banner: { js: "var process = globalThis.process || { env: {} };" },
        logLevel: "silent",
    });
    bundle = out.outputFiles[0].text;
});

type Rec = { method: string; path: string; bearer: string; refreshToken: string | null };
async function intercepted(context: BrowserContext) {
    const auth: Rec[] = [];
    const violations: string[] = [];
    const ctl = { failNextSeed: false, recording: true };
    const cors = { "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS" };
    const json = (status: number, body: object) => ({ status, contentType: "application/json", headers: cors, body: JSON.stringify(body) });
    await context.route("**/*", async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        if (url.origin === ORIGIN) {
            if (url.pathname === "/bundle.js") return route.fulfill({ status: 200, contentType: "application/javascript", body: bundle });
            return route.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><meta charset="utf-8"><script src="/bundle.js"></script>` });
        }
        if (url.origin === SUPA && url.pathname.startsWith("/auth/v1/")) {
            if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
            const bearer = (req.headers()["authorization"] || "").replace(/^Bearer /, "");
            let refreshToken: string | null = null;
            try {
                refreshToken = (JSON.parse(req.postData() || "{}") as { refresh_token?: string }).refresh_token ?? null;
            } catch {
                refreshToken = null;
            }
            auth.push({ method: req.method(), path: url.pathname, bearer: who(bearer), refreshToken });
            if (url.pathname === "/auth/v1/token") return route.fulfill(json(400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" }));
            if (url.pathname === "/auth/v1/logout") return route.fulfill({ status: 204, headers: cors });
            if (req.method() === "GET" && ctl.failNextSeed) {
                ctl.failNextSeed = false;
                return route.fulfill(json(500, { code: 500, msg: "synthetic outage" }));
            }
            const id = bearer === TOKEN.a ? "account-a" : bearer === TOKEN.b ? "account-b" : "unknown";
            return route.fulfill(json(200, { id, aud: "authenticated", role: "authenticated", email: `${id}@example.test`, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" }));
        }
        violations.push(`${req.method()} ${url.origin}${url.pathname}`);
        return route.abort("blockedbyclient");
    });
    return { auth, violations, ctl };
}

async function open(context: BrowserContext, path: string): Promise<Page> {
    const page = await context.newPage();
    await page.goto(`${ORIGIN}${path}`);
    await page.waitForFunction(() => Boolean((window as unknown as { __reset?: unknown }).__reset));
    return page;
}

async function listen(page: Page) {
    await page.evaluate(([shared, priv]) => {
        const w = window as unknown as { __msgs: Array<{ channel: string; event: string; token: string | null }> };
        w.__msgs = [];
        for (const n of [shared, priv]) new BroadcastChannel(n).onmessage = (e) => w.__msgs.push({ channel: n, event: e.data?.event ?? "?", token: e.data?.session?.access_token ?? null });
    }, [SHARED_CHANNEL, PRIVATE_CHANNEL]);
}
const heard = async (page: Page) =>
    (await page.evaluate(() => (window as unknown as { __msgs: Array<{ channel: string; event: string; token: string | null }> }).__msgs)).map((m) => ({ channel: m.channel, event: m.event, carries: who(m.token) }));

/** Open A's recovery link in the writer tab and establish through the product path. */
async function establishA(writer: Page) {
    return writer.evaluate(async () => {
        const r = (window as unknown as { __reset: Record<string, (...a: unknown[]) => unknown> }).__reset;
        const once = (r.createRecoverySessionCache as () => (a: unknown, l: unknown) => Promise<{ state: string; userId: string | null; credential: unknown }>)();
        const shared = r.createSharedClient as () => { auth: unknown };
        const est = await once(() => shared().auth, {
            href: () => window.location.href,
            clearLink: () => window.history.replaceState(null, "", (r.withoutRecoveryLink as (h: string) => string)(window.location.href)),
        });
        (window as unknown as { __credential: unknown }).__credential = est.credential;
        return { state: est.state, userId: est.userId, hasCredential: Boolean(est.credential), addressBar: window.location.href };
    });
}

/** Another tab signs the SHARED client in as B. */
async function switchSharedToB(context: BrowserContext, token: string) {
    const other = await open(context, "/workspace");
    await other.evaluate(async (tb) => {
        const r = (window as unknown as { __reset: { createSharedClient: () => { auth: { setSession: (t: object) => Promise<{ error: unknown }> } } } }).__reset;
        const { error } = await r.createSharedClient().auth.setSession({ access_token: tb, refresh_token: "synthetic-refresh-b" });
        if (error) throw new Error(String(error));
    }, token);
    return other;
}

const submit = (writer: Page, password: string, nowSeconds?: number) =>
    writer.evaluate(
        async ({ password, nowSeconds }) => {
            const w = window as unknown as { __credential: unknown; __reset: { updatePasswordWithCredential: (f: unknown, c: unknown, p: string, n?: number) => Promise<{ ok: boolean; reason?: string }>; writeClientFor: unknown } };
            const out = await w.__reset.updatePasswordWithCredential(w.__reset.writeClientFor, w.__credential, password, nowSeconds);
            return { ok: out.ok, reason: out.reason ?? null };
        },
        { password, nowSeconds },
    );

const sharedHolds = (page: Page) =>
    page.evaluate(async () => {
        const r = (window as unknown as { __reset: { createSharedClient: () => { auth: { getSession: () => Promise<{ data: { session: { user: { id: string } } | null } }> } } } }).__reset;
        return (await r.createSharedClient().auth.getSession()).data.session?.user?.id ?? null;
    });

const linkA = `/reset-password#access_token=${TOKEN.a}&refresh_token=synthetic-refresh-a&expires_in=3600&token_type=bearer&type=recovery`;

test("account switch at the write boundary: B in the shared client, the write carries only A, and the private writer broadcasts nothing", async ({ browser }) => {
    const context = await browser.newContext();
    const net = await intercepted(context);
    const observer = await open(context, "/observer");
    await listen(observer);
    const writer = await open(context, linkA);
    const est = await establishA(writer);
    expect(est).toMatchObject({ state: "ready", userId: "account-a", hasCredential: true });
    expect(est.addressBar).toBe(`${ORIGIN}/reset-password`);

    await switchSharedToB(context, TOKEN.b);
    expect(await sharedHolds(writer)).toBe("account-b");
    const before = net.auth.length;
    expect(await submit(writer, "synthetic-password-switch")).toEqual({ ok: true, reason: null });
    const writePath = net.auth.slice(before);
    await observer.waitForTimeout(250);
    const messages = await heard(observer);
    test.info().annotations.push({ type: "evidence", description: JSON.stringify({ browser: `${browser.browserType().name()} ${browser.version()}`, writePath, messages, violations: net.violations }) });

    expect(net.violations).toEqual([]);
    expect(writePath).toEqual([
        { method: "GET", path: "/auth/v1/user", bearer: "A", refreshToken: null },
        { method: "PUT", path: "/auth/v1/user", bearer: "A", refreshToken: null },
    ]);
    expect(net.auth.filter((r) => r.method === "PUT").map((r) => r.bearer)).toEqual(["A"]);
    // Positive control: the observer does hear same-origin auth broadcasts (the shared client's sign-in as B)…
    expect(messages.some((m) => m.channel === SHARED_CHANNEL && m.event === "SIGNED_IN" && m.carries === "B")).toBe(true);
    // …and heard nothing from the private writer.
    expect(messages.filter((m) => m.channel === PRIVATE_CHANNEL)).toEqual([]);
    expect(net.auth.some((r) => r.path === "/auth/v1/logout")).toBe(false);
    await context.close();
});

test("a failed seed is retried on the next submit, still as A; nothing is written on the failed attempt", async ({ browser }) => {
    const context = await browser.newContext();
    const net = await intercepted(context);
    const writer = await open(context, linkA);
    expect(await establishA(writer)).toMatchObject({ state: "ready", userId: "account-a" });
    await switchSharedToB(context, TOKEN.b);
    const before = net.auth.length;
    net.ctl.failNextSeed = true;
    expect(await submit(writer, "synthetic-password-retry")).toEqual({ ok: false, reason: "failed" });
    expect(await submit(writer, "synthetic-password-retry")).toEqual({ ok: true, reason: null });
    expect(net.violations).toEqual([]);
    expect(net.auth.slice(before).map((r) => `${r.method} ${r.bearer}`)).toEqual(["GET A", "GET A", "PUT A"]);
    expect(net.auth.some((r) => r.path === "/auth/v1/logout")).toBe(false);
    await context.close();
});

test("expiry: a credential inside the margin sends nothing; a token that lapses inside the write only offers the placeholder refresh", async ({ browser }) => {
    const context = await browser.newContext();
    const net = await intercepted(context);
    const writer = await open(context, linkA);
    expect(await establishA(writer)).toMatchObject({ state: "ready", userId: "account-a" });
    const now = Math.floor(Date.now() / 1000);

    // At submit the credential is already within the margin: refused before the writer is used.
    let before = net.auth.length;
    expect(await submit(writer, "synthetic-password-late", now + 3600 - 30)).toEqual({ ok: false, reason: "expired" });
    expect(net.auth.slice(before)).toEqual([]);

    // Seed while valid, then the token lapses inside the write (the check passed on a stale clock reading).
    expect(await submit(writer, "synthetic-password-ok")).toEqual({ ok: true, reason: null });
    await writer.clock.install({ time: Date.now() + 2 * 3600 * 1000 });
    before = net.auth.length;
    expect(await submit(writer, "synthetic-password-lapsed", now)).toEqual({ ok: false, reason: "expired" });
    const lapsed = net.auth.slice(before);
    expect(lapsed.some((r) => r.method === "PUT")).toBe(false);
    const refreshes = lapsed.filter((x) => x.path === "/auth/v1/token");
    expect(refreshes.length).toBeGreaterThan(0); // the library did try to refresh — and could only offer the placeholder
    for (const r of refreshes) expect(r.refreshToken).toBe("alloy-unrefreshable-recovery-writer");
    expect(net.auth.some((r) => r.refreshToken === "synthetic-refresh-a" && r.path === "/auth/v1/token")).toBe(false);
    expect(net.auth.some((r) => r.path === "/auth/v1/logout")).toBe(false);
    expect(net.violations).toEqual([]);
    await context.close();
});
