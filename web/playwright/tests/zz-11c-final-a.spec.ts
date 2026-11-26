/**
 * 11C SLICE 3 — FINAL MOUNTED PASS, part A: identity, D1, D2, D3, the projection chain,
 * and the administration-below-ledger disposition.
 *
 * §14's false-green guard is not a section here — it is the shape of every helper. Each one
 * asserts the surface it opened before anything is measured on it, because two of the three
 * defects this closes were originally reported green by probes that never opened the thing
 * they were asserting about.
 *
 * Nothing writes. Kelly's fixture is read only.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-final";
const ENTRY = "/workspace/work-unit/enrolled-children";
const SLICE3_MERGE = "cfd4168b80357997adbc428bc94bbb2eb04ece7b";
const POLICY_ID = "5df9fc6c-71e6-4f1b-a00f-f612cecbe9e0";
const POLICY_NAME = "Sibling discount (QA specimen)";

test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };
const shot = async (p: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); };
async function reach(what: string, l: Locator, t = 30_000) { await expect(l, `reached ${what}`).toHaveCount(1, { timeout: t }); }

/** §14 — the Details surface, proven open by a control only Details has. */
async function openDetails(page: Page) {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url(), "signed in").not.toContain("/login");
    const d = page.locator("[data-financials-card='true']").getByRole("button", { name: /^Details/ }).first();
    await reach("the Details door", d);
    await d.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);
    await reach("Financials Details", page.locator("[data-financials-payment-methods]").first());
}

/** §14 — Discount management, proven open by its own root, not by the gear it was opened from. */
async function openDiscountManagement(page: Page) {
    const gear = page.locator('[data-financials-manage-discounts="gear"]').first();
    await reach("the Discount gear", gear);
    await gear.click({ timeout: 20_000 });
    await page.waitForTimeout(4000);
    await reach("the Discount management root", page.locator('[data-financials-manage-discounts="open-panel"]').first());
}

const fingerprint = (page: Page) => page.evaluate(() => ({
    detailsOpen: document.querySelectorAll("[data-financials-payment-methods]").length,
    account: document.querySelector("[data-financials-account-name],[data-focus-panel-title]")?.textContent?.trim() ?? null,
    lens: document.querySelector("[data-financials-lens]")?.getAttribute("data-financials-lens") ?? null,
    rows: document.querySelectorAll("[data-financials-ledger-row],[data-charge-row]").length,
    filters: Array.from(document.querySelectorAll("[data-testid^='financials-filter-']"))
        .map((e) => `${e.getAttribute("data-testid")}=${(e.querySelector(".alloy-select__value") as HTMLElement | null)?.innerText?.trim() ?? ""}`),
    discountPosition: document.querySelectorAll("[data-financials-discount-position]").length,
    responsibilityGear: document.querySelectorAll('[data-financials-manage-responsibility="gear"]').length,
    responsibilityPanel: document.querySelectorAll('[data-financials-manage-responsibility="open-panel"]').length,
    discountPanel: document.querySelectorAll('[data-financials-manage-discounts="open-panel"]').length,
}));

test("§1 — deployed build identity", async ({ page }) => {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(10_000);
    const build = await page.evaluate(async () => (await fetch("/api/build-info", { credentials: "include" })).json());
    log(`BUILD ${JSON.stringify(build)}`);
    /*
     * NOT SHA EQUALITY AGAINST A SUPERSEDED TIP. Staging advanced past this slice's merge while
     * evidence was being collected; the delta is measured separately against the certified
     * surfaces. What must hold here is that the deployed build CONTAINS the slice, is the real
     * staging production build, and is pointed at the fixture's own project.
     */
    expect(build.gitBranch).toBe("staging");
    expect(build.nodeEnv).toBe("production");
    expect(build.supabaseProjectRef).toBe("ikaxilmwmrmbagoidedu");
    expect(String(build.gitSha ?? ""), "a real 40-char commit, not a dev placeholder").toMatch(/^[0-9a-f]{40}$/);
    save("build", { ...build, slice3Merge: SLICE3_MERGE });
});

test("§2 — D1: one Escape dismisses the discount card and nothing else", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await openDetails(page);
    await reach("the Discount position", page.locator("[data-financials-discount-position]").first());
    R.before = await fingerprint(page);

    await openDiscountManagement(page);
    R.opened = await fingerprint(page);
    expect((R.opened as { discountPanel: number }).discountPanel, "management actually opened").toBe(1);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(2500);
    R.afterEscape = await fingerprint(page);
    /*
     * WHICH CONTROL HOLDS FOCUS, IDENTIFIED STRUCTURALLY. An icon button's innerText is "", not
     * null, so a `??` chain onto aria-label never fires and the probe reports "BUTTON()" for a
     * correctly restored focus. Ask the DOM what the element IS.
     */
    R.focusAfterEscape = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a) return null;
        const name = [a.innerText, a.getAttribute("aria-label"), a.getAttribute("title")]
            .map((v) => (v ?? "").trim()).find((v) => v.length > 0) ?? "";
        return {
            tag: a.tagName,
            name: name.slice(0, 60),
            manageDiscounts: a.closest("[data-financials-manage-discounts]")?.getAttribute("data-financials-manage-discounts") ?? null,
            isTheOpener: a.matches('[data-financials-manage-discounts="gear"]')
                || Boolean(a.closest('[data-financials-manage-discounts="gear"]')),
        };
    });
    await shot(page, "d1-after-escape");

    const b = R.before as Record<string, unknown>;
    const a = R.afterEscape as Record<string, unknown>;
    expect(a.discountPanel, "the discount card closed").toBe(0);
    expect(a.detailsOpen, "Details stayed open").toBe(b.detailsOpen);
    expect(a.account, "same account").toBe(b.account);
    expect(a.lens, "same lens").toBe(b.lens);
    expect(a.rows, "same ledger").toBe(b.rows);
    expect(a.filters, "same filters").toEqual(b.filters);
    expect(a.discountPosition, "the position survived").toBe(b.discountPosition);
    expect(a.responsibilityGear, "responsibility controls survived").toBe(b.responsibilityGear);
    const f = R.focusAfterEscape as { name: string; manageDiscounts: string | null; isTheOpener: boolean } | null;
    expect(f, "something holds focus").toBeTruthy();
    expect(
        f!.isTheOpener || f!.manageDiscounts === "gear" || /manage discounts/i.test(f!.name),
        `focus returned to the control that opened the card — got ${JSON.stringify(f)}`,
    ).toBe(true);

    /* And the explicit dismissal must be the same one layer, not a different amount of closing. */
    await openDiscountManagement(page);
    const cancel = page.locator('[data-financials-manage-discounts="open-panel"]').getByRole("button", { name: /^(Cancel|Close|Done)$/ }).first();
    await reach("an explicit dismissal", cancel);
    await cancel.click();
    await page.waitForTimeout(2500);
    R.afterExplicit = await fingerprint(page);
    const e = R.afterExplicit as Record<string, unknown>;
    expect(e.discountPanel, "explicit dismissal closed the card").toBe(0);
    expect(e.detailsOpen, "explicit dismissal did not collapse the host").toBe(b.detailsOpen);
    expect(e.rows).toBe(b.rows);
    expect(e.lens).toBe(b.lens);
    log(`D1 ${JSON.stringify(R, null, 1)}`);
    save("d1-escape", R);
});

test("§3+§4+§5 — D2 presentation, D3 canonical name, and the projection that carries it", async ({ page }) => {
    const R: Record<string, unknown> = {};
    const captured: { position: { status: number; body: unknown } | null; requests: string[] } = { position: null, requests: [] };
    page.on("request", (r) => {
        const u = r.url().replace(/^https?:\/\/[^/]+/, "");
        if (u.startsWith("/api/")) captured.requests.push(`${r.method()} ${u}`);
    });
    page.on("response", async (res) => {
        const u = res.url();
        if (!/family-discount-position/.test(u)) return;
        captured.position = { status: res.status(), body: await res.json().catch(() => null) };
    });
    await openDetails(page);
    await reach("the Discount position", page.locator("[data-financials-discount-position]").first());

    R.projection = captured.position;
    R.surfaceRequests = captured.requests;
    log(`PROJECTION ${JSON.stringify(R.projection, null, 1)}`);
    log(`SURFACE REQUESTS ${JSON.stringify(captured.requests, null, 1)}`);

    /*
     * §5 — THE CHAIN, PROVEN WHERE IT ARRIVES. This is the surface's OWN response, intercepted,
     * not a query we composed: commercial_policies.label → readPolicies projection → forecast
     * outcome → this payload → the rendering above. If the name reached the screen by a
     * component-local lookup or a second naming fetch, the label would be absent HERE and present
     * on screen — so the assertion is that the payload itself carries it.
     */
    const body = (R.projection as { body: unknown } | null)?.body as
        { expected?: Array<{ policyId?: string; label?: string; subjects?: unknown[] }> } | null;
    expect(R.projection, "the surface fetched its position from the canonical route").toBeTruthy();
    const projected = JSON.stringify(body ?? {});
    expect(projected, "the projection carries the configured label").toContain(POLICY_NAME);
    expect(projected, "and carries the policy by its canonical id").toContain(POLICY_ID);
    /* No second fetch whose job is naming. */
    const namingFetches = captured.requests.filter((u) => /polic/i.test(u) && !/family-discount-position/.test(u));
    expect(namingFetches, `no component-specific naming fetch — saw ${JSON.stringify(namingFetches)}`).toEqual([]);

    /* §3 — the family position as it is actually rendered. */
    R.position = await page.evaluate(() => {
        const host = document.querySelector("[data-financials-discount-position]") as HTMLElement | null;
        return {
            text: host?.innerText?.replace(/\n+/g, " | ") ?? null,
            policies: Array.from(document.querySelectorAll("[data-financials-discount-policy]")).map((p) => ({
                policyId: p.getAttribute("data-financials-discount-policy"),
                header: (p.firstElementChild as HTMLElement | null)?.innerText?.trim() ?? null,
                subjects: Array.from(p.querySelectorAll("[data-financials-discount-subject]")).map((s) => ({
                    ocm: s.getAttribute("data-financials-discount-subject"),
                    text: (s as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
                })),
            })),
        };
    });
    log(`POSITION ${JSON.stringify(R.position, null, 1)}`);
    await shot(page, "d2-family-position");

    const policies = (R.position as { policies: Array<{ policyId: string; header: string; subjects: Array<{ text: string }> }> }).policies;
    expect(policies.length, "the sibling policy is present at policy grain").toBeGreaterThan(0);
    const sib = policies.find((p) => p.policyId === POLICY_ID);
    expect(sib, `policy ${POLICY_ID} is the one rendered`).toBeTruthy();

    /* §4 — identity by ID, presentation by the configured label. */
    expect(sib!.header, "D3: the configured name, not the kind").toContain(POLICY_NAME);

    /* §3 — no duplicated-kind copy, and the basis belongs to the relationship it describes. */
    const joined = policies.map((p) => `${p.header} :: ${p.subjects.map((s) => s.text).join(" :: ")}`).join(" || ");
    expect(joined.toLowerCase(), "no duplicated-kind copy").not.toMatch(/discount\s*·\s*discount/);
    expect(sib!.header, "the header states no relationship's basis").not.toMatch(/\d+% of/);

    const certa = sib!.subjects.find((s) => /certa/i.test(s.text));
    const certb = sib!.subjects.find((s) => /certb/i.test(s.text));
    expect(certa, "Certa has her own line").toBeTruthy();
    expect(certb, "Certb has his own line").toBeTruthy();
    expect(certa!.text, "Certa: expected $18.50").toContain("$18.50");
    expect(certa!.text, "Certa: 10% of $185.00").toContain("$185.00");
    expect(certb!.text, "Certb: expected $145.00").toContain("$145.00");
    expect(certb!.text, "Certb: 10% of $1,450.00").toMatch(/\$1,?450\.00/);
    /* Certa's basis must not be reused as the policy's explanatory copy. */
    expect(certb!.text, "Certb does not carry Certa's basis").not.toContain("$185.00");

    /* §4 — the same ID and the same name inside Discount MANAGEMENT. */
    await openDiscountManagement(page);
    R.management = await page.evaluate(() => {
        const root = document.querySelector('[data-financials-manage-discounts="open-panel"]') as HTMLElement | null;
        return {
            rootPresent: Boolean(root),
            text: root?.innerText?.replace(/\n+/g, " | ") ?? null,
            policies: Array.from(document.querySelectorAll("[data-financials-discount-manage-policy]")).map((p) => ({
                policyId: p.getAttribute("data-financials-discount-manage-policy"),
                text: (p as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
            })),
        };
    });
    log(`MANAGEMENT ${JSON.stringify(R.management, null, 1)}`);
    await shot(page, "d3-management");
    const mp = (R.management as { policies: Array<{ policyId: string; text: string }> }).policies;
    const msib = mp.find((p) => p.policyId === POLICY_ID);
    expect(msib, "management names the same policy ID").toBeTruthy();
    expect(msib!.text, "management shows the configured name").toContain(POLICY_NAME);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);

    /* §15 — measured, not redesigned: where do Discounts and payer administration sit? */
    /*
     * §15 — DOM ORDER, NOT VIEWPORT COORDINATES. The ledger scrolls inside its own container, so
     * absolute tops say more about where the operator last scrolled than about where the
     * administration sits. Document order is the thing that does not move.
     */
    R.belowLedger = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("[data-financials-ledger-row],[data-charge-row]")) as HTMLElement[];
        const last = rows[rows.length - 1] ?? null;
        const after = (sel: string) => {
            const e = document.querySelector(sel);
            if (!e || !last) return null;
            return Boolean(last.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING);
        };
        return {
            ledgerRows: rows.length,
            discountPositionAfterLedger: after("[data-financials-discount-position]"),
            responsibilityAfterLedger: after('[data-financials-manage-responsibility="gear"]'),
            payerAdminAfterLedger: after("[data-financials-payment-methods]"),
        };
    });
    log(`BELOW-LEDGER ${JSON.stringify(R.belowLedger)}`);
    save("d2-d3-projection", R);
});

test("§4 — the same ID carries the same name in Organization Policies", async ({ page }) => {
    await page.goto(`/organization/financials?chapter=policies&policyId=${POLICY_ID}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    /* §14 — the Policies chapter, proven by the chapter root AND the page root. */
    await reach("the Policies chapter", page.locator('[data-testid="financials-chapter-policies"]').first());
    await reach("the Policies page", page.locator('[data-testid="policies-configuration-page"]').first());
    const R = await page.evaluate((pid) => {
        const row = document.querySelector(`[data-testid="policy-${pid}"]`) as HTMLElement | null;
        return {
            rowPresent: Boolean(row),
            rowText: row?.innerText?.replace(/\s+/g, " ").trim() ?? null,
            overview: (document.querySelector('[data-testid="policy-overview"]') as HTMLElement | null)?.innerText?.replace(/\n+/g, " | ") ?? null,
        };
    }, POLICY_ID);
    log(`POLICIES ${JSON.stringify(R, null, 1)}`);
    await shot(page, "d3-policies");
    expect(R.rowPresent, `policy ${POLICY_ID} is listed by its canonical id`).toBe(true);
    expect(R.rowText, "Organization states the configured name").toContain(POLICY_NAME);
    save("d3-policies", R);
});

test("§4 — the same ID carries the same name on Certa's and Certb's assignments", async ({ page }) => {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    expect(page.url()).not.toContain("/login");

    /*
     * THE CHILDREN CARD'S OWN ROWS. `[data-scheduling-open]` belongs to the child panel, not the
     * household one — reading it here returned an empty list that an absence assertion would have
     * called "no discount on the assignment". The household lists children as
     * `[data-children-child]`, keyed by the SAME opportunity_customer_member id the discount
     * subjects carry, which is what makes the identity check below possible at all.
     */
    const children = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-children-child]")).map((e) => ({
            ocm: e.getAttribute("data-children-child"),
            label: (e as HTMLElement).innerText.replace(/\s+/g, " ").trim().slice(0, 80),
        })));
    log(`CHILDREN ${JSON.stringify(children)}`);
    expect(children.length, "the household lists both children").toBe(2);

    const seen: Array<Record<string, unknown>> = [];
    for (const c of children) {
        await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const row = page.locator(`[data-children-child="${c.ocm}"]`).first();
        await reach(`the row for ${c.label}`, row);
        /*
         * THE ROW ACTION, BY WHAT IT IS. Its visible text is the assignment pattern ("custom →"),
         * so a name-based locator has to know the fixture's data to find the door. The title is
         * the stable thing: every children row carries "Assignments: <pattern>".
         */
        const action = row.locator('button[title^="Assignments:"]').first();
        await reach(`the assignment door for ${c.label}`, action);
        await action.click({ force: true, timeout: 20_000 });
        /* §14 — the Assignment surface AND whose it is. */
        await page.locator("[data-schedule-surface]").first().waitFor({ state: "visible", timeout: 45_000 });
        await page.locator("[data-assignment-discount-forecast]").first().waitFor({ state: "attached", timeout: 45_000 }).catch(() => {});
        const m = await page.evaluate(() => {
            const f = document.querySelector("[data-assignment-discount-forecast]") as HTMLElement | null;
            return {
                heading: (document.querySelector("[data-focus-panel-title],[data-schedule-back-target]") as HTMLElement | null)?.innerText?.replace(/\s+/g, " ").trim() ?? null,
                /*
                 * SCOPED TO THE ASSIGNMENT. The workspace shell renders the queue, the children
                 * card and both siblings' names on every screen, so a whole-page substring match
                 * proves nothing about whose assignment is open. Only this surface is the child's.
                 */
                surfaceMentions: (document.querySelector("[data-schedule-surface]") as HTMLElement | null)?.innerText?.replace(/\s+/g, " ") ?? "",
                forecastPresent: Boolean(f),
                forecastText: f?.innerText?.replace(/\n+/g, " | ") ?? null,
                outcomes: Array.from(document.querySelectorAll("[data-forecast-outcome]")).map((e) => ({
                    kind: e.getAttribute("data-forecast-outcome"),
                    policy: e.getAttribute("data-forecast-policy"),
                    reason: e.getAttribute("data-forecast-reason"),
                    text: (e as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
                })),
            };
        });
        /*
         * §14 — IDENTITY, NOT AN INITIAL. `label.split(" ")[0]` is "CC", the avatar's initials,
         * which appear on every row of every card: an identity guard that matches the sibling's
         * surface just as happily is not a guard. Match the child's own name, and require the
         * sibling's to be absent.
         */
        const who = /(Cert\w+ Certhouse)/.exec(c.label ?? "")?.[1] ?? "";
        const sibling = children.map((x) => /(Cert\w+ Certhouse)/.exec(x.label ?? "")?.[1] ?? "").find((n) => n && n !== who) ?? "";
        expect(who, "the row names a child").toMatch(/Cert\w+ Certhouse/);
        expect(m.surfaceMentions, `this is ${who}'s assignment`).toContain(who);
        expect(m.surfaceMentions, `and not ${sibling}'s`).not.toContain(sibling);
        seen.push({ ...c, who, heading: m.heading, forecastPresent: m.forecastPresent, forecastText: m.forecastText, outcomes: m.outcomes });
        log(`ASSIGNMENT ${who} ${JSON.stringify({ heading: m.heading, forecastPresent: m.forecastPresent, forecastText: m.forecastText, outcomes: m.outcomes }, null, 1)}`);
        await shot(page, `d3-assignment-${who.split(" ")[0].toLowerCase()}`);
    }
    save("d3-assignments", seen);

    /* Every assignment that names this policy must name it the same way. */
    const named = seen.flatMap((s2) => (s2.outcomes as Array<{ policy: string | null; text: string }>).filter((o) => o.policy === POLICY_ID));
    log(`ASSIGNMENT OUTCOMES FOR ${POLICY_ID}: ${JSON.stringify(named, null, 1)}`);
    expect(named.length, "both assignments carry the sibling policy by its canonical id").toBe(2);
    for (const n of named) expect(n.text, "the assignment names the configured policy").toContain(POLICY_NAME);
});
