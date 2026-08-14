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
 * ── WHY SELECTION AND URL ARE NOT ENOUGH ──
 *
 * `aria-selected` and the projected `?work_view_id=` both move for a view whose answer is an ERROR
 * terminal — the pill lights up and the address updates while nothing composes. An earlier revision
 * of this file asserted only those two and reported `tours` as passing, when `tours` in fact answers
 * `no_truthful_primary_action` and the Focus Panel collapses to zero cells behind it.
 *
 * So an OPERATIONAL view must also compose: cells > 0. A view the tenant's configuration cannot make
 * operational is asserted EXPLICITLY as such, from its own provisioning terminal, rather than being
 * quietly counted as a pass or as a dead click.
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

/** Composed Focus Panel cells — the observable only a real COMMIT produces. */
const composedCells = (page: Page) =>
    page.evaluate(() => document.querySelectorAll("[data-focus-panel-grid-cell]").length);

/**
 * The runtime's OWN verdict for a view, asked directly. Views are classified from this rather than a
 * hardcoded list, so repairing the tenant's configuration flips a view into the operational set with
 * no edit here.
 */
async function provisioningTerminals(page: Page, viewIds: string[]) {
    return page.evaluate(async (ids: string[]) => {
        const out: Record<string, { terminal: string | null; code: string | null }> = {};
        for (const id of ids) {
            const res = await fetch(
                `/api/admin/work-units/enrollment-pipeline/provisioning-answer?work_view_id=${encodeURIComponent(id)}`,
                { credentials: "include" },
            );
            const body = (await res.json()) as Record<string, unknown>;
            const answer = (body.answer ?? body) as Record<string, unknown>;
            out[id] = {
                terminal: (answer.terminal as string) ?? null,
                code: (answer.code as string) ?? null,
            };
        }
        return out;
    }, viewIds);
}

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

/** An operational view must COMPOSE, not merely light up its pill. */
async function assertComposed(page: Page, id: string) {
    await expect
        .poll(async () => await composedCells(page), {
            timeout: SETTLE,
            message: `${id}: committed but composed no Focus Panel cells`,
        })
        .toBeGreaterThan(0);
}

test("E — every configured Work View pill commits its own view", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 900_000);
    await signIn(page);
    await enterWorkUnit(page);

    const ids = (await pillIds(page)).filter(Boolean);
    expect(ids.length, "no configured Work View pills rendered").toBeGreaterThan(1);
    console.log(`[WV configured] ${JSON.stringify(ids)}`);

    const terminals = await provisioningTerminals(page, ids);
    console.log(`[WV terminals] ${JSON.stringify(terminals)}`);

    for (const id of ids) {
        const operational = terminals[id]?.terminal === "operational";

        // A view whose answer errors cannot compose, and the runtime is right to refuse it. Assert
        // that explicitly — it is a configuration fact about this tenant, not a dead click.
        if (!operational) {
            console.log(
                `[WV ${id}] NON-OPERATIONAL by configuration: terminal=${terminals[id]?.terminal} code=${terminals[id]?.code}`,
            );
            expect(terminals[id]?.terminal, `${id}: expected a typed terminal`).toBeTruthy();
            continue;
        }

        // Each view is proven from a CLEAN entry. Clicking through a non-operational view first
        // leaves attention on a surface that cannot compose, and the next click then fails for a
        // reason that has nothing to do with it — which is how `follow_up` was mis-blamed.
        await enterWorkUnit(page);
        if ((await selectedPill(page)) === id) continue;

        const t0 = Date.now();
        await clickPill(page, id);
        await assertCommitted(page, id, id);
        await assertComposed(page, id);
        console.log(`[WV ${id} TIMING] click→committed+composed=${Date.now() - t0}ms`);
    }
});

test("F — rapid switching: the newest view wins everywhere", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 900_000);
    await signIn(page);
    await enterWorkUnit(page);

    const ids = (await pillIds(page)).filter(Boolean);
    const terminals = await provisioningTerminals(page, ids);
    // Both ends must be OPERATIONAL. Racing toward a view that cannot compose proves only that a pill
    // lit up — the weak assertion this suite exists to avoid.
    const operational = ids.filter((id) => terminals[id]?.terminal === "operational");
    expect(operational.length, "need two operational views to race").toBeGreaterThan(1);
    const [b, a] = [operational[0]!, operational[1]!];

    // a → b → a with no settle between: a stale answer for b must not overwrite a.
    await clickPill(page, a);
    await clickPill(page, b);
    await clickPill(page, a);

    await assertCommitted(page, a, `rapid ${a}→${b}→${a}`);
    await assertComposed(page, a);
});
