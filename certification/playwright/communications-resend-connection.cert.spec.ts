/**
 * Connecting an organization's own Resend account — the whole lifecycle, not the form.
 *
 * The requirement being falsified: "an organization administrator can connect
 * Resend, and Alloy tells the truth about what that did." A form that accepts a
 * key proves nothing; these assertions read what the SERVER decided.
 *
 * NOTHING HERE CAN SEND. Verification short-circuits under ALLOY_CERTIFICATION=1
 * to a synthetic key, so no request reaches api.resend.com, and the synthetic key
 * is refused outside certification so it cannot become a skeleton key.
 */
import { expect, test } from "@playwright/test";

const CONNECTION = "/api/admin/communications/provider-connection";
const BINDINGS = "/api/admin/communications/bindings";
const PAGE = "/organization/communications";

/** Mirrors `CERTIFICATION_RESEND_KEY`. Resolves to no credential at all. */
const CERT_KEY = "certification-synthetic-resend-key";

type Page = import("@playwright/test").Page;

async function connect(page: Page, apiKey: string) {
    return page.request.post(CONNECTION, {
        data: { provider: "resend", api_key: apiKey },
        failOnStatusCode: false,
    });
}

async function emailBindings(page: Page) {
    const res = await page.request.get(BINDINGS);
    const json = (await res.json()) as { bindings?: Record<string, unknown>[] };
    return (json.bindings ?? []).filter((b) => String(b.channel) === "email");
}

test.describe("R · connecting the organization's own Resend account", () => {
    test("R-1 a key this environment cannot verify is refused truthfully, and stores nothing", async ({ page }) => {
        const before = await emailBindings(page);
        const res = await connect(page, "re_definitely_not_valid");
        expect(res.status(), "an unverifiable key must not be accepted").toBe(503);
        const body = JSON.stringify(await res.json());

        // The honest reason. Certification never contacts Resend, so claiming
        // "Resend did not accept that API key" would be FALSE — that message sent
        // a director hunting for a problem with a perfectly good production key.
        expect(body).toMatch(/cannot verify real provider keys/i);
        expect(body).toMatch(/was not stored/i);
        expect(body).not.toMatch(/did not accept/i);

        // Nothing was written on the way to failing.
        const after = await emailBindings(page);
        expect(after.length).toBe(before.length);
    });

    test("R-2 a valid certification key connects", async ({ page }) => {
        const res = await connect(page, CERT_KEY);
        expect(res.ok(), `connect returned ${res.status()}`).toBe(true);
        const body = (await res.json()) as { connection?: { state?: string } };
        expect(body.connection?.state).toBe("connected");
    });

    test("R-3 the key is NEVER readable back — no GET, and nothing in the payload", async ({ page }) => {
        await connect(page, CERT_KEY);

        // There is no GET on the connection endpoint at all.
        const get = await page.request.get(CONNECTION, { failOnStatusCode: false });
        expect([404, 405]).toContain(get.status());

        // And the configuration payload never carries it.
        const res = await page.request.get(BINDINGS);
        const raw = await res.text();
        expect(raw).not.toContain(CERT_KEY);
        expect(raw).not.toContain("vault:");
        expect(raw).not.toContain("secret_ref");
    });

    test("R-4 replacement keeps the connection working", async ({ page }) => {
        await connect(page, CERT_KEY);
        const replaced = await connect(page, CERT_KEY);
        expect(replaced.ok()).toBe(true);

        // A failed replacement must not destroy the working connection.
        const failed = await connect(page, "re_not_valid_at_all");
        expect(failed.ok()).toBe(false);
        const bindings = await emailBindings(page);
        expect(bindings.some((b) => b.credential_configured === true)).toBe(true);
    });

    test("R-5 revoke disconnects, and the surface stops claiming a connection", async ({ page }) => {
        await connect(page, CERT_KEY);
        const res = await page.request.delete(`${CONNECTION}?provider=resend`, { failOnStatusCode: false });
        expect(res.ok(), `revoke returned ${res.status()}`).toBe(true);

        const bindings = await emailBindings(page);
        for (const b of bindings) {
            expect(b.credential_configured, "a revoked credential must not read as configured").toBe(false);
        }
    });

    test("R-6 connection state is independent of sending and receiving readiness", async ({ page }) => {
        await connect(page, CERT_KEY);
        const bindings = await emailBindings(page);
        const withReadiness = bindings.filter((b) => b.readiness);
        expect(withReadiness.length).toBeGreaterThan(0);
        for (const b of withReadiness) {
            const r = b.readiness as { send: { state: string }; receive: { state: string }; providerConnection: string };
            // Three separate facts. A connected account says nothing about whether a
            // sending domain is verified or a reply address exists.
            expect(typeof r.providerConnection).toBe("string");
            expect(typeof r.send.state).toBe("string");
            expect(typeof r.receive.state).toBe("string");
        }
    });
});

test.describe("R · the surface an administrator actually reads", () => {
    test("R-7 the page offers Connect Resend by name, and no infrastructure vocabulary", async ({ page }) => {
        await page.goto(PAGE);
        await expect(page.getByTestId("communications-channel-email")).toBeVisible();
        const body = await page.locator("body").innerText();

        for (const forbidden of [
            "secret_ref",
            "env:",
            "RESEND_API_KEY",
            "vault:",
            "deployment credential",
            "Ask an Alloy administrator",
            "Needs an Alloy administrator",
        ]) {
            expect(body, `${forbidden} must never appear`).not.toContain(forbidden);
        }
    });

    test("R-8 the key never appears in the DOM after submitting", async ({ page }) => {
        await page.goto(PAGE);
        await expect(page.getByTestId("communications-channel-email")).toBeVisible();
        const configure = page.getByTestId("communications-configure-email");
        const connectBtn = page.getByTestId("communications-connect-email");
        if (await configure.count()) await configure.click();
        else await connectBtn.click();

        // Asserted, not skipped. The connect step renders in BOTH modes now, and a
        // self-skip here would hide its disappearance as a pass.
        const field = page.getByTestId("communications-dialog-resend-key");
        await expect(field).toBeVisible();
        await field.fill(CERT_KEY);
        await page.getByTestId("communications-dialog-resend-connect").click();

        await expect(field).toHaveValue("");
        const html = await page.content();
        expect(html).not.toContain(CERT_KEY);
    });

    test("R-9 the hierarchy and room rules are untouched by any of this", async ({ page }) => {
        await page.goto(PAGE);
        await expect(page.getByTestId("communications-channel-email")).toBeVisible();
        const res = await page.request.get(BINDINGS);
        const json = (await res.json()) as { location_hierarchy?: { sites: { id: string; rooms: { id: string }[] }[] } };
        const sites = json.location_hierarchy?.sites ?? [];
        expect(sites.length).toBeGreaterThan(0);
        for (const site of sites) {
            for (const room of site.rooms) {
                // Rooms still carry no override control.
                await expect(page.getByTestId(`communications-email-location-${room.id}-action`)).toHaveCount(0);
            }
        }
    });
});
