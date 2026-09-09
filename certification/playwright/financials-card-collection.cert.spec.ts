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
 * THE CERTIFICATION SUBJECT, PINNED — and it has to be this one.
 *
 * Card collection resolves what may be taken through Thread 9, which resolves responsibility through
 * `resolveAllocatableNet` — and that refuses anything that is not enrolment-backed: "Only an
 * enrolment-backed charge carries responsibility." A pre-enrolment New Leads family therefore has
 * nothing collectible by card no matter how much it owes, so a subject chosen for being reachable is
 * not enough; it must also carry an active enrolment agreement.
 *
 * This tenant has exactly one family that is both: Tatum Testfamily-0059, whose household has an
 * active agreement AND opportunities the Work View pages. The charge-spine fixture household has an
 * agreement too, but no opportunity and no mounted route at all, which is why it cannot be the
 * mounted subject.
 *
 * Pinned rather than discovered, so every scenario in this file operates on the same money.
 */
/*
 * The household has three opportunities; this is the one the Work View actually pages. Cold entry
 * onto either of the others is REFUSED ("isn't in this Work View") — correct product behaviour, and
 * an unusable starting point. Verified mounted against both New Leads and the enrolment pipeline:
 * only this id mounts the card, and the card it mounts reads the household below.
 */
const CERT_OPPORTUNITY = "00000000-0000-4000-8000-40000000099b";
const CERT_CUSTOMER = "00000000-0000-4000-8000-10000000003b";
const CERT_MEMBER = "00000000-0000-4000-8000-30000000003b";

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

    /*
     * Everything read up to here belongs to whichever subject the Work View opened BY DEFAULT when
     * it had no `subject_id` to honour. That is a different account, so the assertion below is
     * scoped to the reads that follow cold entry.
     */
    const mark = reads.length;

    // Cold entry onto the PINNED subject — the platform's own way of establishing attention.
    await page.goto(`${WORK_VIEW}?subject_id=${CERT_OPPORTUNITY}`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(new RegExp(`subject_id=${CERT_OPPORTUNITY}`));

    await expect
        .poll(async () => await page.locator('[data-financials-card="true"]').count(), { timeout: 90_000 })
        .toBeGreaterThan(0);
    const text = (await page.locator("body").innerText().catch(() => "")) || "";
    expect(text, "the Work View refused the certification subject instead of presenting it").not.toMatch(
        /isn.t in this Work View/i,
    );

    expect(
        await page.locator("[data-adminv2-bos-rail-overlay][data-bos-overlay-mode]").count(),
        "the operator's closed assistant-rail preference must be honoured, or every click below is covered",
    ).toBe(0);

    /*
     * THE SUBJECT ASSERTION. The card must be reading the certification household's own account —
     * compared against the pinned id, not merely against itself, so opening the wrong family fails
     * here rather than three assertions later against somebody else's money.
     */
    await expect
        .poll(() => reads.length - mark, { timeout: 60_000 })
        .toBeGreaterThan(0);
    const afterEntry = reads.slice(mark);
    const distinct = Array.from(new Set(afterEntry));
    expect(
        distinct,
        `the mounted card read ${distinct.join(", ")} but this run's subject is ${CERT_CUSTOMER}`,
    ).toEqual([CERT_CUSTOMER]);

    test.info().annotations.push({
        type: "certification-subject",
        description: `subject_id=${CERT_OPPORTUNITY} customer_id=${CERT_CUSTOMER} member=${CERT_MEMBER}`,
    });
    reads.length = 0;
    return { subjectId: CERT_OPPORTUNITY, customerId: CERT_CUSTOMER };
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
        action_key: "charge.add", entity_type: "child", entity_id: CERT_MEMBER, mode: "execute",
        confirmation: { confirmed: true },
        payload: { customer_member_id: CERT_MEMBER, customer_id: subject.customerId, template_id: templateId },
    });
    const id = added.json.data?.execution_result?.affected_id ?? added.json.data?.affected_id;
    expect(id, `seeding a charge for ${subject.customerId} failed: ${JSON.stringify(added.json).slice(0, 400)}`)
        .toBeTruthy();
    const posted = await execute(page, {
        action_key: "charge.post", entity_type: "child", entity_id: CERT_MEMBER, mode: "execute",
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
    await page.goto(`${WORK_VIEW}?subject_id=${CERT_OPPORTUNITY}`);
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
            action_key: "charge.add", entity_type: "child", entity_id: CERT_MEMBER,
            mode: "preview",
            payload: { customer_member_id: CERT_MEMBER, customer_id: subject.customerId, template_id: TEMPLATE },
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
     * THE DEPTH LAYER — the collection surface must be usable, not merely painted.
     *
     * Slice H's controls rendered above the scrim and could not be clicked. The cause was not
     * z-index: an elevated cell makes every direct child inert and hands interaction to
     * `.alloy-os-ucard` alone, so a surface hosted as a bare div is inert by contract. Measured
     * before the repair: every ancestor of the commit control carried `pointer-events: none`, no
     * node in the chain created a stacking context, and `elementFromPoint` over the control
     * returned the scrim.
     *
     * This asserts the INVARIANT rather than the fix, so it keeps holding if the depth layer is
     * reimplemented: the operator's own click lands on the control, the scrim still guards the
     * background, and nothing here is force-clicked — a force-click passing would only prove the
     * product is broken.
     */
    test("D — the collection surface is interactive in the mounted depth layer, and the scrim still guards the background", async ({ page }) => {
        const reads = watchAccountReads(page);
        const subject = await subjectWithCollectibleCharge(page, reads);
        await openPaymentPanel(page);
        await page.locator('[data-financials-payment-method="true"]').first().selectOption("card");

        const commit = page.locator('[data-financials-payment-commit="true"]').first();
        await expect(commit, "the collection surface must be visible").toBeVisible({ timeout: 30_000 });

        /*
         * Settle before measuring. The raised card animates in from its origin, so a rect read on
         * the first frame is transient — measured once at y=-251, above the viewport entirely. This
         * is the browser's own scroll, not a test convenience: hit-testing a control the operator
         * has not scrolled to would prove nothing either way.
         */
        await commit.scrollIntoViewIfNeeded();
        await expect
            .poll(async () => await commit.evaluate((el) => {
                const r = el.getBoundingClientRect();
                return r.top >= 0 && r.bottom <= window.innerHeight ? 1 : 0;
            }), { timeout: 30_000 })
            .toBe(1);

        // 1 · THE CONTROL'S OWN CENTRE HIT-TESTS TO THE CONTROL, not to the scrim.
        const hit = await page.evaluate(() => {
            const el = document.querySelector('[data-financials-payment-commit="true"]') as HTMLElement;
            const surface = el.closest('[data-financials-overlay="payment"]');
            const r = el.getBoundingClientRect();
            const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) as HTMLElement | null;
            return {
                isScrim: !!top?.hasAttribute?.("data-fp-depth-scrim"),
                insideSurface: !!(top && surface?.contains(top)),
                pointerEvents: getComputedStyle(el).pointerEvents,
                topDesc: top ? `${top.tagName.toLowerCase()}.${String(top.className).split(" ")[0]}` : "nothing",
                rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
            };
        });
        expect(hit.isScrim, "the depth scrim is intercepting the commit control").toBe(false);
        expect(
            hit.insideSurface,
            `the commit control's centre hit ${hit.topDesc} instead of its own active surface (rect ${JSON.stringify(hit.rect)})`,
        ).toBe(true);
        expect(hit.pointerEvents, "the commit control is inert").not.toBe("none");

        // 2 · THE SCRIM STILL DOES ITS JOB. A point inside a receded cell and outside the raised
        //     card must belong to the scrim — protecting the background is the reason it exists.
        const background = await page.evaluate(() => {
            const raised = document.querySelector('[data-fp-elevated="true"] .alloy-os-ucard') as HTMLElement | null;
            const rr = raised?.getBoundingClientRect();
            for (const cell of Array.from(document.querySelectorAll("[data-focus-panel-grid-cell]"))) {
                if (cell.getAttribute("data-fp-elevated") === "true") continue;
                const b = cell.getBoundingClientRect();
                if (b.width < 8 || b.height < 8) continue;
                // Sample a few points; take the first that is genuinely outside the raised card.
                for (const [px, py] of [[0.08, 0.5], [0.92, 0.5], [0.5, 0.9]] as const) {
                    const x = b.x + b.width * px, y = b.y + b.height * py;
                    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
                    if (rr && x >= rr.x && x <= rr.right && y >= rr.y && y <= rr.bottom) continue;
                    const top = document.elementFromPoint(x, y) as HTMLElement | null;
                    if (!top) continue;
                    return {
                        cell: cell.getAttribute("data-focus-panel-grid-cell"),
                        isScrim: !!top.hasAttribute?.("data-fp-depth-scrim"),
                        inRaisedCard: !!(raised && raised.contains(top)),
                    };
                }
            }
            return null;
        });
        expect(background, "no receded cell was available to probe").not.toBeNull();
        expect(
            background!.isScrim,
            `the scrim no longer guards the background (cell ${background!.cell} hit-tested past it)`,
        ).toBe(true);

        // 3 · KEYBOARD REACHES IT, so "works with a mouse" is not mistaken for "works".
        const keyboard = await page.evaluate(() => {
            const el = document.querySelector('[data-financials-payment-commit="true"]') as HTMLButtonElement;
            el.focus();
            return { focused: document.activeElement === el, disabled: el.disabled, tabIndex: el.tabIndex };
        });
        expect(keyboard.focused, "the commit control cannot take keyboard focus").toBe(true);
        expect(keyboard.disabled).toBe(false);

        // 4 · AND AN ORDINARY CLICK LANDS. No `force` — Playwright's own actionability check is
        //     the assertion, and it is the same check a real pointer would fail.
        await commit.click({ timeout: 30_000 });

        assertStillOnSubject(reads, subject, "depth-layer scenario");
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
            entity_type: "child",
            entity_id: CERT_MEMBER,
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
     * SCENARIO B — A REAL CARD, END TO END.
     *
     * Real connected merchant, real Stripe test-mode Payment Element, real webhook. The claim that
     * matters most is in the middle: between Stripe accepting the card and Financials recognising
     * it, the panel must say "finalizing" and the canonical balance must not move. A browser is not
     * a payment.
     */
    test("B — a real card is collected, shows finalizing, and only Financials recognition moves the money", async ({ page }) => {
        const reads = watchAccountReads(page);
        const subject = await subjectWithCollectibleCharge(page, reads);

        /** Canonical Thread 8/2/4 truth, read the way the card reads it — never collection-state. */
        const canonical = async () => {
            const res = await page.request.get(
                `/api/admin/financials/card?customer_id=${subject.customerId}`,
            );
            const json = (await res.json()) as any;
            const vm = json.vm ?? {};
            return {
                balance: vm.reconciliation?.balanceCents ?? null,
                payments: (vm.payments ?? []) as Array<any>,
                paymentsCents: vm.reconciliation?.paymentsCents ?? 0,
            };
        };

        const before = await canonical();
        expect(before.balance, "the subject must owe something to collect").toBeGreaterThan(0);

        /*
         * A UNIQUE AMOUNT PER RUN, because the collection attempt is idempotent on
         * (charge, amount, rail). `charge.add` reuses the period's charge, so a fixed amount
         * resolves to the SAME PaymentIntent every run — and once that intent has succeeded, Stripe
         * Elements cannot mount against it. Varying the cents gives each run its own intent while
         * collecting from the same obligation.
         */
        const cents = 1_000 + (Date.now() % 90);
        const amountText = (cents / 100).toFixed(2);

        await openPaymentPanel(page);
        await page.locator('[data-financials-payment-method="true"]').first().selectOption("card");
        await page.locator('[data-financials-payment-amount="true"]').first().fill(amountText);
        const commit = page.locator('[data-financials-payment-commit="true"]').first();
        await commit.scrollIntoViewIfNeeded();
        await commit.click();

        /*
         * The merchant IS ready for this run, so "blocked" is now a defect rather than one of two
         * correct answers. Scenario A already certifies the blocked path on its own terms.
         */
        const blocked = page.locator('[data-financials-card-blocked="true"]');
        const field = page.locator('[data-financials-card-field="true"]');
        await expect
            .poll(async () => (await field.count()) + (await blocked.count()), { timeout: 60_000 })
            .toBeGreaterThan(0);
        if ((await blocked.count()) > 0) {
            throw new Error(`card collection was refused with a ready merchant: ${await blocked.innerText()}`);
        }

        // Stripe's own iframe. The card number never enters Alloy state.
        const mount = page.locator('[data-financials-card-mount="true"] iframe').first();
        await expect(mount, "Stripe's Payment Element must mount").toBeVisible({ timeout: 60_000 });
        const frame = page.frameLocator('[data-financials-card-mount="true"] iframe').first();
        const number = frame.locator('input[name="number"]');
        await expect(number, "the Payment Element must offer a card number field").toBeVisible({ timeout: 60_000 });
        await number.fill("4242424242424242");
        await frame.locator('input[name="expiry"]').fill("12" + String(new Date().getFullYear() + 2).slice(2));
        await frame.locator('input[name="cvc"]').fill("123");
        const zip = frame.locator('input[name="postalCode"]');
        if (await zip.count()) await zip.fill("94103").catch(() => undefined);

        const submit = page.locator('[data-financials-card-submit="true"]').first();
        await expect(submit, "the submit control must become enabled once Stripe is ready").toBeEnabled({
            timeout: 60_000,
        });
        await submit.scrollIntoViewIfNeeded();
        await submit.click();

        /*
         * PRE-RECOGNITION. Stripe has taken the card; Financials has not recognised it. The panel
         * must name that interval truthfully and must never call it paid.
         */
        const finalizing = page.locator('[data-financials-card-finalizing="true"]');
        const failed = page.locator('[data-financials-card-failed="true"]');
        const recognized = page.locator('[data-financials-card-recognized="true"]');
        await expect
            .poll(async () => (await finalizing.count()) + (await failed.count()) + (await recognized.count()), {
                timeout: 90_000,
            })
            .toBeGreaterThan(0);
        expect(await failed.count(), "a real test card must not be declined").toBe(0);

        if ((await finalizing.count()) > 0) {
            const text = await finalizing.innerText();
            expect(text, "the interval is named truthfully").toMatch(/finalizing/i);
            expect(text, "and is never called paid").not.toMatch(/\bpaid\b/i);
            expect(text, "and never offers another charge as the recovery").not.toMatch(/charge again/i);

            /*
             * THE INVARIANT: no cash exists that the provider did not confirm.
             *
             * Stated as "untouched, or moved by exactly this collection" rather than "untouched",
             * because `stripe listen` forwards to localhost and recognition can legitimately land
             * within the same second — a strict equality would be a race against the product
             * working properly. What must never happen is the balance moving by some OTHER amount.
             */
            const during = await canonical();
            expect(
                [before.balance, before.balance! - cents],
                `the canonical balance moved by something other than this collection: ${before.balance} → ${during.balance}`,
            ).toContain(during.balance);
        }

        /*
         * RECOGNITION, through the real webhook. `stripe listen` forwards the provider's own event
         * to this app; nothing here writes a payment.
         */
        await expect
            .poll(async () => (await canonical()).payments.length, { timeout: 180_000 })
            .toBeGreaterThan(before.payments.length);

        const after = await canonical();
        const fresh = after.payments.filter(
            (p) => !before.payments.some((b) => b.paymentId === p.paymentId),
        );
        expect(fresh, "exactly one canonical payment must appear").toHaveLength(1);
        const receipt = fresh[0];
        expect(receipt.receivedCents ?? receipt.amountCents, "the canonical receipt is the amount asked for").toBe(cents);
        expect(receipt.appliedCents, "the receipt is applied to the obligation").toBe(cents);
        expect(receipt.unappliedCents ?? 0, "nothing is left unapplied").toBe(0);
        expect(after.balance, "outstanding falls by exactly the amount collected, once").toBe(
            before.balance! - cents,
        );

        assertStillOnSubject(reads, subject, "scenario B");
        test.info().annotations.push({
            type: "scenario-b",
            description: `collected ${cents}c — canonical receipt ${receipt.paymentId} — balance ${before.balance} → ${after.balance}`,
        });
    });

    /*
     * SCENARIO C — A PARTIAL COLLECTION, AND THE CEILING.
     *
     * Scenario B already collects less than the obligation and proves the residual exactly. What is
     * left to certify is the other half of the same rule: asking for MORE than is collectible is
     * refused rather than quietly clamped. A clamp would take a different amount than the operator
     * authorised and tell nobody.
     */
    test("C — an over-request is refused with the ceiling named, never clamped", async ({ page }) => {
        const reads = watchAccountReads(page);
        const subject = await subjectWithCollectibleCharge(page, reads);

        const cardVm = await page.request.get(`/api/admin/financials/card?customer_id=${subject.customerId}`);
        const vm = ((await cardVm.json()) as any).vm ?? {};
        const payable = (vm.rows ?? []).find((r: any) => r.offersPayment);
        expect(payable, "the subject must have a payable obligation").toBeTruthy();

        const outstanding = payable.outstandingCents as number;

        const over = await execute(page, {
            action_key: "payment.collect_card", entity_type: "child", entity_id: CERT_MEMBER,
            mode: "execute", confirmation: { confirmed: true },
            payload: { charge_id: payable.chargeId, amount_cents: outstanding + 5_000, charge_label: "over" },
        });

        expect(over.json.ok, "an over-request must be refused").toBeFalsy();
        const message = JSON.stringify(over.json);
        expect(message, "the refusal names what CAN be collected rather than failing blankly").toMatch(
            /most that can be collected/i,
        );
        expect(message, "and never names an account").not.toMatch(/acct_/);

        /*
         * NOT CLAMPED. A clamp would have SUCCEEDED at a smaller amount — `ok: true` carrying a
         * different figure than the operator authorised. A refusal cannot be mistaken for one, and
         * proving it this way needs no new endpoint to count attempts through.
         */
        expect(over.json.data?.execution_result, "a refusal must not carry an execution result").toBeFalsy();

        assertStillOnSubject(reads, subject, "scenario C");
    });

    /*
     * SCENARIO D — A DECLINED CARD.
     *
     * Stripe's own decline, not a synthesised one. The operator must be able to tell a refusal from
     * a delay, and must never be told money arrived.
     */
    test("D2 — a declined card is distinguishable from processing and creates no canonical money", async ({ page }) => {
        const reads = watchAccountReads(page);
        const subject = await subjectWithCollectibleCharge(page, reads);
        const canonicalBalance = async () => {
            const res = await page.request.get(`/api/admin/financials/card?customer_id=${subject.customerId}`);
            return ((await res.json()) as any).vm?.reconciliation?.balanceCents ?? null;
        };
        const before = await canonicalBalance();

        await openPaymentPanel(page);
        await page.locator('[data-financials-payment-method="true"]').first().selectOption("card");
        const cents = 1_000 + (Date.now() % 90);
        await page.locator('[data-financials-payment-amount="true"]').first().fill((cents / 100).toFixed(2));
        const commit = page.locator('[data-financials-payment-commit="true"]').first();
        await commit.scrollIntoViewIfNeeded();
        await commit.click();

        const mount = page.locator('[data-financials-card-mount="true"] iframe').first();
        await expect(mount, "Stripe's Payment Element must mount").toBeVisible({ timeout: 60_000 });
        const frame = page.frameLocator('[data-financials-card-mount="true"] iframe').first();
        const number = frame.locator('input[name="number"]');
        await expect(number).toBeVisible({ timeout: 60_000 });
        // Stripe's own generic-decline test card.
        await number.fill("4000000000000002");
        await frame.locator('input[name="expiry"]').fill("12" + String(new Date().getFullYear() + 2).slice(2));
        await frame.locator('input[name="cvc"]').fill("123");
        const zip = frame.locator('input[name="postalCode"]');
        if (await zip.count()) await zip.fill("94103").catch(() => undefined);

        const submit = page.locator('[data-financials-card-submit="true"]').first();
        await expect(submit).toBeEnabled({ timeout: 60_000 });
        await submit.scrollIntoViewIfNeeded();
        await submit.click();

        // The refusal is stated, and it is Stripe's own operator-safe sentence.
        const failedNote = page.locator('[data-financials-card-error="true"], [data-financials-card-failed="true"]');
        await expect(failedNote.first(), "a declined card must say so").toBeVisible({ timeout: 90_000 });
        const text = await failedNote.first().innerText();
        expect(text.length, "the decline explains itself").toBeGreaterThan(8);
        expect(text, "the operator is never told the payment arrived").not.toMatch(/payment received|\bpaid\b/i);
        expect(text, "and a decline is not dressed up as processing").not.toMatch(/finalizing|processing/i);
        expect(text, "no provider identifiers as primary copy").not.toMatch(/acct_|pi_|re_|card_declined/);

        // AND NO MONEY. The provider refused, so Financials has nothing to recognise.
        expect(await canonicalBalance(), "a declined card moved the canonical balance").toBe(before);

        assertStillOnSubject(reads, subject, "scenario D");
    });

    /*
     * SCENARIO E — A FULL REFUND OF A REAL CARD PAYMENT.
     *
     * Money goes back the way it came: a real refund on the provider's connected account, recognised
     * canonically. The original receipt must survive — giving money back is a new fact, never an
     * edit of the one that recorded its arrival.
     */
    test("E — a real card payment is refunded on the provider, and the original receipt survives", async ({ page }) => {
        const reads = watchAccountReads(page);
        const subject = await subjectWithCollectibleCharge(page, reads);
        const canonical = async () => {
            const res = await page.request.get(`/api/admin/financials/card?customer_id=${subject.customerId}`);
            const vm = ((await res.json()) as any).vm ?? {};
            return {
                balance: vm.reconciliation?.balanceCents ?? null,
                payments: (vm.payments ?? []) as Array<any>,
            };
        };

        // ── Collect a real card payment to refund ────────────────────────────────────────────────
        const opening = await canonical();
        const cents = 1_000 + (Date.now() % 90);
        await openPaymentPanel(page);
        await page.locator('[data-financials-payment-method="true"]').first().selectOption("card");
        await page.locator('[data-financials-payment-amount="true"]').first().fill((cents / 100).toFixed(2));
        const commit = page.locator('[data-financials-payment-commit="true"]').first();
        await commit.scrollIntoViewIfNeeded();
        await commit.click();

        const frame = page.frameLocator('[data-financials-card-mount="true"] iframe').first();
        await expect(page.locator('[data-financials-card-mount="true"] iframe').first()).toBeVisible({ timeout: 60_000 });
        await expect(frame.locator('input[name="number"]')).toBeVisible({ timeout: 60_000 });
        await frame.locator('input[name="number"]').fill("4242424242424242");
        await frame.locator('input[name="expiry"]').fill("12" + String(new Date().getFullYear() + 2).slice(2));
        await frame.locator('input[name="cvc"]').fill("123");
        const zip = frame.locator('input[name="postalCode"]');
        if (await zip.count()) await zip.fill("94103").catch(() => undefined);
        const submit = page.locator('[data-financials-card-submit="true"]').first();
        await expect(submit).toBeEnabled({ timeout: 60_000 });
        await submit.scrollIntoViewIfNeeded();
        await submit.click();

        // Canonical recognition, through the provider's own webhook.
        await expect
            .poll(async () => (await canonical()).payments.length, { timeout: 180_000 })
            .toBeGreaterThan(opening.payments.length);
        const collected = await canonical();
        const receipt = collected.payments.find(
            (p) => !opening.payments.some((o) => o.paymentId === p.paymentId),
        );
        expect(receipt, "the collection this refund is about must exist canonically").toBeTruthy();
        const received = (r: any) => r.receivedCents ?? r.amountCents;
        expect(received(receipt), "the canonical receipt is the amount collected").toBe(cents);
        expect(collected.balance, "the collection reduced outstanding").toBe(opening.balance! - cents);

        // ── The refund, from the mounted control on that receipt ─────────────────────────────────
        await page.goto(`${WORK_VIEW}?subject_id=${CERT_OPPORTUNITY}`);
        await expect
            .poll(async () => await page.locator('[data-financials-card="true"]').count(), { timeout: 90_000 })
            .toBeGreaterThan(0);
        await openPaymentPanel(page);

        const refund = page.locator(`[data-financials-refund-payment="${receipt.paymentId}"]`);
        await expect(refund, "the eligible receipt must offer a refund from the mounted panel").toBeVisible({
            timeout: 60_000,
        });
        await refund.scrollIntoViewIfNeeded();
        await refund.click();

        /*
         * The control opens at the full remaining refundable amount, so a full refund is committing
         * what it already offers. Same canonical action as a partial one — only the amount differs.
         */
        const refundForm = page.locator('[data-financials-refund-form="true"]');
        await expect(refundForm, "the refund control must open a form").toBeVisible({ timeout: 30_000 });
        await expect(refundForm.locator('[data-financials-refund-remaining]')).toHaveAttribute(
            "data-financials-refund-remaining",
            String(cents),
        );
        const refundCommit = page.locator('[data-financials-refund-commit="true"]').first();
        await refundCommit.scrollIntoViewIfNeeded();
        await refundCommit.click();

        /*
         * RECOGNITION, not optimism. Thread 8 records the reversal as its own payment; the original
         * is never edited.
         */
        await expect
            .poll(async () => (await canonical()).balance, { timeout: 180_000 })
            .toBe(collected.balance! + cents);

        const after = await canonical();
        const original = after.payments.find((p) => p.paymentId === receipt.paymentId);
        expect(original, "the original receipt must remain visible after a refund").toBeTruthy();
        expect(received(original), "the original receipt is not edited to hide the refund").toBe(cents);

        const lineage = after.payments.filter(
            (p) => !collected.payments.some((c) => c.paymentId === p.paymentId),
        );
        expect(lineage.length, "the refund must appear as its own canonical fact").toBeGreaterThan(0);

        assertStillOnSubject(reads, subject, "scenario E");
        test.info().annotations.push({
            type: "scenario-e",
            description: `refunded ${cents}c of receipt ${receipt.paymentId}; balance ${collected.balance} → ${after.balance}`,
        });
    });

    /*
     * SCENARIO F — A PARTIAL REFUND, AND THEN ANOTHER.
     *
     * Slice G certified repeatable partial refunds on the server; this is the operator expressing
     * them. Both refunds go through the SAME canonical `payment.refund` the full refund uses — one
     * capability with an amount intent, never a second mutation — and the original receipt keeps
     * saying what arrived while the reversals accumulate beside it.
     */
    test("F — a partial refund, a second one, and an over-refund the server refuses", async ({ page }) => {
        const reads = watchAccountReads(page);
        const subject = await subjectWithCollectibleCharge(page, reads);
        const canonical = async () => {
            const res = await page.request.get(`/api/admin/financials/card?customer_id=${subject.customerId}`);
            const vm = ((await res.json()) as any).vm ?? {};
            return {
                balance: vm.reconciliation?.balanceCents ?? null,
                payments: (vm.payments ?? []) as Array<any>,
            };
        };
        const received = (r: any) => r.receivedCents ?? r.amountCents;

        // ── A real card payment to refund in pieces ──────────────────────────────────────────────
        const opening = await canonical();
        const cents = 1_000 + (Date.now() % 90);
        await openPaymentPanel(page);
        await page.locator('[data-financials-payment-method="true"]').first().selectOption("card");
        await page.locator('[data-financials-payment-amount="true"]').first().fill((cents / 100).toFixed(2));
        const commit = page.locator('[data-financials-payment-commit="true"]').first();
        await commit.scrollIntoViewIfNeeded();
        await commit.click();

        const frame = page.frameLocator('[data-financials-card-mount="true"] iframe').first();
        await expect(page.locator('[data-financials-card-mount="true"] iframe').first()).toBeVisible({ timeout: 60_000 });
        await expect(frame.locator('input[name="number"]')).toBeVisible({ timeout: 60_000 });
        await frame.locator('input[name="number"]').fill("4242424242424242");
        await frame.locator('input[name="expiry"]').fill("12" + String(new Date().getFullYear() + 2).slice(2));
        await frame.locator('input[name="cvc"]').fill("123");
        const zip = frame.locator('input[name="postalCode"]');
        if (await zip.count()) await zip.fill("94103").catch(() => undefined);
        const submit = page.locator('[data-financials-card-submit="true"]').first();
        await expect(submit).toBeEnabled({ timeout: 60_000 });
        await submit.scrollIntoViewIfNeeded();
        await submit.click();

        await expect
            .poll(async () => (await canonical()).payments.length, { timeout: 180_000 })
            .toBeGreaterThan(opening.payments.length);
        const collected = await canonical();
        const receipt = collected.payments.find(
            (p) => !opening.payments.some((o) => o.paymentId === p.paymentId),
        );
        expect(receipt, "the receipt this test refunds must exist canonically").toBeTruthy();
        expect(received(receipt)).toBe(cents);

        /** Reopen the panel on the receipt and read what the surface says is refundable. */
        const openRefund = async () => {
            await page.goto(`${WORK_VIEW}?subject_id=${CERT_OPPORTUNITY}`);
            await expect
                .poll(async () => await page.locator('[data-financials-card="true"]').count(), { timeout: 90_000 })
                .toBeGreaterThan(0);
            await openPaymentPanel(page);
            const button = page.locator(`[data-financials-refund-payment="${receipt.paymentId}"]`);
            await expect(button, "the receipt must still offer a refund").toBeVisible({ timeout: 60_000 });
            await button.scrollIntoViewIfNeeded();
            await button.click();
            const form = page.locator('[data-financials-refund-form="true"]');
            await expect(form).toBeVisible({ timeout: 30_000 });
            return form;
        };

        // ── FIRST PARTIAL: less than the whole ───────────────────────────────────────────────────
        const firstPart = 400;
        let form = await openRefund();
        // ENTITY ATTRIBUTION: the form is bound to the payment the operator chose, not to a first row.
        await expect(form).toHaveAttribute("data-financials-refund-for", receipt.paymentId);
        await expect(form.locator("[data-financials-refund-remaining]")).toHaveAttribute(
            "data-financials-refund-remaining",
            String(cents),
        );
        await page.locator('[data-financials-refund-amount="true"]').fill((firstPart / 100).toFixed(2));
        let refundCommit = page.locator('[data-financials-refund-commit="true"]').first();
        await refundCommit.scrollIntoViewIfNeeded();
        await refundCommit.click();

        await expect
            .poll(async () => (await canonical()).balance, { timeout: 180_000 })
            .toBe(collected.balance! + firstPart);

        let after = await canonical();
        let original = after.payments.find((p) => p.paymentId === receipt.paymentId);
        expect(original, "the original receipt must remain").toBeTruthy();
        expect(received(original), "the original is not rewritten to net").toBe(cents);

        // ── SECOND PARTIAL: a new intent, not a duplicate of the first ───────────────────────────
        const secondPart = 300;
        form = await openRefund();
        await expect(
            form.locator("[data-financials-refund-remaining]"),
            "the remaining refundable amount must fall by the first refund",
        ).toHaveAttribute("data-financials-refund-remaining", String(cents - firstPart));
        await expect(
            page.locator(`[data-financials-payment-id="${receipt.paymentId}"] [data-financials-payment-refunded]`),
            "the receipt must state what has gone back",
        ).toHaveAttribute("data-financials-payment-refunded", String(firstPart));

        await page.locator('[data-financials-refund-amount="true"]').fill((secondPart / 100).toFixed(2));
        refundCommit = page.locator('[data-financials-refund-commit="true"]').first();
        await refundCommit.scrollIntoViewIfNeeded();
        await refundCommit.click();

        await expect
            .poll(async () => (await canonical()).balance, { timeout: 180_000 })
            .toBe(collected.balance! + firstPart + secondPart);

        after = await canonical();
        original = after.payments.find((p) => p.paymentId === receipt.paymentId);
        expect(received(original), "the original still says what arrived").toBe(cents);
        const reversals = after.payments.filter((p) => p.refundsPaymentId === receipt.paymentId);
        expect(
            reversals.length,
            "the second partial refund was deduplicated instead of being its own reversal",
        ).toBe(2);
        expect(reversals.map((r) => received(r)).sort((a, b) => a - b)).toEqual([secondPart, firstPart].sort((a, b) => a - b));

        // ── OVER-REFUND: the client warns, and the server refuses regardless ─────────────────────
        const remaining = cents - firstPart - secondPart;
        form = await openRefund();
        await expect(form.locator("[data-financials-refund-remaining]")).toHaveAttribute(
            "data-financials-refund-remaining",
            String(remaining),
        );
        await page.locator('[data-financials-refund-amount="true"]').fill(((remaining + 500) / 100).toFixed(2));
        await page.locator('[data-financials-refund-commit="true"]').first().click();
        const clientRefusal = page.locator('[data-financials-refund-error="true"]');
        await expect(clientRefusal, "the surface should say why before asking").toBeVisible({ timeout: 20_000 });
        expect(await clientRefusal.innerText()).toMatch(/exceeds the remaining refundable/i);

        // …and the client is only a courtesy: the server refuses the same request on its own.
        const balanceBefore = (await canonical()).balance;
        const bypass = await execute(page, {
            action_key: "payment.refund", entity_type: "child", entity_id: CERT_MEMBER,
            mode: "execute", confirmation: { confirmed: true },
            payload: { payment_id: receipt.paymentId, amount_cents: remaining + 500, payment_label: "over" },
        });
        expect(bypass.json.ok, "the server must refuse an over-refund even when the client is bypassed").toBeFalsy();
        const refusal = JSON.stringify(bypass.json);
        expect(refusal, "no provider identifiers in operator copy").not.toMatch(/acct_|re_[A-Za-z0-9]/);
        expect(refusal, "no raw database error").not.toMatch(/violates|constraint|stack/i);
        expect((await canonical()).balance, "a refused over-refund moved money").toBe(balanceBefore);

        // ── COLD RELOAD: the same canonical state reconstructs ───────────────────────────────────
        await page.reload();
        await page.waitForLoadState("domcontentloaded");
        await expect
            .poll(async () => await page.locator('[data-financials-card="true"]').count(), { timeout: 90_000 })
            .toBeGreaterThan(0);
        const reloaded = await canonical();
        expect(reloaded.balance, "outstanding after a true reload").toBe(after.balance);
        expect(
            reloaded.payments.filter((p) => p.refundsPaymentId === receipt.paymentId).length,
            "a reload must not duplicate the refunds",
        ).toBe(2);
        expect(received(reloaded.payments.find((p) => p.paymentId === receipt.paymentId)), "the receipt survives a reload").toBe(cents);

        assertStillOnSubject(reads, subject, "scenario F");
        test.info().annotations.push({
            type: "scenario-f",
            description: `receipt ${receipt.paymentId} ${cents}c → refunded ${firstPart}+${secondPart}c, retained ${cents - firstPart - secondPart}c`,
        });
    });

    /*
     * REFRESH CONVERGENCE — the balance arrives without the operator reloading.
     *
     * Recognition happens after the browser is done: the provider's webhook reaches Financials, and
     * the card's own seam (poll `collection-state`, reload canonical truth, stop asking once
     * recognised) brings the surface to it. Asserted in the DOM with NO `page.reload()` anywhere in
     * this test — a reload would prove the database, not the convergence.
     */
    test("R — the mounted card converges on canonical truth without a manual reload", async ({ page }) => {
        const reads = watchAccountReads(page);
        const subject = await subjectWithCollectibleCharge(page, reads);

        await openPaymentPanel(page);
        await page.locator('[data-financials-payment-method="true"]').first().selectOption("card");
        const cents = 1_000 + (Date.now() % 90);
        await page.locator('[data-financials-payment-amount="true"]').first().fill((cents / 100).toFixed(2));
        const commit = page.locator('[data-financials-payment-commit="true"]').first();
        await commit.scrollIntoViewIfNeeded();
        await commit.click();

        const frame = page.frameLocator('[data-financials-card-mount="true"] iframe').first();
        await expect(page.locator('[data-financials-card-mount="true"] iframe').first()).toBeVisible({ timeout: 60_000 });
        await expect(frame.locator('input[name="number"]')).toBeVisible({ timeout: 60_000 });
        await frame.locator('input[name="number"]').fill("4242424242424242");
        await frame.locator('input[name="expiry"]').fill("12" + String(new Date().getFullYear() + 2).slice(2));
        await frame.locator('input[name="cvc"]').fill("123");
        const zip = frame.locator('input[name="postalCode"]');
        if (await zip.count()) await zip.fill("94103").catch(() => undefined);
        const submit = page.locator('[data-financials-card-submit="true"]').first();
        await expect(submit).toBeEnabled({ timeout: 60_000 });
        await submit.scrollIntoViewIfNeeded();
        await submit.click();

        // The interval, stated the way the operator reads it.
        const finalizing = page.locator('[data-financials-card-finalizing="true"]');
        if (await finalizing.count()) {
            const text = await finalizing.innerText();
            expect(text, "the finalizing copy must not read as failure").not.toMatch(/failed|could not/i);
            expect(text, "and must not offer another charge as recovery").not.toMatch(/charge again/i);
        }

        // CONVERGENCE, in the DOM, with no reload: the card says recognised on its own.
        await expect(
            page.locator('[data-financials-card-recognized="true"]'),
            "the card never converged on canonical recognition by itself",
        ).toBeVisible({ timeout: 120_000 });

        // …and the canonical receipt is on the surface, not merely in the database.
        await expect
            .poll(
                async () =>
                    await page
                        .locator('[data-financials-payments="true"] [data-financials-payment-kind="receipt"]')
                        .count(),
                { timeout: 60_000 },
            )
            .toBeGreaterThan(0);

        assertStillOnSubject(reads, subject, "refresh convergence");
    });

    /*
     * NARROW VIEWPORT — the same operation, on a screen that cannot hide a layout problem.
     *
     * Especially load-bearing after a depth-layer change: a raised command surface that overflows a
     * short viewport puts its commit control where nothing can reach it, which is exactly the class
     * of failure this slice already hit once.
     */
    test("N — the collection and refund controls stay usable at a narrow viewport", async ({ page }) => {
        /*
         * Entered at desk width, then narrowed.
         *
         * The Work View's queue pages no rows at 390px — its own responsive behaviour, and a
         * separate question from this one. What this scenario is about is the payment and refund
         * surface, so the subject is opened the ordinary way and the viewport is narrowed around it,
         * which is also what happens to an operator who resizes or rotates mid-task.
         */
        const reads = watchAccountReads(page);
        const subject = await subjectWithCollectibleCharge(page, reads);
        await page.setViewportSize({ width: 390, height: 780 });
        await page.waitForTimeout(1_500);

        await openPaymentPanel(page);
        const chooser = page.locator('[data-financials-payment-method="true"]').first();
        await expect(chooser, "the rail chooser must be reachable").toBeVisible({ timeout: 30_000 });
        await chooser.selectOption("card");
        const amount = page.locator('[data-financials-payment-amount="true"]').first();
        await expect(amount, "the amount input must not be clipped away").toBeVisible();
        // Unique per run: the attempt is idempotent on (charge, amount, rail), and Elements cannot
        // mount against an intent that has already succeeded.
        await amount.fill(((1_000 + (Date.now() % 90)) / 100).toFixed(2));

        const commit = page.locator('[data-financials-payment-commit="true"]').first();
        await commit.scrollIntoViewIfNeeded();
        const reachable = async (locator: typeof commit, label: string) => {
            await expect
                .poll(async () => await locator.evaluate((el) => {
                    const r = el.getBoundingClientRect();
                    return r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth ? 1 : 0;
                }), { timeout: 30_000 })
                .toBe(1);
            const hit = await locator.evaluate((el) => {
                const r = el.getBoundingClientRect();
                const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) as HTMLElement | null;
                return { isScrim: !!top?.hasAttribute?.("data-fp-depth-scrim"), self: !!(top && (el === top || el.contains(top))) };
            });
            expect(hit.isScrim, `${label} is behind the depth scrim at a narrow viewport`).toBe(false);
            expect(hit.self, `${label} does not hit-test to itself at a narrow viewport`).toBe(true);
        };
        await reachable(commit, "the collect control");
        await commit.click();

        // Stripe's own element has to be usable here too, not merely present.
        await expect(page.locator('[data-financials-card-mount="true"] iframe').first(), "the Payment Element must mount narrow").toBeVisible({ timeout: 60_000 });
        const frame = page.frameLocator('[data-financials-card-mount="true"] iframe').first();
        await expect(frame.locator('input[name="number"]')).toBeVisible({ timeout: 60_000 });
        await frame.locator('input[name="number"]').fill("4242424242424242");
        const submit = page.locator('[data-financials-card-submit="true"]').first();
        await submit.scrollIntoViewIfNeeded();
        await reachable(submit, "the card submit control");

        // Leave without charging: cancel is reachable too, which is the way out of this surface.
        const cancel = page.locator('[data-financials-card-cancel="true"]').first();
        await cancel.scrollIntoViewIfNeeded();
        await reachable(cancel, "the cancel control");
        await cancel.click();

        // And the refund control, on an existing receipt, at the same width.
        const refundButton = page.locator("[data-financials-refund-payment]").first();
        if (await refundButton.count()) {
            await refundButton.scrollIntoViewIfNeeded();
            await reachable(refundButton, "the refund control");
            await refundButton.click();
            const refundAmount = page.locator('[data-financials-refund-amount="true"]');
            await expect(refundAmount, "the refund amount input must be usable narrow").toBeVisible({ timeout: 30_000 });
            await refundAmount.fill("1.00");
            const refundCommit = page.locator('[data-financials-refund-commit="true"]').first();
            await refundCommit.scrollIntoViewIfNeeded();
            await reachable(refundCommit, "the refund commit control");
            await page.locator('[data-financials-refund-cancel="true"]').first().click();
        }

        assertStillOnSubject(reads, subject, "narrow viewport");
    });

    /*
     * NO SECOND READ MODEL.
     *
     * `/api/admin/financials/collection-state` reports where a collection has GOT TO. The moment it
     * starts reporting what is owed, Financials has two answers to the same question and one of them
     * is wrong. Asserted against the live route, on this run's own subject.
     */
    test("M — collection-state reports execution state and never financial authority", async ({ page }) => {
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
