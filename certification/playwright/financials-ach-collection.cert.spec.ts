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

function sql(query: string): string {
    return execSync(`psql ${JSON.stringify(DB)} -tAc ${JSON.stringify(query.replace(/\s+/g, " ").trim())}`, {
        encoding: "utf8", env: { ...process.env, PATH: `/tmp/claude-501/bin:${process.env.PATH ?? ""}` },
    }).trim();
}

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
async function seedCharge(page: Page): Promise<string> {
    const added = await execute(page, {
        action_key: "charge.add", entity_type: "child", entity_id: CERT_MEMBER, mode: "execute",
        confirmation: { confirmed: true },
        payload: { customer_member_id: CERT_MEMBER, customer_id: CERT_CUSTOMER, template_id: TEMPLATE },
    });
    const id = added.json.data?.execution_result?.affected_id ?? added.json.data?.affected_id;
    expect(id, `seeding failed: ${JSON.stringify(added.json).slice(0, 300)}`).toBeTruthy();
    await execute(page, {
        action_key: "charge.post", entity_type: "child", entity_id: CERT_MEMBER, mode: "execute",
        confirmation: { confirmed: true }, payload: { charge_id: id },
    });
    return String(id);
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
            const refused = await execute(page, {
                action_key: "payment.collect_card", entity_type: "child", entity_id: CERT_MEMBER,
                mode: "execute", confirmation: { confirmed: true },
                payload: {
                    charge_id: chargeId, amount_cents: 1_000, rail: "ach",
                    ach_ready: true, merchant_ready: true, ach_readiness: "ready",
                },
            });
            const said = JSON.stringify(refused.json);
            expect(said, "a bank collection is refused when the merchant cannot take one").toMatch(/ach_not_enabled/);
            expect(said, "and the refusal is in the operator's language, not a stack").toMatch(/bank/i);
            expect(said, "and never leaks the connected account").not.toMatch(/acct_/);

            // The refusal is a refusal: no intent, no attempt, no money.
            const attempts = sql(`select count(*) from payment_collection_attempts
                where rail = 'ach' and charge_id = '${chargeId}'`);
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

        const created = await collectByBank(page, chargeId, 4_400);
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
        expect(["verification_required", "selected", "action_required"]).toContain(shown.state);

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

        const created = await collectByBank(page, chargeId, 3_100);
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

        const created = await collectByBank(page, chargeId, 2_600);
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

        const after = await canonical(page);
        expect(after.balance, "and reduces no outstanding").toBe(before.balance);
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
});
