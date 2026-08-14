import { test, expect, type Page } from "@playwright/test";

/**
 * Work View navigation — the pill contract.
 *
 * A pill click only passes when the clicked view, the committed runtime view, the selected pill and
 * the URL projection all agree. A changed URL alone is not a pass: the defect this certifies against
 * changed the URL on every click and moved nothing — `router.push` to `/workspace/work-unit/:slug`,
 * which is SEED-ONLY, so attention never moved, `aria-selected` stayed on the previous view and the
 * queue never reloaded.
 *
 * The committed view is read from the URL PROJECTION, which the kernel writes from committed focus —
 * a same-host switch projects `?work_view_id=<id>` on the unchanged work-unit slug. That is the
 * observable the runtime itself produces, not a test-only hook.
 */

const OPERATOR = { email: "qa.operator@northwind.invalid", password: "alloy-local-cert" };
const LOGIN_WAIT = Number(process.env.CERT_AUTH_WAIT_MS || 300_000);
const SETTLE = 60_000;
const ENTRY = "/workspace/work-unit/enrollment-pipeline";

test.use({ storageState: undefined });

async function signIn(page: Page) {
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(OPERATOR.email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(OPERATOR.password);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: LOGIN_WAIT });
}

async function enterWorkUnit(page: Page) {
    await page.goto(ENTRY);
    await page.locator("button[data-work-view-id]").first().waitFor({ timeout: 180_000 });
    // The classifier reads COMMITTED focus; clicking before the destination commits measures nothing.
    await page.waitForTimeout(15_000);
}

const pillIds = (page: Page) =>
    page.evaluate(() =>
        Array.from(document.querySelectorAll("button[data-work-view-id]")).map(
            (el) => el.getAttribute("data-work-view-id") ?? "",
        ),
    );

const selectedPill = (page: Page) =>
    page.evaluate(
        () =>
            document
                .querySelector("button[data-work-view-id][aria-selected='true']")
                ?.getAttribute("data-work-view-id") ?? null,
    );

/** The committed view, as the kernel projected it into the address. */
const projectedView = (page: Page) =>
    page.evaluate(() => new URL(location.href).searchParams.get("work_view_id"));

async function clickPill(page: Page, id: string) {
    await page.locator(`button[data-work-view-id="${id}"]`).first().click({ timeout: 20_000 });
}

/** THE CONTRACT: clicked === selected === projected. */
async function assertCommitted(page: Page, id: string, label: string) {
    await expect
        .poll(async () => await selectedPill(page), {
            timeout: SETTLE,
            message: `${label}: pill "${id}" never became selected`,
        })
        .toBe(id);

    // A cross-host commit carries the view in the SLUG rather than the query, so accept either —
    // the claim is that the committed view is this one, not how the address spells it.
    await expect
        .poll(
            async () => {
                const projected = await projectedView(page);
                if (projected) return projected;
                const path = new URL(page.url()).pathname;
                return path.endsWith(`/${id.replace(/_/g, "-")}`) ? id : projected;
            },
            {
                timeout: SETTLE,
                message: `${label}: committed attention never projected view ${id}`,
            },
        )
        .toBe(id);

    // Projection shape depends on hosting, and BOTH are legitimate commits:
    //   same-host  → `?work_view_id=<id>` on the unchanged work-unit slug (a lens swap)
    //   cross-host → the view's own slug (a surface exchange to its canonical host)
    // What is never legitimate is a changed address with no committed view, which is what the
    // `router.push` defect produced.
    const url = new URL(page.url());
    const sameHost = url.pathname === ENTRY;
    expect(
        sameHost || url.pathname.endsWith(`/${id.replace(/_/g, "-")}`),
        `${label}: address ${url.pathname} matches neither a lens swap nor this view's own host`,
    ).toBe(true);

    console.log(`[WV ${label}] clicked=${id} selected=${id} projected=${id} url=${page.url().split("?")[1] ?? ""}`);
}

test("E — every configured Work View pill commits its own view", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 900_000);
    await signIn(page);
    await enterWorkUnit(page);

    const ids = (await pillIds(page)).filter(Boolean);
    expect(ids.length, "no configured Work View pills rendered").toBeGreaterThan(1);
    console.log(`[WV configured] ${JSON.stringify(ids)}`);

    for (const id of ids) {
        if ((await selectedPill(page)) === id) continue; // already committed — nothing to prove
        const t0 = Date.now();
        await clickPill(page, id);
        await assertCommitted(page, id, id);
        console.log(`[WV ${id} TIMING] click→committed=${Date.now() - t0}ms`);
    }
});

test("F — rapid switching: the newest view wins everywhere", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 900_000);
    await signIn(page);
    await enterWorkUnit(page);

    const ids = (await pillIds(page)).filter(Boolean);
    const [a, b] = [ids.find((i) => i !== ids[0]) ?? ids[1]!, ids[0]!];
    expect(a).not.toBe(b);

    // a → b → a with no settle between: a stale answer for b must not overwrite a.
    await clickPill(page, a);
    await clickPill(page, b);
    await clickPill(page, a);

    await assertCommitted(page, a, `rapid ${a}→${b}→${a}`);
});
