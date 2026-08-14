/**
 * Organization Communications — can an administrator configure the channels Alloy
 * actually uses, from `/organization/communications`, without meeting a provider
 * binding or a secret?
 *
 * Everything runs against production code through the real authenticated routes
 * and the real page; nothing is stubbed. The seeded certification tenant supplies
 * the rows: an ACTIVE email channel (`hello@northwind-cert.invalid`), a DISABLED
 * one, and an ACTIVE SMS channel — see `certification/inbound-sms-binding.sql`.
 *
 * WHAT THIS EVIDENCE DOES NOT COVER, stated so it is not read as more than it is:
 *
 * The certification environment deliberately holds NO provider credentials — that
 * absence is what guarantees no certification run can send anything. So the
 * SUCCESSFUL connect path cannot execute here: every catalogue entry is correctly
 * unavailable and connect fails closed. That fail-closed behaviour is certified
 * below and is the more important half; the successful connect is covered by unit
 * test and requires a deployment that has actually provisioned a credential.
 */
import { expect, test } from "@playwright/test";

const BINDINGS = "/api/admin/communications/bindings";
const PAGE = "/organization/communications";
const LEGACY_SETTINGS = "/settings/communications";
const LEGACY_ADMINV2 = "/adminV2/settings/communications";

const ACTIVE_EMAIL = "hello@northwind-cert.invalid";
const DISABLED_EMAIL = "disabled@northwind-cert.invalid";
const CERT_NUMBER = "+15550001111";

type Json = Record<string, unknown>;

type BindingPayload = {
    id: string;
    channel: string;
    status: string;
    inbound_address: string | null;
    inbound_to_e164?: string | null;
    receiving_domain: string | null;
    sending_domain: string | null;
    credential_key: string | null;
    credential_configured: boolean;
    readiness: { send: { state: string; detail: string }; receive: { state: string; detail: string } };
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

test.describe("Organization Communications — IA and convergence", () => {
    test("the canonical surface is /organization/communications", async ({ page }) => {
        await page.goto(PAGE);
        await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
        await expect(page.getByTestId("organization-communications-page")).toBeVisible();
        await expect(page.getByRole("heading", { name: "Communications", exact: true })).toBeVisible();
    });

    test("both legacy settings paths redirect here — one surface, not two", async ({ page }) => {
        for (const legacy of [LEGACY_SETTINGS, LEGACY_ADMINV2]) {
            await page.goto(legacy);
            await expect(page, `${legacy} must converge`).toHaveURL(new RegExp(`${PAGE}$`));
            await expect(page.getByTestId("organization-communications-page")).toBeVisible();
        }
    });

    test("the page matches the Organization experience", async ({ page }) => {
        await page.goto(PAGE);
        // Same chrome as every other /organization/* domain page.
        await expect(page.getByTestId("organization-communications-context")).toBeVisible();
        await expect(page.getByTestId("organization-communications-context-eyebrow")).toHaveText("Organization");
        await expect(page.getByTestId("organization-communications-summary")).toBeVisible();
    });
});

test.describe("Organization Communications — the five questions", () => {
    test("Q1 what is connected — both channels are accounted for", async ({ page }) => {
        await page.goto(PAGE);
        await expect(page.getByTestId("communications-channel-email")).toBeVisible();
        await expect(page.getByTestId("communications-channel-sms")).toBeVisible();
        await expect(page.getByTestId("communications-channel-email-provider")).toHaveText("Resend");
        await expect(page.getByTestId("communications-channel-sms-provider")).toHaveText("Twilio");
    });

    test("Q2 what identity Alloy sends and receives as", async ({ page }) => {
        await page.goto(PAGE);
        // The identity list was folded INTO the Sending and Receiving rows: showing
        // an address twice, once as a value and once as a readiness detail, made the
        // card longer without answering anything the rows do not.
        await expect(page.getByTestId("communications-email-sending-value")).toHaveText(ACTIVE_EMAIL);
        await expect(page.getByTestId("communications-email-receiving-value")).toHaveText(ACTIVE_EMAIL);
        await expect(page.getByTestId("communications-sms-sending-value")).toHaveText(CERT_NUMBER);
    });

    test("Q3 and Q4 sending and receiving are separate, visible answers", async ({ page }) => {
        await page.goto(PAGE);
        await expect(page.getByTestId("communications-email-sending-state")).toHaveText("Ready");
        await expect(page.getByTestId("communications-email-receiving-state")).toHaveText("Ready");
        await expect(page.getByTestId("communications-sms-sending-state")).toHaveText("Ready");
        await expect(page.getByTestId("communications-sms-receiving-state")).toHaveText("Ready");
    });

    test("the page never speaks storage vocabulary", async ({ page }) => {
        await page.goto(PAGE);
        await expect(page.getByTestId("organization-communications-page")).toBeVisible();
        const text = (await page.locator("body").innerText()).toLowerCase();
        for (const term of ["secret_ref", "scope", "composer", "binding", "_uq", "unconfigured", "pending_verification"]) {
            expect(text, `page must not say "${term}"`).not.toContain(term);
        }
    });
});

test.describe("Organization Communications — secrets never surface", () => {
    test("no provider secret appears in the API payload", async ({ page }) => {
        const { raw, credentialOptions } = await loadBindings(page);
        expect(raw).not.toContain("secret_ref");
        expect(raw).not.toContain("secretRef");
        expect(raw).not.toContain("RESEND_API_KEY");
        expect(raw).not.toContain("TWILIO_AUTH_TOKEN");
        expect(raw).not.toContain("env:");
        expect(raw).not.toContain("legacy_global_twilio");

        expect(credentialOptions.length).toBeGreaterThan(0);
        for (const option of credentialOptions) {
            expect(typeof option.available).toBe("boolean");
            expect(Object.keys(option).sort()).toEqual(
                ["available", "channel", "description", "externalSendCapable", "key", "label", "provider"].sort(),
            );
        }
    });

    test("no provider secret appears in the DOM, and no key can be typed", async ({ page }) => {
        await page.goto(PAGE);
        await expect(page.getByTestId("organization-communications-page")).toBeVisible();

        const html = await page.content();
        for (const term of ["secret_ref", "RESEND_API_KEY", "TWILIO_AUTH_TOKEN", "env:", "legacy_global_twilio"]) {
            expect(html, `DOM must not contain "${term}"`).not.toContain(term);
        }
        // A credential cannot be entered from the CARD. It has exactly one home —
        // the connect step inside the dialog — and this used to assert that no such
        // field existed anywhere, which was right while a credential could only be
        // provisioned by an Alloy employee. Self-service changes where the field
        // lives, not whether the secret can be read back.
        await expect(page.locator('input[type="password"]')).toHaveCount(0);

        await page.getByTestId("communications-configure-email").click();
        await expect(page.getByTestId("communications-channel-dialog")).toBeVisible();
        // Exactly one, masked, and empty — never pre-filled from stored state.
        const keyField = page.getByTestId("communications-dialog-resend-key");
        await expect(keyField).toBeVisible();
        await expect(keyField).toHaveAttribute("type", "password");
        await expect(keyField).toHaveValue("");
        const dialogHtml = await page.content();
        for (const term of ["secret_ref", "RESEND_API_KEY", "env:"]) {
            expect(dialogHtml, `dialog must not contain "${term}"`).not.toContain(term);
        }
    });
});

test.describe("Organization Communications — configure", () => {
    test("the From identity can be edited from the page, and the card updates", async ({ page }) => {
        const { bindings } = await loadBindings(page);
        const bindingId = bindings.find((b) => b.inbound_address === ACTIVE_EMAIL)!.id;

        await page.goto(PAGE);
        await page.getByTestId("communications-configure-email").click();
        await expect(page.getByTestId("communications-channel-dialog")).toBeVisible();

        const next = "cert-from@northwind-cert.invalid";
        try {
            await page.getByTestId("communications-dialog-edit-from").fill(next);
            await page.getByTestId("communications-dialog-submit").click();

            await expect(page.getByTestId("communications-channel-dialog")).toBeHidden();
            await expect(page.getByTestId("communications-email-sending-value")).toHaveText(next);
        } finally {
            // Restore UNCONDITIONALLY. This spec mutates shared fixture state, and an
            // assertion failure between the edit and the restore would otherwise leave
            // the tenant dirty — poisoning the identity assertions of the NEXT run,
            // which is exactly how this suite failed once already.
            const restore = await page.request.patch(`${BINDINGS}/${bindingId}`, {
                data: { from_email: ACTIVE_EMAIL },
                failOnStatusCode: false,
            });
            expect(restore.ok(), "fixture restore must succeed").toBe(true);
        }
    });

    /**
     * The SMS card sits in the right-hand column, which is where a bottom-right
     * floating assistant lives, so at certification viewports it overlaps the
     * Configure control.
     *
     * This is NOT the old workaround. That one hid a real defect — a dialog whose
     * own Close button was unreachable, since fixed by portaling the dialog above
     * the assistant. This closes the assistant because a floating window occupies
     * space and moving it is the operator's ordinary remedy; forcing zero overlap
     * is what produced the pinned-like layout regression that had to be reverted.
     *
     * Open question for the Director, reported rather than papered over: whether
     * the assistant's DEFAULT placement should avoid the primary content column.
     * That is a BOS product decision, not a Communications one.
     */
    async function moveAssistantAside(page: import("@playwright/test").Page) {
        await page.evaluate(() => {
            document.documentElement.setAttribute("data-bos-presentation", "closed");
        });
    }

    test("enable and disable moves the readiness answer, both directions at once", async ({ page }) => {
        const { bindings } = await loadBindings(page);
        const smsId = bindings.find((b) => (b.inbound_to_e164 ?? null) === CERT_NUMBER)!.id;

        await page.goto(PAGE);
        await moveAssistantAside(page);
        try {
            await page.getByTestId("communications-configure-sms").click();
            await page.getByTestId("communications-dialog-enabled").uncheck();
            await page.getByTestId("communications-dialog-submit").click();

            // One switch moves BOTH answers — the point of reporting them separately
            // is that they can also move together when the cause is shared.
            await expect(page.getByTestId("communications-sms-sending-state")).toHaveText("Disabled");
            await expect(page.getByTestId("communications-sms-receiving-state")).toHaveText("Disabled");
        } finally {
            // Restore unconditionally — a half-finished run must not leave the
            // tenant's SMS channel switched off for the next spec.
            const restore = await page.request.patch(`${BINDINGS}/${smsId}`, {
                data: { status: "active" },
                failOnStatusCode: false,
            });
            expect(restore.ok(), "fixture restore must succeed").toBe(true);
        }

        await page.goto(PAGE);
        await expect(page.getByTestId("communications-sms-sending-state")).toHaveText("Ready");
    });

    test("a duplicate receiving identity is refused safely, in the operator's words", async ({ page }) => {
        await page.goto(PAGE);
        const { bindings } = await loadBindings(page);
        const disabled = bindings.find((b) => b.inbound_address === DISABLED_EMAIL);
        expect(disabled).toBeTruthy();

        await page.getByTestId("communications-configure-email").click();
        await page.getByTestId("communications-dialog-which").selectOption(disabled!.id);
        await page.getByTestId("communications-dialog-edit-inbound").fill(ACTIVE_EMAIL);
        await page.getByTestId("communications-dialog-submit").click();

        const error = page.getByTestId("communications-dialog-error");
        await expect(error).toBeVisible();
        await expect(error).toHaveText("This receiving address is already connected to another Communications channel.");
        // Nothing about the holder, nothing from Postgres.
        const errorText = await error.innerText();
        expect(errorText).not.toContain("communication_bindings_inbound_address_uq");
        expect(errorText).not.toContain("duplicate key");
        expect(errorText).not.toContain(ACTIVE_EMAIL);
    });
});

test.describe("Organization Communications — connect fails closed", () => {
    test("connect refuses a credential the deployment has not provisioned", async ({ page }) => {
        const { credentialOptions } = await loadBindings(page);
        // No REAL provider credential is available — the certification environment
        // deliberately holds none, and that absence is what guarantees no run can
        // send. The certification-only synthetic credential IS available and is
        // excluded here deliberately: it exists so the SUCCESSFUL connect path can
        // be certified (see communications-location-identity.cert.spec.ts) and it
        // cannot authenticate to any provider.
        const deploymentCredentials = credentialOptions.filter(
            (o) => !String(o.key).startsWith("certification_"),
        );
        expect(deploymentCredentials.length).toBeGreaterThan(0);
        expect(deploymentCredentials.every((o) => !o.available)).toBe(true);

        const res = await page.request.post(BINDINGS, {
            data: {
                channel: "email",
                credential_key: "resend_deployment_key",
                inbound_address: "brand-new@northwind-cert.invalid",
            },
            failOnStatusCode: false,
        });
        expect(res.status()).toBe(400);
        expect(String(((await res.json()) as Json).error)).toMatch(/not provisioned/i);

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
            expect(String(((await res.json()) as Json).error)).toMatch(/provisioned for this deployment/i);
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
});

test.describe("Organization Communications — tenant ownership of receiving identities", () => {
    test("an SMS receiving number cannot be claimed twice", async ({ page }) => {
        const { bindings } = await loadBindings(page);
        const email = bindings.find((b) => b.inbound_address === DISABLED_EMAIL);
        expect(email).toBeTruthy();

        // The certification tenant owns exactly one SMS destination, so the
        // collision is proven by trying to create a second claim on it. The index
        // is global, so in production the loser is frequently another tenant.
        const res = await page.request.post(BINDINGS, {
            data: {
                channel: "sms",
                credential_key: "twilio_deployment_token",
                inbound_to_e164: CERT_NUMBER,
            },
            failOnStatusCode: false,
        });

        // Credentials are absent in certification, so this is refused before it
        // reaches the constraint. Either refusal is a pass — what must never
        // happen is a second binding claiming the number.
        expect([400, 409]).toContain(res.status());
        const after = await loadBindings(page);
        const claims = after.bindings.filter((b) => (b.inbound_to_e164 ?? null) === CERT_NUMBER);
        expect(claims.length, "exactly one binding may claim a receiving number").toBe(1);
    });

    test("a From address with a display name is refused before it can break threading", async ({ page }) => {
        const { bindings } = await loadBindings(page);
        const active = bindings.find((b) => b.inbound_address === ACTIVE_EMAIL);
        expect(active).toBeTruthy();

        const res = await page.request.patch(`${BINDINGS}/${active!.id}`, {
            data: { from_email: `Northwind Front Desk <${ACTIVE_EMAIL}>` },
            failOnStatusCode: false,
        });
        expect(res.status()).toBe(400);
        expect(await res.text()).toMatch(/without a display name/i);
    });
});

test.describe("Organization Communications — the operator runtime still works", () => {
    test("Command Center still resolves the configured channels for sending", async ({ page }) => {
        // The configuration surface changed; the send path must not have. This
        // reads the same endpoint the composer uses to decide which channels it
        // may offer, so a regression in the config route would surface here.
        const res = await page.request.get(BINDINGS);
        expect(res.ok()).toBe(true);
        const body = (await res.json()) as Json;
        const channels = (body.channels_available ?? []) as string[];
        expect(channels).toContain("email");
        expect(channels).toContain("sms");

        const selectable = body.selectable_by_channel as Record<string, unknown[]>;
        expect(selectable.email.length).toBeGreaterThan(0);
        expect(selectable.sms.length).toBeGreaterThan(0);
    });
});
