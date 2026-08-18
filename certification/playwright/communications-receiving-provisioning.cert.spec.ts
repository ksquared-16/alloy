/**
 * Self-service Email receiving setup — the provisioning gap closed after #461.
 *
 * WHAT IS BEING PROVED. An administrator who has connected Resend can obtain a
 * hidden ingress destination without an Alloy employee, without SQL, without
 * inserting `communication_ingress_routes` by hand, and without knowing anything
 * about Resend's internals — while the visible identity they and every family
 * see stays exactly what it was.
 *
 * WHAT IS NOT BEING PROVED, stated so this evidence is not read as more than it
 * is. Resend is never contacted: the certification environment holds no provider
 * credential and is structurally incapable of reaching it. Domain DISCOVERY is
 * therefore answered by the documented certification stub, which exercises the
 * flow — offered for confirmation, never silently selected — and not Resend's API
 * shape. That shape is unit-tested against the documented payload in
 * `receivingDomain.test.ts`.
 *
 * Nor does anything here prove the external routing hop. That remains owed to the
 * controlled live test.
 *
 * CERT_REQUIRES_PRISTINE_TENANT — P-10 and P-11 assert that a freshly created
 * destination has seen NO inbound, which is only true on a tenant where none has
 * ever arrived. Any earlier run that delivered mail to the seeded identity makes
 * receiving legitimately `ready`, and those two then fail for a reason that looks
 * like a product defect and is not.
 */
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

const PAGE = "/organization/communications";
const BINDINGS = "/api/admin/communications/bindings";
const ROUTES = "/api/admin/communications/ingress-routes";

const VISIBLE_IDENTITY = "hello@northwind-cert.invalid";
const CERT_DISCOVERED_DOMAIN = "inbound.northwind-cert.invalid";

async function emailBinding(page: Page) {
    const res = await page.request.get(BINDINGS);
    expect(res.ok(), `GET ${BINDINGS} → ${res.status()}`).toBe(true);
    const body = (await res.json()) as { bindings?: Array<Record<string, unknown>> };
    const binding = (body.bindings ?? []).find(
        (b) =>
            String(b.channel ?? "") === "email" &&
            String(b.status ?? "") === "active" &&
            String(b.inbound_address ?? "") === VISIBLE_IDENTITY
    );
    expect(binding, `the seeded active email binding for ${VISIBLE_IDENTITY} exists`).toBeTruthy();
    return binding!;
}

async function setup(page: Page, body: Record<string, unknown>) {
    const res = await page.request.post(ROUTES, { data: body });
    return { status: res.status(), json: (await res.json()) as Record<string, unknown> };
}

test.describe("Receiving domain discovery", () => {
    test("P-1 a discovered domain is OFFERED, never silently selected", async ({ page }) => {
        const binding = await emailBinding(page);
        const first = await setup(page, { binding_id: binding.id });
        // Either the tenant already has a route (a later run), or setup asks for
        // a domain and hands back what it discovered. Both are correct; what must
        // never happen is a route created against a domain nobody confirmed.
        if (first.json.status === "needs_receiving_domain") {
            expect(Array.isArray(first.json.discovered_domains)).toBe(true);
            expect(first.json.discovered_domains).toContain(CERT_DISCOVERED_DOMAIN);
            expect(first.json.hidden_destination, "nothing is created before confirmation").toBeUndefined();
        } else {
            expect(first.json.status).toBe("ready_for_routing");
        }
    });

    test("P-2 an invalid receiving domain is refused, with the reason", async ({ page }) => {
        const binding = await emailBinding(page);
        // The likeliest mistake: the Resend page shows a full address.
        const address = await setup(page, {
            binding_id: binding.id,
            receiving_domain: "anything@cool-hedgehog.resend.app",
        });
        expect(address.status).toBe(400);
        expect(address.json.reason).toBe("looks_like_an_address");

        const junk = await setup(page, { binding_id: binding.id, receiving_domain: "localhost" });
        expect(junk.status).toBe(400);
        expect(junk.json.reason).toBe("not_a_domain");
    });

    test("P-3 a valid domain produces a destination AT that domain", async ({ page }) => {
        const binding = await emailBinding(page);
        const res = await setup(page, { binding_id: binding.id, receiving_domain: CERT_DISCOVERED_DOMAIN });
        expect(res.status).toBe(200);
        expect(res.json.status).toBe("ready_for_routing");
        const destination = String(res.json.hidden_destination ?? "");
        expect(destination).toContain("@");
        // The local part is opaque and server-minted — never the visible identity.
        expect(destination.split("@")[0]).not.toContain("hello");
        expect(destination.split("@")[0].length).toBeGreaterThanOrEqual(16);
    });
});

test.describe("Idempotence and tenancy", () => {
    test("P-4 retry returns the SAME destination, not a second one", async ({ page }) => {
        // The failure this prevents is not a duplicate row but a duplicate
        // ADDRESS: a forwarding rule already created against the first would
        // point somewhere Alloy no longer watches.
        const binding = await emailBinding(page);
        const a = await setup(page, { binding_id: binding.id, receiving_domain: CERT_DISCOVERED_DOMAIN });
        const b = await setup(page, { binding_id: binding.id });
        const c = await setup(page, { binding_id: binding.id, receiving_domain: CERT_DISCOVERED_DOMAIN });
        expect(a.json.hidden_destination).toBeTruthy();
        expect(b.json.hidden_destination).toBe(a.json.hidden_destination);
        expect(c.json.hidden_destination).toBe(a.json.hidden_destination);
        expect(b.json.created).toBe(false);
    });

    test("P-5 exactly one route exists for the binding after repeated setup", async ({ page }) => {
        const binding = await emailBinding(page);
        await setup(page, { binding_id: binding.id, receiving_domain: CERT_DISCOVERED_DOMAIN });
        const res = await page.request.get(ROUTES);
        const rows = ((await res.json()).routes ?? []) as Array<{ binding_id: string }>;
        expect(rows.filter((r) => r.binding_id === binding.id)).toHaveLength(1);
    });

    test("P-6 a binding this org does not own cannot be configured", async ({ page }) => {
        // Naming a binding is never the same as being allowed to configure it.
        const res = await setup(page, {
            binding_id: "00000000-0000-4000-8000-0000000000ff",
            receiving_domain: CERT_DISCOVERED_DOMAIN,
        });
        expect(res.status).toBe(404);
    });

    test("P-7 a malformed binding id is refused", async ({ page }) => {
        const res = await setup(page, { binding_id: "not-a-uuid" });
        expect(res.status).toBe(400);
    });
});

test.describe("The hidden destination stays hidden", () => {
    test("P-8 it is absent from the ordinary bindings projection", async ({ page }) => {
        const binding = await emailBinding(page);
        await setup(page, { binding_id: binding.id, receiving_domain: CERT_DISCOVERED_DOMAIN });
        // That projection feeds the channel cards, the composer's From line and
        // the operator's own identity display.
        const fresh = await emailBinding(page);
        expect(JSON.stringify(fresh)).not.toContain(CERT_DISCOVERED_DOMAIN);
        expect(String(fresh.inbound_address ?? "")).toBe(VISIBLE_IDENTITY);
    });

    test("P-9 the configuration page shows the visible identity, and the destination only in setup", async ({
        page,
    }) => {
        const binding = await emailBinding(page);
        const created = await setup(page, { binding_id: binding.id, receiving_domain: CERT_DISCOVERED_DOMAIN });
        const destination = String(created.json.hidden_destination ?? "");
        expect(destination).toBeTruthy();

        await page.goto(PAGE);
        await expect(page.getByTestId("communications-email-receiving-value")).toHaveText(VISIBLE_IDENTITY);

        // It may appear on the technical setup step — and ONLY there.
        const setupPanel = page.getByTestId("communications-email-routing-setup");
        await expect(setupPanel).toBeVisible({ timeout: 120_000 });
        await expect(setupPanel).toContainText(destination);

        // The identity rows must not carry it.
        await expect(page.getByTestId("communications-email-sending-value")).not.toContainText(destination);
        await expect(page.getByTestId("communications-email-receiving-value")).not.toContainText(destination);
    });
});

test.describe("Provisioning is not receiving", () => {
    test("P-10 a created destination does NOT report receiving ready", async ({ page }) => {
        const binding = await emailBinding(page);
        const res = await setup(page, { binding_id: binding.id, receiving_domain: CERT_DISCOVERED_DOMAIN });
        expect(res.json.receiving_observed).toBe(false);

        const fresh = await emailBinding(page);
        const receive = (fresh.readiness as { receive: { state: string } }).receive;
        // Waiting for routed email — Alloy has somewhere to receive and nothing
        // has arrived. Never `ready`.
        expect(receive.state).toBe("awaiting_routed_email");
    });

    test("P-11 the page says Waiting for routed email, and offers no redundant action", async ({ page }) => {
        const binding = await emailBinding(page);
        await setup(page, { binding_id: binding.id, receiving_domain: CERT_DISCOVERED_DOMAIN });
        await page.goto(PAGE);
        await expect(page.getByTestId("communications-email-receiving-state")).toHaveText(
            "Waiting for routed email"
        );
        // "Set up mail routing" would send an administrator to redo finished work.
        await expect(page.getByTestId("organization-communications-page")).not.toContainText(
            "Set up mail routing"
        );
    });

    test("P-12 setup survives a reload", async ({ page }) => {
        const binding = await emailBinding(page);
        const created = await setup(page, { binding_id: binding.id, receiving_domain: CERT_DISCOVERED_DOMAIN });
        const destination = String(created.json.hidden_destination ?? "");
        await page.goto(PAGE);
        await expect(page.getByTestId("communications-email-routing-setup")).toContainText(destination);
        await page.reload();
        await expect(page.getByTestId("communications-email-routing-setup")).toContainText(destination);
    });
});
