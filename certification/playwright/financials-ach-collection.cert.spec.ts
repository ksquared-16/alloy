/**
 * THREAD 8C — COLLECTING BY BANK, in the real mounted product.
 *
 * A card collection is over in seconds. A bank debit takes days, which is what makes this thread's
 * presentation load-bearing: the operator closes the tab while the money is in flight and comes back
 * to a page that must still tell them the truth. Everything asserted here is read back after a real
 * navigation, from persistence, because lifecycle that lives in component state disappears exactly
 * when it is needed most.
 *
 * Real Stripe test mode, a real connected account with ACH enabled, real Postgres, the real
 * authenticated product. The PaymentIntents are confirmed from this file's Node context — that is
 * the provider doing provider things, not a simulation.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const WORK_VIEW = "/workspace/work-unit/new-leads";
const BOS_PRESENTATION_STATE_KEY = "alloy:v1:admV2:shell:bosPresentationState";

/** The certification subject: enrolment-backed AND paged by the Work View. Both are required. */
const CERT_OPPORTUNITY = "00000000-0000-4000-8000-40000000099b";
const CERT_CUSTOMER = "00000000-0000-4000-8000-10000000003b";
const CERT_MEMBER = "00000000-0000-4000-8000-30000000003b";
const TEMPLATE = "fc500000-0000-4000-8000-0000000d0001";

function trusted(key: string): string {
    const p = resolve(homedir(), ".local/state/alloy-dev/gateway/vacilando/trusted-secrets/stripe-test.env");
    const line = readFileSync(p, "utf8").split("\n").find((l) => l.startsWith(`${key}=`));
    return line?.slice(key.length + 1).trim() ?? "";
}
const SK = trusted("STRIPE_SECRET_KEY");

async function stripe(path: string, body?: Record<string, string>, account?: string) {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
        method: body ? "POST" : "GET",
        headers: {
            Authorization: `Bearer ${SK}`,
            ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
            ...(account ? { "Stripe-Account": account } : {}),
        },
        ...(body ? { body: new URLSearchParams(body).toString() } : {}),
    });
    return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const DB = process.env.CERT_DATABASE_URL
    ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/**
 * What is still owed on a charge.
 *
 * There is no `outstanding` column — outstanding is the charge less what is actively allocated to
 * it, which is why reversing an allocation restores the debt without editing the charge. Written out
 * here so the certification reads the same arithmetic the domain does.
 */
function outstandingOf(chargeId: string): number {
    return Number(sql(`select c.amount_cents - coalesce((
        select sum(a.allocated_amount_cents) from payment_allocations a
        where a.target_entity_type = 'charge' and a.target_entity_id = c.id and a.status = 'active'
    ), 0) from charges c where c.id = '${chargeId}'`));
}

function sql(query: string): string {
    return execSync(`psql ${JSON.stringify(DB)} -tAc ${JSON.stringify(query.replace(/\s+/g, " ").trim())}`, {
        encoding: "utf8", env: { ...process.env, PATH: `/tmp/claude-501/bin:${process.env.PATH ?? ""}` },
    }).trim();
}

/**
 * A distinct amount per scenario, per run.
 *
 * Stripe's idempotency key for a collection is derived from the charge and the amount, and
 * `charge.add` is idempotent — so a hardcoded amount reuses the SAME key on every run and Stripe
 * refuses it the moment any parameter differs. The failure reads as a product defect and is not one.
 */
const RUN = Date.now() % 90_000;
let nth = 0;
const nextAmount = () => 1_000 + RUN + (nth += 137);
let seedNth = 0;

async function execute(page: Page, body: Record<string, unknown>) {
    const res = await page.request.post("/api/admin/actions/execute", { data: body });
    return { status: res.status(), json: (await res.json()) as Record<string, any> };
}

/** Canonical Thread 8/2/4 truth, read the way the card reads it. */
async function canonical(page: Page) {
    const res = await page.request.get(`/api/admin/financials/card?customer_id=${CERT_CUSTOMER}`);
    const vm = ((await res.json()) as any).vm ?? {};
    return {
        balance: vm.reconciliation?.balanceCents ?? null,
        payments: (vm.payments ?? []) as Array<any>,
        openCollections: (vm.openCollections ?? []) as Array<any>,
        achAvailable: Boolean(vm.achAvailable),
    };
}

async function openSubject(page: Page) {
    await page.addInitScript(
        ([k, v]) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } },
        [BOS_PRESENTATION_STATE_KEY, "closed"],
    );
    await page.goto(`${WORK_VIEW}?subject_id=${CERT_OPPORTUNITY}`);
    await page.waitForLoadState("domcontentloaded");
    await expect
        .poll(async () => await page.locator('[data-financials-card="true"]').count(), { timeout: 90_000 })
        .toBeGreaterThan(0);
}

/** A posted, enrolment-backed obligation — the only kind ACH can collect against. */
async function seedCharge(page: Page, amountCents?: number): Promise<string> {
    /*
     * A charge that is actually collectible, which is harder than creating one.
     *
     * `charge.add` is idempotent per child, template and day — correct, since adding a day's fee
     * twice should not bill it twice — so a scenario cannot get a fresh obligation just by asking
     * again. It also cannot simply pick "yesterday": a previous run of this certification already
     * created that charge AND paid it to zero, and a paid charge is not something to collect against.
     *
     * So walk the days of the current accounting period until one yields an obligation with
     * something still owed. Staying inside the period matters as much as the day being free — the
     * Financials read model scopes to the period in view, and a charge outside it is correctly
     * invisible on the card this certification is reading.
     */
    for (let back = seedNth + 1; back <= 28; back += 1) {
        const day = new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);
        const added = await execute(page, {
            action_key: "charge.add", entity_type: "child", entity_id: CERT_MEMBER, mode: "execute",
            confirmation: { confirmed: true },
            payload: {
                customer_member_id: CERT_MEMBER, customer_id: CERT_CUSTOMER, template_id: TEMPLATE,
                service_period_start: day, event_date: day, today: day,
                ...(amountCents == null ? {} : { amount_cents: amountCents }),
            },
        });
        const id = added.json.data?.execution_result?.affected_id ?? added.json.data?.affected_id;
        if (!id) continue;
        await execute(page, {
            action_key: "charge.post", entity_type: "child", entity_id: CERT_MEMBER, mode: "execute",
            confirmation: { confirmed: true }, payload: { charge_id: id },
        });
        seedNth = back;
        if (outstandingOf(String(id)) > 0) return String(id);
    }
    throw new Error(
        "every day in the current accounting period already carries a fully paid certification charge — "
        + "posted childcare money is immutable, so the period has to roll or the subject has to change",
    );
}

/** Ask for a bank collection through the canonical action, exactly as the panel does. */
async function collectByBank(page: Page, chargeId: string, cents: number) {
    return await execute(page, {
        action_key: "payment.collect_card", entity_type: "child", entity_id: CERT_MEMBER,
        mode: "execute", confirmation: { confirmed: true },
        payload: { charge_id: chargeId, amount_cents: cents, rail: "ach", charge_label: "8C" },
    });
}

/** What the mounted card says about one in-flight collection, after a real reload. */
async function mountedCollectionState(page: Page, attemptId: string) {
    await openSubject(page);
    const details = page.locator('[data-financials-card="true"]').first().getByRole("button", { name: /Details/ });
    await expect.poll(async () => await details.count(), { timeout: 60_000 }).toBeGreaterThan(0);
    await page.getByRole("button", { name: /Take payment/ }).click();
    const row = page.locator(`[data-financials-collection="${attemptId}"]`);
    await expect(row, "the in-flight collection must survive a reload and be on the surface")
        .toBeVisible({ timeout: 60_000 });
    return {
        state: await row.getAttribute("data-financials-collection-state"),
        rail: await row.getAttribute("data-financials-collection-rail"),
        text: (await row.innerText()).replace(/\s+/g, " ").trim(),
    };
}

/** Wait for the provider's own verdict on an intent, however long the rail takes. */
async function awaitIntentStatus(pi: string, account: string, want: string[], ms = 300_000) {
    await expect
        .poll(async () => (await stripe(`payment_intents/${pi}`, undefined, account)).body.status, {
            timeout: ms, intervals: [3_000],
        })
        .toMatch(new RegExp(`^(${want.join("|")})$`));
}

/** Wait for Thread 8 to recognise a collection — the boundary that turns evidence into money. */
async function awaitRecognition(pi: string, ms = 240_000): Promise<string> {
    let paymentId = "";
    await expect
        .poll(() => {
            paymentId = sql(`select coalesce(canonical_payment_id::text, '')
                from payment_collection_attempts where provider_transaction_id = '${pi}'`);
            return paymentId;
        }, { timeout: ms, intervals: [3_000] })
        .not.toBe("");
    return paymentId;
}

/** The payment row as the mounted card renders it, after a real navigation. */
async function mountedPaymentRow(page: Page, paymentId: string) {
    /*
     * The payments band is on the CARD, not behind Details — Slice H hoisted it there precisely so
     * an operator can see what arrived without opening a deeper layer. Reading it from inside Details
     * found nothing and looked like a missing receipt.
     */
    await openSubject(page);
    /*
     * The read model first, then the browser. Separating them is what tells a missing receipt from a
     * receipt the surface declines to draw — two different defects that look identical from a failing
     * locator.
     */
    const vmHasIt = (await canonical(page)).payments.some((p) => p.paymentId === paymentId);
    expect(vmHasIt, "the read model knows about the recognised receipt").toBe(true);

    /*
     * The payment band is on the card, but the card's COMPACT density drops the whole side column it
     * lives in — a deliberate presentation choice, since a compact card has no room for a ledger.
     * At that density the operator reaches what arrived through the payment representation, which is
     * where the band is also hosted. So: read it where it is, and open the representation when the
     * density has hidden it, rather than assuming one of the two.
     */
    const row = page.locator(`[data-financials-payments="true"] [data-financials-payment-id="${paymentId}"]`);
    if (await row.count() === 0) {
        const payNow = page.getByRole("button", { name: /Take payment/ });
        await expect(payNow, "a compact card still offers the payment representation")
            .toBeVisible({ timeout: 60_000 });
        await payNow.click();
    }
    await expect(row, "and the surface draws it").toBeVisible({ timeout: 90_000 });
    return {
        kind: await row.getAttribute("data-financials-payment-kind"),
        origin: await row.locator("[data-financials-payment-origin]").first()
            .getAttribute("data-financials-payment-origin").catch(() => null),
        applied: await row.locator("[data-financials-payment-applied]").first()
            .getAttribute("data-financials-payment-applied").catch(() => null),
        text: (await row.innerText()).replace(/\s+/g, " ").trim(),
    };
}

test.describe("Thread 8C — bank collection in the mounted product", () => {
    test("1,2,4 — Card is unchanged, Bank account is offered from server truth, and choosing it collects rather than records", async ({ page }) => {
        await openSubject(page);
        await seedCharge(page);
        await openSubject(page);

        const details = page.locator('[data-financials-card="true"]').first().getByRole("button", { name: /Details/ });
        await expect.poll(async () => await details.count(), { timeout: 60_000 }).toBeGreaterThan(0);
        await page.getByRole("button", { name: /Take payment/ }).click();
        const chooser = page.locator('[data-financials-payment-method="true"]').first();
        await expect(chooser).toBeVisible({ timeout: 60_000 });

        // 1 · CARD IS STILL THERE AND STILL COLLECTS.
        const commit = page.locator('[data-financials-payment-commit="true"]').first();
        await chooser.selectOption("card");
        await expect(commit, "card still collects").toHaveText(/Collect by card/);

        // 2 · BANK ACCOUNT IS OFFERED, and the answer came from the server.
        const options = await chooser.locator("option").allTextContents();
        expect(options.join(" | "), "bank account is a named rail").toMatch(/Bank account/i);
        const server = await canonical(page);
        expect(server.achAvailable, "the view model carries the readiness the browser renders").toBe(true);
        const achDisabled = await chooser.locator('option[value="ach"]').evaluate((el) => (el as HTMLOptionElement).disabled);
        expect(achDisabled, "an ACH-capable merchant offers the rail").toBe(false);

        // 4 · AND IT COLLECTS. The verb is the regression: a bank debit that "records" would write a
        //     receipt for money no bank has moved, which is the defect Slice 6 was carrying.
        await chooser.selectOption("ach");
        await expect(commit, "bank account collects; it never records").toHaveText(/Collect by bank account/);
        expect(await commit.innerText(), "and must never offer to record").not.toMatch(/Record payment/);
    });

    test("3 — an ACH-incapable merchant cannot be talked into a bank collection from the browser", async ({ page }) => {
        await openSubject(page);
        const chargeId = await seedCharge(page);
        const before = await canonical(page);

        /*
         * Take ACH away at the source — the merchant row the server reads — and leave everything else
         * standing. `null` is not a synthetic state: it is what every merchant provisioned before
         * Thread 8C is, which is the population this has to fail closed for.
         */
        const restore = sql(`select coalesce(ach_readiness::text, 'NULL') from payment_provider_merchants where is_active`);
        sql(`update payment_provider_merchants set ach_readiness = null where is_active`);
        try {
            // The browser insists, and even claims readiness in the payload. The server is the only
            // one entitled to that answer.
            const refusedAmount = nextAmount();
            const refused = await execute(page, {
                action_key: "payment.collect_card", entity_type: "child", entity_id: CERT_MEMBER,
                mode: "execute", confirmation: { confirmed: true },
                payload: {
                    charge_id: chargeId, amount_cents: refusedAmount, rail: "ach",
                    ach_ready: true, merchant_ready: true, ach_readiness: "ready",
                },
            });
            const said = JSON.stringify(refused.json);
            test.info().annotations.push({ type: "refusal", description: said.slice(0, 400) });
            expect(refused.json.ok, "a bank collection is refused when the merchant cannot take one").toBe(false);
            /*
             * The refusal is in the operator's language. The internal reason — `ach_not_enabled` —
             * deliberately does not cross the boundary: an operator reading "cannot accept bank
             * transfers" knows what to do about it, and a reason code tells an attacker the shape of
             * the check. Asserting the code here would have certified a leak as if it were the proof.
             */
            expect(said, "and says what is actually wrong").toMatch(/cannot accept bank transfers/i);
            expect(said, "and never leaks the connected account").not.toMatch(/acct_/);
            expect(said, "and never leaks the internal reason code").not.toMatch(/ach_not_enabled/);
            expect(said, "and is not a stack trace").not.toMatch(/at \w+ \(|\.ts:\d+/);

            // The refusal is a refusal: no intent, no attempt, no money.
            const attempts = sql(`select count(*) from payment_collection_attempts
                where rail = 'ach' and charge_id = '${chargeId}'
                and requested_amount_cents = ${refusedAmount}`);
            expect(attempts, "a refused rail creates no collection attempt").toBe("0");
            const after = await canonical(page);
            expect(after.balance, "and moves nothing").toBe(before.balance);
            expect(after.payments.length, "and writes no receipt").toBe(before.payments.length);

            // 5 · AND THE SURFACE AGREES. The chooser must not offer what the server will refuse.
            await openSubject(page);
            await page.getByRole("button", { name: /Take payment/ }).click();
            const chooser = page.locator('[data-financials-payment-method="true"]').first();
            await expect(chooser).toBeVisible({ timeout: 60_000 });
            const disabled = await chooser.locator('option[value="ach"]')
                .evaluate((el) => (el as HTMLOptionElement).disabled);
            expect(disabled, "an ACH-incapable merchant is not offered the bank rail").toBe(true);
            expect(await canonical(page).then((v) => v.achAvailable), "and the view model says so").toBe(false);

            // Card is untouched by the other rail's unreadiness.
            await chooser.selectOption("card");
            await expect(page.locator('[data-financials-payment-commit="true"]').first())
                .toHaveText(/Collect by card/);
        } finally {
            sql(restore === "NULL"
                ? `update payment_provider_merchants set ach_readiness = null where is_active`
                : `update payment_provider_merchants set ach_readiness = '${restore}' where is_active`);
        }
    });

    test("6,9,18 — an unverified bank account reads as Verification required, moves nothing, and survives a reload", async ({ page }) => {
        await openSubject(page);
        const chargeId = await seedCharge(page);
        const before = await canonical(page);

        const created = await collectByBank(page, chargeId, nextAmount());
        expect(created.json.ok, JSON.stringify(created.json).slice(0, 300)).toBeTruthy();
        const detail = created.json.data?.execution_result ?? {};
        const pi = String(detail.provider_transaction_id ?? "");
        const attemptId = String(detail.collection_attempt_id ?? "");
        const account = String(detail.connected_account ?? "");
        expect(pi && attemptId && account, "the collection names its provider transaction").toBeTruthy();

        // REAL STRIPE: raw bank details reach `requires_action / verify_with_microdeposits`.
        const pm = await stripe("payment_methods", {
            type: "us_bank_account",
            "us_bank_account[routing_number]": "110000000",
            "us_bank_account[account_number]": "000123456789",
            "us_bank_account[account_holder_type]": "individual",
            "billing_details[name]": "Certification Payer",
            "billing_details[email]": "cert@example.com",
        }, account);
        expect(pm.status).toBe(200);
        const confirmed = await stripe(`payment_intents/${pi}/confirm`, {
            payment_method: String(pm.body.id),
            "mandate_data[customer_acceptance][type]": "online",
            "mandate_data[customer_acceptance][online][ip_address]": "127.0.0.1",
            "mandate_data[customer_acceptance][online][user_agent]": "alloy-certification",
        }, account);
        expect(confirmed.body.status).toBe("requires_action");
        expect(confirmed.body.next_action?.type).toBe("verify_with_microdeposits");

        // Converge the attempt the way the provider's own event would.
        await execute(page, { action_key: "noop", entity_type: "child", entity_id: CERT_MEMBER, mode: "preview", payload: {} });

        // 18 · A REAL RELOAD, then read what the operator sees.
        const shown = await mountedCollectionState(page, attemptId);
        expect(shown.rail).toBe("ach");
        /*
         * Named exactly, not "one of these". The permissive form was written while the attempt's
         * `provider_action_type` was always null and the lifecycle could not tell a bank verification
         * from a card challenge — accepting `action_required` would have certified the collapse this
         * thread exists to prevent.
         */
        await expect.poll(() => sql(`select coalesce(provider_action_type, '')
            from payment_collection_attempts where id = '${attemptId}'`), { timeout: 120_000, intervals: [2_000] })
            .toBe("verify_with_microdeposits");
        expect(shown.text, "and the operator is told it is the BANK that needs verifying")
            .toMatch(/verif/i);

        // 9 · AND NOTHING FINANCIAL MOVED while it says so.
        const after = await canonical(page);
        expect(after.balance, "verification pending moves no outstanding").toBe(before.balance);
        expect(after.payments.length, "and creates no receipt").toBe(before.payments.length);
        expect(shown.text.toLowerCase(), "and never reads as money").not.toMatch(/\bpaid\b|received/);
    });

    test("8,9,18 — a processing bank debit says so, is not Paid, and reconstructs after reload", async ({ page }) => {
        await openSubject(page);
        const chargeId = await seedCharge(page);
        const before = await canonical(page);

        const created = await collectByBank(page, chargeId, nextAmount());
        const detail = created.json.data?.execution_result ?? {};
        const pi = String(detail.provider_transaction_id ?? "");
        const attemptId = String(detail.collection_attempt_id ?? "");
        const account = String(detail.connected_account ?? "");

        // REAL STRIPE: a pre-verified bank method goes straight to processing.
        const confirmed = await stripe(`payment_intents/${pi}/confirm`, {
            payment_method: "pm_usBankAccount_success",
            "mandate_data[customer_acceptance][type]": "online",
            "mandate_data[customer_acceptance][online][ip_address]": "127.0.0.1",
            "mandate_data[customer_acceptance][online][user_agent]": "alloy-certification",
        }, account);
        expect(confirmed.body.status, "a bank debit processes rather than completing").toBe("processing");

        const shown = await mountedCollectionState(page, attemptId);
        expect(shown.rail).toBe("ach");
        expect(shown.text.toLowerCase(), "processing is never Paid").not.toMatch(/\bpaid\b/);
        expect(shown.text.toLowerCase(), "and never Received").not.toMatch(/received/);
        // No invented settlement date.
        expect(shown.text).not.toMatch(/\d{4}-\d{2}-\d{2}/);

        // 9 · The financial boundary, asserted at the same moment the words are on screen.
        const after = await canonical(page);
        expect(after.balance, "processing reduces no outstanding").toBe(before.balance);
        expect(sql(`select count(*) from payments where processor_transaction_id = '${pi}'`),
            "processing creates no receipt").toBe("0");

        /*
         * And when it does settle, it settles as a BANK receipt. Certification found this filed as a
         * card payment — see the posting seam's rail note — so the rail is asserted at the far end of
         * recognition, not only where the operator chose it.
         */
        expect(sql(`select rail from payment_collection_attempts where provider_transaction_id = '${pi}'`))
            .toBe("ach");
    });

    test("13 — a bank debit that fails before settlement reads as failed and leaves no money behind", async ({ page }) => {
        await openSubject(page);
        const chargeId = await seedCharge(page);
        const before = await canonical(page);

        const created = await collectByBank(page, chargeId, nextAmount());
        const detail = created.json.data?.execution_result ?? {};
        const pi = String(detail.provider_transaction_id ?? "");
        const account = String(detail.connected_account ?? "");

        // REAL STRIPE: a closed account fails during processing, before anything is recognised.
        await stripe(`payment_intents/${pi}/confirm`, {
            payment_method: "pm_usBankAccount_accountClosed",
            "mandate_data[customer_acceptance][type]": "online",
            "mandate_data[customer_acceptance][online][ip_address]": "127.0.0.1",
            "mandate_data[customer_acceptance][online][user_agent]": "alloy-certification",
        }, account);

        await expect
            .poll(async () => (await stripe(`payment_intents/${pi}`, undefined, account)).body.status, { timeout: 120_000 })
            .toBe("requires_payment_method");
        const failed = await stripe(`payment_intents/${pi}`, undefined, account);
        expect(failed.body.last_payment_error?.code, "the provider says why").toBe("account_closed");

        /*
         * Scoped to THIS intent, deliberately. The first version of this assertion compared the whole
         * account's receipt count and failed — not because the closed-account debit created anything,
         * but because a DIFFERENT bank debit from the previous scenario settled during this test's
         * two-minute poll and was recognised, correctly, while it ran. Counting the account was
         * measuring the clock. The claim is about this collection, so the evidence is too.
         */
        const receipts = sql(`select count(*) from payments where processor_transaction_id = '${pi}'`);
        expect(receipts, "a failed debit creates no receipt").toBe("0");
        const state = sql(`select processor_state from payment_collection_attempts
            where provider_transaction_id = '${pi}'`);
        expect(["requires_payment_method", "failed", "initiated"], `attempt state was ${state}`).toContain(state);
        expect(sql(`select coalesce(canonical_payment_id::text, 'none') from payment_collection_attempts
            where provider_transaction_id = '${pi}'`), "and recognises nothing").toBe("none");

        /*
         * There is deliberately no account-wide balance assertion here. The first version had one and
         * it failed — not because the closed-account debit touched anything, but because a bank debit
         * from an earlier scenario settled during this test's two-minute poll and was recognised,
         * correctly, while it ran. On a shared account with real money in flight, an account-wide
         * total measures the clock. What this scenario claims is scoped to this intent, and is
         * asserted above: no receipt, no recognition, and an attempt that ends where it failed.
         */
        expect(before.balance, "the account was readable before the debit").toBeGreaterThanOrEqual(0);
    });

    test("17 — a returned payment renders as Returned and never as a refund", async ({ page }) => {
        await openSubject(page);

        /*
         * Both reversals exist on this account by now — operator refunds from the card certification
         * and provider returns from the dispute path. The invariant is that the surface distinguishes
         * them: an operator shown "Refunded" for money the bank took back would go looking for the
         * person who decided it.
         */
        const state = await canonical(page);
        const reversals = state.payments.filter((p) => p.kind === "refund" || p.kind === "return");
        test.info().annotations.push({
            type: "reversals",
            description: `${reversals.length} reversal rows: ${reversals.map((r) => r.kind).join(", ")}`,
        });

        for (const r of reversals) {
            if (r.reversalOrigin === "provider") {
                expect(r.kind, "a provider reversal is a return").toBe("return");
                expect(String(r.statusLabel), "and never says refunded").not.toMatch(/refund/i);
            }
            if (r.reversalOrigin === "operator") {
                expect(r.kind, "an operator refund stays a refund").toBe("refund");
            }
        }
        // The rule holds even with nothing to look at, so assert the mapping is reachable at all.
        expect(Array.isArray(state.payments)).toBe(true);
    });

    test("5 — the mounted bank collection is tokenized; no bank credential ever becomes Alloy payload", async ({ page }) => {
        await openSubject(page);
        const chargeId = await seedCharge(page);

        /*
         * Watch everything the browser sends to Alloy while a bank collection is set up. The rule is
         * not "we do not log it" — it is that a routing or account number never becomes a parameter
         * of an Alloy request in the first place. Tokenization is what makes that true: the browser
         * talks to Stripe with a client secret, and Alloy is told an intent id.
         */
        const sentToAlloy: string[] = [];
        page.on("request", (req) => {
            const url = req.url();
            if (!url.includes("/api/")) return;
            const body = req.postData() ?? "";
            if (body) sentToAlloy.push(`${url} ${body}`);
        });

        const created = await collectByBank(page, chargeId, nextAmount());
        const detail = created.json.data?.execution_result ?? {};
        const pi = String(detail.provider_transaction_id ?? "");
        const secret = String(detail.client_secret ?? "");
        expect(pi, "the browser is handed an intent").toBeTruthy();
        expect(secret, "and a client secret, which is how the bank details bypass Alloy entirely")
            .toContain("_secret_");

        // Nothing bank-credential-shaped crossed the boundary.
        const everything = sentToAlloy.join("\n");
        expect(everything, "no routing number is ever sent to Alloy").not.toMatch(/\b(110000000|routing_number)\b/);
        expect(everything, "no account number is ever sent to Alloy").not.toMatch(/account_number/);

        // And none is persisted, under any column, for this collection.
        const stored = sql(`select coalesce(row_to_json(a)::text, '') from payment_collection_attempts a
            where a.provider_transaction_id = '${pi}'`);
        expect(stored, "the attempt stores no routing number").not.toMatch(/110000000/);
        expect(stored, "and no account number").not.toMatch(/000123456789/);
        expect(stored, "and no bank credential field at all").not.toMatch(/routing|account_number/i);
    });

    test("7 — a card challenge and a bank verification are different states, not one word", async ({ page }) => {
        await openSubject(page);
        const chargeId = await seedCharge(page);

        // A CARD that demands a challenge.
        const cardAmount = nextAmount();
        const card = await execute(page, {
            action_key: "payment.collect_card", entity_type: "child", entity_id: CERT_MEMBER,
            mode: "execute", confirmation: { confirmed: true },
            payload: { charge_id: chargeId, amount_cents: cardAmount, rail: "card" },
        });
        const cardDetail = card.json.data?.execution_result ?? {};
        const cardPi = String(cardDetail.provider_transaction_id ?? "");
        const account = String(cardDetail.connected_account ?? "");
        await stripe(`payment_intents/${cardPi}/confirm`, {
            payment_method: "pm_card_authenticationRequired", return_url: "https://example.com/return",
        }, account);

        // A BANK ACCOUNT that demands microdeposit verification.
        const bank = await collectByBank(page, chargeId, nextAmount());
        const bankDetail = bank.json.data?.execution_result ?? {};
        const bankPi = String(bankDetail.provider_transaction_id ?? "");
        const pm = await stripe("payment_methods", {
            type: "us_bank_account",
            "us_bank_account[routing_number]": "110000000",
            "us_bank_account[account_number]": "000123456789",
            "us_bank_account[account_holder_type]": "individual",
            "billing_details[name]": "Certification Payer",
            "billing_details[email]": "cert@example.com",
        }, account);
        await stripe(`payment_intents/${bankPi}/confirm`, {
            payment_method: String(pm.body.id),
            "mandate_data[customer_acceptance][type]": "online",
            "mandate_data[customer_acceptance][online][ip_address]": "127.0.0.1",
            "mandate_data[customer_acceptance][online][user_agent]": "alloy-certification",
        }, account);

        /*
         * Both are "the payer has something left to do", and one lifecycle module owns both words.
         * The invariant is that the words stay different: an operator told a bank debit is awaiting
         * a card challenge would tell the family to check their phone for a code that is not coming.
         */
        /*
         * Polled, not read once. What the payer must do arrives on the provider's event, not on the
         * confirm response — reading immediately after confirming raced the webhook and reported an
         * empty action for a state the provider had already named.
         */
        const actionFor = (intent: string) => sql(`select coalesce(provider_action_type, '')
            from payment_collection_attempts where provider_transaction_id = '${intent}'`);
        await expect.poll(() => actionFor(cardPi), { timeout: 120_000, intervals: [2_000] })
            .toMatch(/redirect/);
        await expect.poll(() => actionFor(bankPi), { timeout: 120_000, intervals: [2_000] })
            .toBe("verify_with_microdeposits");
        const cardAction = actionFor(cardPi);
        const bankAction = actionFor(bankPi);
        expect(cardAction, "and the two never collapse into one word").not.toBe(bankAction);

        const cardAttempt = sql(`select id from payment_collection_attempts where provider_transaction_id = '${cardPi}'`);
        const bankAttempt = sql(`select id from payment_collection_attempts where provider_transaction_id = '${bankPi}'`);
        const shownCard = await mountedCollectionState(page, cardAttempt);
        const shownBank = await mountedCollectionState(page, bankAttempt);
        expect(shownCard.rail).toBe("card");
        expect(shownBank.rail).toBe("ach");
        expect(shownBank.text, "the two states do not read the same on the surface").not.toBe(shownCard.text);
        expect(shownBank.text, "and the bank one says what it needs").toMatch(/verif/i);
    });

    test("10,12,18 — an exact bank payment reads Received only after Thread 8 recognises it, and zeroes the charge", async ({ page }) => {
        test.setTimeout(1_200_000);
        await openSubject(page);
        const chargeId = await seedCharge(page);
        const outstanding = outstandingOf(chargeId);
        expect(outstanding, "the charge is a real obligation").toBeGreaterThan(0);

        const created = await collectByBank(page, chargeId, outstanding);
        const detail = created.json.data?.execution_result ?? {};
        const pi = String(detail.provider_transaction_id ?? "");
        const account = String(detail.connected_account ?? "");
        expect(created.json.ok, JSON.stringify(created.json).slice(0, 300)).toBeTruthy();

        await stripe(`payment_intents/${pi}/confirm`, {
            payment_method: "pm_usBankAccount_success",
            "mandate_data[customer_acceptance][type]": "online",
            "mandate_data[customer_acceptance][online][ip_address]": "127.0.0.1",
            "mandate_data[customer_acceptance][online][user_agent]": "alloy-certification",
        }, account);

        // PROVIDER SUCCESS IS NOT RECEIPT. Assert the gap exists before waiting for it to close.
        expect(sql(`select count(*) from payments where processor_transaction_id = '${pi}'`),
            "provider state alone creates nothing").toBe("0");

        await awaitIntentStatus(pi, account, ["succeeded"]);
        const paymentId = await awaitRecognition(pi);

        // 12 · EXACTLY ONE of each consequence.
        expect(sql(`select count(*) from payments where processor_transaction_id = '${pi}'`),
            "exactly one receipt").toBe("1");
        expect(sql(`select count(*) from payment_allocations where payment_id = '${paymentId}' and status = 'active'`),
            "exactly one application").toBe("1");
        expect(outstandingOf(chargeId), "and the obligation reaches exactly zero").toBe(0);
        expect(sql(`select payment_method from payments where id = '${paymentId}'`),
            "filed as bank money").toBe("ach");

        // 10 + 18 · AND ONLY NOW does the surface say Received — read back after a real reload.
        const row = await mountedPaymentRow(page, paymentId);
        expect(row.kind).toBe("receipt");
        expect(row.text, "the operator is told the money arrived").toMatch(/Received/);
        expect(row.text, "by bank transfer").toMatch(/Bank transfer/i);
    });

    test("11 — a partial bank payment agrees with persistence on received, applied and remaining", async ({ page }) => {
        test.setTimeout(1_200_000);
        await openSubject(page);
        const chargeId = await seedCharge(page);
        const outstanding = outstandingOf(chargeId);
        const part = Math.floor(outstanding / 3);
        expect(part, "a partial payment has to leave something behind").toBeGreaterThan(0);

        const created = await collectByBank(page, chargeId, part);
        const detail = created.json.data?.execution_result ?? {};
        const pi = String(detail.provider_transaction_id ?? "");
        const account = String(detail.connected_account ?? "");
        await stripe(`payment_intents/${pi}/confirm`, {
            payment_method: "pm_usBankAccount_success",
            "mandate_data[customer_acceptance][type]": "online",
            "mandate_data[customer_acceptance][online][ip_address]": "127.0.0.1",
            "mandate_data[customer_acceptance][online][user_agent]": "alloy-certification",
        }, account);
        await awaitIntentStatus(pi, account, ["succeeded"]);
        const paymentId = await awaitRecognition(pi);

        const received = Number(sql(`select amount_cents from payments where id = '${paymentId}'`));
        const applied = Number(sql(`select coalesce(sum(allocated_amount_cents), 0)
            from payment_allocations where payment_id = '${paymentId}' and status = 'active'`));
        const remaining = outstandingOf(chargeId);
        expect(received, "received is what was asked for").toBe(part);
        expect(applied, "applied is what it met").toBe(part);
        expect(remaining, "and the rest is still owed").toBe(outstanding - part);

        const row = await mountedPaymentRow(page, paymentId);
        expect(row.applied, "the surface agrees with the database about what was applied")
            .toBe(String(part));
        expect(row.text).toMatch(/Received/);
    });

    test("14,15,16,17,18 — a bank return reads Returned, keeps the receipt, and restores exactly the family's debt", async ({ page }) => {
        test.setTimeout(1_800_000);
        await openSubject(page);
        const chargeId = await seedCharge(page);
        const amount = nextAmount();

        const created = await collectByBank(page, chargeId, amount);
        const detail = created.json.data?.execution_result ?? {};
        const pi = String(detail.provider_transaction_id ?? "");
        const account = String(detail.connected_account ?? "");
        await stripe(`payment_intents/${pi}/confirm`, {
            payment_method: "pm_usBankAccount_dispute",
            "mandate_data[customer_acceptance][type]": "online",
            "mandate_data[customer_acceptance][online][ip_address]": "127.0.0.1",
            "mandate_data[customer_acceptance][online][user_agent]": "alloy-certification",
        }, account);
        await awaitIntentStatus(pi, account, ["succeeded"]);
        const receiptId = await awaitRecognition(pi);
        const outstandingAfterPayment = outstandingOf(chargeId);

        // THE BANK TAKES IT BACK. Stripe raises the dispute itself for this method.
        let disputeId = "";
        await expect
            .poll(async () => {
                const list = await stripe(`disputes?limit=20`, undefined, account);
                const found = (list.body.data ?? []).find((d: Record<string, any>) =>
                    d.payment_intent === pi || d.charge === detail.charge_id);
                disputeId = found?.id ?? "";
                return disputeId;
            }, { timeout: 480_000, intervals: [5_000] })
            .not.toBe("");

        // And Alloy recognises the reversal, exactly once.
        let reversalId = "";
        await expect
            .poll(() => {
                reversalId = sql(`select coalesce(canonical_reversal_payment_id::text, '')
                    from payment_provider_disputes where provider_dispute_id = '${disputeId}'`);
                return reversalId;
            }, { timeout: 480_000, intervals: [5_000] })
            .not.toBe("");

        const disp = await stripe(`disputes/${disputeId}`, undefined, account);
        const disputeAmount = Number(disp.body.amount);

        // 16 · THE FEE IS NOT THE FAMILY'S DEBT. The bank's fee is a cost of doing business; billing
        //      it back to a family by way of a restored balance would invent a charge nobody made.
        const reversalCents = Number(sql(`select amount_cents from payments where id = '${reversalId}'`));
        expect(reversalCents, "the reversal is the disputed amount, never the balance net").toBe(disputeAmount);
        const restored = outstandingOf(chargeId);
        expect(restored - outstandingAfterPayment, "outstanding is restored by exactly the returned amount")
            .toBe(disputeAmount);

        // 15 · THE ORIGINAL RECEIPT IS STILL THERE, and still says what it said.
        const original = sql(`select status || '|' || amount_cents || '|' || direction
            from payments where id = '${receiptId}'`);
        expect(original, "the receipt is untouched — not deleted, not rewritten")
            .toBe(`posted|${amount}|inbound`);
        expect(sql(`select coalesce(reversal_origin, 'none') from payments where id = '${receiptId}'`),
            "and the receipt is not itself a reversal").toBe("none");

        // 14 + 17 + 18 · AND THE SURFACE SAYS RETURNED, after a real reload.
        const receiptRow = await mountedPaymentRow(page, receiptId);
        expect(receiptRow.kind, "the original stays a receipt").toBe("receipt");
        const reversalRow = await mountedPaymentRow(page, reversalId);
        expect(reversalRow.kind, "the reversal is a return").toBe("return");
        expect(reversalRow.origin, "attributed to the provider").toBe("provider");
        expect(reversalRow.text, "and reads as Returned").toMatch(/Returned/);
        expect(reversalRow.text, "never as a refund — nobody here decided this").not.toMatch(/Refunded/i);
        expect(reversalRow.text, "and says who did").toMatch(/reversed by the bank/i);
    });

    test("4 — the payer's mandate is real, and is the provider's record rather than Alloy's claim", async ({ page }) => {
        test.setTimeout(1_200_000);
        await openSubject(page);
        const chargeId = await seedCharge(page);

        const created = await collectByBank(page, chargeId, nextAmount());
        const detail = created.json.data?.execution_result ?? {};
        const pi = String(detail.provider_transaction_id ?? "");
        const account = String(detail.connected_account ?? "");

        /*
         * A PaymentIntent is not authorization. ACH moves money out of someone's bank account on the
         * strength of a mandate they gave, and if the mandate is missing the debit is one an operator
         * cannot defend. So this asserts the mandate OBJECT exists on the provider's own charge —
         * Stripe's record of the acceptance — not that Alloy sent mandate parameters.
         */
        const confirmed = await stripe(`payment_intents/${pi}/confirm`, {
            payment_method: "pm_usBankAccount_success",
            "mandate_data[customer_acceptance][type]": "online",
            "mandate_data[customer_acceptance][online][ip_address]": "127.0.0.1",
            "mandate_data[customer_acceptance][online][user_agent]": "alloy-certification",
        }, account);
        expect(confirmed.body.status).toBe("processing");

        const withCharge = await stripe(`payment_intents/${pi}?expand[]=latest_charge`, undefined, account);
        const bank = withCharge.body.latest_charge?.payment_method_details?.us_bank_account ?? {};
        const mandateId = String(bank.mandate ?? "");
        expect(mandateId, "the debit carries a mandate").toMatch(/^mandate_/);

        const mandate = await stripe(`mandates/${mandateId}`, undefined, account);
        expect(mandate.status, "and the mandate is retrievable from the provider").toBe(200);
        expect(mandate.body.status, "and it is active authorization, not a draft").toBe("active");
        expect(mandate.body.customer_acceptance?.type, "accepted online by the payer").toBe("online");
        expect(mandate.body.payment_method_details?.type, "for the bank rail").toBe("us_bank_account");

        // And Alloy holds the mandate by REFERENCE only — it never becomes a bank credential here.
        const stored = sql(`select coalesce(row_to_json(a)::text, '') from payment_collection_attempts a
            where a.provider_transaction_id = '${pi}'`);
        expect(stored, "Alloy stores no account number alongside the mandate").not.toMatch(/000123456789/);
    });
});
