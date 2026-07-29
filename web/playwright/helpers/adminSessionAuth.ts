import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { Page } from "@playwright/test";

function supabaseAuthCookieName(supabaseUrl: string): string {
    const host = new URL(supabaseUrl).hostname;
    const projectRef = host.split(".")[0];
    return `sb-${projectRef}-auth-token`;
}

/**
 * Playwright admin login for live audits when PLAYWRIGHT_ADMIN_* is unset.
 * Mints a one-time magic-link session via service role (no password mutation).
 */
export async function ensureAdminPlaywrightSession(page: Page): Promise<void> {
    if (process.env.PLAYWRIGHT_STORAGE_STATE?.trim()) {
        await page.goto("/workspace", { waitUntil: "domcontentloaded", timeout: 120_000 });
        const pathname = new URL(page.url()).pathname;
        if (pathname !== "/login" && !pathname.startsWith("/unauthorized")) return;
        throw new Error(`Managed Playwright storage did not unlock workspace (landed on ${pathname})`);
    }

    const email = process.env.PLAYWRIGHT_ADMIN_EMAIL?.trim();
    const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD?.trim();
    if (email && password) {
        await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 120_000 });

        // The login inputs are CONTROLLED React fields. Filling before hydration completes lets
        // React re-render and wipe the value — the field looks typed, then silently empties, and the
        // sign-in posts blank credentials. Fill, then assert the value actually stuck, and retry.
        const emailBox = page.locator("#email");
        const passwordBox = page.locator("#password");
        await emailBox.waitFor({ state: "visible", timeout: 120_000 });

        // Settle hydration before typing at all: React replaces the DOM value on hydrate, so a value
        // that "stuck" a moment ago can still be wiped. Wait for the form to stop changing, fill,
        // confirm the value survives a beat, and re-verify immediately before submitting.
        // pressSequentially, NOT fill. `fill` sets the DOM value directly; if React has not yet
        // attached its onChange the DOM looks correct while React state stays EMPTY, and the submit
        // handler then posts blank credentials ("missing email or phone"). inputValue() reads the
        // DOM, so it cannot detect that. Real key events make React register every character.
        const typeInto = async (box: typeof emailBox, value: string) => {
            await box.click();
            await box.press("ControlOrMeta+a").catch(() => undefined);
            await box.press("Backspace").catch(() => undefined);
            await box.pressSequentially(value, { delay: 12 });
        };

        const fillAndConfirm = async (): Promise<boolean> => {
            await typeInto(emailBox, email);
            await typeInto(passwordBox, password);
            await page.waitForTimeout(500);
            const [e, p] = await Promise.all([emailBox.inputValue(), passwordBox.inputValue()]);
            return e === email && p === password;
        };

        let ready = false;
        for (let attempt = 0; attempt < 8 && !ready; attempt += 1) {
            ready = await fillAndConfirm();
            if (!ready) await page.waitForTimeout(1000);
        }
        if (!ready) throw new Error("Login form kept clearing its values (hydration race)");

        // Sign in, and wait for the AUTH RESPONSE rather than for a client-side redirect. In dev,
        // Next's Fast Refresh can rebuild mid-navigation and swallow the router.push, leaving the
        // page on /login even though the session was created successfully. Waiting on the token
        // response proves authentication; the explicit goto then lands the session.
        // Final guard: refill if anything cleared between confirmation and submit.
        if ((await emailBox.inputValue()) !== email || (await passwordBox.inputValue()) !== password) {
            await emailBox.fill(email);
            await passwordBox.fill(password);
        }

        // Retry the CLICK, not just the wait. A click landing before the submit handler is attached
        // is silently swallowed — no navigation, no request — so one click plus a long wait simply
        // hangs for the whole timeout. Short bounded attempts surface that instead of stalling.
        let authRes: Awaited<ReturnType<typeof page.waitForResponse>> | null = null;
        for (let attempt = 0; attempt < 4 && !authRes; attempt += 1) {
            if ((await emailBox.inputValue()) !== email || (await passwordBox.inputValue()) !== password) {
                await typeInto(emailBox, email);
                await typeInto(passwordBox, password);
            }
            const pending = page
                .waitForResponse(
                    (r) => r.url().includes("/auth/v1/token") && r.request().method() === "POST",
                    { timeout: 45_000 },
                )
                .catch(() => null);
            await page
                .getByRole("button", { name: /sign in/i })
                .click({ timeout: 30_000 })
                .catch(() => undefined);
            authRes = await pending;
        }
        if (!authRes) {
            throw new Error("Sign-in produced no auth request after repeated attempts (form never became interactive)");
        }
        if (authRes.status() !== 200) {
            throw new Error(`Sign-in failed ${authRes.status()}: ${(await authRes.text()).slice(0, 300)}`);
        }

        await page.goto("/workspace", { waitUntil: "domcontentloaded", timeout: 120_000 });
        const landed = new URL(page.url()).pathname;
        if (landed === "/login" || landed.startsWith("/unauthorized")) {
            throw new Error(`Authenticated session did not unlock workspace (landed on ${landed})`);
        }
        return;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
        throw new Error(
            "Need PLAYWRIGHT_ADMIN_EMAIL/PASSWORD or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
        );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const preferredOrgId = process.env.DEV_QUEUE_ORG_ID?.trim() || null;
    let rolesRes = preferredOrgId ?
        await admin
            .from("user_roles")
            .select("user_id")
            .eq("org_id", preferredOrgId)
            .in("role", ["admin", "ops"])
            .limit(1)
            .maybeSingle()
    :   { data: null, error: null };

    if (!rolesRes.data?.user_id) {
        rolesRes = await admin
            .from("user_roles")
            .select("user_id")
            .in("role", ["admin", "ops"])
            .limit(1)
            .maybeSingle();
    }

    if (rolesRes.error || !rolesRes.data?.user_id) {
        throw new Error(`Could not resolve portal admin user: ${rolesRes.error?.message ?? "no rows"}`);
    }

    const userRes = await admin.auth.admin.getUserById(rolesRes.data.user_id);
    if (userRes.error || !userRes.data.user?.email) {
        throw new Error(`Could not load auth user: ${userRes.error?.message ?? "missing email"}`);
    }
    const loginEmail = userRes.data.user.email;

    const linkRes = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: loginEmail!,
    });
    if (linkRes.error || !linkRes.data.properties?.hashed_token) {
        throw new Error(`generateLink failed: ${linkRes.error?.message ?? "no hashed_token"}`);
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
    const otpRes = await anonClient.auth.verifyOtp({
        type: "email",
        token_hash: linkRes.data.properties.hashed_token,
    });
    if (otpRes.error || !otpRes.data.session) {
        throw new Error(`verifyOtp failed: ${otpRes.error?.message ?? "no session"}`);
    }

    const session = otpRes.data.session;
    const cookieJar: Array<{ name: string; value: string }> = [];
    const serverClient = createServerClient(supabaseUrl, anonKey, {
        cookies: {
            getAll() {
                return cookieJar;
            },
            setAll(cookiesToSet) {
                for (const cookie of cookiesToSet) {
                    const idx = cookieJar.findIndex((c) => c.name === cookie.name);
                    if (!cookie.value) {
                        if (idx >= 0) cookieJar.splice(idx, 1);
                    } else if (idx >= 0) {
                        cookieJar[idx] = { name: cookie.name, value: cookie.value };
                    } else {
                        cookieJar.push({ name: cookie.name, value: cookie.value });
                    }
                }
            },
        },
    });

    const setRes = await serverClient.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
    });
    if (setRes.error) {
        throw new Error(`setSession failed: ${setRes.error.message}`);
    }

    const expectedCookie = supabaseAuthCookieName(supabaseUrl);
    if (!cookieJar.some((c) => c.name === expectedCookie || c.name.startsWith(`${expectedCookie}.`))) {
        throw new Error(`Expected Supabase auth cookie ${expectedCookie} was not written`);
    }

    await page.context().addCookies(
        cookieJar.map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
            domain: "127.0.0.1",
            path: "/",
            httpOnly: false,
            secure: false,
            sameSite: "Lax" as const,
        }))
    );

    // NOT networkidle: authenticated surfaces keep long-lived requests open (and the dept
    // queue-summaries endpoint can hang), so network-idle may never settle. The auth check
    // only needs the navigation to commit somewhere.
    await page.goto("/workspace", { waitUntil: "domcontentloaded", timeout: 120_000 });
    const pathname = new URL(page.url()).pathname;
    if (pathname === "/login" || pathname.startsWith("/unauthorized")) {
        throw new Error(`Session cookies did not unlock workspace (landed on ${pathname})`);
    }
}
