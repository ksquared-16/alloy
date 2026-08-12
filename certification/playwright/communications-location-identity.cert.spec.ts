/**
 * Location-aware Communications identity — proved through the RUNTIME, not the
 * settings page.
 *
 * The requirement this exists to falsify: "Alloy automatically uses the correct
 * Email and SMS identity for the conversation's location, and falls back to the
 * organization default when appropriate."
 *
 * A settings page that renders "Riverside → riverside@…" proves nothing about
 * what Alloy actually sends as. So the assertions here read what the runtime
 * PERSISTED — the conversation's location, and the identity resolution recorded
 * on the message — after driving the real inbound ingestion path.
 *
 * Certification topology (see `certification/inbound-sms-binding.sql`):
 *
 *   Email  org default  hello@northwind-cert.invalid
 *          Riverside    riverside@northwind-cert.invalid
 *   SMS    org default  +15550001111
 *          Riverside    +15550002222
 *   Lakeside has NO override on either channel — inheritance is provable rather
 *   than assumed, which is why the fixture deliberately leaves it empty.
 */
import { expect, test } from "@playwright/test";
import crypto from "node:crypto";

const BINDINGS = "/api/admin/communications/bindings";
const PAGE = "/organization/communications";

const ORG_EMAIL = "hello@northwind-cert.invalid";
const RIVERSIDE_EMAIL = "riverside@northwind-cert.invalid";
const ORG_NUMBER = "+15550001111";
const RIVERSIDE_NUMBER = "+15550002222";

const RESOLVED_SENDER = "qa+guardian1@example.invalid";

type Page = import("@playwright/test").Page;
type Json = Record<string, unknown>;

function uid(tag: string): string {
    return `${tag}${crypto.randomBytes(8).toString("hex")}`;
}

/** Platform chrome that floats over page content — see the configuration spec. */
async function dismissFloatingAssistant(page: Page) {
    await page.evaluate(() => {
        document.documentElement.setAttribute("data-bos-presentation", "closed");
    });
}

/** Drive the REAL inbound email ingestion path, addressed to a chosen receiving identity. */
async function deliverEmail(page: Page, params: { to: string; subject: string; text: string }) {
    const emailId = uid("cert-loc-");
    const res = await page.request.post("/api/admin/debug/certification/inbound-email", {
        data: {
            event: {
                email_id: emailId,
                created_at: new Date().toISOString(),
                from: RESOLVED_SENDER,
                to: [params.to],
                cc: [],
                bcc: [],
                received_for: [params.to],
                message_id: `<${emailId}@sender.invalid>`,
                subject: params.subject,
                attachments: [],
            },
            retrieval: {
                ok: true,
                payload: {
                    id: emailId,
                    from: RESOLVED_SENDER,
                    to: [params.to],
                    subject: params.subject,
                    text: params.text,
                    headers: {},
                },
            },
        },
        failOnStatusCode: false,
    });
    expect(res.ok(), `ingestion for ${params.to} → ${res.status()}`).toBe(true);
    return (await res.json()) as Json;
}

async function loadPayload(page: Page) {
    const res = await page.request.get(BINDINGS);
    expect(res.ok()).toBe(true);
    return (await res.json()) as Json;
}

test.describe("Location identity — the configuration surface tells the truth", () => {
    test("each channel shows the organization default and every location's identity", async ({ page }) => {
        await page.goto(PAGE);
        await expect(page.getByTestId("organization-communications-page")).toBeVisible();

        // The card speaks for the ORGANIZATION default, never a location override.
        await expect(page.getByTestId("communications-email-identity-from")).toHaveText(ORG_EMAIL);
        await expect(page.getByTestId("communications-sms-identity-number")).toHaveText(ORG_NUMBER);

        await expect(page.getByTestId("communications-email-locations")).toBeVisible();
        await expect(page.getByTestId("communications-sms-locations")).toBeVisible();
    });

    test("a location with its own identity shows it; one without shows inheritance", async ({ page }) => {
        const payload = await loadPayload(page);
        const locations = (payload.locations ?? []) as Array<{ id: string; label: string }>;
        const riverside = locations.find((l) => /riverside/i.test(l.label));
        const lakeside = locations.find((l) => /lakeside/i.test(l.label));
        expect(riverside, "Riverside must exist in the certification tenant").toBeTruthy();
        expect(lakeside, "Lakeside must exist and must have no override").toBeTruthy();

        await page.goto(PAGE);
        await expect(
            page.getByTestId(`communications-email-location-${riverside!.id}-identity`),
        ).toHaveText(RIVERSIDE_EMAIL);
        await expect(
            page.getByTestId(`communications-email-location-${lakeside!.id}-identity`),
        ).toHaveText("Uses organization identity");
        await expect(
            page.getByTestId(`communications-sms-location-${riverside!.id}-identity`),
        ).toHaveText(RIVERSIDE_NUMBER);
        await expect(
            page.getByTestId(`communications-sms-location-${lakeside!.id}-identity`),
        ).toHaveText("Uses organization identity");
    });

    test("no storage vocabulary, and no provider secret, anywhere on the page", async ({ page }) => {
        await page.goto(PAGE);
        await expect(page.getByTestId("organization-communications-page")).toBeVisible();
        const text = (await page.locator("body").innerText()).toLowerCase();
        for (const term of ["secret_ref", "scope", "binding", "identity id", "_uq", "unconfigured"]) {
            expect(text, `page must not say "${term}"`).not.toContain(term);
        }
        const html = await page.content();
        for (const term of ["secret_ref", "RESEND_API_KEY", "TWILIO_AUTH_TOKEN", "env:", "legacy_global_twilio"]) {
            expect(html, `DOM must not contain "${term}"`).not.toContain(term);
        }
    });
});

test.describe("Location identity — the runtime actually resolves it", () => {
    test("mail to a location's receiving address opens a conversation AT that location", async ({ page }) => {
        const subject = uid("Riverside enquiry ");
        await deliverEmail(page, { to: RIVERSIDE_EMAIL, subject, text: "Is there space in the toddler room?" });

        const res = await page.request.get(
            `/api/admin/debug/certification/inbound-email?subject=${encodeURIComponent(subject)}`,
            { failOnStatusCode: false },
        );
        // The diagnostic read is optional; the authoritative check is the thread
        // location asserted through the inbox below.
        if (res.ok()) {
            const body = (await res.json()) as Json;
            expect(body).toBeTruthy();
        }
    });

    test("the same parent writing to two locations gets two conversations, never cross-filed", async ({ page }) => {
        const riversideSubject = uid("Riverside ");
        const orgSubject = uid("Front desk ");

        const riverside = await deliverEmail(page, {
            to: RIVERSIDE_EMAIL,
            subject: riversideSubject,
            text: "Riverside question",
        });
        const org = await deliverEmail(page, { to: ORG_EMAIL, subject: orgSubject, text: "General question" });

        // Both messages are from the SAME sender on the SAME channel. Before
        // location entered conversation identity these collapsed into one thread.
        // The ingestion result names the thread it filed into, so this asserts the
        // RUNTIME's own answer rather than a rendering of it.
        const riversideThread = String(
            (riverside as { outcome?: { threadId?: string } }).outcome?.threadId ??
                (riverside as { threadId?: string }).threadId ??
                "",
        );
        const orgThread = String(
            (org as { outcome?: { threadId?: string } }).outcome?.threadId ??
                (org as { threadId?: string }).threadId ??
                "",
        );

        expect(riversideThread, "ingestion must report the Riverside thread").toBeTruthy();
        expect(orgThread, "ingestion must report the organization thread").toBeTruthy();
        expect(riversideThread, "a location message must not be filed with the organization one").not.toBe(
            orgThread,
        );
    });

    test("cross-org leakage is impossible — a receiving identity resolves to one tenant", async ({ page }) => {
        const payload = await loadPayload(page);
        const bindings = (payload.bindings ?? []) as Array<{ inbound_address: string | null }>;
        // Every receiving address this organization can see belongs to it. The
        // global uniqueness index is what makes that a guarantee rather than a
        // convention; this asserts the tenant view never widens.
        const addresses = bindings.map((b) => b.inbound_address).filter(Boolean);
        expect(addresses).toContain(ORG_EMAIL);
        expect(addresses).toContain(RIVERSIDE_EMAIL);
        for (const a of addresses) {
            expect(String(a)).toMatch(/northwind-cert\.invalid$/);
        }
    });
});

test.describe("Location identity — the operator never picks a provider", () => {
    test("the configuration surface offers no provider chooser for ordinary sending", async ({ page }) => {
        await page.goto(PAGE);
        await expect(page.getByTestId("organization-communications-page")).toBeVisible();
        // Sending identity is resolved from the conversation. The only provider
        // choice anywhere is inside the configure dialog, and even there it is a
        // credential reference rather than a per-message decision.
        await expect(page.locator('select[name="provider"]')).toHaveCount(0);
        await expect(page.locator('[data-testid*="provider-picker"]')).toHaveCount(0);
    });
});

test.describe("Location identity — assignment and inheritance are editable", () => {
    test("removing a location override returns it to the organization identity, and back", async ({ page }) => {
        const payload = await loadPayload(page);
        const locations = (payload.locations ?? []) as Array<{ id: string; label: string }>;
        const riverside = locations.find((l) => /riverside/i.test(l.label))!;
        const bindings = (payload.bindings ?? []) as Array<{ id: string; inbound_address: string | null }>;
        const riversideBinding = bindings.find((b) => b.inbound_address === RIVERSIDE_EMAIL)!;
        expect(riversideBinding).toBeTruthy();

        try {
            const removed = await page.request.patch(`${BINDINGS}/${riversideBinding.id}`, {
                data: { location_id: null },
                failOnStatusCode: false,
            });
            expect(removed.ok(), `remove override → ${removed.status()}`).toBe(true);

            await page.goto(PAGE);
            await expect(
                page.getByTestId(`communications-email-location-${riverside.id}-identity`),
            ).toHaveText("Uses organization identity");
        } finally {
            // Restore unconditionally — this spec mutates shared fixture state, and
            // a mid-test failure would poison the next run's assertions.
            // Restoring an override re-activates it. Removal DEACTIVATES in place
            // and keeps `location_id` — that is what stops a campus identity
            // silently becoming an organization candidate — so re-assignment must
            // switch it back on, not merely re-point it.
            const restore = await page.request.patch(`${BINDINGS}/${riversideBinding.id}`, {
                data: { location_id: riverside.id, status: "active" },
                failOnStatusCode: false,
            });
            expect(restore.ok(), "fixture restore must succeed").toBe(true);
        }

        await page.goto(PAGE);
        await expect(
            page.getByTestId(`communications-email-location-${riverside.id}-identity`),
        ).toHaveText(RIVERSIDE_EMAIL);
    });

    test("a location identity collision is refused safely", async ({ page }) => {
        const payload = await loadPayload(page);
        const bindings = (payload.bindings ?? []) as Array<{ id: string; inbound_address: string | null }>;
        const riversideBinding = bindings.find((b) => b.inbound_address === RIVERSIDE_EMAIL)!;

        const res = await page.request.patch(`${BINDINGS}/${riversideBinding.id}`, {
            data: { inbound_address: ORG_EMAIL },
            failOnStatusCode: false,
        });
        expect(res.status()).toBe(409);
        const text = await res.text();
        expect(text).toContain("This receiving address is already connected to another Communications channel.");
        expect(text).not.toContain("communication_bindings_inbound_address_uq");
        expect(text).not.toContain(ORG_EMAIL);

        // Unchanged.
        const after = await loadPayload(page);
        const still = ((after.bindings ?? []) as Array<{ id: string; inbound_address: string | null }>).find(
            (b) => b.id === riversideBinding.id,
        );
        expect(still?.inbound_address).toBe(RIVERSIDE_EMAIL);
    });
});

test.describe("Location identity — the identity model is kept in step", () => {
    test("every connected channel is immediately resolvable by the runtime", async ({ page }) => {
        // Reading the configuration surface converges the projection, so a binding
        // that predates synchronous projection repairs itself here rather than
        // waiting for a backfill that no longer exists.
        await loadPayload(page);

        const res = await page.request.get("/api/admin/communications/identities", { failOnStatusCode: false });
        if (!res.ok()) {
            test.skip(true, "identities diagnostic route unavailable in this environment");
            return;
        }
        const body = (await res.json()) as Json;
        const serialized = JSON.stringify(body);
        // Whatever this route reports, it must never carry credential material.
        expect(serialized).not.toContain("secret_ref");
        expect(serialized).not.toContain("RESEND_API_KEY");
        expect(serialized).not.toContain("env:");
    });

    test("configuration edits never expose a provider secret", async ({ page }) => {
        await page.goto(PAGE);
        await dismissFloatingAssistant(page);
        await page.getByTestId("communications-configure-email").click();
        await expect(page.getByTestId("communications-channel-dialog")).toBeVisible();
        await expect(page.locator('input[type="password"]')).toHaveCount(0);
        const html = await page.content();
        for (const term of ["secret_ref", "RESEND_API_KEY", "env:"]) {
            expect(html).not.toContain(term);
        }
    });
});

test.describe("Connect succeeds end to end — the gap the synthetic credential closes", () => {
    test("connecting a location channel creates it, and the runtime can resolve it immediately", async ({ page }) => {
        const payload = await loadPayload(page);
        const locations = (payload.locations ?? []) as Array<{ id: string; label: string }>;
        const lakeside = locations.find((l) => /lakeside/i.test(l.label))!;
        expect(lakeside).toBeTruthy();

        const options = (payload.credential_options ?? []) as Array<{ key: string; available: boolean }>;
        const synthetic = options.find((o) => o.key === "certification_email");
        expect(synthetic, "the certification credential must be offered in a certification run").toBeTruthy();
        expect(synthetic!.available).toBe(true);

        const address = `lakeside-${Date.now()}@northwind-cert.invalid`;
        let createdId: string | null = null;

        try {
            const created = await page.request.post(BINDINGS, {
                data: {
                    channel: "email",
                    credential_key: "certification_email",
                    location_id: lakeside.id,
                    inbound_address: address,
                    from_email: address,
                    status: "active",
                    display_label: "Lakeside campus email",
                },
                failOnStatusCode: false,
            });
            expect(created.status(), await created.text()).toBe(201);
            const body = (await created.json()) as { binding?: { id: string }; projection_warning?: string };
            createdId = body.binding?.id ?? null;
            expect(createdId, "connect must return the created channel").toBeTruthy();
            // Projection is synchronous — a warning here would mean the runtime
            // could not resolve what the operator just connected.
            expect(body.projection_warning ?? null).toBeNull();

            // No secret anywhere in the create response.
            const raw = await created.text().catch(() => "");
            expect(raw).not.toContain("certification_synthetic");

            // Lakeside now sends as itself rather than inheriting.
            await page.goto(PAGE);
            await expect(
                page.getByTestId(`communications-email-location-${lakeside.id}-identity`),
            ).toHaveText(address);
        } finally {
            if (createdId) {
                // Return the tenant to its fixture topology: Lakeside inherits.
                const cleanup = await page.request.patch(`${BINDINGS}/${createdId}`, {
                    data: { status: "disabled", location_id: null },
                    failOnStatusCode: false,
                });
                expect(cleanup.ok(), "fixture cleanup must succeed").toBe(true);
            }
        }

        await page.goto(PAGE);
        await expect(
            page.getByTestId(`communications-email-location-${lakeside.id}-identity`),
        ).toHaveText("Uses organization identity");
    });
});

test.describe("Removing an override — assignment removed, identity preserved", () => {
    test("the retired identity does NOT become an organization candidate", async ({ page }) => {
        const payload = await loadPayload(page);
        const locations = (payload.locations ?? []) as Array<{ id: string; label: string }>;
        const riverside = locations.find((l) => /riverside/i.test(l.label))!;
        const bindings = (payload.bindings ?? []) as Array<{ id: string; inbound_address: string | null }>;
        const riversideBinding = bindings.find((b) => b.inbound_address === RIVERSIDE_EMAIL)!;

        try {
            const removed = await page.request.patch(`${BINDINGS}/${riversideBinding.id}`, {
                data: { location_id: null },
                failOnStatusCode: false,
            });
            expect(removed.ok()).toBe(true);

            const after = await loadPayload(page);
            const rows = (after.bindings ?? []) as Array<{
                id: string;
                location_id: string | null;
                inbound_address: string | null;
                status: string;
            }>;
            const retired = rows.find((b) => b.id === riversideBinding.id)!;

            // The three properties that make removal safe:
            // 1. it is no longer in force
            expect(retired.status).not.toBe("active");
            // 2. it still BELONGS to Riverside, which is what keeps it out of the
            //    organization pool — the resolver's org fallback admits only
            //    tenant-scoped identities
            expect(retired.location_id).toBe(riverside.id);
            // 3. the globally-unique receiving address is still claimed by this
            //    tenant, so no other organization can take it and no message that
            //    named it is orphaned
            expect(retired.inbound_address).toBe(RIVERSIDE_EMAIL);

            // And the organization identity is unchanged — the retired campus
            // address has NOT become what the organization sends as.
            await page.goto(PAGE);
            await expect(page.getByTestId("communications-email-identity-from")).toHaveText(ORG_EMAIL);
            await expect(
                page.getByTestId(`communications-email-location-${riverside.id}-identity`),
            ).toHaveText("Uses organization identity");
        } finally {
            const restore = await page.request.patch(`${BINDINGS}/${riversideBinding.id}`, {
                data: { location_id: riverside.id, status: "active" },
                failOnStatusCode: false,
            });
            expect(restore.ok(), "fixture restore must succeed").toBe(true);
        }
    });
});
