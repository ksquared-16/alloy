/**
 * SLICE 6 — MOVING A PAYMENT, PROVEN IN THE BROWSER.
 *
 * The fixture is built through the operator's OWN actions (charge.add, charge.post, payment.record).
 * A fixture written straight into the tables proves a card can render something the product may not
 * be able to produce; this one cannot exist unless the product could make it.
 *
 * Household: Kurzman, which is the household this thread certifies against AND one whose row
 * actually mounts the Financials card. Amounts are fixed, and the fixture reuses what it finds, so a
 * rerun does not mint more money.
 *
 * Every money assertion is read back from the canonical account read, never recomputed here.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { alloyOptions, pickAlloyByValue } from "../helpers/alloyControls";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const ROUTE = "/workspace/work-unit/new-work-view-6?work_view_id=new_work_view_6";
const SUBJECT = "d097e1a8-c3c0-4c51-a113-2275b009b9a9";
const HOUSEHOLD = "0658832a-48d6-4b80-beae-0b12d573fdf2";

const SOURCE_LABEL = "Late pickup";      // template, 2500 — the charge the money first answers
const TARGET_LABEL = "Registration fee"; // 7500 — where the money should end up
const RECEIPT_CENTS = 2500;
/** PHASE 9's destination: a charge that gets settled between the preview and the confirm. */
const RACE_LABEL = "Materials";
/** The receipt PHASE 9 uses to settle that destination mid-decision. Recorded once, reused. */
const SETTLER_CENTS = 1800;

test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012" });

type Row = {
    chargeId: string; description: string; status: string;
    outstandingCents: number; amountCents: number; subjectMemberId: string | null;
};
type Application = { allocationId: string; chargeId: string | null; status: string; appliedCents: number };
type Payment = {
    paymentId: string; direction: string; amountCents: number; unappliedCents: number;
    payerLabel?: string | null; applications?: Application[];
};
type Vm = { rows?: Row[]; payments?: Payment[]; chargeTemplates?: Array<{ id: string; label: string }> };

/* ── canonical reads ─────────────────────────────────────────────────────────────────────────── */

async function vm(request: APIRequestContext): Promise<Vm> {
    const res = await request.get(`/api/admin/financials/card?customer_id=${HOUSEHOLD}`);
    expect(res.ok(), `card ${res.status()}`).toBe(true);
    return ((await res.json()) as { vm?: Vm }).vm ?? {};
}

const receipts = (v: Vm) => (v.payments ?? []).filter((p) => p.direction === "inbound");
/**
 * THE certification receipt. PHASE 9 records a second, smaller one to settle a charge mid-decision,
 * so "the first inbound payment" stops being a safe way to name the one these phases are about.
 */
const subject = (v: Vm) => {
    const mine = receipts(v).filter((p) => p.amountCents === RECEIPT_CENTS);
    expect(mine.length, "exactly one certification receipt of this amount").toBe(1);
    return mine[0];
};

const rowFor = (v: Vm, description: string, status?: string) =>
    (v.rows ?? []).find((r) => r.description === description && (!status || r.status === status));

async function execute(request: APIRequestContext, body: Record<string, unknown>) {
    const res = await request.post("/api/admin/actions/execute", {
        headers: { "content-type": "application/json" },
        data: body,
    });
    return { status: res.status(), json: (await res.json()) as Record<string, unknown> };
}

const entity = { entity_type: "opportunity", entity_id: SUBJECT };

/* ── fixture, built the way an operator would ────────────────────────────────────────────────── */

async function ensurePostedCharge(request: APIRequestContext, label: string): Promise<Row> {
    let v = await vm(request);
    const posted = rowFor(v, label, "posted");
    if (posted) return posted;

    let draft = rowFor(v, label, "draft");
    if (!draft) {
        const template = (v.chargeTemplates ?? []).find((t) => t.label === label);
        expect(template, `no charge template "${label}" in this household`).toBeTruthy();
        const { status, json } = await execute(request, {
            action_key: "charge.add", ...entity, mode: "execute",
            payload: { template_id: template!.id, customer_id: HOUSEHOLD },
        });
        expect(json.ok, `charge.add ${status} ${JSON.stringify(json).slice(0, 300)}`).toBe(true);
        v = await vm(request);
        draft = rowFor(v, label, "draft");
        expect(draft, `charge.add produced no draft "${label}"`).toBeTruthy();
    }
    const { status, json } = await execute(request, {
        action_key: "charge.post", ...entity, mode: "execute",
        payload: { charge_id: draft!.chargeId, customer_id: HOUSEHOLD },
    });
    expect(json.ok, `charge.post ${status} ${JSON.stringify(json).slice(0, 300)}`).toBe(true);
    const after = rowFor(await vm(request), label, "posted");
    expect(after, `"${label}" did not become posted`).toBeTruthy();
    return after!;
}

/**
 * PHASE 9 needs a destination it can SETTLE, and it must work on the tenth run as well as the first.
 *
 * `charge.add` is idempotent per template and period, so a "fresh" charge is not available — asking
 * again returns the one the last run already settled, and the chooser correctly stops offering a
 * charge that owes nothing. So the same charge is reopened instead, by reversing the application
 * that settled it, using the same action an operator would. One settling receipt is recorded once
 * and reused forever, which keeps this household at exactly two receipts however often this runs.
 */
async function settlingReceipt(request: APIRequestContext, chargeId: string): Promise<Payment> {
    const existing = receipts(await vm(request)).find((p) => p.amountCents === SETTLER_CENTS);
    if (existing) return existing;
    const { json } = await execute(request, {
        action_key: "payment.record", ...entity, mode: "execute",
        payload: {
            charge_id: chargeId, amount_cents: SETTLER_CENTS,
            payment_method: "cash", customer_id: HOUSEHOLD,
        },
    });
    expect(json.ok, `settling receipt ${JSON.stringify(json).slice(0, 300)}`).toBe(true);
    const made = receipts(await vm(request)).find((p) => p.amountCents === SETTLER_CENTS);
    expect(made, "the settling receipt was not recorded").toBeTruthy();
    return made!;
}

/** The destination, owing money again — whatever a previous run left behind. */
async function reopenedCharge(request: APIRequestContext, label: string): Promise<Row> {
    const row = await ensurePostedCharge(request, label);
    const settler = await settlingReceipt(request, row.chargeId);
    const current = ((await vm(request)).rows ?? []).find((r) => r.chargeId === row.chargeId)!;
    if (current.outstandingCents > 0) return current;

    for (const a of (settler.applications ?? []).filter((x) => x.status === "active" && x.chargeId === row.chargeId)) {
        const { json } = await execute(request, {
            action_key: "payment.reverse_application", ...entity, mode: "execute",
            payload: { allocation_id: a.allocationId, reason: "certification: reopening the destination" },
        });
        expect(json.ok, `reopening ${JSON.stringify(json).slice(0, 200)}`).toBe(true);
    }
    const reopened = ((await vm(request)).rows ?? []).find((r) => r.chargeId === row.chargeId)!;
    expect(reopened.outstandingCents, "the destination must owe something again").toBeGreaterThan(0);
    return reopened;
}

/** Record the receipt only if the household has none: a rerun must not mint more money. */
async function ensureFixture(request: APIRequestContext) {
    const source = await ensurePostedCharge(request, SOURCE_LABEL);
    const target = await ensurePostedCharge(request, TARGET_LABEL);
    let v = await vm(request);
    if (!(v.payments ?? []).length) {
        const { status, json } = await execute(request, {
            action_key: "payment.record", ...entity, mode: "execute",
            payload: { charge_id: source.chargeId, amount_cents: RECEIPT_CENTS, payment_method: "check", customer_id: HOUSEHOLD },
        });
        expect(json.ok, `payment.record ${status} ${JSON.stringify(json).slice(0, 300)}`).toBe(true);
        v = await vm(request);
    }
    const payment = subject(v);
    expect(payment, "the fixture produced no receipt").toBeTruthy();
    return { payment: payment!, sourceId: source.chargeId, targetId: target.chargeId };
}

/**
 * Put the receipt back on the charge this phase starts from.
 *
 * The fixture is idempotent about CREATING things, but a Move is a change of state: once a run has
 * moved the money, the next run no longer starts where the phase says it starts. Rather than skip or
 * re-mint, the starting position is re-established through the same two actions the operator uses.
 */
async function ensureAppliedTo(request: APIRequestContext, chargeId: string): Promise<Payment> {
    let payment = subject(await vm(request));
    const active = (payment.applications ?? []).filter((a) => a.status === "active");
    if (active.length === 1 && active[0].chargeId === chargeId && payment.unappliedCents === 0) return payment;

    for (const a of active) {
        const { json } = await execute(request, {
            action_key: "payment.reverse_application", ...entity, mode: "execute",
            payload: { allocation_id: a.allocationId, reason: "certification: restoring the starting position" },
        });
        expect(json.ok, `reverse ${JSON.stringify(json).slice(0, 200)}`).toBe(true);
    }
    payment = subject(await vm(request));
    const { json } = await execute(request, {
        action_key: "payment.apply_to_charge", ...entity, mode: "execute",
        payload: { payment_id: payment.paymentId, charge_id: chargeId, amount_cents: payment.unappliedCents },
    });
    expect(json.ok, `apply ${JSON.stringify(json).slice(0, 200)}`).toBe(true);
    return subject(await vm(request));
}

/* ── the card ────────────────────────────────────────────────────────────────────────────────── */

/**
 * The receipts and the Move panel live in the card's DETAIL surface, not on its face. Several early
 * returns in this component all render `data-financials-card`, so waiting for that attribute alone
 * lands on the compact card and finds no payments — which is how a first version of this spec failed.
 *
 * The "Details" control is drawn by the shared card shell through an onDetails prop, so it does not
 * carry this component's own data attribute and has to be found by name.
 */
async function openCard(page: Page) {
    await page.goto(`${ROUTE}&subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator('[data-financials-card="true"]').first()).toBeVisible({ timeout: 90_000 });
    const details = page.getByRole("button", { name: /^Details/ }).first();
    await expect(details, "the card must offer its detail view").toBeVisible({ timeout: 60_000 });
    await details.click();
    const detail = page.locator('[data-financials-overlay="detail"]');
    await expect(detail, "Details opens the surface the receipts and the Move panel live in")
        .toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2_000);
    return detail;
}

const card = (page: Page) => page.locator('[data-financials-overlay="detail"]');
const paymentRow = (page: Page, id: string) => card(page).locator(`[data-payment-id="${id}"]`);
const panel = (page: Page) => card(page).getByTestId("payment-move-panel");
/** Scoped to the expanded card: the identical testid exists in the inert copy behind it. */
const control = (page: Page, id: string) => card(page).getByTestId(id);

test.describe.configure({ mode: "serial" });

test.describe("Slice 6 — moving a payment, mounted", () => {
    test("PHASE 5 · the receipt renders with a real payer, and what it is answering", async ({ page }) => {
        test.setTimeout(300_000);
        const { payment, sourceId } = await ensureFixture(page.request);
        await openCard(page);

        const row = paymentRow(page, payment.paymentId);
        await expect(row, "the receipt must render").toBeVisible({ timeout: 60_000 });
        const text = (await row.innerText()).replace(/\s+/g, " ");

        // An absent payer is allowed to read as "—"; an invented one is not.
        const payer = payment.payerLabel ?? null;
        if (payer) expect(text, `payer ${payer} must appear on the row`).toContain(payer);
        else expect(text, "an unnamed payer reads as a dash, never as a guess").toContain("—");

        const app = row.locator(`[data-application-id]`).first();
        await expect(app).toBeVisible();
        expect(await app.getAttribute("data-application-status")).toBe("active");
        expect(rowFor(await vm(page.request), SOURCE_LABEL, "posted")!.chargeId).toBe(sourceId);
    });

    test("PHASE 6 · a full Move releases the source and answers the target", async ({ page }) => {
        test.setTimeout(420_000);
        const { sourceId, targetId } = await ensureFixture(page.request);
        const payment = await ensureAppliedTo(page.request, sourceId);
        const before = await vm(page.request);
        const reversedBefore = (payment.applications ?? []).filter((a) => a.status === "reversed").length;
        const beforeSource = (before.rows ?? []).find((r) => r.chargeId === sourceId)!;
        const beforeTarget = (before.rows ?? []).find((r) => r.chargeId === targetId)!;
        expect(beforeSource.outstandingCents, "the source starts settled").toBe(0);

        await openCard(page);
        const row = paymentRow(page, payment.paymentId);
        const active = row.locator('[data-application-status="active"]').first();
        await expect(active).toBeVisible({ timeout: 60_000 });

        await active.getByText("Move payment").click();
        await expect(panel(page), "the Move panel opens").toBeVisible();

        const target = control(page, "payment-move-target");
        await expect(target).toBeVisible();
        // The chooser is filled by a fetch the panel fires as it opens, so wait for it to answer.
        await expect
            .poll(async () => (await alloyOptions(page, "payment-move-target")).length, { timeout: 30_000 })
            .toBeGreaterThan(1);
        const options = (await alloyOptions(page, "payment-move-target")).map((o) => o.label);
        expect(options.join(" | "), "the target charge is offered").toContain(TARGET_LABEL);
        expect(options.join(" | "), "and never as a stored key").not.toMatch(/[a-z]+_[a-z]+/);
        // The chooser must not offer the charge the money is already on.
        expect(options.filter((o) => o.includes(SOURCE_LABEL)).length, "the source is not a destination").toBe(0);

        const confirm = control(page, "payment-move-confirm");
        await pickAlloyByValue(page, "payment-move-target", targetId);
        await expect(confirm, "Confirm stays disabled until the action has previewed").toBeDisabled();

        await control(page, "payment-move-reason").fill("Applied to the wrong charge");
        await control(page, "payment-move-preview-button").click();
        const preview = control(page, "payment-move-preview");
        await expect(preview, "the action previews the reversal").toBeVisible({ timeout: 60_000 });
        const previewText = (await preview.innerText()).replace(/\s+/g, " ");
        await expect(confirm).toBeEnabled();

        await confirm.click();
        await expect(panel(page), "the panel closes when the move lands").toBeHidden({ timeout: 90_000 });

        const after = await vm(page.request);
        const afterSource = (after.rows ?? []).find((r) => r.chargeId === sourceId)!;
        const afterTarget = (after.rows ?? []).find((r) => r.chargeId === targetId)!;
        const afterPayment = (after.payments ?? []).find((p) => p.paymentId === payment.paymentId)!;

        expect(afterSource.outstandingCents, "the source owes it again").toBe(RECEIPT_CENTS);
        expect(afterTarget.outstandingCents, "the target is answered by exactly the receipt")
            .toBe(beforeTarget.outstandingCents - RECEIPT_CENTS);
        expect(afterPayment.unappliedCents, "none of the money is loose afterwards").toBe(0);
        expect(afterPayment.amountCents, "the receipt is untouched").toBe(subject(before).amountCents);
        expect(afterPayment.payerLabel ?? null, "the payer is untouched").toBe(payment.payerLabel ?? null);

        const actives = (afterPayment.applications ?? []).filter((a) => a.status === "active");
        expect(actives.length, "exactly one active application").toBe(1);
        expect(actives[0].chargeId, "and it is the target").toBe(targetId);
        /*
         * History accumulates: this household has been certified before, so what is asserted is the
         * change THIS move made, not a total that would only hold on a pristine tenant.
         */
        const reversed = (afterPayment.applications ?? []).filter((a) => a.status === "reversed");
        expect(reversed.length, "the move added exactly one reversal").toBe(reversedBefore + 1);
        expect(
            reversed.some((a) => a.chargeId === sourceId),
            "and it is the source application that was reversed",
        ).toBe(true);
        expect(previewText.length, "the preview said something").toBeGreaterThan(0);
    });

    test("PHASE 10/11/12 · the lineage, and both charges, agree after the Move", async ({ page }) => {
        test.setTimeout(300_000);
        const v = await vm(page.request);
        const payment = subject(v);
        await openCard(page);
        const row = paymentRow(page, payment.paymentId);
        await expect(row).toBeVisible({ timeout: 60_000 });

        const apps = row.locator("[data-application-id]");
        expect(await apps.count(), "both the reversed and the active application remain").toBeGreaterThanOrEqual(2);
        const statuses = await apps.evaluateAll((els) => els.map((e) => e.getAttribute("data-application-status")));
        expect(statuses, "history is not rewritten").toContain("reversed");
        expect(statuses, "and the new application is there").toContain("active");
        expect((await row.innerText()).replace(/\s+/g, " "), "the reversal says why")
            .toContain("Applied to the wrong charge");
    });

    test("PHASE 7 · a preview for a different question does not stay valid", async ({ page }) => {
        test.setTimeout(300_000);
        const v = await vm(page.request);
        const payment = subject(v);
        await openCard(page);
        const row = paymentRow(page, payment.paymentId);
        const active = row.locator('[data-application-status="active"]').first();
        await expect(active).toBeVisible({ timeout: 60_000 });
        await active.getByText("Move payment").click();
        await expect(panel(page)).toBeVisible();

        const target = control(page, "payment-move-target");
        const confirm = control(page, "payment-move-confirm");
        const preview = control(page, "payment-move-preview");
        const destinations = (await alloyOptions(page, "payment-move-target")).filter((o) => o.value);
        const first = destinations[0]?.value ?? null;
        expect(first, "the chooser must offer at least one destination").toBeTruthy();

        await pickAlloyByValue(page, "payment-move-target", first!);
        await control(page, "payment-move-reason").fill("first reason");
        await control(page, "payment-move-preview-button").click();
        await expect(preview).toBeVisible({ timeout: 60_000 });
        await expect(confirm).toBeEnabled();

        // A. a different destination is a different question.
        if (destinations.length > 1) {
            const second = destinations[1]!.value;
            await pickAlloyByValue(page, "payment-move-target", second!);
            await expect(preview, "changing the destination clears the preview").toBeHidden();
            await expect(confirm, "and Confirm goes back to disabled").toBeDisabled();
            await control(page, "payment-move-preview-button").click();
            await expect(preview).toBeVisible({ timeout: 60_000 });
            await expect(confirm).toBeEnabled();
        }

        // B. a different reason is also a different question — it is what the reversal will record.
        await control(page, "payment-move-reason").fill("a different reason entirely");
        await expect(preview, "changing the reason clears the preview").toBeHidden();
        await expect(confirm, "and Confirm is disabled again").toBeDisabled();

        await control(page, "payment-move-cancel").click();
        await expect(panel(page)).toBeHidden();
    });

    test("PHASE 8 · unapplied money answers another charge, partially", async ({ page }) => {
        test.setTimeout(420_000);
        const v0 = await vm(page.request);
        const payment = subject(v0);
        const active = (payment.applications ?? []).find((a) => a.status === "active")!;
        const allocationId = active.allocationId;

        // Free the money through the real action, so the partial-apply state is one the product makes.
        const rev = await execute(page.request, {
            action_key: "payment.reverse_application", ...entity, mode: "execute",
            payload: { allocation_id: allocationId, reason: "certification: free it for a partial apply" },
        });
        expect(rev.json.ok, `reverse ${JSON.stringify(rev.json).slice(0, 300)}`).toBe(true);

        const freed = (await vm(page.request)).payments!.find((p) => p.paymentId === payment.paymentId)!;
        expect(freed.unappliedCents, "all of it is unapplied now").toBe(RECEIPT_CENTS);

        await openCard(page);
        const row = paymentRow(page, payment.paymentId);
        await expect(row).toBeVisible({ timeout: 60_000 });
        expect((await row.innerText()).replace(/\s+/g, " "), "the card says it is unapplied").toMatch(/unapplied/i);

        await row.getByText("Apply payment").click();
        await expect(panel(page)).toBeVisible();
        // Applying unapplied money undoes nothing, so it asks for no reason and needs no preview.
        await expect(control(page, "payment-move-reason")).toHaveCount(0);

        const target = control(page, "payment-move-target");
        const value = (await alloyOptions(page, "payment-move-target")).find((o) => o.value)?.value ?? null;
        await pickAlloyByValue(page, "payment-move-target", value!);
        const confirm = control(page, "payment-move-confirm");
        await expect(confirm, "no preview is required to apply free money").toBeEnabled();
        await confirm.click();
        await expect(panel(page)).toBeHidden({ timeout: 90_000 });

        const after = (await vm(page.request)).payments!.find((p) => p.paymentId === payment.paymentId)!;
        expect(after.amountCents, "the receipt is still the receipt").toBe(RECEIPT_CENTS);
        expect(after.unappliedCents, "the money went somewhere").toBeLessThan(RECEIPT_CENTS);
    });

    /**
     * PHASE 9/21 — THE MOVE THAT FAILS HALFWAY.
     *
     * A Move is a reversal and then an application. Once the reversal commits, a refusal on the
     * second half leaves the money unapplied — and saying "Move failed" would tell the operator the
     * opposite of what is true.
     *
     * The refusal is a real one and not a toggled UI state: the destination is SETTLED between the
     * preview and the confirm, by money arriving for it from somewhere else. That is an ordinary
     * race in a school office, and applying to a charge that owes nothing is refused by the service.
     */
    test("PHASE 9/21 · a failed re-apply says the money is loose, and it can be recovered", async ({ page }) => {
        test.setTimeout(420_000);
        const { sourceId } = await ensureFixture(page.request);
        const payment = await ensureAppliedTo(page.request, sourceId);
        const doomed = await reopenedCharge(page.request, RACE_LABEL);

        await openCard(page);
        const row = paymentRow(page, payment.paymentId);
        const active = row.locator('[data-application-status="active"]').first();
        await expect(active).toBeVisible({ timeout: 60_000 });
        await active.getByText("Move payment").click();
        await expect(panel(page)).toBeVisible();

        const target = control(page, "payment-move-target");
        await expect
            .poll(async () => (await alloyOptions(page, "payment-move-target")).length, { timeout: 30_000 })
            .toBeGreaterThan(1);
        await pickAlloyByValue(page, "payment-move-target", doomed.chargeId);
        await control(page, "payment-move-reason").fill("certification: destination settles mid-decision");
        await control(page, "payment-move-preview-button").click();
        await expect(control(page, "payment-move-preview")).toBeVisible({ timeout: 60_000 });

        // Somebody else's money answers that charge while the operator is deciding.
        const settler = await settlingReceipt(page.request, doomed.chargeId);
        const settle = await execute(page.request, {
            action_key: "payment.apply_to_charge", ...entity, mode: "execute",
            payload: {
                payment_id: settler.paymentId, charge_id: doomed.chargeId,
                amount_cents: doomed.outstandingCents,
            },
        });
        expect(settle.json.ok, `settling the destination ${JSON.stringify(settle.json).slice(0, 200)}`).toBe(true);

        await control(page, "payment-move-confirm").click();

        const notice = control(page, "payment-move-notice");
        await expect(notice, "the operator is told what actually happened").toBeVisible({ timeout: 90_000 });
        const said = (await notice.innerText()).replace(/\s+/g, " ");
        expect(said, "it must not claim nothing happened").not.toMatch(/^Move failed\.?$/i);
        expect(said, "it says the original application was reversed").toMatch(/reversed/i);
        expect(said, "and that the money is now unapplied").toMatch(/unapplied/i);

        // What persistence actually holds.
        const after = await vm(page.request);
        const afterPayment = subject(after);
        expect(afterPayment.unappliedCents, "the money is loose").toBe(RECEIPT_CENTS);
        expect(
            (after.rows ?? []).find((r) => r.chargeId === sourceId)!.outstandingCents,
            "the source owes it again",
        ).toBe(RECEIPT_CENTS);
        expect(
            (afterPayment.applications ?? []).some((a) => a.status === "active" && a.chargeId === doomed.chargeId),
            "nothing was applied to the destination that refused",
        ).toBe(false);

        // PHASE 21 — a cold reload must preserve the stranded state and keep the way out visible.
        await page.reload();
        await expect(page.locator('[data-financials-card="true"]').first()).toBeVisible({ timeout: 90_000 });
        await page.getByRole("button", { name: /^Details/ }).first().click();
        await expect(page.locator('[data-financials-overlay="detail"]')).toBeVisible({ timeout: 60_000 });
        await page.waitForTimeout(2_000);
        const reloaded = paymentRow(page, payment.paymentId);
        await expect(reloaded).toBeVisible({ timeout: 60_000 });
        expect((await reloaded.innerText()).replace(/\s+/g, " "), "still unapplied after a reload")
            .toMatch(/unapplied/i);
        await expect(reloaded.getByText("Apply payment"), "and the way out is offered").toBeVisible();

        // And the operator can actually take it.
        const recovered = await ensureAppliedTo(page.request, sourceId);
        expect(recovered.unappliedCents, "the money can be placed again").toBe(0);
    });

    test("PHASE 20 · a cold reload reconstructs all of it", async ({ page }) => {
        test.setTimeout(300_000);
        const expected = await vm(page.request);
        const payment = subject(expected);

        await openCard(page);
        /*
         * A reload returns the card to its face — that is correct, the detail view is not a route.
         * Re-opening it is what makes this a cold-reload proof: nothing below is reconstructed from
         * React state, because this render was built from persistence after a full page load.
         */
        await page.reload();
        await expect(page.locator('[data-financials-card="true"]').first()).toBeVisible({ timeout: 90_000 });
        await page.getByRole("button", { name: /^Details/ }).first().click();
        await expect(page.locator('[data-financials-overlay="detail"]')).toBeVisible({ timeout: 60_000 });
        await page.waitForTimeout(2_000);

        const row = paymentRow(page, payment.paymentId);
        await expect(row, "the receipt survives a reload").toBeVisible({ timeout: 60_000 });
        const apps = row.locator("[data-application-id]");
        expect(await apps.count(), "so does its whole history").toBeGreaterThanOrEqual(2);

        const reread = (await vm(page.request)).payments!.find((p) => p.paymentId === payment.paymentId)!;
        expect(reread.unappliedCents, "and the money reads the same").toBe(payment.unappliedCents);
    });

    test("PHASE 22 · the controls are reachable on a narrow viewport", async ({ page }) => {
        test.setTimeout(300_000);
        await page.setViewportSize({ width: 390, height: 844 });
        const v = await vm(page.request);
        const payment = subject(v);
        await openCard(page);
        const row = paymentRow(page, payment.paymentId);
        await expect(row).toBeVisible({ timeout: 60_000 });

        const opener = row.getByText(/Move payment|Apply payment/).first();
        await expect(opener).toBeVisible();
        await opener.scrollIntoViewIfNeeded();
        await opener.click();
        await expect(panel(page), "the panel opens at phone width").toBeVisible();
        for (const id of ["payment-move-target", "payment-move-confirm", "payment-move-cancel"]) {
            const el = page.getByTestId(id);
            await expect(el, `${id} must be reachable`).toBeVisible();
            const box = await el.boundingBox();
            expect(box, `${id} must have a box`).toBeTruthy();
            expect(box!.x, `${id} must not sit off-screen`).toBeGreaterThanOrEqual(-1);
            expect(box!.x + box!.width, `${id} must not overflow the viewport`).toBeLessThanOrEqual(391);
        }
        await control(page, "payment-move-cancel").click();
    });

    test("PHASE 13/23 · every surface tells the same story about the money", async ({ page }) => {
        test.setTimeout(300_000);
        const v = await vm(page.request);
        const payment = subject(v);
        const actives = (payment.applications ?? []).filter((a) => a.status === "active");

        await openCard(page);
        const row = paymentRow(page, payment.paymentId);
        await expect(row).toBeVisible({ timeout: 60_000 });
        const rendered = (await row.innerText()).replace(/\s+/g, " ");

        const money = (cents: number) =>
            (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

        // The card may show LESS than the canonical read. It may not disagree with it.
        expect(rendered, "the receipt total is the canonical one").toContain(money(payment.amountCents));
        expect(rendered, "and so is the unapplied figure").toContain(money(payment.unappliedCents));

        // The charge rows and the applications are two readings of the same allocations.
        const appliedFromRows = (v.rows ?? [])
            .filter((r) => actives.some((a) => a.chargeId === r.chargeId))
            .reduce((n, r) => n + (r.amountCents - r.outstandingCents), 0);
        const appliedFromPayment = payment.amountCents - payment.unappliedCents;
        expect(appliedFromRows, "charges and receipt agree on what is applied")
            .toBeGreaterThanOrEqual(appliedFromPayment);
    });
});
