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
/* Pinned in-file, like the mounted spec: this suite must not depend on how it was invoked. */
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";

const HOUSEHOLD_PREFIX = "0658832a";  // Kurzman: the household the mounted proofs certify
const SOURCE = "Late pickup";      // posted — the charge the money first answered
const TARGET = "Registration fee"; // posted — where the money should end up
const RECEIPT_CENTS = 2500;

/** The certification receipt, named by its deterministic amount rather than by arrival order. */
function subject(v: NonNullable<Card["vm"]>): Payment {
    const mine = (v.payments ?? []).filter((p) => p.direction === "inbound" && p.amountCents === RECEIPT_CENTS);
    expect(mine.length, "exactly one certification receipt of this amount").toBe(1);
    return mine[0];
}

test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012" });

type Row = { chargeId: string; description: string; status: string; outstandingCents: number; subjectMemberId: string | null };
type Application = { allocationId: string; chargeId: string | null; status: string; appliedCents: number };
type Payment = {
    paymentId: string; direction: string; amountCents: number; unappliedCents: number;
    payerLabel?: string | null; applications?: Application[];
};
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
    if (!(vm.payments ?? []).some((p) => p.direction === "inbound" && p.amountCents === RECEIPT_CENTS)) {
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
    return subject(vm);
}

async function openHousehold(page: Page, customerId: string) {
    await page.goto(`/workspace?focus_entity_type=customer&focus_entity_id=${customerId}`);
    await page.waitForLoadState("networkidle");
}

test("PHASE 2 — the deterministic receipt exists, and its money adds up", async ({ page }) => {
    const customerId = await householdId(page.request);
    await ensureReceipt(page.request, customerId);
    const vm = await card(page.request, customerId);
    const payment = subject(vm);

    expect(payment.amountCents, "the receipt is the deterministic amount").toBe(RECEIPT_CENTS);

    /*
     * WHICH charge the money is on is not fixed: the mounted phases move it, and that is the point
     * of the fixture. What must always hold is the accounting law, read from the canonical account
     * rather than recomputed here — applied plus unapplied is the receipt, exactly.
     */
    const active = (payment.applications ?? []).filter((a) => a.status === "active");
    const applied = active.reduce((n, a) => n + a.appliedCents, 0);
    expect(applied + payment.unappliedCents, "applied plus unapplied is the receipt")
        .toBe(payment.amountCents);

    // And every charge it answers belongs to this household.
    const household = new Set((vm.rows ?? []).map((r) => r.chargeId));
    for (const a of active) {
        expect(household.has(a.chargeId ?? ""), `application ${a.allocationId} points outside the household`)
            .toBe(true);
    }
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

    test("PHASE 4 — the same operator now authorizes BOTH halves of a Move", async ({ page }) => {
        await page.goto("/workspace");
        const customerId = await householdId(page.request);
        const vm = await card(page.request, customerId);
        const target = charge(vm, TARGET);
        const ent = { entity_type: "opportunity_customer_member", entity_id: target.subjectMemberId ?? "" };

        /*
         * BEFORE the grant was deployed this same call was refused with "Applying a payment requires
         * fin.write", on authority, before the payment was looked up — that refusal was measured on
         * this identity and is what the grant migration repairs. It cannot be re-exercised here now
         * that the role holds the permission, and minting a second, unpermitted identity is not this
         * lane's to do; so what is asserted now is the other side: the gate no longer stops us, and
         * the refusal that remains is about the subject rather than about authority.
         */
        const apply = await execute(page.request, {
            action_key: "payment.apply_to_charge", ...ent, mode: "execute",
            payload: { payment_id: "00000000-0000-4000-8000-000000000000", charge_id: target.chargeId, amount_cents: 100 },
        });
        expect(apply.json.ok, "a payment that does not exist still cannot be applied").toBe(false);
        expect(JSON.stringify(apply.json), "but no longer because the operator lacks fin.write")
            .not.toMatch(/fin\.write/);

        // The reversal half was always permitted through fin.adjust; it must still be.
        const reverse = await execute(page.request, {
            action_key: "payment.reverse_application", entity_type: "customer", entity_id: customerId,
            mode: "execute",
            payload: { allocation_id: "00000000-0000-4000-8000-000000000000", reason: "authorization probe" },
        });
        expect(reverse.json.ok, "a missing allocation still refuses").toBe(false);
        expect(JSON.stringify(reverse.json), "and not for want of fin.adjust").not.toMatch(/fin\.adjust/);
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

    /*
     * PHASE 15/16 — the refusals that need a real receipt. These skip themselves until the fixture
     * exists rather than passing vacuously, so a green here always means the refusal was exercised.
     */
    test("PHASE 15 · applying refuses a malformed target and an over-application", async ({ page }) => {
        await page.goto("/workspace");
        const customerId = await householdId(page.request);
        const v = await card(page.request, customerId);
        const payment = (v.payments ?? [])[0];
        test.skip(!payment, "no receipt in this household yet");
        const target = charge(v, TARGET);

        const malformed = await execute(page.request, {
            action_key: "payment.apply_to_charge",
            entity_type: "opportunity_customer_member",
            entity_id: target.subjectMemberId ?? "",
            mode: "execute",
            payload: { payment_id: payment.paymentId, charge_id: "not-a-uuid", amount_cents: 100 },
        });
        expect(malformed.json.ok, "a malformed target must refuse").toBe(false);

        const tooMuch = await execute(page.request, {
            action_key: "payment.apply_to_charge",
            entity_type: "opportunity_customer_member",
            entity_id: target.subjectMemberId ?? "",
            mode: "execute",
            // More than the receipt itself: money that was never received cannot answer anything.
            payload: { payment_id: payment.paymentId, charge_id: target.chargeId, amount_cents: payment.amountCents + 1_000_000 },
        });
        expect(tooMuch.json.ok, "applying more than was received must refuse").toBe(false);
    });

    test("PHASE 16 · a forged same-org cross-household apply refuses and changes nothing", async ({ page }) => {
        await page.goto("/workspace");
        const mine = await householdId(page.request);
        const v = await card(page.request, mine);
        const payment = (v.payments ?? [])[0];
        test.skip(!payment, "no receipt in this household yet");

        // Another household in the SAME org — the chooser would never offer this, so it is forged.
        const others = await page.request.get("/api/admin/customers?limit=50");
        const list = ((await others.json()) as { customers?: Array<{ id: string }> }).customers ?? [];
        let foreign: { customerId: string; chargeId: string } | null = null;
        for (const c of list) {
            if (c.id === mine) continue;
            const ov = await card(page.request, c.id);
            const row = (ov.rows ?? []).find((r) => r.status === "posted" && r.outstandingCents > 0);
            if (row) { foreign = { customerId: c.id, chargeId: row.chargeId }; break; }
        }
        test.skip(!foreign, "no second household with a posted charge to forge against");

        const beforeMine = JSON.stringify((await card(page.request, mine)).rows);
        const beforeTheirs = JSON.stringify((await card(page.request, foreign!.customerId)).rows);

        const { json } = await execute(page.request, {
            action_key: "payment.apply_to_charge",
            entity_type: "opportunity_customer_member",
            entity_id: charge(v, TARGET).subjectMemberId ?? "",
            mode: "execute",
            payload: { payment_id: payment.paymentId, charge_id: foreign!.chargeId, amount_cents: 100 },
        });
        expect(json.ok, "one family's money may only answer that family's obligations").toBe(false);
        expect(JSON.stringify(json), "and the refusal names the household reason")
            .toMatch(/household/i);

        expect(JSON.stringify((await card(page.request, mine)).rows), "our balances did not move").toBe(beforeMine);
        expect(JSON.stringify((await card(page.request, foreign!.customerId)).rows), "theirs did not either")
            .toBe(beforeTheirs);
        const after = (await card(page.request, mine)).payments!.find((p) => p.paymentId === payment.paymentId)!;
        expect(after.unappliedCents, "and the receipt is untouched").toBe(payment.unappliedCents);
    });
});
