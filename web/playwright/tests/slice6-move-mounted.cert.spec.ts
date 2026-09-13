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

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const ROUTE = "/workspace/work-unit/new-work-view-6?work_view_id=new_work_view_6";
const SUBJECT = "d097e1a8-c3c0-4c51-a113-2275b009b9a9";
const HOUSEHOLD = "0658832a-48d6-4b80-beae-0b12d573fdf2";

const SOURCE_LABEL = "Late pickup";      // template, 2500 — the charge the money first answers
const TARGET_LABEL = "Registration fee"; // 7500 — where the money should end up
const RECEIPT_CENTS = 2500;

test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012" });

type Row = {
    chargeId: string; description: string; status: string;
    outstandingCents: number; amountCents: number; subjectMemberId: string | null;
};
type Application = { allocationId?: string; id?: string; chargeId: string; status: string; amountCents: number };
type Payment = { id: string; amountCents: number; unappliedCents: number; payerLabel?: string | null; applications?: Application[] };
type Vm = { rows?: Row[]; payments?: Payment[]; chargeTemplates?: Array<{ id: string; label: string }> };

/* ── canonical reads ─────────────────────────────────────────────────────────────────────────── */

async function vm(request: APIRequestContext): Promise<Vm> {
    const res = await request.get(`/api/admin/financials/card?customer_id=${HOUSEHOLD}`);
    expect(res.ok(), `card ${res.status()}`).toBe(true);
    return ((await res.json()) as { vm?: Vm }).vm ?? {};
}

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
    const payment = (v.payments ?? [])[0];
    expect(payment, "the fixture produced no receipt").toBeTruthy();
    return { payment: payment!, sourceId: source.chargeId, targetId: target.chargeId };
}

/* ── the card ────────────────────────────────────────────────────────────────────────────────── */

async function openCard(page: Page) {
    await page.goto(`${ROUTE}&subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    const card = page.locator('[data-financials-card="true"]').first();
    await expect(card).toBeVisible({ timeout: 90_000 });
    await page.waitForTimeout(4_000); // the payments section arrives with the account read
    return card;
}

const paymentRow = (page: Page, id: string) => page.locator(`[data-payment-id="${id}"]`);
const panel = (page: Page) => page.getByTestId("payment-move-panel");

test.describe.configure({ mode: "serial" });

test.describe("Slice 6 — moving a payment, mounted", () => {
    test("PHASE 5 · the receipt renders with a real payer, and what it is answering", async ({ page }) => {
        test.setTimeout(300_000);
        const { payment, sourceId } = await ensureFixture(page.request);
        await openCard(page);

        const row = paymentRow(page, payment.id);
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
        const { payment, sourceId, targetId } = await ensureFixture(page.request);
        const before = await vm(page.request);
        const beforeSource = (before.rows ?? []).find((r) => r.chargeId === sourceId)!;
        const beforeTarget = (before.rows ?? []).find((r) => r.chargeId === targetId)!;
        expect(beforeSource.outstandingCents, "the source starts settled").toBe(0);

        await openCard(page);
        const row = paymentRow(page, payment.id);
        const active = row.locator('[data-application-status="active"]').first();
        await expect(active).toBeVisible({ timeout: 60_000 });

        await active.getByText("Move payment").click();
        await expect(panel(page), "the Move panel opens").toBeVisible();

        const target = page.getByTestId("payment-move-target");
        await expect(target).toBeVisible();
        const options = await target.locator("option").allTextContents();
        expect(options.join(" | "), "the target charge is offered").toContain(TARGET_LABEL);
        // The chooser must not offer the charge the money is already on.
        expect(options.filter((o) => o.includes(SOURCE_LABEL)).length, "the source is not a destination").toBe(0);

        const confirm = page.getByTestId("payment-move-confirm");
        await target.selectOption(targetId);
        await expect(confirm, "Confirm stays disabled until the action has previewed").toBeDisabled();

        await page.getByTestId("payment-move-reason").fill("Applied to the wrong charge");
        await page.getByTestId("payment-move-preview-button").click();
        const preview = page.getByTestId("payment-move-preview");
        await expect(preview, "the action previews the reversal").toBeVisible({ timeout: 60_000 });
        const previewText = (await preview.innerText()).replace(/\s+/g, " ");
        await expect(confirm).toBeEnabled();

        await confirm.click();
        await expect(panel(page), "the panel closes when the move lands").toBeHidden({ timeout: 90_000 });

        const after = await vm(page.request);
        const afterSource = (after.rows ?? []).find((r) => r.chargeId === sourceId)!;
        const afterTarget = (after.rows ?? []).find((r) => r.chargeId === targetId)!;
        const afterPayment = (after.payments ?? []).find((p) => p.id === payment.id)!;

        expect(afterSource.outstandingCents, "the source owes it again").toBe(RECEIPT_CENTS);
        expect(afterTarget.outstandingCents, "the target is answered by exactly the receipt")
            .toBe(beforeTarget.outstandingCents - RECEIPT_CENTS);
        expect(afterPayment.unappliedCents, "none of the money is loose afterwards").toBe(0);
        expect(afterPayment.amountCents, "the receipt is untouched").toBe(before.payments![0].amountCents);
        expect(afterPayment.payerLabel ?? null, "the payer is untouched").toBe(payment.payerLabel ?? null);

        const actives = (afterPayment.applications ?? []).filter((a) => a.status === "active");
        expect(actives.length, "exactly one active application").toBe(1);
        expect(actives[0].chargeId, "and it is the target").toBe(targetId);
        const reversed = (afterPayment.applications ?? []).filter((a) => a.status === "reversed");
        expect(reversed.length, "history keeps the reversed one").toBe(1);
        expect(previewText.length, "the preview said something").toBeGreaterThan(0);
    });

    test("PHASE 10/11/12 · the lineage, and both charges, agree after the Move", async ({ page }) => {
        test.setTimeout(300_000);
        const v = await vm(page.request);
        const payment = (v.payments ?? [])[0];
        await openCard(page);
        const row = paymentRow(page, payment.id);
        await expect(row).toBeVisible({ timeout: 60_000 });

        const apps = row.locator("[data-application-id]");
        expect(await apps.count(), "both the reversed and the active application remain").toBeGreaterThanOrEqual(2);
        const statuses = await apps.evaluateAll((els) => els.map((e) => e.getAttribute("data-application-status")));
        expect(statuses, "history is not rewritten").toContain("reversed");
        expect(statuses, "and the new application is there").toContain("active");
        expect((await row.innerText()).replace(/\s+/g, " "), "the reversal says why")
            .toContain("Applied to the wrong charge");
    });

    test("PHASE 8 · unapplied money answers another charge, partially", async ({ page }) => {
        test.setTimeout(420_000);
        const v0 = await vm(page.request);
        const payment = (v0.payments ?? [])[0];
        const active = (payment.applications ?? []).find((a) => a.status === "active")!;
        const allocationId = active.allocationId ?? active.id!;

        // Free the money through the real action, so the partial-apply state is one the product makes.
        const rev = await execute(page.request, {
            action_key: "payment.reverse_application", ...entity, mode: "execute",
            payload: { allocation_id: allocationId, reason: "certification: free it for a partial apply" },
        });
        expect(rev.json.ok, `reverse ${JSON.stringify(rev.json).slice(0, 300)}`).toBe(true);

        const freed = (await vm(page.request)).payments!.find((p) => p.id === payment.id)!;
        expect(freed.unappliedCents, "all of it is unapplied now").toBe(RECEIPT_CENTS);

        await openCard(page);
        const row = paymentRow(page, payment.id);
        await expect(row).toBeVisible({ timeout: 60_000 });
        expect((await row.innerText()).replace(/\s+/g, " "), "the card says it is unapplied").toMatch(/unapplied/i);

        await row.getByText("Apply payment").click();
        await expect(panel(page)).toBeVisible();
        // Applying unapplied money undoes nothing, so it asks for no reason and needs no preview.
        await expect(page.getByTestId("payment-move-reason")).toHaveCount(0);

        const target = page.getByTestId("payment-move-target");
        const value = await target.locator("option").nth(1).getAttribute("value");
        await target.selectOption(value!);
        const confirm = page.getByTestId("payment-move-confirm");
        await expect(confirm, "no preview is required to apply free money").toBeEnabled();
        await confirm.click();
        await expect(panel(page)).toBeHidden({ timeout: 90_000 });

        const after = (await vm(page.request)).payments!.find((p) => p.id === payment.id)!;
        expect(after.amountCents, "the receipt is still the receipt").toBe(RECEIPT_CENTS);
        expect(after.unappliedCents, "the money went somewhere").toBeLessThan(RECEIPT_CENTS);
    });

    test("PHASE 20 · a cold reload reconstructs all of it", async ({ page }) => {
        test.setTimeout(300_000);
        const expected = await vm(page.request);
        const payment = (expected.payments ?? [])[0];

        await openCard(page);           // fresh navigation, no React state carried over
        await page.reload();
        const card = page.locator('[data-financials-card="true"]').first();
        await expect(card).toBeVisible({ timeout: 90_000 });
        await page.waitForTimeout(4_000);

        const row = paymentRow(page, payment.id);
        await expect(row, "the receipt survives a reload").toBeVisible({ timeout: 60_000 });
        const apps = row.locator("[data-application-id]");
        expect(await apps.count(), "so does its whole history").toBeGreaterThanOrEqual(2);

        const reread = (await vm(page.request)).payments!.find((p) => p.id === payment.id)!;
        expect(reread.unappliedCents, "and the money reads the same").toBe(payment.unappliedCents);
    });

    test("PHASE 22 · the controls are reachable on a narrow viewport", async ({ page }) => {
        test.setTimeout(300_000);
        await page.setViewportSize({ width: 390, height: 844 });
        const v = await vm(page.request);
        const payment = (v.payments ?? [])[0];
        await openCard(page);
        const row = paymentRow(page, payment.id);
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
        await page.getByTestId("payment-move-cancel").click();
    });
});
