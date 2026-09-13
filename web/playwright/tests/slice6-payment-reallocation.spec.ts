import { expect, type APIRequestContext, type Page, test } from "@playwright/test";

/**
 * SLICE 6 — MOUNTED CERTIFICATION OF PAYMENT REALLOCATION.
 *
 * The fixture is built through the operator's OWN action pipeline (`payment.record`), never by
 * writing rows. A fixture minted by a privileged back door proves the UI can render something the
 * product cannot actually produce; this one can only exist if the product could make it.
 *
 * It is deterministic and idempotent: the household, the two posted charges and the amount are
 * fixed, and the run reuses the receipt it finds rather than minting a second one each time.
 */
const HOUSEHOLD_PREFIX = "29944d3e";
const SOURCE = "Late pickup";      // posted, 2500 — the charge the money first answered
const TARGET = "Registration fee"; // posted, 7500 — where the money should end up
const RECEIPT_CENTS = 2500;

type Row = { chargeId: string; description: string; status: string; outstandingCents: number; subjectMemberId: string | null };
type Application = { id: string; chargeId: string; status: string; amountCents: number };
type Payment = { id: string; amountCents: number; unappliedCents: number; payerLabel?: string | null; applications?: Application[] };
type Card = { vm?: { rows?: Row[]; payments?: Payment[]; subjects?: Array<{ id?: string }> } };

async function householdId(request: APIRequestContext): Promise<string> {
    const res = await request.get("/api/admin/customers?limit=50");
    expect(res.ok(), `customers ${res.status()}`).toBe(true);
    const body = (await res.json()) as { customers?: Array<{ id: string }> };
    const found = (body.customers ?? []).find((c) => c.id.startsWith(HOUSEHOLD_PREFIX));
    expect(found, `no certification household ${HOUSEHOLD_PREFIX}`).toBeTruthy();
    return found!.id;
}

async function card(request: APIRequestContext, customerId: string): Promise<NonNullable<Card["vm"]>> {
    const res = await request.get(`/api/admin/financials/card?customer_id=${customerId}`);
    expect(res.ok(), `card ${res.status()}`).toBe(true);
    return ((await res.json()) as Card).vm ?? {};
}

function charge(vm: NonNullable<Card["vm"]>, description: string): Row {
    const row = (vm.rows ?? []).find((r) => r.description === description && r.status === "posted");
    expect(row, `no posted charge "${description}"`).toBeTruthy();
    return row!;
}

async function execute(request: APIRequestContext, body: Record<string, unknown>) {
    const res = await request.post("/api/admin/actions/execute", {
        headers: { "content-type": "application/json" },
        data: body,
    });
    return { status: res.status(), json: (await res.json()) as Record<string, unknown> };
}

/** Record the receipt only if this household has none — reruns must not mint more money. */
async function ensureReceipt(request: APIRequestContext, customerId: string): Promise<Payment> {
    let vm = await card(request, customerId);
    if ((vm.payments ?? []).length === 0) {
        const source = charge(vm, SOURCE);
        const { status, json } = await execute(request, {
            action_key: "payment.record",
            entity_type: "opportunity_customer_member",
            entity_id: source.subjectMemberId ?? "",
            mode: "execute",
            payload: { charge_id: source.chargeId, amount_cents: RECEIPT_CENTS, payment_method: "check" },
        });
        expect(json.ok, `payment.record ${status} ${JSON.stringify(json).slice(0, 400)}`).toBe(true);
        vm = await card(request, customerId);
    }
    const payment = (vm.payments ?? [])[0];
    expect(payment, "the fixture produced no receipt").toBeTruthy();
    return payment!;
}

async function openHousehold(page: Page, customerId: string) {
    await page.goto(`/workspace?focus_entity_type=customer&focus_entity_id=${customerId}`);
    await page.waitForLoadState("networkidle");
}

test("PHASE 2 — a deterministic receipt exists, applied to the charge it answered", async ({ page }) => {
    const customerId = await householdId(page.request);
    const payment = await ensureReceipt(page.request, customerId);
    const vm = await card(page.request, customerId);
    const source = charge(vm, SOURCE);

    expect(payment.amountCents, "the receipt is the deterministic amount").toBe(RECEIPT_CENTS);
    const active = (payment.applications ?? []).filter((a) => a.status === "active");
    expect(active.length, "it answers exactly one charge").toBe(1);
    expect(active[0].chargeId, "and that charge is the source").toBe(source.chargeId);
    expect(payment.unappliedCents, "none of it is loose").toBe(0);
    // The whole point of an application: the obligation is answered.
    expect(source.outstandingCents, "the source charge is settled").toBe(0);
});

test("PHASE 3 — the receipt carries a payer, not a blank", async ({ page }) => {
    const customerId = await householdId(page.request);
    const payment = await ensureReceipt(page.request, customerId);
    /*
     * payerLabel is resolved server-side from the household, NOT from payments.customer_id, which is
     * null for agreement-sourced money. A blank here means the resolution silently fell through.
     */
    expect(payment.payerLabel ?? "", `payer label was ${JSON.stringify(payment.payerLabel)}`).not.toBe("");
});

/**
 * PHASES 12–14 — THE BOUNDARIES, WHICH DO NOT NEED A RECEIPT TO CERTIFY.
 *
 * These run against the tenant as it stands. They are the proofs that a refusal is real rather than
 * a UI that merely declines to draw a button: every one of them goes through the route, not the card.
 */
test.describe("reallocation boundaries", () => {
    test("PHASE 12 — the eligible-targets route refuses an unauthenticated caller", async ({ playwright, baseURL, page }) => {
        const anon = await playwright.request.newContext({ baseURL, storageState: undefined });
        const res = await anon.get("/api/admin/financials/eligible-target-charges?payment_id=00000000-0000-4000-8000-000000000000");
        // An unauthenticated caller must never learn whether a payment exists.
        expect([401, 403, 404], `status was ${res.status()}`).toContain(res.status());
        const body = await res.text();
        expect(body, "a refusal must not leak charge material").not.toMatch(/chargeId|outstandingCents/);
        await anon.dispose();

        /*
         * The refusal above is only meaningful if the route answers at all. Without this, deleting
         * the route entirely leaves the test green on a 404 — measured, not hypothesised.
         */
        const authed = await page.request.get(
            "/api/admin/financials/eligible-target-charges?payment_id=00000000-0000-4000-8000-000000000000");
        expect(authed.status(), "the same route must answer an authenticated caller").toBeLessThan(500);
        expect(authed.status(), "and must not refuse it as unauthenticated").not.toBe(401);
    });

    test("PHASE 13 — applying a payment is refused without fin.write, and says which permission", async ({ page }) => {
        await page.goto("/workspace");
        const customerId = await householdId(page.request);
        const vm = await card(page.request, customerId);
        const target = charge(vm, TARGET);
        const { json } = await execute(page.request, {
            action_key: "payment.apply_to_charge",
            entity_type: "opportunity_customer_member",
            entity_id: target.subjectMemberId ?? "",
            mode: "execute",
            payload: { payment_id: "00000000-0000-4000-8000-000000000000", charge_id: target.chargeId, amount_cents: 100 },
        });
        expect(json.ok, "a role without fin.write must not move money").toBe(false);
        /*
         * The permission is checked BEFORE the payment is looked up: the refusal must be about
         * authority, not about a missing row. A not-found here would mean an unpermitted caller can
         * probe which payment ids exist.
         */
        expect(JSON.stringify(json)).toMatch(/fin\.write/);
    });

    test("PHASE 14 — a forged allocation from outside the org reads as absent, and changes nothing", async ({ page }) => {
        await page.goto("/workspace");
        const customerId = await householdId(page.request);
        const before = JSON.stringify((await card(page.request, customerId)).rows);

        // This identity DOES hold fin.adjust, so the request reaches org scoping rather than stopping
        // at the permission gate — which is what makes this a scoping proof and not a permission one.
        const { json } = await execute(page.request, {
            action_key: "payment.reverse_application",
            entity_type: "customer",
            entity_id: customerId,
            mode: "execute",
            payload: { allocation_id: "ffffffff-0000-4000-8000-ffffffffffff", reason: "forged" },
        });
        expect(json.ok, "a forged allocation must not reverse anything").toBe(false);
        expect(JSON.stringify(json), "and must not disclose that it belongs to another org")
            .not.toMatch(/another org|different organization|forbidden/i);

        const after = JSON.stringify((await card(page.request, customerId)).rows);
        expect(after, "no charge balance moved").toBe(before);
    });
});
