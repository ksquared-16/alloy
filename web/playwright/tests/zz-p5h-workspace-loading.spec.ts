/**
 * §1 — THE WORKSPACE ACCOUNT PANE, FRAME BY FRAME.
 *
 * Financials → Accounts → selected account is the surface that supplies NO operational projection,
 * so the card bootstraps itself and the data-guarded fall-through is live here. The question is not
 * whether the source permits a second representation; it is whether the operator is SHOWN one.
 *
 * The recorder starts BEFORE the account is selected, so the first frame is the empty pane and
 * every representation that follows is recorded in order, with the identity of the tree that owns
 * it — not just its geometry, because "a card changed size" and "a different component rendered"
 * are the two answers this has to tell apart.
 */
import { expect, test, type Page } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = "http://127.0.0.1:3012";
const HOUSEHOLD = "29944d3e-8267-45b7-8dcb-7405060e2573";
const MOUNTED = 180_000;

test.use({ storageState: STORAGE, baseURL: BASE });

async function startRecorder(page: Page) {
    await page.evaluate(() => {
        const w = window as unknown as { __frames?: string[]; __stop?: () => void };
        w.__frames = [];
        let last = "";
        let live = true;

        /** The owning tree, named by the section markers the shell already stamps. */
        const owner = (el: Element) => {
            let n: Element | null = el;
            const marks: string[] = [];
            for (let i = 0; n && i < 12; i += 1) {
                const e = n as HTMLElement;
                const id = e.getAttribute("data-alloy-section-id");
                const detail = e.getAttribute("data-financials-account-detail");
                const ws = e.hasAttribute("data-adminv2-financials-workspace") ? "workspace" : null;
                const fp = e.getAttribute("data-focus-panel-grid-cell");
                if (id) marks.push(`sec:${id}`);
                if (detail) marks.push(`detail:${detail.slice(0, 8)}`);
                if (ws) marks.push("ws");
                if (fp) marks.push(`fp:${fp}`);
                n = e.parentElement;
            }
            return marks.join(">") || "?";
        };

        const one = (card: Element) => {
            const e = card as HTMLElement;
            const r = e.getBoundingClientRect();
            return [
                `cls=${String(e.className).split(" ")[0]}`,
                `owner=${owner(e)}`,
                `account=${e.getAttribute("data-financials-account") ?? "-"}`,
                `subject=${e.getAttribute("data-financials-subject") ?? "-"}`,
                `overlay=${e.getAttribute("data-financials-overlay") ?? "none"}`,
                `hydrating=${e.getAttribute("data-financials-hydrating") ?? "-"}`,
                `reserved=${e.getAttribute("data-financials-reserved") ?? "-"}`,
                `empty=${e.querySelector("[data-financials-empty]")?.getAttribute("data-financials-empty") ?? "-"}`,
                `rows=${e.querySelectorAll("[data-financials-ledger-row]").length}`,
                `heads=${e.querySelectorAll(".alloy-os-billingdetail__row--head").length}`,
                `lenses=${e.querySelectorAll("[data-financials-lens]").length}`,
                `filters=${e.querySelectorAll('[data-testid^="financials-filter-"]').length}`,
                `stats=${e.querySelectorAll(".alloy-os-fdetail__stat").length}`,
                `box=${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.x)},${Math.round(r.y)}`,
            ].join(" ");
        };

        const sig = () => {
            const cards = [...document.querySelectorAll('[data-financials-card="true"]')];
            const pane = document.querySelector("[data-financials-account-detail]");
            const paneBox = pane ? (pane as HTMLElement).getBoundingClientRect() : null;
            const head = `cards=${cards.length} pane=${paneBox ? `${Math.round(paneBox.width)}x${Math.round(paneBox.height)}` : "none"}`;
            if (cards.length === 0) return head + " (no card)";
            return head + "\n    " + cards.map((c, i) => `#${i} ${one(c)}`).join("\n    ");
        };

        const tick = () => {
            if (!live) return;
            let s: string;
            try {
                s = sig();
            } catch (err) {
                s = "SIGNATURE_THREW " + String(err);
                live = false;
            }
            if (s !== last) {
                last = s;
                w.__frames!.push(`+${Math.round(performance.now())}ms ${s}`);
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        w.__stop = () => {
            live = false;
        };
    });
}

const frames = (page: Page) => page.evaluate(() => (window as unknown as { __frames: string[] }).__frames ?? []);

test("the workspace account pane commits one Financials representation", async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize({ width: 1680, height: 1050 });

    const reads: string[] = [];
    page.on("response", (res) => {
        const u = res.url();
        if (u.includes("/api/admin/financials/")) {
            reads.push(`${Math.round(performance.now())} ${res.status()} ${u.replace(BASE, "")}`);
        }
    });

    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-adminv2-sidebar-modal-nav="financials"]').first().click({ force: true });
    const shell = page.locator("[data-adminv2-financials-workspace]");
    await expect(shell).toBeVisible({ timeout: MOUNTED });
    await shell.locator("[data-workspace-section-tab]").filter({ hasText: "Accounts" }).first().click();
    const row = shell.locator(`[data-financials-account-row="${HOUSEHOLD}"]`);
    await expect(row).toBeVisible({ timeout: MOUNTED });
    await page.waitForTimeout(3_000);

    // RECORD FROM BEFORE THE SELECTION. The first representation is part of the answer.
    await startRecorder(page);
    await row.click();
    // eslint-disable-next-line no-console
    console.log("ACCOUNT_SELECTED " + HOUSEHOLD);

    await page.waitForTimeout(30_000);
    await page.evaluate(() => (window as unknown as { __stop?: () => void }).__stop?.());

    const seq = await frames(page);
    // eslint-disable-next-line no-console
    console.log("WORKSPACE_SEQUENCE (" + seq.length + " frames)\n" + seq.join("\n"));
    // eslint-disable-next-line no-console
    console.log("FINANCIAL_READS\n" + reads.join("\n"));
    await page.screenshot({ path: "/tmp/p5h-workspace-account.png", fullPage: false });
});
