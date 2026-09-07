/**
 * WHAT REDUCED THE BILL, VISIBLE — and who may reduce it, enforced by the server.
 *
 * Thread 10 builds no screen: the reductions are registered actions so Thread 4 can place a surface
 * over them later. So this proves the two things that are genuinely about the running application.
 *
 *   PRESENTATION — the existing Financials card shows GROSS and what reduced it as separate,
 *     human-labelled lines, with a responsibility that is their sum. A card that showed only the
 *     net would be a card that had quietly rewritten the tuition a family agreed to.
 *
 *   AUTHORIZATION — a manual reduction is refused by the SERVER when the actor does not hold
 *     `fin.adjust`. The grant is revoked for the attempt and restored afterwards, because a control
 *     that is merely hidden is not a control at all: the question is what the API does, not what
 *     the page draws.
 *
 * Everything is driven through `/api/admin/actions/execute` from the operator's own authenticated
 * session — the same boundary every other operator intent goes through.
 */
import { expect, test, type Page } from "@playwright/test";

const WORK_VIEW = "/workspace/work-unit/new-leads";
const BOS_PRESENTATION_STATE_KEY = "alloy:v1:admV2:shell:bosPresentationState";
const PERIOD = process.env.CERT_REDUCTION_PERIOD || new Date().toISOString().slice(0, 7);
const CUSTOMER = process.env.CERT_REDUCTION_CUSTOMER || "";
const GROSS_CENTS = 121_000;
const DISCOUNT_CENTS = 5_000;

type LedgerRow = {
    chargeId: string;
    amountCents: number;
    status: string;
    lifecycleStatus: string;
    subjectMemberId: string | null;
    categoryKey: string;
};

async function openPreparedSubject(page: Page) {
    await page.addInitScript(
        ([key, state]) => {
            try {
                sessionStorage.setItem(key, state);
            } catch {
                /* private-mode storage; the rail simply stays where it parks */
            }
        },
        [BOS_PRESENTATION_STATE_KEY, "closed"],
    );
    await page.goto(WORK_VIEW);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(45_000);
    const rows = page.locator('[data-entity-type="opportunity"][data-entity-id]');
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });
    await rows.first().click();
    await page.waitForTimeout(25_000);
}

/** The action's own `detail`, wherever the execute envelope put it. */
function findDetail(body: unknown): Record<string, unknown> {
    const seen = new Set<unknown>();
    const walk = (node: unknown): Record<string, unknown> | null => {
        if (!node || typeof node !== "object" || seen.has(node)) return null;
        seen.add(node);
        const obj = node as Record<string, unknown>;
        if (typeof obj.period_key === "string" || typeof obj.application_id === "string") return obj;
        for (const value of Object.values(obj)) {
            const found = walk(value);
            if (found) return found;
        }
        return null;
    };
    return walk(body) ?? {};
}

test.describe("financial reductions, in the mounted application", () => {
    test.describe.configure({ mode: "serial" });

    test("gross and what reduced it are shown apart, and an unauthorized reduction is refused", async ({ page }) => {
        test.setTimeout(900_000);
        await openPreparedSubject(page);

        const execute = async (body: Record<string, unknown>) => {
            const res = await page.request.post("/api/admin/actions/execute", { data: body });
            return { status: res.status(), json: (await res.json()) as Record<string, unknown> };
        };
        const cardVm = async () => {
            const res = await page.request.get(
                `/api/admin/financials/card?customer_id=${encodeURIComponent(CUSTOMER)}`,
            );
            expect(res.status(), "the card read model must be reachable as the operator").toBe(200);
            return ((await res.json()) as {
                vm: { rows: LedgerRow[]; reconciliation: { grossCents: number; discountsCents: number; responsibilityCents: number; balanceCents: number } };
            }).vm;
        };

        // ── GROSS, THROUGH THREAD 7 ─────────────────────────────────────────────────────────
        const generated = await execute({
            action_key: "billing.generate_tuition",
            entity_type: "opportunity_customer_member",
            entity_id: process.env.CERT_REDUCTION_ASSIGNMENT ?? "",
            mode: "execute",
            confirmation: { confirmed: true },
            payload: { period_key: PERIOD },
        });
        expect(generated.status, JSON.stringify(generated.json)).toBe(200);
        expect(findDetail(generated.json).generated, JSON.stringify(generated.json)).toBe(1);

        const afterGross = await cardVm();
        const grossRow = afterGross.rows.find((r) => r.categoryKey === "tuition" && r.lifecycleStatus === "draft");
        expect(grossRow, "the generated tuition must reach the card's read model").toBeTruthy();
        expect(grossRow!.amountCents).toBe(GROSS_CENTS);

        // Posted, so it is money owed rather than a draft — a draft moves no balance and would make
        // the reduction lines below prove nothing.
        const postedGross = await execute({
            action_key: "charge.post",
            entity_type: "child",
            entity_id: grossRow!.subjectMemberId,
            mode: "execute",
            confirmation: { confirmed: true },
            payload: { charge_id: grossRow!.chargeId, charge_label: "tuition" },
        });
        expect(postedGross.status, JSON.stringify(postedGross.json)).toBe(200);

        // ── THE REDUCTION, THROUGH ITS OWN COMMAND ──────────────────────────────────────────
        const discounted = await execute({
            action_key: "billing.apply_discounts",
            entity_type: "customer",
            entity_id: CUSTOMER,
            mode: "execute",
            confirmation: { confirmed: true },
            payload: { period_key: PERIOD, customer_id: CUSTOMER },
        });
        expect(discounted.status, JSON.stringify(discounted.json)).toBe(200);
        expect(findDetail(discounted.json).applied, JSON.stringify(discounted.json)).toBe(1);

        const afterDiscount = await cardVm();
        const reductionRow = afterDiscount.rows.find((r) => r.categoryKey === "discount");
        expect(reductionRow, "the reduction must reach the card's read model").toBeTruthy();
        expect(reductionRow!.amountCents).toBe(-DISCOUNT_CENTS);
        // THE GROSS DID NOT MOVE. This is the assertion the whole thread exists for.
        expect(afterDiscount.rows.find((r) => r.chargeId === grossRow!.chargeId)!.amountCents).toBe(GROSS_CENTS);

        const postedReduction = await execute({
            action_key: "charge.post",
            entity_type: "child",
            entity_id: reductionRow!.subjectMemberId ?? grossRow!.subjectMemberId,
            mode: "execute",
            confirmation: { confirmed: true },
            payload: { charge_id: reductionRow!.chargeId, charge_label: "discount" },
        });
        expect(postedReduction.status, JSON.stringify(postedReduction.json)).toBe(200);

        // ── THE CARD SHOWS THEM APART, AND THE NET IS THEIR SUM ─────────────────────────────
        const settled = await cardVm();
        expect(settled.reconciliation.grossCents, "gross is stated on its own").toBe(GROSS_CENTS);
        expect(settled.reconciliation.discountsCents, "and what reduced it on its own").toBe(-DISCOUNT_CENTS);
        expect(settled.reconciliation.responsibilityCents).toBe(GROSS_CENTS - DISCOUNT_CENTS);
        expect(settled.reconciliation.balanceCents).toBe(GROSS_CENTS - DISCOUNT_CENTS);

        await page.reload();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(40_000);
        const mounted = await page.locator("body").innerText();
        /*
         * THE NET IS WHAT THE OPERATOR SEES, and it is a number they could not have got by reading
         * the tuition alone. $1,160.00 is $1,210.00 of agreed tuition less a $50.00 authored
         * discount — so a card showing it has both facts, not a rewritten one.
         */
        expect(mounted, "the mounted card must state responsibility").toContain("Responsibility");
        expect(mounted, "and the net the family owes").toContain("$1,160.00");

        // The LEDGER shows them apart: the gross charge and the reduction as their own rows, under
        // human labels an operator reads rather than the category keys the database stores.
        await page
            .locator('[data-financials-card="true"]')
            .getByRole("button", { name: /Details/ })
            .first()
            .click();
        await expect
            .poll(async () => (await page.locator("body").innerText().catch(() => "")) || "", { timeout: 30_000 })
            .toContain("LEDGER");
        const ledger = await page.locator("body").innerText();
        expect(ledger, "the gross stands in the ledger at what was agreed").toContain("$1,210.00");
        expect(ledger, "and the reduction stands beside it, as its own row").toMatch(/[−-]\$50\.00/);
        expect(ledger, "reductions are named in words").toMatch(/Credits & adjustments/i);
        expect(ledger, "and the balance is the net").toContain("$1,160.00");

        // A manual reduction, by an operator who DOES hold the grant, with a reason.
        const adjusted = await execute({
            action_key: "billing.adjust_account",
            entity_type: "child",
            entity_id: grossRow!.subjectMemberId,
            mode: "execute",
            confirmation: { confirmed: true },
            payload: {
                enrollment_agreement_id: process.env.CERT_REDUCTION_AGREEMENT ?? "",
                customer_id: CUSTOMER,
                customer_member_id: grossRow!.subjectMemberId,
                charge_category: "credit",
                amount_cents: -2_500,
                reason: "Certification: goodwill for the closure day",
                effective_date: `${PERIOD}-01`,
                idempotency_key: "fred:manual:cert-browser",
            },
        });
        expect(adjusted.status, JSON.stringify(adjusted.json)).toBe(200);
        expect(findDetail(adjusted.json).application_id, JSON.stringify(adjusted.json)).toBeTruthy();
    });

    /*
     * L · AN UNAUTHORIZED REDUCTION. The harness revokes `fin.adjust` and runs this by itself — a
     * single browser session cannot be two operators at once. A control the page still renders is a
     * cosmetic matter; the WRITE is what has to fail, through the same route the authorized case
     * used moments earlier.
     */
    test("without the grant, the server refuses a manual reduction", async ({ page }) => {
        test.skip(process.env.CERT_EXPECT_UNAUTHORIZED !== "1", "driven by the harness");
        test.setTimeout(600_000);
        await openPreparedSubject(page);

        const res = await page.request.post("/api/admin/actions/execute", {
            data: {
                action_key: "billing.adjust_account",
                entity_type: "customer",
                entity_id: CUSTOMER,
                mode: "execute",
                confirmation: { confirmed: true },
                payload: {
                    enrollment_agreement_id: process.env.CERT_REDUCTION_AGREEMENT ?? "",
                    customer_id: CUSTOMER,
                    charge_category: "credit",
                    amount_cents: -9_900,
                    reason: "Attempted without authority",
                    effective_date: `${PERIOD}-01`,
                    idempotency_key: "fred:manual:cert-unauthorized",
                },
            },
        });
        const text = await res.text();
        expect(res.status(), text).not.toBe(200);
        expect(text, "the refusal must name the permission, not merely fail").toMatch(/fin\.adjust|permission/i);

        // AND NOTHING WAS RECORDED. A refusal that still wrote the credit would be worse than none.
        const vm = await page.request.get(`/api/admin/financials/card?customer_id=${encodeURIComponent(CUSTOMER)}`);
        const rows = ((await vm.json()) as { vm: { rows: LedgerRow[] } }).vm.rows;
        expect(rows.some((r) => r.amountCents === -9_900), "no credit may exist for a refused command").toBe(false);
    });
});
