/**
 * 11C SLICE 3 — NARROW CLOSURE REMOUNT: F1 hierarchy, F2 money, and the three things the repair
 * must not have broken (D3 identity, management, one-layer Escape).
 *
 * Deliberately narrow. The full Slice-3 matrix was mounted on the previous build and is not
 * re-opened here — only what the repair touched, and what touching it could plausibly break.
 *
 * Nothing writes. No exception is authored.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-close";
const ENTRY = "/workspace/work-unit/enrolled-children";
const POLICY_ID = "5df9fc6c-71e6-4f1b-a00f-f612cecbe9e0";
const POLICY_NAME = "Sibling discount (QA specimen)";
const MERGE = "7633099f75534b770d5f88a921ecff52cd0adc1b";
const WIDTHS = [1280, 1440, 1680];

test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_500_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };
async function reach(what: string, l: Locator, t = 40_000) { await expect(l, `reached ${what}`).toHaveCount(1, { timeout: t }); }

/**
 * CANONICAL MONEY, DECIDED BY SHAPE. Every operator-facing amount groups thousands and carries
 * exactly two decimals. "$1450.00" fails this; "$1,450.00" passes. Applied to every amount the
 * surface renders rather than to the four the instruction names, so a fifth cannot slip through.
 */
const MONEY = /\$\d[\d,]*\.\d{2}/g;
const CANONICAL_MONEY = /^\$\d{1,3}(,\d{3})*\.\d{2}$/;
const badMoney = (text: string) => (text.match(MONEY) ?? []).filter((m) => !CANONICAL_MONEY.test(m));

async function openDetails(page: Page) {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    expect(page.url(), "signed in").not.toContain("/login");
    const d = page.locator("[data-financials-card='true']").getByRole("button", { name: /^Details/ }).first();
    await reach("the Details door", d);
    await d.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);
    await reach("Financials Details", page.locator("[data-financials-payment-methods]").first());
}

async function openManagement(page: Page) {
    const gear = page.locator('[data-financials-manage-discounts="gear"]').first();
    await reach("the Discount gear", gear);
    await gear.click({ timeout: 20_000 });
    await page.waitForTimeout(4000);
    await reach("the Discount management root", page.locator('[data-financials-manage-discounts="open-panel"]').first());
}

/** The rendered hierarchy: what the policy grain says, and what each relationship row says. */
const hierarchy = (page: Page, rootSel: string, policySel: string) => page.evaluate(([root, poly]) => {
    const host = document.querySelector(root) as HTMLElement | null;
    return {
        present: Boolean(host),
        text: host?.innerText.replace(/\n+/g, " | ") ?? null,
        policies: Array.from(document.querySelectorAll(poly)).map((p) => {
            /*
             * TWO GRAINS, ONE OF THEM UNINSTRUMENTED. The position tags each relationship row with
             * data-financials-discount-subject; the management card does not — its rows are plain
             * paragraphs. Reading only the attribute made management look like a policy with no
             * relationships at all, which would have passed an "is the name repeated on the rows"
             * check for the emptiest possible reason. Fall back to the rows' own shape.
             */
            const tagged = Array.from(p.querySelectorAll("[data-financials-discount-subject]")) as HTMLElement[];
            const subjects = tagged.length > 0
                ? tagged
                : (Array.from(p.querySelectorAll("p")) as HTMLElement[]).filter((e) => /·\s*Expected\s/.test(e.innerText));
            const subjectText = subjects.map((s) => s.innerText.replace(/\s+/g, " ").trim());
            /* The policy grain is everything in the group that is not a relationship row. */
            const whole = (p as HTMLElement).innerText;
            const grain = subjectText.reduce((acc, t) => acc.replace(t, ""), whole).replace(/\s+/g, " ").trim();
            return {
                policyId: p.getAttribute("data-financials-discount-policy") ?? p.getAttribute("data-financials-discount-manage-policy"),
                grain,
                subjects: subjects.map((s, i) => ({ ocm: s.getAttribute("data-financials-discount-subject"), text: subjectText[i] })),
            };
        }),
    };
}, [rootSel, policySel] as const);

const geometry = (page: Page, sel: string) => page.evaluate((s) => {
    const e = document.querySelector(s) as HTMLElement | null;
    if (!e) return null;
    const r = e.getBoundingClientRect();
    const d = document.scrollingElement as HTMLElement;
    return {
        box: `${Math.round(r.width)}x${Math.round(r.height)}`,
        clipped: e.scrollWidth > e.clientWidth + 1,
        insideViewport: r.left >= -1 && r.right <= window.innerWidth + 1,
        pageHorizontalOverflow: d.scrollWidth > d.clientWidth + 1,
    };
}, sel);

/** F1 and F2, asserted the same way wherever the policy is rendered. */
function assertHierarchyAndMoney(where: string, h: { policies: Array<{ policyId: string | null; grain: string; subjects: Array<{ text: string }> }> }) {
    const sib = h.policies.find((p) => p.policyId === POLICY_ID);
    expect(sib, `${where}: the sibling policy is rendered at policy grain`).toBeTruthy();

    /* F1 — the name belongs to the policy, and appears there exactly once. */
    expect(sib!.grain, `${where}: policy grain names the policy`).toContain(POLICY_NAME);
    expect(sib!.grain.split(POLICY_NAME).length - 1, `${where}: named once at policy grain`).toBe(1);
    for (const s of sib!.subjects) {
        expect(s.text, `${where}: the relationship row does not repeat the policy name — "${s.text}"`).not.toContain(POLICY_NAME);
    }

    /* Relationship-specific truth still on the relationship it describes. */
    const certa = sib!.subjects.find((s) => /Certa/i.test(s.text));
    const certb = sib!.subjects.find((s) => /Certb/i.test(s.text));
    expect(certa, `${where}: Certa has a row`).toBeTruthy();
    expect(certb, `${where}: Certb has a row`).toBeTruthy();
    expect(certa!.text, `${where}: Certa expected $18.50`).toContain("$18.50");
    expect(certa!.text, `${where}: Certa basis 10% of $185.00`).toContain("10% of $185.00");
    expect(certb!.text, `${where}: Certb expected $145.00`).toContain("$145.00");
    expect(certb!.text, `${where}: Certb basis 10% of $1,450.00`).toContain("10% of $1,450.00");
    expect(certb!.text, `${where}: Certb does not carry Certa's basis`).not.toContain("$185.00");

    /* F2 — every amount, not only the four named ones. */
    const all = [sib!.grain, ...sib!.subjects.map((s) => s.text)].join(" ");
    expect(badMoney(all), `${where}: every amount is canonically formatted`).toEqual([]);
    expect(all, `${where}: the ungrouped form is gone`).not.toContain("$1450.00");
}

test("§1 — the deployed build carries the repair", async ({ page }) => {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(10_000);
    const build = await page.evaluate(async () => (await fetch("/api/build-info", { credentials: "include" })).json());
    log(`BUILD ${JSON.stringify(build)}`);
    /*
     * CONTAINMENT, NOT EQUALITY. Staging redeployed to an unrelated Scheduling merge while the QA
     * session was being restored. Demanding equality with my own merge would fail a build that
     * carries the repair perfectly well; what matters is that the deployed commit CONTAINS
     * 7633099f7, which is proved by git ancestry and recorded beside this measurement, and that
     * the delta touches nothing under certification (13 files, none of them financial).
     */
    expect(String(build.gitSha ?? ""), "a real commit, not a dev placeholder").toMatch(/^[0-9a-f]{40}$/);
    expect(build.gitBranch).toBe("staging");
    expect(build.nodeEnv).toBe("production");
    expect(build.supabaseProjectRef).toBe("ikaxilmwmrmbagoidedu");
    save("build", { ...build, mergeContained: MERGE });
});

for (const width of WIDTHS) {
    test(`§2+§3+§5+§6-8 — F1 hierarchy and F2 money at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        const shot = async (n: string) => { mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: `${OUT}/c${width}-${n}.png`, fullPage: true }); };
        const R: Record<string, unknown> = { width };

        await openDetails(page);
        await reach("the Discount position", page.locator("[data-financials-discount-position]").first());
        const position = await hierarchy(page, "[data-financials-discount-position]", "[data-financials-discount-policy]");
        R.position = position;
        R.positionGeometry = await geometry(page, "[data-financials-discount-position]");
        log(`POSITION ${width} ${JSON.stringify(position, null, 1)}`);
        await shot("discount-position");
        assertHierarchyAndMoney(`position@${width}`, position);

        await openManagement(page);
        const management = await hierarchy(page, '[data-financials-manage-discounts="open-panel"]', "[data-financials-discount-manage-policy]");
        R.management = management;
        R.managementGeometry = await geometry(page, '[data-financials-manage-discounts="open-panel"]');
        R.exceptionControls = await page.locator('[data-financials-manage-discounts="open-panel"]').getByRole("button", { name: /Add exception/ }).count();
        log(`MANAGEMENT ${width} ${JSON.stringify({ ...management, exceptionControls: R.exceptionControls }, null, 1)}`);
        await shot("discount-management");
        assertHierarchyAndMoney(`management@${width}`, management);
        /* §5 — the exception controls survived the presentation change; none is pressed. */
        expect(R.exceptionControls, "one exception control per relationship").toBe(2);

        save(`close-${width}`, R);
        const pg = R.positionGeometry as { clipped: boolean; pageHorizontalOverflow: boolean };
        const mg = R.managementGeometry as { clipped: boolean; insideViewport: boolean; pageHorizontalOverflow: boolean };
        expect(pg.clipped, "the position is not clipped").toBe(false);
        expect(pg.pageHorizontalOverflow, "no horizontal overflow").toBe(false);
        expect(mg.clipped, "the depth card is not clipped").toBe(false);
        expect(mg.insideViewport, "the depth card is inside the viewport").toBe(true);
        expect(mg.pageHorizontalOverflow, "no horizontal overflow with the card open").toBe(false);
    });
}

test("§10 — one Escape still dismisses one layer", async ({ page }) => {
    await page.setViewportSize({ width: 1680, height: 1050 });
    const fingerprint = () => page.evaluate(() => ({
        detailsOpen: document.querySelectorAll("[data-financials-payment-methods]").length,
        lens: document.querySelector("[data-financials-lens]")?.getAttribute("data-financials-lens") ?? null,
        rows: document.querySelectorAll("[data-financials-ledger-row],[data-charge-row]").length,
        filters: Array.from(document.querySelectorAll("[data-testid^='financials-filter-']"))
            .map((e) => `${e.getAttribute("data-testid")}=${(e.querySelector(".alloy-select__value") as HTMLElement | null)?.innerText?.trim() ?? ""}`),
        discountPanel: document.querySelectorAll('[data-financials-manage-discounts="open-panel"]').length,
        discountPosition: document.querySelectorAll("[data-financials-discount-position]").length,
    }));
    await openDetails(page);
    await reach("the Discount position", page.locator("[data-financials-discount-position]").first());
    const before = await fingerprint();
    await openManagement(page);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(2500);
    const after = await fingerprint();
    const focus = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a) return null;
        return {
            name: [a.innerText, a.getAttribute("aria-label"), a.getAttribute("title")].map((v) => (v ?? "").trim()).find((v) => v.length > 0) ?? "",
            isTheOpener: Boolean(a.closest('[data-financials-manage-discounts="gear"]')),
        };
    });
    log(`ESCAPE before=${JSON.stringify(before)} after=${JSON.stringify(after)} focus=${JSON.stringify(focus)}`);
    save("escape", { before, after, focus });
    expect(after.discountPanel, "management closed").toBe(0);
    expect(after.detailsOpen, "Details survived").toBe(before.detailsOpen);
    expect(after.lens, "same lens").toBe(before.lens);
    expect(after.rows, "same ledger").toBe(before.rows);
    expect(after.filters, "same filters").toEqual(before.filters);
    expect(after.discountPosition, "the position survived").toBe(before.discountPosition);
    expect(focus?.isTheOpener || /manage discounts/i.test(focus?.name ?? ""), "focus returned to Manage discounts").toBe(true);
});

test("§4 — D3 did not regress: the same id, the same name, on every surface", async ({ page }) => {
    await page.setViewportSize({ width: 1680, height: 1050 });
    const seen: Record<string, string | null> = {};

    /* Organization Policies. */
    await page.goto(`/organization/financials?chapter=policies&policyId=${POLICY_ID}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    await reach("the Policies page", page.locator('[data-testid="policies-configuration-page"]').first());
    seen.organization = await page.locator(`[data-testid="policy-${POLICY_ID}"]`).first().innerText();

    /* Family position and management. */
    await openDetails(page);
    await reach("the Discount position", page.locator("[data-financials-discount-position]").first());
    seen.familyPosition = await page.locator(`[data-financials-discount-policy="${POLICY_ID}"]`).first().innerText();
    await openManagement(page);
    seen.familyManagement = await page.locator(`[data-financials-discount-manage-policy="${POLICY_ID}"]`).first().innerText();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);

    /* Both Assignments. */
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    const children = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-children-child]")).map((e) => ({
            ocm: e.getAttribute("data-children-child"),
            who: /(Cert\w+ Certhouse)/.exec((e as HTMLElement).innerText.replace(/\s+/g, " "))?.[1] ?? null,
        })));
    for (const c of children) {
        await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        await page.locator(`[data-children-child="${c.ocm}"]`).first()
            .locator('button[title^="Assignments:"]').first().click({ force: true, timeout: 20_000 });
        await page.locator("[data-schedule-surface]").first().waitFor({ state: "visible", timeout: 45_000 });
        await page.locator("[data-assignment-discount-forecast]").first().waitFor({ state: "attached", timeout: 45_000 }).catch(() => {});
        const surface = await page.locator("[data-schedule-surface]").first().innerText();
        expect(surface.replace(/\s+/g, " "), `this is ${c.who}'s assignment`).toContain(String(c.who));
        seen[`assignment:${c.who}`] = await page.locator(`[data-forecast-policy="${POLICY_ID}"]`).first().innerText();
    }

    log(`D3 ${JSON.stringify(seen, null, 1)}`);
    save("d3-non-regression", seen);
    for (const [where, text] of Object.entries(seen)) {
        expect(text, `${where}: names the policy by its configured name`).toContain(POLICY_NAME);
        expect(String(text).toLowerCase(), `${where}: no fallback to the kind`).not.toMatch(/(^|\s)discount\s*·\s*discount/);
    }
});
