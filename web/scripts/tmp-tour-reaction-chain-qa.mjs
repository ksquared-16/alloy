/**
 * Tour reaction-chain certification (activity + Tour menu + reschedule/cancel).
 * Slot 5 · localhost:3015
 * Evidence → docs/audits/active/enrollment-e2e-tour-reaction-chain/
 */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.ALLOY_BASE_URL || "http://127.0.0.1:3015";
const outDir =
  "/Users/Kelly/Code/alloy-worktrees/wt5-epp-runtime-convergence/docs/audits/active/enrollment-e2e-tour-reaction-chain";
const storage = path.join(process.env.HOME, ".local/state/alloy-dev/auth/slot5/storage-state.json");
const logPath = path.join(outDir, "browser-qa-reaction-chain.json");

fs.mkdirSync(outDir, { recursive: true });
const log = [];
function push(entry) {
  log.push({ t: new Date().toISOString(), ...entry });
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  console.log(JSON.stringify(entry));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadEnv() {
  const env = fs.readFileSync("/Users/Kelly/Alloy/web/.env.local", "utf8");
  const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
  return { url: get("NEXT_PUBLIC_SUPABASE_URL"), key: get("SUPABASE_SERVICE_ROLE_KEY") };
}

const OPP = "d097e1a8-c3c0-4c51-a113-2275b009b9a9";
const BOOKING_LABELS = {
  tour_invitation_activated: "Tour invitation sent",
  tour_confirmed: "Tour scheduled",
  tour_booked: "Tour scheduled",
  tour_rescheduled: "Tour rescheduled",
  tour_canceled: "Tour cancelled",
  tour_cancelled: "Tour cancelled",
};

async function cookieHeader(context) {
  return (await context.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
}

async function fetchActivity(cookie) {
  const res = await fetch(`${BASE}/api/admin/activity?entity_type=opportunity&entity_id=${OPP}&limit=30`, {
    headers: { Cookie: cookie },
  });
  const json = await res.json();
  const events = json.events || [];
  return {
    status: res.status,
    types: events.map((e) => e.event_type),
    titles: events.map((e) => e.title || e.summary || e.label || BOOKING_LABELS[e.event_type] || e.event_type),
    raw: events.slice(0, 8).map((e) => ({
      type: e.event_type,
      title: e.title || e.summary || e.label || null,
      at: e.occurred_at,
    })),
  };
}

async function fetchDrawerVm(cookie) {
  const res = await fetch(`${BASE}/api/admin/view-models/drawer/opportunity/${OPP}`, {
    headers: { Cookie: cookie },
  });
  const json = await res.json();
  const vm = json.viewModel || json.data?.viewModel || json;
  const bookings = vm?.summaries?.active_tour_bookings || [];
  const recordEvents = vm?.above_fold?.record?._activity_timeline_events || [];
  return {
    status: res.status,
    bookingCount: bookings.length,
    bookings: bookings.map((b) => ({ id: b.id, status: b.status_key, start: b.start_at })),
    activityTypes: recordEvents.map((e) => e.event_type).slice(0, 15),
  };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: storage,
  viewport: { width: 1440, height: 980 },
});
const page = await context.newPage();
page.setDefaultTimeout(45000);

const { url, key } = loadEnv();
const sb = createClient(url, key, { auth: { persistSession: false } });

try {
  push({ step: "warm" });
  const health = await page.request.get(`${BASE}/login`);
  push({ step: "health", status: health.status() });
  if (health.status() !== 200) throw new Error("server not ready");

  const cookie = await cookieHeader(context);

  // --- Phase A: activity + booking projection (authoritative) ---
  const act0 = await fetchActivity(cookie);
  const vm0 = await fetchDrawerVm(cookie);
  push({
    step: "phase-A-activity-bookings",
    activity: { status: act0.status, types: act0.types.slice(0, 12), raw: act0.raw },
    drawer: vm0,
    pass: {
      invite: act0.types.includes("tour_invitation_activated"),
      scheduled: act0.types.includes("tour_confirmed") || act0.types.includes("tour_booked"),
      booking: vm0.bookingCount > 0,
      hydrated: vm0.activityTypes.includes("tour_invitation_activated"),
    },
  });

  const bookingId = vm0.bookings[0]?.id;
  if (!bookingId) throw new Error("No active tour booking on drawer VM");

  // --- Phase B: light UI — What's Next + Tour menu + Activity mode ---
  push({ step: "phase-B-ui-start" });
  await page.goto(`${BASE}/workspace/work-unit/waitlist`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForSelector("[data-entity-id]", { timeout: 90000 });
  for (let i = 0; i < 25; i++) {
    if (!(await page.locator("text=Compiling").count())) break;
    await sleep(800);
  }

  const rows = page.locator("[data-entity-id]");
  const count = await rows.count();
  let clicked = false;
  for (let i = 0; i < count; i++) {
    const t = (await rows.nth(i).innerText()).replace(/\s+/g, " ");
    if (/Kurzman|Lennon|Wrigley/i.test(t)) {
      await rows.nth(i).click();
      clicked = true;
      push({ step: "row", i, t: t.slice(0, 160) });
      break;
    }
  }
  if (!clicked) {
    await rows.first().click();
    push({ step: "row-fallback", count });
  }
  await sleep(4000);

  await page.screenshot({ path: path.join(outDir, "01-focus-whats-next.png"), fullPage: false });

  const uiBefore = await page.evaluate(() => {
    const text = (document.body?.innerText || "").replace(/\s+/g, " ");
    const card = document.querySelector(
      "[data-current-work-surface='true'], [data-work-card='true']",
    );
    const cardText = (card?.textContent || "").replace(/\s+/g, " ");
    const tourBtn =
      [...document.querySelectorAll("button, [role='button']")].find((el) =>
        /^(Tour|Tour ▾|Tour▾)/i.test((el.textContent || "").trim()),
      ) ||
      [...document.querySelectorAll("button, [role='button']")].find((el) =>
        /\bTour\b/i.test((el.textContent || "").trim()) &&
        /schedule|reschedule|invitation|cancel/i.test(
          (el.getAttribute("aria-label") || el.textContent || ""),
        ),
      );
    return {
      hasRecentActivity: /RECENT ACTIVITY/i.test(cardText) || /Recent activity/i.test(cardText),
      hasInviteCopy: /Tour invitation sent/i.test(cardText) || /Tour invitation sent/i.test(text),
      hasScheduledCopy: /Tour scheduled/i.test(cardText) || /Tour scheduled/i.test(text),
      cardSlice: cardText.slice(0, 900),
      tourButton: tourBtn ? (tourBtn.textContent || "").trim().slice(0, 80) : null,
    };
  });
  push({ step: "ui-whats-next", ...uiBefore });

  // Open Tour menu
  const tourOpened = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll("button, [role='button'], [data-action-menu]")];
    const tour = candidates.find((el) => {
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      return /^Tour(\s*▾)?$/i.test(t) || t === "Tour ▾" || /^Tour\b/i.test(t) && t.length < 20;
    });
    if (tour) {
      tour.click();
      return { found: true, label: (tour.textContent || "").trim() };
    }
    return { found: false };
  });
  push({ step: "tour-menu-click", ...tourOpened });
  await sleep(800);
  await page.screenshot({ path: path.join(outDir, "02-tour-menu.png"), fullPage: false });

  const menuItems = await page.evaluate(() => {
    const items = [...document.querySelectorAll("[role='menuitem'], [data-menu-item], button, a")]
      .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
      .filter((t) => /Schedule Tour|Reschedule Tour|Cancel Tour|Send Tour Invitation/i.test(t));
    return [...new Set(items)];
  });
  push({
    step: "tour-menu-items",
    menuItems,
    pass:
      menuItems.some((t) => /Reschedule Tour/i.test(t)) &&
      menuItems.some((t) => /Cancel Tour/i.test(t)) &&
      !menuItems.some((t) => /^Schedule Tour$/i.test(t)),
  });

  // Activity mode
  const activityMode = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll("button, [role='tab'], a")];
    const act = tabs.find((el) => /^(Activity)$/i.test((el.textContent || "").trim()));
    if (act) {
      act.click();
      return { clicked: true };
    }
    return { clicked: false, available: tabs.map((t) => (t.textContent || "").trim()).filter((x) => x.length < 24).slice(0, 20) };
  });
  push({ step: "activity-mode-click", ...activityMode });
  await sleep(2500);
  await page.screenshot({ path: path.join(outDir, "03-activity-mode.png"), fullPage: false });

  const activityUi = await page.evaluate(() => {
    const text = (document.body?.innerText || "").replace(/\s+/g, " ");
    return {
      hasInvite: /Tour invitation sent/i.test(text),
      hasScheduled: /Tour scheduled/i.test(text),
      slice: text.match(/.{0,40}Tour (invitation sent|scheduled|rescheduled|cancelled).{0,40}/gi) || [],
    };
  });
  push({ step: "activity-mode-copy", ...activityUi });

  // --- Phase C: reschedule via admin API ---
  const nextStart = new Date();
  nextStart.setUTCDate(nextStart.getUTCDate() + 10);
  nextStart.setUTCHours(17, 0, 0, 0); // ~10am PT
  const nextEnd = new Date(nextStart.getTime() + 60 * 60 * 1000);
  const resched = await page.request.post(`${BASE}/api/admin/tours/bookings/${bookingId}/reschedule`, {
    headers: { "Content-Type": "application/json", Cookie: cookie },
    data: {
      start_at: nextStart.toISOString(),
      end_at: nextEnd.toISOString(),
      timezone: "America/Los_Angeles",
    },
  });
  const reschedJson = await resched.json();
  push({
    step: "reschedule-api",
    status: resched.status(),
    bookingStatus: reschedJson.booking?.status_key,
    start: reschedJson.booking?.start_at,
    error: reschedJson.error || null,
  });

  await sleep(1500);
  const act1 = await fetchActivity(cookie);
  const vm1 = await fetchDrawerVm(cookie);
  push({
    step: "after-reschedule",
    hasRescheduledEvent: act1.types.includes("tour_rescheduled"),
    bookingStart: vm1.bookings[0]?.start,
    bookingCount: vm1.bookingCount,
    typesHead: act1.types.slice(0, 8),
  });

  // --- Phase D: cancel via admin API ---
  const cancel = await page.request.post(`${BASE}/api/admin/tours/bookings/${bookingId}/cancel`, {
    headers: { "Content-Type": "application/json", Cookie: cookie },
    data: { canceled_by: "admin", cancel_reason: "reaction-chain-cert" },
  });
  const cancelJson = await cancel.json();
  push({
    step: "cancel-api",
    status: cancel.status(),
    bookingStatus: cancelJson.booking?.status_key,
    error: cancelJson.error || null,
  });

  await sleep(1500);
  const act2 = await fetchActivity(cookie);
  const vm2 = await fetchDrawerVm(cookie);
  const { data: bookingRow } = await sb
    .from("tour_bookings")
    .select("id,status_key,start_at,canceled_at")
    .eq("id", bookingId)
    .maybeSingle();
  push({
    step: "after-cancel",
    hasCancelEvent: act2.types.includes("tour_canceled") || act2.types.includes("tour_cancelled"),
    bookingCount: vm2.bookingCount,
    bookingRow,
    typesHead: act2.types.slice(0, 8),
  });

  // Soft UI re-check after cancel (reload focus expected? product says no — try soft wait)
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
  await sleep(4000);
  const rows2 = page.locator("[data-entity-id]");
  for (let i = 0; i < (await rows2.count()); i++) {
    const t = (await rows2.nth(i).innerText()).replace(/\s+/g, " ");
    if (/Kurzman|Lennon|Wrigley/i.test(t)) {
      await rows2.nth(i).click();
      break;
    }
  }
  await sleep(3500);
  await page.evaluate(() => {
    const candidates = [...document.querySelectorAll("button, [role='button']")];
    const tour = candidates.find((el) => {
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      return /^Tour(\s*▾)?$/i.test(t) || (t.startsWith("Tour") && t.length < 16);
    });
    tour?.click();
  });
  await sleep(700);
  await page.screenshot({ path: path.join(outDir, "04-tour-menu-after-cancel.png"), fullPage: false });
  const menuAfterCancel = await page.evaluate(() => {
    const items = [...document.querySelectorAll("[role='menuitem'], [data-menu-item], button, a")]
      .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
      .filter((t) => /Schedule Tour|Reschedule Tour|Cancel Tour|Send Tour Invitation/i.test(t));
    return [...new Set(items)];
  });
  push({
    step: "tour-menu-after-cancel",
    menuItems: menuAfterCancel,
    pass:
      menuAfterCancel.some((t) => /^Schedule Tour$/i.test(t)) &&
      !menuAfterCancel.some((t) => /Reschedule Tour/i.test(t)) &&
      !menuAfterCancel.some((t) => /Cancel Tour/i.test(t)),
  });

  push({
    step: "SUMMARY",
    activityProjectionPass:
      act0.types.includes("tour_invitation_activated") &&
      (act0.types.includes("tour_confirmed") || act0.types.includes("tour_booked")) &&
      vm0.activityTypes.includes("tour_invitation_activated"),
    tourMenuActivePass:
      menuItems.some((t) => /Reschedule Tour/i.test(t)) &&
      menuItems.some((t) => /Cancel Tour/i.test(t)) &&
      !menuItems.some((t) => /^Schedule Tour$/i.test(t)),
    reschedulePass: Boolean(act1.types.includes("tour_rescheduled") && vm1.bookingCount > 0),
    cancelPass: Boolean(
      (act2.types.includes("tour_canceled") || act2.types.includes("tour_cancelled")) &&
        vm2.bookingCount === 0,
    ),
    uiActivityHints: {
      whatsNextInvite: uiBefore.hasInviteCopy,
      whatsNextScheduled: uiBefore.hasScheduledCopy,
      activityModeInvite: activityUi.hasInvite,
      activityModeScheduled: activityUi.hasScheduled,
    },
    note: "UI copy hints may lag if Whats Next still waitlist-scoped; API/VM are authoritative for this cert slice.",
  });
} catch (e) {
  push({ step: "ERROR", message: String(e?.message || e), stack: String(e?.stack || "").slice(0, 800) });
  await page.screenshot({ path: path.join(outDir, "error.png"), fullPage: false }).catch(() => null);
  process.exitCode = 1;
} finally {
  await browser.close();
}
