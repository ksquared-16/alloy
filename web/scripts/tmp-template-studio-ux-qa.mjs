/**
 * Template Studio UX polish browser acceptance.
 * Opens Communications → Studio → Templates via inbox modal event.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.ALLOY_BASE_URL || "http://127.0.0.1:3015";
const outDir =
  "/Users/Kelly/Code/alloy-worktrees/wt5-epp-runtime-convergence/docs/audits/active/enrollment-e2e-template-studio-ux";
const storage = path.join(process.env.HOME, ".local/state/alloy-dev/auth/slot5/storage-state.json");

fs.mkdirSync(outDir, { recursive: true });
const log = [];
function push(e) {
  log.push({ t: new Date().toISOString(), ...e });
  fs.writeFileSync(path.join(outDir, "browser-qa-template-studio-ux.json"), JSON.stringify(log, null, 2));
  console.log(JSON.stringify(e));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: storage,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
page.setDefaultTimeout(30000);

try {
  push({ step: "goto" });
  await page.goto(`${BASE}/workspace/work-unit/waitlist`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);

  // Open Communications inbox modal
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("adminv2:open-inbox-modal"));
  });
  await page.waitForSelector('[data-comms-workspace-shell="true"], [data-testid="communications-workspace-shell"]', {
    timeout: 20000,
  });
  push({ step: "inbox-open" });

  // Studio mode → Templates (default for studio)
  const studio = page.getByRole("button", { name: /^Studio$/i }).or(page.getByRole("tab", { name: /^Studio$/i }));
  if (await studio.count()) {
    await studio.first().click();
    await sleep(800);
  }
  const templatesTab = page.getByRole("button", { name: /^Templates$/i }).or(page.getByRole("tab", { name: /^Templates$/i }));
  if (await templatesTab.count()) {
    await templatesTab.first().click();
    await sleep(1000);
  }
  await page.waitForSelector('[data-templates-workspace="true"]', { timeout: 20000 });
  // Wait for library rows (provision/list can lag behind shell mount).
  await page.waitForFunction(
    () => document.querySelectorAll("[data-template-row]").length > 0,
    null,
    { timeout: 25000 }
  );
  await sleep(500);
  await page.screenshot({ path: path.join(outDir, "01-templates-default.png"), fullPage: false });

  const metrics = await page.evaluate(() => {
    const ws = document.querySelector('[data-templates-workspace="true"]');
    const listScroll = document.querySelector('[data-template-list-scroll="true"]');
    const editor = document.querySelector('[data-template-editor="true"]');
    const details = document.querySelector('[data-template-details="true"]');
    const message = document.querySelector('[data-template-message="true"]');
    const subject = document.querySelector('[data-template-subject="true"]');
    const body = document.querySelector('[data-template-body="true"]');
    const advanced = document.querySelector('[data-template-filters-advanced="true"]');
    const filtersBtn = document.querySelector('[data-template-filters-toggle="true"]');
    const rows = [...document.querySelectorAll("[data-template-row]")];
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), width: Math.round(r.width) };
    };
    const cs = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      return { overflowY: s.overflowY, borderColor: s.borderColor, borderLeftWidth: s.borderLeftWidth };
    };
    return {
      rowCount: rows.length,
      advancedVisible: !!advanced,
      filtersExpanded: filtersBtn?.getAttribute("aria-expanded") === "true",
      listScroll: { ...rect(listScroll), ...cs(listScroll) },
      editor: rect(editor),
      details: rect(details),
      message: rect(message),
      subject: rect(subject),
      body: rect(body),
      subjectInViewport: subject ? subject.getBoundingClientRect().top < window.innerHeight * 0.55 : false,
      bodyStartsHigh: body ? body.getBoundingClientRect().top < window.innerHeight * 0.72 : false,
      divideClass: ws?.className || "",
    };
  });
  push({ step: "01-default-metrics", ...metrics });

  // Toggle Filters open
  await page.locator('[data-template-filters-toggle="true"]').click();
  await sleep(400);
  await page.screenshot({ path: path.join(outDir, "02-filters-open.png"), fullPage: false });
  const filtersOpen = await page.evaluate(() => ({
    advanced: !!document.querySelector('[data-template-filters-advanced="true"]'),
    expanded: document.querySelector('[data-template-filters-toggle="true"]')?.getAttribute("aria-expanded"),
  }));
  push({ step: "02-filters-open", ...filtersOpen });

  // Apply a filter (status) then collapse — should persist
  await page.locator('[data-template-filter-status="true"]').selectOption({ label: "active" }).catch(async () => {
    await page.locator('[data-template-filter-status="true"]').selectOption("active");
  });
  await sleep(1200);
  await page.locator('[data-template-filters-toggle="true"]').click();
  await sleep(400);
  const afterCollapse = await page.evaluate(() => ({
    advancedHidden: !document.querySelector('[data-template-filters-advanced="true"]'),
    badge: document.querySelector("[data-template-filters-badge]")?.textContent?.trim() || null,
    rowCount: document.querySelectorAll("[data-template-row]").length,
  }));
  push({ step: "03-filters-collapsed-persist", ...afterCollapse });
  await page.screenshot({ path: path.join(outDir, "03-filters-collapsed.png"), fullPage: false });

  // List scroll independence
  const scrollProbe = await page.evaluate(async () => {
    const list = document.querySelector('[data-template-list-scroll="true"]');
    const editor = document.querySelector('[data-template-editor="true"]');
    if (!list) return { ok: false, reason: "no-list-scroll" };
    const beforeList = list.scrollTop;
    const beforeEditor = editor?.scrollTop ?? 0;
    const canScroll = list.scrollHeight > list.clientHeight + 8;
    list.scrollTop = Math.min(list.scrollHeight, list.scrollTop + 240);
    await new Promise((r) => setTimeout(r, 50));
    return {
      ok: true,
      canScroll,
      listMoved: list.scrollTop > beforeList,
      editorUnmoved: (editor?.scrollTop ?? 0) === beforeEditor,
      scrollHeight: list.scrollHeight,
      clientHeight: list.clientHeight,
    };
  });
  push({ step: "04-list-scroll", ...scrollProbe });

  // Prefer an EMAIL template so Subject is present for density acceptance.
  const emailRow = page.locator('[data-template-row][data-template-row-channel="email"]').first();
  const targetName = (await emailRow.count()) > 0
    ? ((await emailRow.locator("span").first().textContent()) || "").trim()
    : "";
  if ((await emailRow.count()) > 0) {
    await emailRow.scrollIntoViewIfNeeded();
    await emailRow.click();
  } else {
    await page.locator("[data-template-row]").first().click();
  }
  await page.waitForFunction(
    ({ expectedName }) => {
      const nameEl = document.querySelector('[data-template-name="true"]');
      const name = nameEl && "value" in nameEl ? String(nameEl.value || "").trim() : "";
      const channel = document.querySelector('[data-template-channel="true"]');
      const channelVal = channel && "value" in channel ? String(channel.value || "") : "";
      const subject = document.querySelector('[data-template-subject="true"]');
      const body = document.querySelector('[data-template-body="true"]');
      if (!body) return false;
      if (expectedName) {
        return name === expectedName && channelVal === "email" && !!subject;
      }
      return name.length > 0;
    },
    { expectedName: targetName },
    { timeout: 15000 }
  );
  await sleep(400);
  await page.screenshot({ path: path.join(outDir, "04-selected-template.png"), fullPage: false });

  const selected = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-template-row]")];
    const active = rows.find((r) => r.className.includes("juniper")) || null;
    const subject = document.querySelector('[data-template-subject="true"]');
    const body = document.querySelector('[data-template-body="true"]');
    const details = document.querySelector('[data-template-details="true"]');
    const name = document.querySelector('[data-template-name="true"]');
    const status = document.querySelector('[data-template-status="true"]');
    const channel = document.querySelector('[data-template-channel="true"]');
    return {
      selectedFound: !!active,
      name: name && "value" in name ? name.value : null,
      status: status && "value" in status ? status.value : null,
      channel: channel && "value" in channel ? channel.value : null,
      subjectTop: subject?.getBoundingClientRect().top ?? null,
      bodyTop: body?.getBoundingClientRect().top ?? null,
      detailsHeight: details?.getBoundingClientRect().height ?? null,
      subjectVisible: subject
        ? subject.getBoundingClientRect().top > 0 && subject.getBoundingClientRect().top < innerHeight * 0.62
        : false,
      bodyStartsHigh: body ? body.getBoundingClientRect().top < innerHeight * 0.78 : false,
      subjectInUpperHalf: subject ? subject.getBoundingClientRect().top < innerHeight * 0.55 : false,
    };
  });
  push({ step: "05-selection-density", ...selected });

  // Narrower viewport
  await page.setViewportSize({ width: 1180, height: 820 });
  await sleep(600);
  await page.screenshot({ path: path.join(outDir, "05-narrow.png"), fullPage: false });
  const narrow = await page.evaluate(() => {
    const ws = document.querySelector('[data-templates-workspace="true"]');
    const r = ws?.getBoundingClientRect();
    return {
      workspaceWidth: r ? Math.round(r.width) : null,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    };
  });
  push({ step: "06-narrow", ...narrow });

  const pass = {
    workspaceMounted: true,
    filtersToggleWorks: filtersOpen.advanced === true,
    filtersPersistCollapsed: afterCollapse.advancedHidden === true && afterCollapse.badge === "1",
    listCanScrollOrShort: scrollProbe.canScroll === false || scrollProbe.listMoved === true,
    editorNotScrolledByList: scrollProbe.editorUnmoved !== false,
    subjectHigh: selected.subjectVisible === true || selected.subjectInUpperHalf === true,
    bodyHigh: selected.bodyStartsHigh === true,
    editorHydrated: typeof selected.name === "string" && selected.name.length > 0,
    noHorizontalClip: narrow.horizontalOverflow === false,
  };
  push({ step: "RESULT", pass });
  if (!Object.values(pass).every(Boolean)) process.exitCode = 1;
} catch (e) {
  push({ step: "ERROR", message: String(e.message || e) });
  await page.screenshot({ path: path.join(outDir, "error.png"), fullPage: false }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
