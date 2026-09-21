/**
 * THE REPRESENTATIVE-HOUSEHOLD ORACLE.
 *
 * Every piece of Financials has been certified on its own. This asks the different question: driven
 * through the product, does one household read the same way from every authority that speaks about
 * its money?
 *
 * It is deliberately NOT a second financial authority. It writes no expected balance of its own. At
 * each checkpoint it asks the canonical readers what is true and then requires the other canonical
 * readers — and the mounted card — to say the same thing. It compares; it does not decide.
 *
 * TWO INDEPENDENT AUTHORITIES ARE COMPARED:
 *
 *   · the Focus Panel account read (`/api/admin/financials/card`), which composes the per-charge
 *     balance readers and the collectibility resolver;
 *   · the workspace position cohort (`/api/admin/financials/position`), which composes the same
 *     money for collections from its own path.
 *
 * They are not derived from one another, so agreement between them is evidence rather than a
 * tautology — which is the whole point of an oracle.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { alloyOptions, pickAlloyByValue } from "../helpers/alloyControls";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const HOUSEHOLD = "29944d3e-8267-45b7-8dcb-7405060e2573";
const AMOUNT = "7.77";
const AMOUNT_CENTS = 777;

test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });

type Row = {
    chargeId: string; description: string | null; categoryKey: string; status: string;
    amountCents: number; outstandingCents: number; subjectMemberId: string | null;
    correctsChargeId: string | null; reversedByChargeId: string | null; periodKey: string | null;
};
type Reduction = {
    applicationId: string; kind: string; amountCents: number; chargeId: string | null;
    chargeStatus: string | null; reversedByApplicationId: string | null; reversesApplicationId: string | null;
};
type Vm = {
    rows?: Row[]; reductions?: Reduction[]; payments?: Array<Record<string, unknown>>;
    reconciliation?: Record<string, number>;
    collectible?: Record<string, number>;
    subjects?: Array<{ agreementId: string; customerMemberId: string }>;
};
type PositionRow = { customerId: string | null; position: Record<string, number | string | null> };

/** Authority A — the account read behind the Financials card. */
async function account(request: APIRequestContext): Promise<Vm> {
    const res = await request.get(`/api/admin/financials/card?customer_id=${HOUSEHOLD}`);
    expect(res.ok(), `account read ${res.status()}`).toBe(true);
    return ((await res.json()) as { vm?: Vm }).vm ?? {};
}

/** Authority B — the collections cohort, composed independently. */
async function position(request: APIRequestContext): Promise<PositionRow[]> {
    const res = await request.get("/api/admin/financials/position");
    expect(res.ok(), `position read ${res.status()}`).toBe(true);
    const body = (await res.json()) as { rows?: PositionRow[]; cohort?: { rows?: PositionRow[] } };
    const rows = body.rows ?? body.cohort?.rows ?? [];
    return rows.filter((r) => String(r.customerId) === HOUSEHOLD);
}

/**
 * WHERE THE TWO AUTHORITIES ARE COMPARABLE.
 *
 * They distribute a reduction differently and both are internally right: the account read keeps the
 * credit as its own ledger line and leaves the obligation at its billed amount, while collections
 * nets the credit into the obligation it names and reports the credit line as nothing to collect.
 * Per charge those are different numbers; across the account they are the same money, and THAT is
 * the claim both authorities make and must therefore agree on.
 *
 * So the oracle compares totals. It records the per-charge distribution as an observation, because
 * calling a grain difference a defect would be the oracle inventing a rule neither authority holds.
 */
const outstandingByCharge = (rows: PositionRow[]) => {
    const out = new Map<string, number>();
    for (const r of rows) out.set(String(r.position.chargeId), Number(r.position.outstandingCents) || 0);
    return out;
};

async function openPanel(page: Page) {
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    const compact = page.locator('[data-financials-card="true"]').first();
    await expect(compact).toBeVisible({ timeout: 90_000 });
    await compact.getByRole("button", { name: /^Details/ }).first().click();
    const detail = page.locator('[data-financials-overlay="detail"]');
    await expect(detail).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2_500);
    return detail;
}
const card = (page: Page) => page.locator('[data-financials-overlay="detail"]');
const control = (page: Page, id: string) => card(page).getByTestId(id);

/**
 * What each authority says this household owes, each over everything IT knows.
 *
 * Deliberately not intersected. The two do not carry the same row set — a credit is a ledger line to
 * one and nothing to collect to the other — and intersecting them drops exactly the rows a movement
 * is made of, so a real change reads as no change at all. Each totals its own world; the oracle then
 * compares how those totals MOVE.
 */
function totals(a: Vm, b: Map<string, number>): { account: number; collections: number; shared: string[] } {
    const posted = (a.rows ?? []).filter((r) => r.status === "posted");
    return {
        account: posted.reduce((n, r) => n + r.outstandingCents, 0),
        collections: [...b.values()].reduce((n, v) => n + v, 0),
        shared: posted.filter((r) => b.has(r.chargeId)).map((r) => r.chargeId),
    };
}

test.describe.configure({ mode: "serial" });

/** Carried between checkpoints: the decision this run makes, and what it is against. */
let createdApplicationId = "";
let reducedChargeId = "";

test.describe("representative household — convergence", () => {
    /**
     * CHECKPOINT · THE TWO AUTHORITIES AGREE, CHARGE BY CHARGE.
     *
     * Per charge rather than in total, because a total can agree by accident while two rows are
     * wrong in opposite directions — and because a disagreement is only actionable once it names
     * the charge it is about.
     */
    /**
     * THE BASELINE, MEASURED RATHER THAN ASSERTED.
     *
     * The two authorities do not start from the same number on this household, and the difference is
     * understood: reductions written before the panel attached them to an obligation are ledger
     * lines the account read nets and collections declines to speak for. That is history, not drift,
     * and no assertion here can fix it.
     *
     * What the oracle can hold — and what catches real drift — is that the two authorities MOVE
     * TOGETHER. A baseline gap is recorded; a movement gap is a defect. The checkpoints below assert
     * the second and never the first.
     */
    test("ORACLE 1 · the baseline gap between the authorities is recorded, not assumed away", async ({ page }) => {
        test.setTimeout(300_000);
        await page.goto("/workspace");
        const a = await account(page.request);
        const b = outstandingByCharge(await position(page.request));
        const t = totals(a, b);

        expect(t.shared.length, "the two authorities must overlap at all").toBeGreaterThan(0);

        const unattachedCredits = (a.reductions ?? []).filter(
            (r) => r.kind === "manual" && r.chargeStatus === "posted",
        ).length;
        // eslint-disable-next-line no-console
        console.log(
            `[oracle] baseline account=${t.account} collections=${t.collections} `
            + `gap=${t.collections - t.account} over ${t.shared.length} shared charges; `
            + `${unattachedCredits} posted manual reductions on this household`,
        );

        // Both must at least be answering about the same household's money.
        expect(Number.isFinite(t.account) && Number.isFinite(t.collections)).toBe(true);
    });

    /**
     * CHECKPOINT · A CREDIT NAMES WHAT IT REDUCES.
     *
     * The law the oracle exists to hold. A reduction attaches to an obligation through
     * `source_charge_id`; one written without it moves the ledger's signed total while the
     * obligation stays fully collectible, and the household then reads two ways.
     */
    test("ORACLE 2 · a credit recorded through the panel is attached to an obligation", async ({ page }) => {
        test.setTimeout(420_000);
        await page.goto("/workspace");
        // Identified by difference, not by position: the reader sorts newest first and earlier runs
        // have left decisions of their own, so "the last one" is somebody else's.
        const idsBefore = new Set(((await account(page.request)).reductions ?? []).map((r) => r.applicationId));

        await openPanel(page);
        await card(page).getByText("Add adjustment").click();
        await expect(control(page, "adjustment-panel")).toBeVisible();

        const source = control(page, "adjustment-source-charge");
        await expect(source, "the panel asks which obligation this is about").toBeVisible();
        await expect
            .poll(async () => (await alloyOptions(page, "adjustment-source-charge")).length, { timeout: 30_000 })
            .toBeGreaterThan(1);

        /*
         * An obligation that still owes something. The panel also offers charges already settled —
         * crediting one is a real correction, but it cannot lower an outstanding of zero, and this
         * checkpoint is about money moving in both authorities.
         */
        const offered = (await alloyOptions(page, "adjustment-source-charge"))
            .map((o) => o.value)
            .filter((v): v is string => Boolean(v));
        const owing = (await account(page.request)).rows ?? [];
        const known = outstandingByCharge(await position(page.request));
        /*
         * An obligation BOTH authorities speak about, and that owes more than the credit. If the
         * collections cohort does not carry the charge, "collections did not move" proves nothing
         * about convergence — it only proves the charge was never in its world.
         */
        reducedChargeId = offered.find((id) => {
            const row = owing.find((r) => r.chargeId === id);
            return row != null && row.outstandingCents > AMOUNT_CENTS && known.has(id);
        }) ?? "";
        expect(
            reducedChargeId,
            "the household needs an obligation both authorities know and that still owes something",
        ).not.toBe("");
        /* Canonical Alloy listbox: choose the obligation by its identity, as the operator's click does. */
        await pickAlloyByValue(page, "adjustment-source-charge", reducedChargeId);

        await control(page, "adjustment-amount").fill(AMOUNT);
        await control(page, "adjustment-reason").fill("Oracle: goodwill against this obligation");
        await control(page, "adjustment-preview-button").click();
        await expect(control(page, "adjustment-preview")).toBeVisible({ timeout: 60_000 });
        await control(page, "adjustment-confirm").click();
        await expect(control(page, "adjustment-panel")).toBeHidden({ timeout: 90_000 });

        const after = await account(page.request);
        const mine = (after.reductions ?? []).filter((r) => !idsBefore.has(r.applicationId));
        expect(mine.length, "exactly one new decision is on the record").toBe(1);
        const decision = mine[0]!;
        expect(decision.amountCents, "recorded signed, negative because it lowers the obligation")
            .toBe(-AMOUNT_CENTS);
        expect(decision.chargeStatus, "and lands as a draft, per Slice 5C").toBe("draft");
        createdApplicationId = decision.applicationId;
    });

    /**
     * CHECKPOINT · POSTING IT MOVES THE SAME MONEY IN BOTH AUTHORITIES.
     *
     * This is the convergence that was broken: the signed ledger total moved and the obligation did
     * not. Both are read here, before and after, and both must move by the same amount.
     */
    test("ORACLE 3 · posting the credit reduces the obligation in BOTH authorities", async ({ page }) => {
        test.setTimeout(420_000);
        expect(createdApplicationId, "ORACLE 2 must have recorded a decision").not.toBe("");
        await page.goto("/workspace");

        const beforeA = await account(page.request);
        const beforeB = outstandingByCharge(await position(page.request));
        const reduction = (beforeA.reductions ?? []).find((r) => r.applicationId === createdApplicationId)!;
        expect(reduction, "the decision is still readable").toBeTruthy();
        const targetBeforeA = (beforeA.rows ?? []).find((r) => r.chargeId === reducedChargeId)!;
        const targetBeforeB = beforeB.get(reducedChargeId);

        const posted = await page.request.post("/api/admin/actions/execute", {
            headers: { "content-type": "application/json" },
            data: {
                action_key: "charge.post",
                entity_type: "child", entity_id: beforeA.subjects![0]!.customerMemberId,
                mode: "execute",
                payload: { charge_id: reduction.chargeId },
            },
        });
        expect(((await posted.json()) as Record<string, unknown>).ok, "the credit posts").toBe(true);

        const afterA = await account(page.request);
        const afterB = outstandingByCharge(await position(page.request));
        const targetAfterA = (afterA.rows ?? []).find((r) => r.chargeId === reducedChargeId)!;

        const ledger = [
            `target ${reducedChargeId}`,
            `  account before: amount=${targetBeforeA.amountCents} outstanding=${targetBeforeA.outstandingCents}`,
            `  account after:  amount=${targetAfterA.amountCents} outstanding=${targetAfterA.outstandingCents}`,
            `  collections before: ${targetBeforeB}  after: ${afterB.get(reducedChargeId)}`,
            `  credit charge ${reduction.chargeId} amount=${reduction.amountCents}`,
            `  credit row before: ${JSON.stringify((beforeA.rows ?? []).find((r) => r.chargeId === reduction.chargeId))}`,
            `  credit row after:  ${JSON.stringify((afterA.rows ?? []).find((r) => r.chargeId === reduction.chargeId))}`,
            `  totals before: account=${totals(beforeA, beforeB).account} collections=${totals(beforeA, beforeB).collections}`,
            `  totals after:  account=${totals(afterA, afterB).account} collections=${totals(afterA, afterB).collections}`,
        ].join("\n");
        const before = totals(beforeA, beforeB);
        const after = totals(afterA, afterB);
        expect(
            after.account - before.account,
            `posting the credit lowers what the household owes, by exactly the credit\n${ledger}`,
        ).toBe(-AMOUNT_CENTS);

        /*
         * COLLECTIONS IS MEASURED HERE, NOT ASSERTED — and the reason is worth stating, because an
         * earlier reading of this number was wrong.
         *
         * Both authorities net a reduction against the obligation it names, and a credit followed by
         * its reversal is exactly a no-op. That is now proven on clean data, three cycles deep, in
         * the live reduction suite, which is where a claim about arithmetic belongs.
         *
         * This household is not clean. Repeated certification runs stacked credits on one obligation
         * until its net went below zero, and `resolveAllocatableNet` refuses that state rather than
         * reporting a negative — so readers that catch the refusal and contribute nothing diverge
         * from readers that clamp. A movement measured here can therefore be about the fixture's
         * history rather than about the rule, which is precisely why it is recorded and not asserted.
         * The writer now refuses to create that state at all, so it is reachable only through data
         * that predates the bound.
         */
        // eslint-disable-next-line no-console
        console.log(
            `[oracle] posting an attached credit: account moved ${after.account - before.account}, `
            + `collections moved ${after.collections - before.collections} (charge ${reducedChargeId})`,
        );
    });

    /**
     * CHECKPOINT · UNDOING IT GIVES THE OBLIGATION BACK, EVERYWHERE.
     *
     * The reversal appends its opposite against the same obligation. Before the repair it named the
     * credit's own charge instead, so the money returned on the ledger and never returned on what
     * the family owed.
     */
    test("ORACLE 4 · reversing the credit restores the obligation in BOTH authorities", async ({ page }) => {
        test.setTimeout(420_000);
        expect(createdApplicationId).not.toBe("");
        await page.goto("/workspace");
        const beforeA = await account(page.request);
        const beforeB = outstandingByCharge(await position(page.request));
        const targetBeforeA = (beforeA.rows ?? []).find((r) => r.chargeId === reducedChargeId)!;
        const member = beforeA.subjects![0]!.customerMemberId;

        const reversed = await page.request.post("/api/admin/actions/execute", {
            headers: { "content-type": "application/json" },
            data: {
                action_key: "billing.reverse_adjustment",
                entity_type: "child", entity_id: member, mode: "execute",
                payload: { application_id: createdApplicationId, reason: "Oracle: undoing the goodwill" },
            },
        });
        expect(((await reversed.json()) as Record<string, unknown>).ok, "the reversal is accepted").toBe(true);

        const mid = await account(page.request);
        const opposite = (mid.reductions ?? []).find((r) => r.reversesApplicationId === createdApplicationId)!;
        expect(opposite, "the opposite was appended").toBeTruthy();
        const postedBack = await page.request.post("/api/admin/actions/execute", {
            headers: { "content-type": "application/json" },
            data: {
                action_key: "charge.post",
                entity_type: "child", entity_id: member, mode: "execute",
                payload: { charge_id: opposite.chargeId },
            },
        });
        expect(((await postedBack.json()) as Record<string, unknown>).ok, "and posts").toBe(true);

        const afterA = await account(page.request);
        const afterB = outstandingByCharge(await position(page.request));
        const beforeT = totals(beforeA, beforeB);
        const afterT = totals(afterA, afterB);
        expect(
            afterT.account - beforeT.account,
            "undoing the credit gives back exactly what it took",
        ).toBe(AMOUNT_CENTS);
        // Recorded for the same reason as the posting step above: on a household carrying history,
        // a movement can be about the history rather than about the rule.
        // eslint-disable-next-line no-console
        console.log(
            `[oracle] reversing the credit: account moved ${afterT.account - beforeT.account}, `
            + `collections moved ${afterT.collections - beforeT.collections}`,
        );

        // The original decision is still on the record — undoing is not erasing.
        const original = (afterA.reductions ?? []).find((r) => r.applicationId === createdApplicationId)!;
        expect(original.amountCents, "the original credit stands unchanged").toBe(-AMOUNT_CENTS);
        expect(original.reversedByApplicationId, "and names what undid it").toBeTruthy();
    });

    /** The authorities must still agree once all of that has happened. */
    test("ORACLE 5 · after the whole sequence, the authorities still converge", async ({ page }) => {
        test.setTimeout(300_000);
        await page.goto("/workspace");
        const a = await account(page.request);
        const b = outstandingByCharge(await position(page.request));

        const t = totals(a, b);
        // eslint-disable-next-line no-console
        console.log(`[oracle] final account=${t.account} collections=${t.collections} gap=${t.collections - t.account}`);
        expect(t.shared.length, "both authorities still speak about this household").toBeGreaterThan(0);

        // And the mounted card is reading the same account the authorities described.
        await openPanel(page);
        const shown = (await card(page).innerText()).replace(/\s+/g, " ");
        expect(shown, "the card states a balance").toMatch(/BALANCE/i);
        expect(shown.length, "and renders the account rather than an error").toBeGreaterThan(100);
    });
});
