import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), "../docs/audits/active/assignment-final-polish-qa");
mkdirSync(OUT, { recursive: true });
const evidence = [];
const log = (l) => {
  evidence.push(l);
  console.log(l);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState:
    process.env.PLAYWRIGHT_STORAGE_STATE ||
    `${process.env.HOME}/.local/state/alloy-dev/auth/slot5/storage-state.json`,
});
const page = await context.newPage();
const shot = async (n) => {
  await page.screenshot({ path: join(OUT, `${n}.png`), fullPage: false });
  log(`SHOT ${n}`);
};

try {
  await page.goto("http://127.0.0.1:3015/workspace", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);
  const tModal = Date.now();
  await page.locator('[data-adminv2-sidebar-modal-nav="scheduling"]').first().click({ force: true });
  await page.locator('[data-adminv2-scheduling-modal="true"]').waitFor({ timeout: 60000 });
  log(`MODAL_MS=${Date.now() - tModal}`);
  await page.waitForTimeout(1000);
  await shot("01-workspace-overview");

  await page.locator('button:has-text("Studio")').first().click();
  await page.waitForTimeout(600);
  await page.locator('button:has-text("Assignment Kinds")').first().click().catch(() => {});
  await page.waitForTimeout(1000);
  log(
    `VOCAB kinds=${await page.locator("text=Assignment Kinds").count()} purpose=${await page.locator("text=Assignment Purpose").count()}`
  );
  await shot("02-studio-kinds");
  await page.locator('button:has-text("Create Kind")').first().click().catch(() => {});
  await page.waitForTimeout(500);
  await shot("03-kind-editor");
  log(
    `STUDIO spaceReq=${await page.locator("text=Space requirement").count()} eligible=${await page.locator("text=Eligible spaces").count()}`
  );

  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);

  await page.goto("http://127.0.0.1:3015/workspace/work-unit/new-leads", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(5000);
  await page.getByRole("button", { name: /^close$/i }).first().click().catch(() => {});
  await page.getByTestId("wu-record-filter-search").fill("Kurzman");
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /Kurzman Family/i }).first().click();
  await page.waitForTimeout(8000);
  let openers = page.locator("[data-scheduling-open]");
  if ((await openers.count()) === 0) {
    await page.locator('[data-universal-card-key="scheduling"]').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(2000);
    openers = page.locator("[data-scheduling-open]");
  }
  await openers.first().click({ force: true });
  await page.locator("[data-assignment-day-filter], [data-assignment-summary]").first().waitFor({
    timeout: 25000,
  });
  const rows = await page.locator("[data-assignment-row]").count();
  log(`LIST_ROWS=${rows}`);
  await shot("04-plural-all");

  await page.locator('[data-day-filter="2"]').click().catch(() => {});
  await page.waitForTimeout(400);
  await shot("05-plural-tuesday");

  await page.locator('[data-day-filter="all"]').click().catch(() => {});
  await page.waitForTimeout(300);
  if (rows > 0) {
    await page.locator("[data-assignment-row]").first().click();
    await page.locator("[data-assignment-detail]").waitFor({ timeout: 8000 });
    const life = await page.locator("[data-assignment-lifecycle]").first().innerText().catch(() => "");
    log(
      `DETAIL lifecycle=${life} kindTitle=${await page.locator("[data-assignment-kind-title]").count()} summary=${await page.locator("[data-assignment-detail-summary]").count()}`
    );
    await shot("06-singular-detail");
    await page.locator('[data-schedule-back="true"]').click().catch(() => {});
    await page.waitForTimeout(400);
  }

  await page.locator("[data-schedule-create-new]").first().click({ force: true });
  await page.waitForTimeout(800);
  if (await page.locator("[data-assignment-type-picker]").count()) {
    await page.locator("[data-assignment-type-option]").first().click();
    await page.waitForTimeout(600);
  }
  const tRoom = Date.now();
  await page.locator("[data-room-change]").click().catch(() => {});
  await page.waitForSelector("[data-room-option]", { timeout: 8000 }).catch(() => {});
  log(`ROOM_MS=${Date.now() - tRoom} options=${await page.locator("[data-room-option]").count()}`);
  await shot("07-room-picker");

  writeFileSync(join(OUT, "evidence.txt"), evidence.join("\n") + "\n");
  log("DONE");
} catch (e) {
  log(`FAIL ${e?.stack || e}`);
  await shot("99-fail");
  writeFileSync(join(OUT, "evidence.txt"), evidence.join("\n") + "\n");
  process.exitCode = 1;
} finally {
  await browser.close();
}
