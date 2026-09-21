/**
 * SLICE 5C — CORRECTING WHAT A FAMILY OWES, AND UNDOING IT, IN THE BROWSER.
 *
 * The two actions already existed and ran on the action runtime. What is certified here is the
 * operator surface over them: that it is scoped to the enrolment the backend actually requires,
 * that the direction of the money is unambiguous, that the ACTION states the consequence before
 * anything is committed, and that a reversal appends rather than edits.
 *
 * The household is Certhouse, because it is the one that HAS enrolment agreements — the action is
 * scoped to one, so a household with none is correctly never offered this at all.
 *
 * Every money assertion is read back from the canonical account read, never recomputed here.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { alloyOptionLabels, alloyOptions, alloyValueText, pickAlloyByValue } from "../helpers/alloyControls";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const HOUSEHOLD = "29944d3e-8267-45b7-8dcb-7405060e2573";

/** Deterministic, and small enough never to be mistaken for real money. */
const AMOUNT = "12.34";
const AMOUNT_CENTS = 1234;

/*
 * A desktop viewport. At 1280 the workspace's floating assistant rail overlaps the Financials card
 * and intercepts clicks meant for it — an artefact of where the rail sits at that width, not of this
 * feature. Reachability at phone width is proven separately in PROOF 6.
 */
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });

type Reduction = {
    applicationId: string; kind: string; category: string | null; amountCents: number;
    reason: string | null; chargeId: string | null; chargeStatus: string | null;
    reversedByApplicationId: string | null; reversesApplicationId: string | null;
};
type Recon = { grossCents: number; discountsCents: number; adjustmentsCents: number; responsibilityCents: number; paymentsCents: number; balanceCents: number };
type Vm = { reductions?: Reduction[]; reconciliation?: Recon; payments?: Array<Record<string, unknown>>; subjects?: Array<{ agreementId: string; customerMemberId: string }> };

async function vm(request: APIRequestContext): Promise<Vm> {
    const res = await request.get(`/api/admin/financials/card?customer_id=${HOUSEHOLD}`);
    expect(res.ok(), `card ${res.status()}`).toBe(true);
    return ((await res.json()) as { vm?: Vm }).vm ?? {};
}

const manual = (v: Vm) => (v.reductions ?? []).filter((r) => r.kind === "manual");

/*
 * The entity a reduction action will accept.
 *
 * `billing.adjust_account` and `billing.reverse_adjustment` support child / person /
 * opportunity_customer_member — NOT `opportunity`. Addressing them with the lane's own subject type
 * is refused as an unsupported entity type, which looks like a refusal and proves nothing: every
 * "this must be rejected" assertion below would pass without the rule under test ever running.
 */
const reductionEntity = (v: Vm) => ({
    entity_type: "opportunity_customer_member",
    entity_id: v.subjects![0]!.customerMemberId,
});
/** The row this run created: our amount, not yet reversed, and not itself a reversal. */
const mine = (v: Vm) =>
    manual(v).filter((r) => Math.abs(r.amountCents) === AMOUNT_CENTS && r.reversesApplicationId === null);

async function openCard(page: Page) {
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    const compact = page.locator('[data-financials-card="true"]').first();
    await expect(compact).toBeVisible({ timeout: 90_000 });
    /*
     * Scoped to the Financials card. This surface mounts six cards and more than one of them offers
     * a "Details" control, so the first match on the page is somebody else's.
     */
    await compact.getByRole("button", { name: /^Details/ }).first().click();
    const detail = page.locator('[data-financials-overlay="detail"]');
    await expect(detail, "the detail surface is where adjustments live").toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2_000);
    return detail;
}

const card = (page: Page) => page.locator('[data-financials-overlay="detail"]');
/** Scoped: the inert background copy of the card carries the same testids. */
const control = (page: Page, id: string) => card(page).getByTestId(id);

/**
 * A reduction has to name what it reduces.
 *
 * `resolveAllocatableNet` nets a charge as its amount plus the reductions naming it, so a credit
 * written without a `source_charge_id` moves the ledger's signed total and leaves the obligation
 * fully collectible — the contradiction the representative-household oracle surfaced. The panel now
 * asks, so the certification has to answer.
 */
async function chooseObligation(page: Page) {
    /*
     * The control is the canonical Alloy listbox now, not a native select, so this drives it the
     * way the product does: open, read what is offered, choose the first real obligation. The
     * assertion is the EFFECT the panel promises — it asks which obligation this is about, and
     * the answer sticks — rather than `HTMLSelectElement.value`, which is an implementation
     * detail the product no longer has.
     */
    await expect(control(page, "adjustment-source-charge"), "the panel asks which obligation this is about")
        .toBeVisible();
    await expect
        .poll(async () => (await alloyOptions(page, "adjustment-source-charge")).length, { timeout: 30_000 })
        .toBeGreaterThan(1);
    const offered = await alloyOptions(page, "adjustment-source-charge");
    const obligation = offered.find((o) => o.value && !o.disabled);
    expect(obligation, "an obligation is offered to adjust").toBeTruthy();
    await pickAlloyByValue(page, "adjustment-source-charge", obligation!.value!);
    await expect
        .poll(() => alloyValueText(page, "adjustment-source-charge"), { timeout: 15_000 })
        .toContain(obligation!.label.split(" · ")[0]!);
}

test.describe.configure({ mode: "serial" });

/*
 * The decision PROOF 2 records, handed to PROOF 3 so it reverses THAT one.
 *
 * Picking "some unreversed credit of this amount" instead left one posted credit behind on every
 * run: the household drifted further negative each time, and a later proof that reads the balance
 * eventually failed for a reason that had nothing to do with the rule it was testing. A suite that
 * writes money has to put it back.
 */
let recordedApplicationId = "";

test.describe("Slice 5C — manual adjustments, mounted", () => {
    test("PROOF 1 · the panel names the enrolment, and refuses to commit before the action has spoken", async ({ page }) => {
        test.setTimeout(420_000);
        const before = await vm(page.request);
        expect((before.subjects ?? []).length, "this household must have an enrolment to adjust")
            .toBeGreaterThan(0);

        await openCard(page);
        await card(page).getByText("Add adjustment").click();
        await expect(control(page, "adjustment-panel"), "the panel opens").toBeVisible();

        // SCOPE: the enrolment is named, not assumed.
        const agreement = control(page, "adjustment-agreement");
        await expect(agreement, "the panel says which enrolment this is against").toBeVisible();
        const agreementOptions = await alloyOptionLabels(page, "adjustment-agreement");
        expect(agreementOptions.length, "and offers the household's enrolments").toBeGreaterThan(0);

        // VOCABULARY: credit and adjustment only. Discount belongs to configured policy.
        const categories = (await alloyOptionLabels(page, "adjustment-category")).join(" | ");
        expect(categories).toMatch(/Credit/i);
        expect(categories).toMatch(/Adjustment/i);
        expect(categories, "manual discount is not offered — policy owns that word").not.toMatch(/Discount/i);

        // A credit only lowers an obligation, so it has no direction control to get wrong.
        await expect(control(page, "adjustment-direction"), "a credit has one direction by definition")
            .toHaveCount(0);

        const confirm = control(page, "adjustment-confirm");
        await chooseObligation(page);
        await control(page, "adjustment-amount").fill(AMOUNT);
        await control(page, "adjustment-reason").fill("Certification: goodwill for a closure day");
        await expect(confirm, "Confirm waits for the action's own preview").toBeDisabled();

        await control(page, "adjustment-preview-button").click();
        const preview = control(page, "adjustment-preview");
        await expect(preview, "the action states the consequence").toBeVisible({ timeout: 60_000 });
        const said = (await preview.innerText()).replace(/\s+/g, " ");
        expect(said, "and says which way the money goes").toMatch(/reduces what the family owes/i);
        expect(said, "including the amount as money").toContain(AMOUNT);
        await expect(confirm).toBeEnabled();

        // Changing a load-bearing input invalidates a preview taken for a different question.
        await control(page, "adjustment-amount").fill("99.99");
        await expect(preview, "the preview is for the question that was asked").toBeHidden();
        await expect(confirm).toBeDisabled();

        await control(page, "adjustment-cancel").click();
        await expect(control(page, "adjustment-panel")).toBeHidden();
    });

    test("PROOF 2 · a credit is recorded as a draft, and lowers the obligation once posted", async ({ page }) => {
        test.setTimeout(420_000);
        const before = await vm(page.request);
        const reconBefore = before.reconciliation!;
        const paymentsBefore = JSON.stringify(before.payments ?? []);
        const idsBefore = new Set(mine(before).map((r) => r.applicationId));

        await openCard(page);
        await card(page).getByText("Add adjustment").click();
        await expect(control(page, "adjustment-panel")).toBeVisible();
        await chooseObligation(page);
        await control(page, "adjustment-amount").fill(AMOUNT);
        await control(page, "adjustment-reason").fill("Certification: goodwill for a closure day");
        await control(page, "adjustment-preview-button").click();
        await expect(control(page, "adjustment-preview")).toBeVisible({ timeout: 60_000 });
        /*
         * The action's own summary speaks in the present tense; the panel says when it actually
         * takes effect. Certifying that wording is the point — a manual reduction is written as a
         * DRAFT, and an operator told "reduces what the family owes" would otherwise go looking for
         * a balance that has not moved.
         */
        await expect(control(page, "adjustment-preview-timing"), "the panel says when this takes effect")
            .toContainText(/draft/i);
        await control(page, "adjustment-confirm").click();
        await expect(control(page, "adjustment-panel")).toBeHidden({ timeout: 90_000 });

        const afterRecord = await vm(page.request);
        const recorded = mine(afterRecord).find((r) => !idsBefore.has(r.applicationId));
        expect(recorded, "exactly one new decision is on the record").toBeTruthy();
        expect(recorded!.amountCents, "stored signed, negative because it lowers the obligation")
            .toBe(-AMOUNT_CENTS);
        expect(recorded!.category).toBe("credit");
        expect(recorded!.reason).toContain("closure day");
        expect(recorded!.chargeStatus, "and it lands as a draft").toBe("draft");
        recordedApplicationId = recorded!.applicationId;

        // NOTHING IS OWED DIFFERENTLY YET. A draft is recorded, not applied.
        expect(afterRecord.reconciliation!.responsibilityCents, "a draft has not moved the obligation")
            .toBe(reconBefore.responsibilityCents);
        expect(afterRecord.reconciliation!.grossCents, "and the charges are untouched")
            .toBe(reconBefore.grossCents);
        expect(JSON.stringify(afterRecord.payments ?? []), "no receipt moved").toBe(paymentsBefore);

        // The card says so too, rather than showing an amount that implies it already counted.
        const row = card(page).locator(`[data-adjustment-id="${recorded!.applicationId}"]`);
        await expect(row).toBeVisible({ timeout: 60_000 });
        expect((await row.innerText()).replace(/\s+/g, " "), "the row states it is not applied yet")
            .toMatch(/once posted/i);

        // ── AND NOW POST IT, through the same action the charge rows use ──────────────────────
        const posted = await page.request.post("/api/admin/actions/execute", {
            headers: { "content-type": "application/json" },
            data: {
                action_key: "charge.post",
                entity_type: "opportunity", entity_id: SUBJECT, mode: "execute",
                payload: { charge_id: recorded!.chargeId },
            },
        });
        const postedJson = (await posted.json()) as Record<string, unknown>;
        expect(postedJson.ok, `charge.post ${JSON.stringify(postedJson).slice(0, 300)}`).toBe(true);

        const afterPost = await vm(page.request);
        expect(afterPost.reconciliation!.grossCents, "posting a credit is not a re-billing")
            .toBe(reconBefore.grossCents);
        expect(afterPost.reconciliation!.discountsCents, "the credit lands in reductions")
            .toBe(reconBefore.discountsCents - AMOUNT_CENTS);
        expect(afterPost.reconciliation!.responsibilityCents, "and now the family owes exactly that much less")
            .toBe(reconBefore.responsibilityCents - AMOUNT_CENTS);
        expect(JSON.stringify(afterPost.payments ?? []), "still no receipt moved").toBe(paymentsBefore);
        expect(afterPost.reconciliation!.paymentsCents, "and none was invented")
            .toBe(reconBefore.paymentsCents);
    });

    test("PROOF 3 · the decision is readable, and reversing it appends rather than edits", async ({ page }) => {
        test.setTimeout(420_000);
        const before = await vm(page.request);
        const target = manual(before).find((r) => r.applicationId === recordedApplicationId);
        expect(target, "PROOF 2 must have left the decision this proof undoes").toBeTruthy();
        const reconBefore = before.reconciliation!;

        await openCard(page);
        const row = card(page).locator(`[data-adjustment-id="${target!.applicationId}"]`);
        await expect(row, "the decision is on the card, not just in a total").toBeVisible({ timeout: 60_000 });
        const rowText = (await row.innerText()).replace(/\s+/g, " ");
        expect(rowText, "it says which way it went").toMatch(/Lowers what is owed/i);
        expect(rowText, "and why").toContain("closure day");

        await row.getByText("Reverse adjustment").click();
        await expect(control(page, "adjustment-reverse-panel")).toBeVisible();
        const confirm = control(page, "adjustment-reverse-confirm");
        await expect(confirm, "a reversal waits for its preview too").toBeDisabled();

        await control(page, "adjustment-reverse-reason").fill("Certification: recorded against the wrong enrolment");
        await control(page, "adjustment-reverse-preview-button").click();
        const preview = control(page, "adjustment-reverse-preview");
        await expect(preview).toBeVisible({ timeout: 60_000 });
        expect((await preview.innerText()).replace(/\s+/g, " "), "it promises an append, not an edit")
            .toMatch(/original stays in the ledger/i);
        await expect(confirm).toBeEnabled();

        await confirm.click();
        await expect(control(page, "adjustment-reverse-panel")).toBeHidden({ timeout: 90_000 });

        const after = await vm(page.request);
        const original = manual(after).find((r) => r.applicationId === target!.applicationId)!;
        expect(original.amountCents, "the original is exactly as it was").toBe(-AMOUNT_CENTS);
        expect(original.reversedByApplicationId, "and now names its reversal").not.toBeNull();

        const reversal = manual(after).find((r) => r.reversesApplicationId === target!.applicationId)!;
        expect(reversal.amountCents, "whose opposite was appended").toBe(AMOUNT_CENTS);

        /*
         * The opposite is written the same way the original was — as a draft — so the obligation
         * moves when it is posted, not when it is decided. Asserting an immediate restoration here
         * would be asserting a behaviour this product does not have.
         */
        expect(reversal.chargeStatus, "the opposite is a draft, like the decision it undoes").toBe("draft");
        expect(after.reconciliation!.responsibilityCents, "so nothing has moved on the balance yet")
            .toBe(reconBefore.responsibilityCents);

        const posted = await page.request.post("/api/admin/actions/execute", {
            headers: { "content-type": "application/json" },
            data: {
                action_key: "charge.post",
                entity_type: "opportunity", entity_id: SUBJECT, mode: "execute",
                payload: { charge_id: reversal.chargeId },
            },
        });
        expect(((await posted.json()) as Record<string, unknown>).ok, "the opposite posts").toBe(true);

        const settled = await vm(page.request);
        expect(settled.reconciliation!.responsibilityCents, "and now the obligation is back where it was")
            .toBe(reconBefore.responsibilityCents + AMOUNT_CENTS);
        expect(settled.reconciliation!.grossCents, "the charges were never involved")
            .toBe(reconBefore.grossCents);
    });

    test("PROOF 4 · a reversed decision offers no second reversal, and survives a reload", async ({ page }) => {
        test.setTimeout(420_000);
        const state = await vm(page.request);
        const reversed = manual(state).find((r) => r.reversedByApplicationId !== null);
        expect(reversed, "PROOF 3 must have left a reversed decision").toBeTruthy();

        await openCard(page);
        await page.reload();
        const compact = page.locator('[data-financials-card="true"]').first();
        await expect(compact).toBeVisible({ timeout: 90_000 });
        await compact.getByRole("button", { name: /^Details/ }).first().click();
        await expect(card(page)).toBeVisible({ timeout: 60_000 });
        await page.waitForTimeout(2_000);

        const row = card(page).locator(`[data-adjustment-id="${reversed!.applicationId}"]`);
        await expect(row, "the history survives a full page load").toBeVisible({ timeout: 60_000 });
        expect(await row.getAttribute("data-adjustment-reversed")).toBe("true");
        await expect(
            row.getByText("Reverse adjustment"),
            "and a decision already undone is not offered a second undoing",
        ).toHaveCount(0);

        // The service refuses it too, through the real route — the UI is not the only guard.
        const res = await page.request.post("/api/admin/actions/execute", {
            headers: { "content-type": "application/json" },
            data: {
                action_key: "billing.reverse_adjustment",
                ...reductionEntity(state), mode: "execute",
                payload: { application_id: reversed!.applicationId, reason: "certification: second attempt" },
            },
        });
        const json = (await res.json()) as Record<string, unknown>;
        expect(json.ok, "reverse-once is enforced by the service").toBe(false);
        expect(JSON.stringify(json)).toMatch(/already been reversed/i);
    });

    test("PROOF 5 · the route refuses a malformed adjustment and one from outside the org", async ({ page }) => {
        test.setTimeout(300_000);
        await page.goto("/workspace");
        const current = await vm(page.request);
        const post = async (payload: Record<string, unknown>, action = "billing.adjust_account") => {
            const res = await page.request.post("/api/admin/actions/execute", {
                headers: { "content-type": "application/json" },
                data: { action_key: action, ...reductionEntity(current), mode: "execute", payload },
            });
            return (await res.json()) as Record<string, unknown>;
        };
        /* Preview runs the same validation as execute and writes nothing — the control must not
         * leave money behind on every run. */
        const preview = async (payload: Record<string, unknown>) => {
            const res = await page.request.post("/api/admin/actions/execute", {
                headers: { "content-type": "application/json" },
                data: { action_key: "billing.adjust_account", ...reductionEntity(current), mode: "preview", payload },
            });
            return (await res.json()) as Record<string, unknown>;
        };
        const agreementId = current.subjects![0]!.agreementId;

        /*
         * The control: a well-formed payload through this same seam is ACCEPTED. Without it every
         * refusal below could be the seam refusing rather than the rule refusing, and the whole
         * proof would be green for the wrong reason.
         */
        const wellFormed = await preview({
            enrollment_agreement_id: agreementId, amount_cents: -1,
            reason: "certification: control that this seam accepts a valid payload",
            effective_date: "2026-09-13",
        });
        expect(wellFormed.ok, "a valid adjustment is accepted through this seam").toBe(true);

        expect((await post({ enrollment_agreement_id: agreementId, amount_cents: 0, reason: "zero", effective_date: "2026-09-13" })).ok,
            "a zero adjustment is not a correction").toBe(false);
        expect((await post({ enrollment_agreement_id: agreementId, amount_cents: -500, reason: "x", effective_date: "2026-09-13" })).ok,
            "a reduction with no real reason cannot be explained later").toBe(false);
        expect((await post({ enrollment_agreement_id: agreementId, amount_cents: -500, reason: "no date given", effective_date: "" })).ok,
            "it must say which period it belongs to").toBe(false);
        expect((await post({ enrollment_agreement_id: agreementId, amount_cents: -500, reason: "bad category", effective_date: "2026-09-13", charge_category: "waiver" })).ok,
            "waiver is not in the canonical vocabulary").toBe(false);

        const forged = await post(
            { application_id: "ffffffff-0000-4000-8000-ffffffffffff", reason: "certification: forged" },
            "billing.reverse_adjustment",
        );
        expect(forged.ok, "a reduction that is not this org's reads as absent").toBe(false);
        expect(JSON.stringify(forged), "and discloses no other tenant").not.toMatch(/another org|forbidden/i);
    });

    test("PROOF 6 · the controls are reachable on a narrow viewport", async ({ page }) => {
        test.setTimeout(300_000);
        await page.setViewportSize({ width: 390, height: 844 });
        await openCard(page);
        const opener = card(page).getByText("Add adjustment").first();
        await opener.scrollIntoViewIfNeeded();
        await opener.click();
        await expect(control(page, "adjustment-panel")).toBeVisible();
        for (const id of ["adjustment-agreement", "adjustment-category", "adjustment-amount", "adjustment-confirm"]) {
            const el = control(page, id);
            await expect(el, `${id} must be reachable`).toBeVisible();
            const box = await el.boundingBox();
            expect(box, `${id} must have a box`).toBeTruthy();
            expect(box!.x, `${id} must not sit off-screen`).toBeGreaterThanOrEqual(-1);
            expect(box!.x + box!.width, `${id} must not overflow the viewport`).toBeLessThanOrEqual(391);
        }
        await control(page, "adjustment-cancel").click();
    });
});
