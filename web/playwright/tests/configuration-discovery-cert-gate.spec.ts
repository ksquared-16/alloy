import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

const EMAIL = process.env.CERT_OPERATOR_EMAIL ?? "qa.operator@northwind.invalid";
const PASSWORD = process.env.CERT_OPERATOR_PASSWORD ?? "alloy-local-cert";
const CUSTOMER = "cdc10000-0000-4000-8000-000000000001";

test("cert gate: authenticate, read, and write through supported APIs", async ({ page }) => {
    await ensureAdminPlaywrightSession(page);
    console.log(`GATE authenticated -> ${new URL(page.url()).pathname}`);

    // READ through a supported admin API
    const readRes = await page.request.get("/api/admin/customer-members?limit=5");
    expect(readRes.ok(), `read failed ${readRes.status()}`).toBe(true);
    const read = await readRes.json();
    console.log(`GATE read members=${(read.members ?? []).length}`);

    // The fixture household + BOTH sibling children must be visible to the operator's org.
    const membersRes = await page.request.get("/api/admin/customer-members?limit=2000");
    const members = (await membersRes.json()).members ?? [];
    const fixtureChildren = members.filter((m: { customer_id?: string }) => m.customer_id === CUSTOMER);
    console.log(
        `GATE fixture children visible=${fixtureChildren.length} names=${JSON.stringify(
            fixtureChildren.map((m: { display_name?: string }) => m.display_name),
        )}`,
    );
    expect(fixtureChildren.length, "fixture household children not visible to the operator org").toBe(2);

    // WRITE through a supported admin API (harmless, namespaced, cleaned by teardown)
    const writeRes = await page.request.post("/api/admin/persons", {
        data: { first_name: "CDV1", last_name: "GateProbe", email: "gate.probe@cdv1.invalid" },
    });
    console.log(`GATE write person -> ${writeRes.status()}`);
    expect(writeRes.ok(), `write failed ${writeRes.status()}: ${(await writeRes.text()).slice(0, 300)}`).toBe(true);
});
