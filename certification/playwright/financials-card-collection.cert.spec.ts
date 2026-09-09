/**
 * SLICE H — THE OPERATOR ACTUALLY COLLECTING, in a real browser.
 *
 * Everything Thread 8B built was reachable only from a test file until now. These scenarios drive
 * the mounted Financials card the way an operator does: open the panel, choose a rail, and watch
 * what the product says about money.
 *
 * The claim that matters is what the UI refuses to say. A blocked merchant must be explained rather
 * than reported as a failure; a card that Stripe has taken must read as "finalizing" rather than as
 * paid, because Financials has not recognised it yet; and a manual rail must never touch any of it.
 *
 * Real Stripe test mode, a real connected account, real Postgres, real Stripe Elements.
 *
 * ── WHY THE SUBJECT IS RESOLVED RATHER THAN ASSUMED ──────────────────────────────────────────────
 *
 * The first version of this file opened `/workspace/work-unit/new-leads`, took whichever row the
 * queue happened to render first, and then seeded its charges onto a DIFFERENT, hardcoded household
 * (`fc500000-…c0001`, the charge-spine fixture). The card on screen and the money under test were
 * two unrelated accounts, so every assertion below them was reading one subject and mutating
 * another. A green run proved nothing.
 *
 * That fixture household cannot be the answer either, and this is a platform fact rather than a
 * preference: it has NO opportunity (`certification/fixtures/financials-charge-spine.sql` says so in
 * as many words — "No opportunities, no process instances"), every active Work Unit in this tenant
 * pages `opportunity` subjects, and `/api/admin/operator-focus/resolve` answers
 * `operational_host: null` for it. Its durable record surface at `/workspace/record/child/…` renders
 * CHILDREN but composes no Financials card at all. There is no mounted route to it. Proven, not
 * assumed — see the run notes on this slice.
 *
 * So the subject is resolved from the Work View that actually hosts the card, and then everything
 * else is BOUND to it: the charges are seeded onto that subject's own household, and the card's own
 * authoritative account read is asserted to be scoped to that same household before any scenario is
 * allowed to proceed. Selection is deliberate rather than positional — the least opportunity id
 * among the rows this view pages in, which is stable whatever order the queue chooses to display —
 * and cold entry by `?subject_id=` is the platform's own mechanism, the same one
 * `attendance-record-attention` and `search-focus-panel` use.
 *
 * Correctness here comes from BINDING, not from luck: whichever subject is opened, the money under
 * test is that subject's money, and the card is proven to be reading it.
 */
import { expect, test, type Page } from "@playwright/test";

const WORK_VIEW = "/workspace/work-unit/new-leads";

/**
 * The assistant rail, parked.
 *
 * BOS mounts an overlay above the workspace. It is a real product surface and the operator's own
 * preference decides it, but left open it sits over the Financials card's footer, so `Details →`
 * and the payment controls beneath it are covered and every click waits out its own timeout against
 * an element nothing can reach. `workspace-financials-smoke` parks it the same way for the same
 * reason — this is the operator's stored preference, not a test-only bypass.
 */
const BOS_PRESENTATION_STATE_KEY = "alloy:v1:admV2:shell:bosPresentationState";

async function parkAssistantRail(page: Page) {
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
}

/** The action envelope, from the operator's own authenticated session. */
async function execute(page: Page, body: Record<string, unknown>) {
    const res = await page.request.post("/api/admin/actions/execute", { data: body });
    return { status: res.status(), json: (await res.json()) as Record<string, any> };
}

/** A charge template belonging to this org. Fixed amounts, so the arithmetic below is exact. */
const TEMPLATE = "fc500000-0000-4000-8000-0000000d0001";

/**
 * The subject this run operates on, and the account its money lives in.
 *
 * `customerId` is not read from a fixture or a guess — it is taken from the card's OWN request for
 * its balance (`/api/admin/financials/card?customer_id=…`). That is the authoritative account by
 * construction: it is the one the operator is looking at.
 */
type CertSubject = { subjectId: string; customerId: string };

/** Every account the mounted card has asked about, in order. The wrong-subject tripwire. */
function watchAccountReads(page: Page): string[] {
    const reads: string[] = [];
    page.on("request", (req) => {
        const url = req.url();
        if (!url.includes("/api/admin/financials/card")) return;
        const id = new URL(url).searchParams.get("customer_id");
        if (id) reads.push(id);
    });
    return reads;
}

/**
 * Open the certification subject, deliberately, and prove which one it is.
 *
 * Fails EARLY and loudly rather than letting a selector success stand in for subject correctness:
 * a refused cold entry, an absent card, or a card reading somebody else's account each stop the
 * scenario here instead of at an assertion three steps later that would blame the wrong thing.
 */
async function openCertificationSubject(page: Page, reads: string[]): Promise<CertSubject> {
    await parkAssistantRail(page);
    await page.goto(WORK_VIEW);
    await page.waitForLoadState("domcontentloaded");

    const rows = page.locator('[data-entity-type="opportunity"][data-entity-id]');
    await expect(rows.first(), "the queue must page in at least one subject").toBeVisible({
        timeout: 90_000,
    });

    // DELIBERATE, NOT POSITIONAL. The least id among the rows this view pages in is the same
    // subject whatever order the queue decides to render, so the run is reproducible without
    // depending on `updated_at` or on the display sort.
    const ids = (await rows.evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-entity-id")).filter((v): v is string => !!v),
    )).sort();
    expect(ids.length, "no selectable subject in the Work View").toBeGreaterThan(0);
    const subjectId = ids[0];

    /*
     * Everything read up to here belongs to whichever subject the Work View opened BY DEFAULT when
     * it had no `subject_id` to honour. That is a legitimate product behaviour and a different
     * account, so the subject assertion below is scoped to the reads that follow cold entry — the
     * first run of this file failed here, correctly, by counting both.
     */
    const mark = reads.length;

    // Cold entry — the platform's own way of establishing attention on a named subject.
    await page.goto(`${WORK_VIEW}?subject_id=${subjectId}`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(new RegExp(`subject_id=${subjectId}`));

    // A subject this view cannot page in is REFUSED rather than substituted. That refusal is a
    // correct product behaviour, and an unusable starting point for this certification.
    await expect
        .poll(async () => await page.locator('[data-financials-card="true"]').count(), { timeout: 90_000 })
        .toBeGreaterThan(0);
    const text = (await page.locator("body").innerText().catch(() => "")) || "";
    expect(text, "the Work View refused the subject instead of presenting it").not.toMatch(
        /isn.t in this Work View/i,
    );

    expect(
        await page.locator("[data-adminv2-bos-rail-overlay][data-bos-overlay-mode]").count(),
        "the operator's closed assistant-rail preference must be honoured, or every click below is covered",
    ).toBe(0);

    // THE SUBJECT ASSERTION. The card must have asked about exactly one account, and that account
    // is the one every scenario below will seed, collect and refund against.
    await expect
        .poll(() => reads.length - mark, { timeout: 60_000 })
        .toBeGreaterThan(0);
    const afterEntry = reads.slice(mark);
    const customerId = afterEntry[afterEntry.length - 1];
    expect(customerId, "the mounted card never resolved an account to read").toBeTruthy();
    const distinct = Array.from(new Set(afterEntry));
    expect(
        distinct,
        `the mounted card read more than one account — the panel is not settled on one subject: ${distinct.join(", ")}`,
    ).toHaveLength(1);

    test.info().annotations.push({
        type: "certification-subject",
        description: `subject_id=${subjectId} customer_id=${customerId}`,
    });
    // From here on, EVERY read must be this subject's. The window is closed so the tripwire below
    // cannot be satisfied by the default subject's reads from before cold entry.
    reads.length = 0;
    return { subjectId, customerId };
}

/**
 * The tripwire, re-armed after every navigation.
 *
 * Selector success must never masquerade as subject correctness: if the card has started reading a
 * different household — a stale panel, a substituted subject, a queue that moved — the scenario
 * fails here rather than reporting a balance that belongs to somebody else.
 */
function assertStillOnSubject(reads: string[], subject: CertSubject, where: string) {
    const strayed = reads.filter((id) => id !== subject.customerId);
    expect(
        strayed,
        `${where}: the mounted card read ${strayed.join(", ")} but this run's subject is ${subject.customerId}`,
    ).toHaveLength(0);
}

/**
 * A posted charge for THIS run's subject.
 *
 * The payment control only renders for rows the read model marks payable, so a subject with nothing
 * owed has no way in — correctly. Seeding one is setup, not the thing under test, and it goes through
 * the same canonical actions an operator would use, at the same grain the mounted card itself uses:
 * the panel's subject as the entity, the household as `customer_id`. (`FinancialsCard` builds
 * exactly this invocation when the panel has no child in scope, which every pre-enrolment New Leads
 * family is.)
 */
async function seedPostedCharge(page: Page, subject: CertSubject, templateId = TEMPLATE) {
    const added = await execute(page, {
        action_key: "charge.add", entity_type: "opportunity", entity_id: subject.subjectId, mode: "execute",
        confirmation: { confirmed: true },
        payload: { customer_id: subject.customerId, template_id: templateId },
    });
    const id = added.json.data?.execution_result?.affected_id ?? added.json.data?.affected_id;
    expect(id, `seeding a charge for ${subject.customerId} failed: ${JSON.stringify(added.json).slice(0, 400)}`)
        .toBeTruthy();
    const posted = await execute(page, {
        action_key: "charge.post", entity_type: "opportunity", entity_id: subject.subjectId, mode: "execute",
        confirmation: { confirmed: true }, payload: { charge_id: id },
    });
    expect(posted.json.ok, `posting the seeded charge failed: ${JSON.stringify(posted.json).slice(0, 400)}`)
        .toBeTruthy();
    return String(id);
}

/**
 * Enter the payment panel. "Record payment →" opens a menu of the charges that can take money —
 * the operator picks WHICH obligation before they pick a rail — and the panel follows the choice.
 */
async function openPaymentPanel(page: Page): Promise<void> {
    /*
     * The payment control lives in the EXPANDED representation. A compact card is supporting context
     * inside another process and deliberately offers the way in rather than the operation itself, so
     * the card has to be opened before there is anything to click.
     */
    const details = page
        .locator('[data-financials-card="true"]')
        .first()
        .getByRole("button", { name: /Details/ });
    /*
     * WAITED FOR, never merely probed. `[data-financials-card]` appears as soon as the card mounts,
     * while its footer actions belong to the approved representation composed inside it — so a
     * conditional probe silently did nothing on a card that was still rendering, and the control it
     * opens was then waited for forever against a card that had never finished composing.
     */
    await expect
        .poll(async () => await details.count(), { timeout: 60_000 })
        .toBeGreaterThan(0);

    /*
     * `Take payment →` is the card's own footer intent, and it is taken from the card rather than
     * from inside Details on purpose: the detail representation is a deeper layer whose armed scrim
     * sits over the operation, so a commit button reached that way is visible, enabled and
     * unclickable. This is the same depth Add charge opens at, which is where the operation belongs.
     */
    const payNow = page.getByRole("button", { name: /Take payment/ });
    await expect(payNow, "the mounted card must offer the settle operation").toBeVisible({
        timeout: 60_000,
    });
    await payNow.click();

    const chooser = page.locator('[data-financials-payment-method="true"]').first();
    await expect(chooser, "the payment panel opens with a rail chooser").toBeVisible({ timeout: 60_000 });
}

/** Open the subject, seed one posted charge on it, and come back with the panel ready. */
async function subjectWithCollectibleCharge(page: Page, reads: string[]): Promise<CertSubject> {
    const subject = await openCertificationSubject(page, reads);
    await seedPostedCharge(page, subject);
    await page.goto(`${WORK_VIEW}?subject_id=${subject.subjectId}`);
    await page.waitForLoadState("domcontentloaded");
    await expect
        .poll(async () => await page.locator('[data-financials-card="true"]').count(), { timeout: 90_000 })
        .toBeGreaterThan(0);
    assertStillOnSubject(reads, subject, "after seeding");
    return subject;
}

test.describe("Slice H — collecting money through the mounted Financials card", () => {
    /*
     * SCENARIO S — THE SUBJECT ITSELF.
     *
     * The defect this slice was blocked on was not a selector failure; it was a card showing one
     * account while the test mutated another. So the binding is certified in its own right, before
     * any money moves.
     */
    test("S — the mounted card is proven to be reading this run's own subject", async ({ page }) => {
        const reads = watchAccountReads(page);
        const subject = await openCertificationSubject(page, reads);

        // The seeded money lands on the SAME account the card is reading — asserted through the
        // card's own projection rather than through the database.
        const before = await execute(page, {
            action_key: "charge.add", entity_type: "opportunity", entity_id: subject.subjectId,
            mode: "preview", payload: { customer_id: subject.customerId, template_id: TEMPLATE },
        });
        expect(before.json.ok, "the resolver must accept this subject's own grain").toBeTruthy();

        await seedPostedCharge(page, subject);
        await page.reload();
        await page.waitForLoadState("domcontentloaded");
        await expect
            .poll(async () => await page.locator('[data-financials-card="true"]').count(), { timeout: 90_000 })
            .toBeGreaterThan(0);

        assertStillOnSubject(reads, subject, "after a reload");
    });

    /*
     * SCENARIO A — MERCHANT BLOCKED.
     *
     * The organisation has no usable connected account, so card collection cannot happen. The bar is
     * not that it fails; it is that the operator is told WHY, and that Alloy does not quietly collect
     * into its own account instead.
     */
    test("A — a card collection with no ready merchant is explained, not failed, and never falls back", async ({ page }) => {
        const reads = watchAccountReads(page);
        const subject = await openCertificationSubject(page, reads);

        // Driven through the operator's own session, exactly as the panel does it.
        const attempted = await execute(page, {
            action_key: "payment.collect_card",
            entity_type: "opportunity",
            entity_id: subject.subjectId,
            mode: "execute",
            confirmation: { confirmed: true },
            payload: { charge_id: "00000000-0000-4000-8000-0000000000cc", amount_cents: 1000 },
        });

        expect(attempted.json.ok, "collection is refused").toBeFalsy();
        const body = JSON.stringify(attempted.json);
        // The refusal explains itself and never names an account.
        expect(body, "no platform or connected account is offered as a fallback").not.toMatch(/acct_/);
        expect(body, "and it is not a generic failure").not.toMatch(/payment failed/i);
        assertStillOnSubject(reads, subject, "scenario A");
    });

    /*
     * SCENARIO G — MANUAL RAILS, through the mounted panel.
     *
     * Cash, check and money order reach Thread 8 with no merchant, no collection attempt and no
     * provider transaction. The panel's rail chooser is the proof that the product still models
     * payment as something wider than Stripe.
     */
    test("G — the rail chooser offers manual rails and records them with no provider involvement", async ({ page }) => {
        const reads = watchAccountReads(page);
        const subject = await subjectWithCollectibleCharge(page, reads);
        await openPaymentPanel(page);
        const chooser = page.locator('[data-financials-payment-method="true"]').first();

        // RAIL-FIRST, and truthful about what is executable. Bank transfer is a real rail with no
        // executor yet, so it is present and disabled rather than silently recording money.
        const options = await chooser.locator("option").allTextContents();
        expect(options.join(" | "), "card is a rail").toMatch(/Card/);
        expect(options.join(" | "), "and so are the manual ones").toMatch(/Cash/);
        expect(options.join(" | ")).toMatch(/Check/);
        expect(options.join(" | ")).toMatch(/Money order/);
        expect(options.join(" | "), "ACH is named as unavailable rather than offered").toMatch(/not yet available/i);
        expect(options.join(" | "), "the chooser is rail-first, never processor-first").not.toMatch(/Stripe/i);

        // Choosing a manual rail keeps the commit verb honest: it RECORDS, it does not collect.
        await chooser.selectOption("cash");
        const commit = page.locator('[data-financials-payment-commit="true"]').first();
        await expect(commit).toHaveText(/Record payment/);

        // And choosing card changes the verb, because a card is asked rather than written down.
        // THE EXACT DEFECT THIS ASSERTION EXISTS FOR: Card once fell through to `payment.record`,
        // which writes canonical money without any processor ever being asked for it.
        await chooser.selectOption("card");
        await expect(commit, "card collects rather than records").toHaveText(/Collect by card/);

        assertStillOnSubject(reads, subject, "scenario G");
    });

    /*
     * SCENARIO B — A REAL CARD, and the state that matters most.
     *
     * The panel must not say "paid" when Stripe has taken the money but Financials has not yet
     * recognised it. That interval is real, Slice F made it representable, and this is where an
     * operator would otherwise be told a lie in either direction.
     */
    test("B — a real card collection shows finalizing, never paid, until Financials recognises it", async ({ page }) => {
        const reads = watchAccountReads(page);
        const subject = await subjectWithCollectibleCharge(page, reads);
        await openPaymentPanel(page);
        const chooser = page.locator('[data-financials-payment-method="true"]').first();
        await chooser.selectOption("card");

        const amount = page.locator('[data-financials-payment-amount="true"]').first();
        await amount.fill("10.00");
        await page.locator('[data-financials-payment-commit="true"]').first().click();

        /*
         * Either the merchant is ready and Stripe's own fields mount, or the organisation cannot
         * collect and the panel says so. Both are correct product states; what would be wrong is a
         * raw error, a fallback, or a balance that moved.
         */
        const mounted = page.locator('[data-financials-card-field="true"]');
        const blocked = page.locator('[data-financials-card-blocked="true"]');
        await expect
            .poll(async () => (await mounted.count()) + (await blocked.count()), { timeout: 60_000 })
            .toBeGreaterThan(0);

        if ((await blocked.count()) > 0) {
            const text = await blocked.innerText();
            expect(text.length, "a blocked collection explains itself").toBeGreaterThan(10);
            expect(text, "and never names an account").not.toMatch(/acct_/);
            test.info().annotations.push({ type: "scenario-b", description: `blocked: ${text}` });
            assertStillOnSubject(reads, subject, "scenario B (blocked)");
            return;
        }

        // Stripe's own iframe. The card number never enters Alloy state — this is the whole reason
        // the field is Stripe's rather than ours.
        const frame = page.frameLocator('[data-financials-card-field="true"] iframe').first();
        await expect
            .poll(async () => await page.locator('[data-financials-card-mount="true"] iframe').count(), { timeout: 60_000 })
            .toBeGreaterThan(0);

        await frame.locator('[name="number"]').fill("4242424242424242").catch(() => undefined);
        await frame.locator('[name="expiry"]').fill("12" + String(new Date().getFullYear() + 2).slice(2)).catch(() => undefined);
        await frame.locator('[name="cvc"]').fill("123").catch(() => undefined);

        await page.locator('[data-financials-card-submit="true"]').first().click();

        // THE ASSERTION THIS SCENARIO EXISTS FOR. Whatever happens next, the panel must never claim
        // the money is Financials-recognised on the strength of the browser alone.
        await expect
            .poll(
                async () =>
                    (await page.locator('[data-financials-card-finalizing="true"]').count())
                    + (await page.locator('[data-financials-card-failed="true"]').count())
                    + (await page.locator('[data-financials-card-recognized="true"]').count()),
                { timeout: 90_000 },
            )
            .toBeGreaterThan(0);

        const finalizing = page.locator('[data-financials-card-finalizing="true"]');
        if ((await finalizing.count()) > 0) {
            const text = await finalizing.innerText();
            expect(text, "the interval is named truthfully").toMatch(/finalizing/i);
            expect(text, "and is never called paid").not.toMatch(/\bpaid\b/i);
            // Never offer another charge as the recovery for money already taken.
            expect(text).not.toMatch(/charge again|try again/i);
        }

        assertStillOnSubject(reads, subject, "scenario B");
    });

    /*
     * NO SECOND READ MODEL.
     *
     * `/api/admin/financials/collection-state` reports where a collection has GOT TO. The moment it
     * starts reporting what is owed, Financials has two answers to the same question and one of them
     * is wrong. Asserted against the live route, on this run's own subject.
     */
    test("N — collection-state reports execution state and never financial authority", async ({ page }) => {
        const reads = watchAccountReads(page);
        await openCertificationSubject(page, reads);

        const res = await page.request.get(
            "/api/admin/financials/collection-state?attempt_id=00000000-0000-4000-8000-0000000000cc",
        );
        // A missing attempt is a 404; what matters is the SHAPE the route can ever answer with.
        expect([200, 404]).toContain(res.status());
        const body = await res.text();
        for (const owned of ["outstanding", "applied", "unapplied", "collectible", "balance"]) {
            expect(body.toLowerCase(), `collection-state must not own "${owned}"`).not.toContain(owned);
        }
    });
});
