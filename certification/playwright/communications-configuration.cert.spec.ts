/**
 * Communications configuration — can an operator connect and understand a
 * channel without SQL, and does the surface refuse to lie?
 *
 * Everything here runs against production code through the real authenticated
 * routes; nothing is stubbed. The seeded certification tenant supplies the rows:
 * an ACTIVE email binding (`hello@northwind-cert.invalid`), a DISABLED one, and
 * an ACTIVE SMS binding — see `certification/inbound-sms-binding.sql`.
 *
 * WHAT THIS EVIDENCE DOES NOT COVER, stated so it is not read as more than it is:
 *
 * The certification environment deliberately holds NO provider credentials —
 * that absence is what guarantees no certification run can send anything. So the
 * SUCCESSFUL create path cannot execute here: every catalogue entry is correctly
 * unavailable, and create fails closed. That fail-closed behaviour is certified
 * below and is the more important half; the successful create is covered by unit
 * test (`bindingOperationalConfiguration.test.ts`) and requires a deployment that
 * has actually provisioned a credential.
 */
import { expect, test } from "@playwright/test";

const BINDINGS = "/api/admin/communications/bindings";
const SETTINGS = "/adminV2/settings/communications";

const ACTIVE_EMAIL = "hello@northwind-cert.invalid";
const DISABLED_EMAIL = "disabled@northwind-cert.invalid";

type Json = Record<string, unknown>;

type BindingPayload = {
    id: string;
    channel: string;
    status: string;
    inbound_address: string | null;
    receiving_domain: string | null;
    sending_domain: string | null;
    credential_key: string | null;
    credential_configured: boolean;
    readiness: {
        send: { state: string; detail: string };
        receive: { state: string; detail: string };
    };
};

async function loadBindings(page: import("@playwright/test").Page) {
    const res = await page.request.get(BINDINGS);
    expect(res.ok(), `GET ${BINDINGS} → ${res.status()}`).toBe(true);
    const body = (await res.json()) as Json;
    return {
        raw: JSON.stringify(body),
        bindings: (body.bindings ?? []) as BindingPayload[],
        credentialOptions: (body.credential_options ?? []) as Array<Json & { available: boolean }>,
    };
}

test.describe("Communications configuration", () => {
    test("the bindings payload carries no credential material of any kind", async ({ page }) => {
        const { raw, credentialOptions } = await loadBindings(page);

        // The long-standing contract: `secret_ref` is never emitted.
        expect(raw).not.toContain("secret_ref");
        expect(raw).not.toContain("secretRef");
        // Extended by the create flow: nor is the environment variable NAME, which
        // would otherwise let a client enumerate what the deployment holds.
        expect(raw).not.toContain("RESEND_API_KEY");
        expect(raw).not.toContain("TWILIO_AUTH_TOKEN");
        expect(raw).not.toContain("env:");
        expect(raw).not.toContain("legacy_global_twilio");

        // A credential is described by opaque key, label, and a presence boolean.
        expect(credentialOptions.length).toBeGreaterThan(0);
        for (const option of credentialOptions) {
            expect(typeof option.available).toBe("boolean");
            expect(Object.keys(option).sort()).toEqual(
                ["available", "channel", "description", "key", "label", "provider"].sort(),
            );
        }
    });

    test("send and receive readiness are reported separately, per binding", async ({ page }) => {
        const { bindings } = await loadBindings(page);

        const active = bindings.find((b) => b.inbound_address === ACTIVE_EMAIL);
        expect(active, `seeded binding ${ACTIVE_EMAIL} must exist`).toBeTruthy();
        expect(active!.readiness.send.state).toBe("ready");
        expect(active!.readiness.receive.state).toBe("ready");
        // The receiving domain is derived from the address, not stored separately.
        expect(active!.receiving_domain).toBe("northwind-cert.invalid");
        expect(active!.sending_domain).toBe("northwind-cert.invalid");
        // Every state carries an operator sentence, never a bare status.
        expect(active!.readiness.receive.detail).toContain(ACTIVE_EMAIL);

        const disabled = bindings.find((b) => b.inbound_address === DISABLED_EMAIL);
        expect(disabled, `seeded binding ${DISABLED_EMAIL} must exist`).toBeTruthy();
        expect(disabled!.readiness.send.state).toBe("disabled");
        expect(disabled!.readiness.receive.state).toBe("disabled");

        // No binding is ever described by one combined verdict.
        for (const b of bindings) {
            expect(b.readiness.send.state).toBeTruthy();
            expect(b.readiness.receive.state).toBeTruthy();
            expect(b.readiness.send.detail.trim().length).toBeGreaterThan(0);
            expect(b.readiness.receive.detail.trim().length).toBeGreaterThan(0);
        }
    });

    test("create fails closed when the deployment has provisioned no credential", async ({ page }) => {
        const { credentialOptions } = await loadBindings(page);
        // The certification environment holds no provider credentials by design.
        expect(credentialOptions.every((o) => !o.available)).toBe(true);

        const res = await page.request.post(BINDINGS, {
            data: {
                channel: "email",
                credential_key: "resend_deployment_key",
                inbound_address: "brand-new@northwind-cert.invalid",
            },
            failOnStatusCode: false,
        });

        // Configuration must not be able to claim a readiness the runtime cannot
        // honour — a row bound to a credential that does not exist would look
        // connected and fail at send time.
        expect(res.status()).toBe(400);
        const body = (await res.json()) as Json;
        expect(String(body.error)).toMatch(/not provisioned/i);

        // And nothing was written.
        const after = await loadBindings(page);
        expect(after.bindings.some((b) => b.inbound_address === "brand-new@northwind-cert.invalid")).toBe(false);
    });

    test("an arbitrary environment variable is not a selectable credential", async ({ page }) => {
        for (const key of ["env:SUPABASE_SERVICE_ROLE_KEY", "env:DATABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
            const res = await page.request.post(BINDINGS, {
                data: { channel: "email", credential_key: key },
                failOnStatusCode: false,
            });
            expect(res.status(), `credential_key=${key}`).toBe(400);
            const body = (await res.json()) as Json;
            // Refused as unknown — the route never probes the name, so it cannot
            // be used to discover what the deployment holds.
            expect(String(body.error)).toMatch(/provisioned for this deployment/i);
        }
    });

    test("a request carrying an API key is refused, and the value is never echoed", async ({ page }) => {
        const planted = "re_certification_planted_value";
        for (const field of ["api_key", "secret", "secret_ref", "auth_token", "token"]) {
            const res = await page.request.post(BINDINGS, {
                data: { channel: "email", credential_key: "resend_deployment_key", [field]: planted },
                failOnStatusCode: false,
            });
            expect(res.status(), `field ${field}`).toBe(400);
            const text = await res.text();
            expect(text).not.toContain(planted);
            expect(text).toMatch(/provisioned by the deployment/i);
        }
    });

    test("a receiving-address collision is refused without naming the other channel's owner", async ({ page }) => {
        const { bindings } = await loadBindings(page);
        const disabled = bindings.find((b) => b.inbound_address === DISABLED_EMAIL);
        expect(disabled).toBeTruthy();

        // Claim an address another binding already owns. The unique index is
        // global — (provider, channel, lower(inbound_address)) has no org_id — so
        // in production the loser of this race is frequently another tenant.
        const res = await page.request.patch(`${BINDINGS}/${disabled!.id}`, {
            data: { inbound_address: ACTIVE_EMAIL },
            failOnStatusCode: false,
        });

        expect(res.status()).toBe(409);
        const text = await res.text();
        expect(text).toContain("This receiving address is already connected to another Communications channel.");
        // Nothing about the holder, and nothing from Postgres.
        expect(text).not.toContain("communication_bindings_inbound_address_uq");
        expect(text).not.toContain("duplicate key");
        expect(text).not.toContain(ACTIVE_EMAIL);

        // The rejected write left the environment exactly as it was.
        const after = await loadBindings(page);
        const stillDisabled = after.bindings.find((b) => b.id === disabled!.id);
        expect(stillDisabled?.inbound_address).toBe(DISABLED_EMAIL);
        expect(stillDisabled?.status).toBe("disabled");
    });

    test("a From address with a display name is refused before it can break threading", async ({ page }) => {
        const { bindings } = await loadBindings(page);
        const active = bindings.find((b) => b.inbound_address === ACTIVE_EMAIL);
        expect(active).toBeTruthy();

        const res = await page.request.patch(`${BINDINGS}/${active!.id}`, {
            data: { from_email: `Northwind Front Desk <${ACTIVE_EMAIL}>` },
            failOnStatusCode: false,
        });

        // The same value mints <alloy.{id}@{domain}>; a display-name form yields a
        // Message-ID inbound correlation cannot match.
        expect(res.status()).toBe(400);
        expect(await res.text()).toMatch(/without a display name/i);

        const after = await loadBindings(page);
        expect(after.bindings.find((b) => b.id === active!.id)?.sending_domain).toBe("northwind-cert.invalid");
    });

    test("the operator sees both directions on the settings page itself", async ({ page }) => {
        await page.goto(SETTINGS);
        await expect(page.getByRole("heading", { name: /channel readiness/i })).toBeVisible();

        // Both directions rendered, for a real seeded channel — not one verdict.
        await expect(page.getByText(/^Send$/i).first()).toBeVisible();
        await expect(page.getByText(/^Receive$/i).first()).toBeVisible();

        // The create affordance exists — the gap this milestone closed.
        await expect(page.getByRole("button", { name: /connect a channel/i }).first()).toBeVisible();

        // The page states the credential rule rather than asking for a key.
        await expect(page.getByText(/never asks for, accepts, or displays an API key/i)).toBeVisible();
        await expect(page.locator('input[type="password"]')).toHaveCount(0);
    });
});
