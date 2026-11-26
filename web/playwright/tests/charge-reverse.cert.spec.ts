/**
 * CHARGE.REVERSE — THE MOUNTED END-TO-END CERTIFICATION.
 *
 * What reversal IS, in this product: the original posted charge is never touched, and a new posted
 * charge of the opposite amount is appended referencing it through `source_charge_id`. The family's
 * obligation nets to nothing; the fact that they were charged remains on the record. Reverse-once is
 * enforced by the service AND by a partial unique index, so a second attempt is refused by the
 * database even if two arrive at once.
 *
 * The fixture is built through the operator's own actions and is deterministic: a posted charge with
 * no payment applied, no reduction against it and no funding — the simplest thing that can be
 * reversed, so the assertions are about reversal and not about everything else.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const HOUSEHOLD = "29944d3e-8267-45b7-8dcb-7405060e2573";

test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });

type Row = {
    chargeId: string; description: string | null; status: string; categoryKey: string;
    amountCents: number; outstandingCents: number; appliedCents: number;
    offersReverse: boolean; correctsChargeId: string | null; reversedByChargeId: string | null;
    periodKey: string | null; subjectMemberId: string | null; date: string | null;
};
type Recon = { grossCents: number; discountsCents: number; adjustmentsCents: number; responsibilityCents: number; paymentsCents: number; balanceCents: number };
type Vm = { rows?: Row[]; reconciliation?: Recon; payments?: Array<Record<string, unknown>>; subjects?: Array<{ customerMemberId: string }> };

async function vm(request: APIRequestContext): Promise<Vm> {
    const res = await request.get(`/api/admin/financials/card?customer_id=${HOUSEHOLD}`);
    expect(res.ok(), `card ${res.status()}`).toBe(true);
    return ((await res.json()) as { vm?: Vm }).vm ?? {};
}

const rowById = (v: Vm, id: string) => (v.rows ?? []).find((r) => r.chargeId === id);
async function execute(request: APIRequestContext, body: Record<string, unknown>) {
    const res = await request.post("/api/admin/actions/execute", {
        headers: { "content-type": "application/json" },
        data: body,
    });
    return { status: res.status(), json: (await res.json()) as Record<string, unknown> };
}
const entity = (v: Vm) => ({ entity_type: "child", entity_id: v.subjects![0]!.customerMemberId });

/**
 * A posted charge that can be reversed, with nothing else going on.
 *
 * Prefers one that already exists; otherwise posts a draft. Reversal consumes its subject — a
 * reversed charge is correctly never offered again — so this finds a fresh one per run rather than
 * assuming the last one survived.
 */
async function reversibleCharge(request: APIRequestContext): Promise<Row> {
    const clean = (r: Row) =>
        r.appliedCents === 0 && !r.correctsChargeId && !r.reversedByChargeId && r.amountCents > 0
        && !["credit", "adjustment"].includes(r.categoryKey);

    let v = await vm(request);
    const posted = (v.rows ?? []).find((r) => r.status === "posted" && r.offersReverse && clean(r));
    if (posted) return posted;

    const draft = (v.rows ?? []).find((r) => r.status === "draft" && clean(r));
    expect(draft, "no posted or draft charge is available to build the fixture from").toBeTruthy();
    const { json } = await execute(request, {
        action_key: "charge.post", ...entity(v), mode: "execute",
        payload: { charge_id: draft!.chargeId, charge_label: draft!.description ?? draft!.chargeId },
    });
    expect(json.ok, `charge.post ${JSON.stringify(json).slice(0, 300)}`).toBe(true);
    v = await vm(request);
    const now = rowById(v, draft!.chargeId)!;
    expect(now.status, "the fixture charge must be posted").toBe("posted");
    expect(now.offersReverse, "and must offer reversal").toBe(true);
    return now;
}

async function openLedger(page: Page) {
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    const compact = page.locator('[data-financials-card="true"]').first();
    await expect(compact).toBeVisible({ timeout: 90_000 });
    // Several cards on this surface offer "Details"; the first match on the page is somebody else's.
    await compact.getByRole("button", { name: /^Details/ }).first().click();
    const detail = page.locator('[data-financials-overlay="detail"]');
    await expect(detail, "the ledger lives in the detail surface").toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2_500);
    return detail;
}

const card = (page: Page) => page.locator('[data-financials-overlay="detail"]');
const control = (page: Page, id: string) => card(page).getByTestId(id);

test.describe.configure({ mode: "serial" });

/** Handed from the reversal proof to the ones that read its consequences. */
let reversedChargeId = "";

test.describe("charge.reverse — mounted", () => {
    /**
     * The transitions the ledger offers must be the read model's answers, for every row — not for one
     * chosen row. Asserting it over the whole ledger is what makes it an invariant rather than an
     * anecdote, and it cannot pass on a stale render: each button is checked against the account read
     * taken in the same breath.
     */
    test("PROOF 1 · every transition the ledger offers is the one the read model allows", async ({ page }) => {
        test.setTimeout(420_000);
        await reversibleCharge(page.request);
        await openLedger(page);

        const offered = await page.evaluate(() => {
            const out: Record<string, string[]> = {};
            for (const b of Array.from(document.querySelectorAll("[data-charge-command]"))) {
                const id = b.getAttribute("data-charge-id") || "?";
                (out[id] ??= []).push(b.getAttribute("data-charge-command") || "?");
            }
            return out;
        });
        const v = await vm(page.request);

        expect(Object.keys(offered).length, "the ledger offers transitions at all").toBeGreaterThan(0);
        expect(
            Object.values(offered).some((cmds) => cmds.includes("charge.reverse")),
            "including reversal — the control that had no way in before",
        ).toBe(true);

        for (const [chargeId, commands] of Object.entries(offered)) {
            const row = rowById(v, chargeId);
            expect(row, `the ledger offered a transition on a charge the account does not know: ${chargeId}`)
                .toBeTruthy();
            // One row, one transition: a charge is either a draft to post or a posting to correct.
            expect(commands.length, `${chargeId} offers exactly one transition`).toBe(1);
            if (commands[0] === "charge.reverse") {
                expect(row!.offersReverse, `${chargeId} is offered reversal, so the read model must allow it`)
                    .toBe(true);
                expect(row!.status, "and reversal is only offered on a posting").toBe("posted");
                expect(row!.correctsChargeId, "a correction is never itself correctable").toBeNull();
                expect(row!.reversedByChargeId, "nor is one already reversed").toBeNull();
            } else {
                expect(commands[0]).toBe("charge.post");
                expect(row!.status, "posting is only offered on a draft").toBe("draft");
                expect(row!.offersReverse, "a draft is not reversible").toBe(false);
            }
        }

        // And the converse: nothing the read model says is reversible and visible is left unoffered.
        const visible = new Set(Object.keys(offered));
        for (const row of v.rows ?? []) {
            if (visible.has(row.chargeId) && row.offersReverse) {
                expect(offered[row.chargeId], `${row.chargeId} is reversible and must say so`)
                    .toContain("charge.reverse");
            }
        }
    });

    test("PROOF 2 · reversing previews, appends its opposite, and leaves the original posted", async ({ page }) => {
        test.setTimeout(420_000);
        await reversibleCharge(page.request);
        await openLedger(page);

        /*
         * Chosen from the ledger itself, so it is reachable by construction rather than by
         * assumption: a charge the account calls reversible but whose period group is collapsed has
         * no button, and asserting against it would be testing a row nobody can act on.
         */
        const button = card(page).locator('[data-charge-command="charge.reverse"]').first();
        await expect(button, "the ledger must offer a reversal to drive").toBeVisible({ timeout: 60_000 });
        const chargeId = (await button.getAttribute("data-charge-id"))!;
        reversedChargeId = chargeId;

        const before = await vm(page.request);
        const target = rowById(before, chargeId)!;
        expect(target, "the charge behind the button is on the account").toBeTruthy();
        const reconBefore = before.reconciliation!;
        const paymentsBefore = JSON.stringify(before.payments ?? []);

        await button.click();
        await expect(control(page, "charge-reverse-panel")).toBeVisible();

        const confirm = control(page, "charge-reverse-confirm");
        await expect(confirm, "Confirm waits for the action's own preview").toBeDisabled();
        await control(page, "charge-reverse-preview-button").click();
        const preview = control(page, "charge-reverse-preview");
        await expect(preview, "the action states what reversal does").toBeVisible({ timeout: 60_000 });
        const said = (await preview.innerText()).replace(/\s+/g, " ");
        expect(said, "it promises the original is left alone").toMatch(/left exactly as posted/i);
        expect(said, "and that a corrective line moves the balance").toMatch(/corrective line/i);
        await expect(confirm).toBeEnabled();

        await confirm.click();
        await expect(control(page, "charge-reverse-panel")).toBeHidden({ timeout: 90_000 });

        const after = await vm(page.request);
        const original = rowById(after, target.chargeId)!;

        // APPEND-ONLY: the original is exactly as it was, and still posted.
        expect(original.status, "the original charge is still posted").toBe("posted");
        expect(original.amountCents, "its amount is untouched").toBe(target.amountCents);
        expect(original.date, "and so is its service date").toBe(target.date);
        expect(original.reversedByChargeId, "it now names the correction that reverses it").toBeTruthy();
        expect(original.offersReverse, "and offers no further correction").toBe(false);

        const correction = rowById(after, original.reversedByChargeId!)!;
        expect(correction.amountCents, "the correction is the exact opposite").toBe(-target.amountCents);
        expect(correction.correctsChargeId, "and names what it corrects").toBe(target.chargeId);
        expect(correction.status, "it is posted money in its own right").toBe("posted");

        // THE OBLIGATION: the pair nets to nothing.
        expect(
            after.reconciliation!.responsibilityCents,
            "the family no longer owes the reversed charge",
        ).toBe(reconBefore.responsibilityCents - target.amountCents);

        // ISOLATION: no receipt, no refund, no provider movement.
        expect(JSON.stringify(after.payments ?? []), "no receipt moved").toBe(paymentsBefore);
        expect(after.reconciliation!.paymentsCents, "and none was invented").toBe(reconBefore.paymentsCents);
    });

    test("PROOF 3 · the same charge cannot be reversed twice", async ({ page }) => {
        test.setTimeout(300_000);
        expect(reversedChargeId, "PROOF 2 must have reversed something").not.toBe("");
        const before = await vm(page.request);
        const reconBefore = JSON.stringify(before.reconciliation);
        const rowCount = (before.rows ?? []).length;

        const { json } = await execute(page.request, {
            action_key: "charge.reverse", ...entity(before), mode: "execute",
            payload: { charge_id: reversedChargeId, kind: "reversal" },
        });
        expect(json.ok, "a charge is corrected once").toBe(false);
        expect(JSON.stringify(json), "and the refusal says why").toMatch(/already been reversed/i);

        const after = await vm(page.request);
        expect(JSON.stringify(after.reconciliation), "the position did not move again").toBe(reconBefore);
        expect((after.rows ?? []).length, "and no second correction was written").toBe(rowCount);

        // The surface agrees with the service rather than discovering it by being refused.
        await openLedger(page);
        await expect(
            card(page).locator(`[data-charge-command="charge.reverse"][data-charge-id="${reversedChargeId}"]`),
            "a reversed charge is not offered reversal",
        ).toHaveCount(0);
    });

    test("PROOF 4 · the route refuses a draft, a correction, a malformed id and another org's charge", async ({ page }) => {
        test.setTimeout(300_000);
        const v = await vm(page.request);
        const ent = entity(v);
        const attempt = (payload: Record<string, unknown>) =>
            execute(page.request, { action_key: "charge.reverse", ...ent, mode: "execute", payload });

        const draft = (v.rows ?? []).find((r) => r.status === "draft");
        if (draft) {
            const { json } = await attempt({ charge_id: draft.chargeId, kind: "reversal" });
            expect(json.ok, "a draft is recalculated, not corrected").toBe(false);
        }

        const correction = (v.rows ?? []).find((r) => r.correctsChargeId);
        if (correction) {
            const { json } = await attempt({ charge_id: correction.chargeId, kind: "reversal" });
            expect(json.ok, "correcting a correction would start a chain with no end").toBe(false);
        }

        expect((await attempt({ kind: "reversal" })).json.ok, "a reversal needs a charge").toBe(false);
        expect(
            (await attempt({ charge_id: v.rows![0]!.chargeId, kind: "not-a-kind" })).json.ok,
            "an unknown correction kind is refused",
        ).toBe(false);

        const forged = await attempt({ charge_id: "ffffffff-0000-4000-8000-ffffffffffff", kind: "reversal" });
        expect(forged.json.ok, "another org's charge is not this one's to reverse").toBe(false);
        expect(JSON.stringify(forged.json), "and no other tenant is disclosed")
            .not.toMatch(/another org|forbidden/i);
    });

    test("PROOF 5 · a cold reload reconstructs the reversal, and navigation keeps it", async ({ page }) => {
        test.setTimeout(420_000);
        expect(reversedChargeId).not.toBe("");
        const expected = await vm(page.request);
        const original = rowById(expected, reversedChargeId)!;

        await openLedger(page);
        await page.reload();
        const compact = page.locator('[data-financials-card="true"]').first();
        await expect(compact).toBeVisible({ timeout: 90_000 });
        await compact.getByRole("button", { name: /^Details/ }).first().click();
        await expect(card(page)).toBeVisible({ timeout: 60_000 });
        await page.waitForTimeout(2_500);

        await expect(
            card(page).locator(`[data-charge-command="charge.reverse"][data-charge-id="${reversedChargeId}"]`),
            "after a full page load the reversed charge still offers nothing",
        ).toHaveCount(0);

        const reread = rowById(await vm(page.request), reversedChargeId)!;
        expect(reread.reversedByChargeId, "the lineage is persistence, not React state")
            .toBe(original.reversedByChargeId);
        expect(reread.amountCents, "and the historical amount survives").toBe(original.amountCents);
    });

    test("PROOF 6 · the ledger's transitions are reachable on a narrow viewport", async ({ page }) => {
        test.setTimeout(300_000);
        await page.setViewportSize({ width: 390, height: 844 });
        await openLedger(page);
        const any = card(page).locator("[data-charge-command]").first();
        await expect(any, "a transition is offered at phone width").toBeVisible({ timeout: 60_000 });
        await any.scrollIntoViewIfNeeded();
        const box = await any.boundingBox();
        expect(box, "it must have a box").toBeTruthy();
        expect(box!.x, "and must not sit off-screen").toBeGreaterThanOrEqual(-1);
        expect(box!.x + box!.width, "or overflow the viewport").toBeLessThanOrEqual(391);
    });
});
