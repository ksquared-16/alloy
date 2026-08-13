/**
 * Tour Invitation → Parent Confirm Tour → operator reaction certification.
 * Slot 5 · localhost:3015
 *
 * Journey:
 * 1) Operator prepare/send Tour Invitation (API prepare + open real short URL)
 * 2) Parent: date → time → Confirm Tour → confirmation
 * 3) Operator: Tours work view / focus / activity probes
 */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.ALLOY_BASE_URL || "http://127.0.0.1:3015";
const outDir =
  "/Users/Kelly/Code/alloy-worktrees/wt5-epp-runtime-convergence/docs/audits/active/enrollment-e2e-tour-confirm-booking";
const storage = path.join(process.env.HOME, ".local/state/alloy-dev/auth/slot5/storage-state.json");
const logPath = path.join(outDir, "browser-qa-tour-confirm.json");

fs.mkdirSync(outDir, { recursive: true });
const log = [];
function push(entry) {
  log.push({ t: new Date().toISOString(), ...entry });
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  console.log(JSON.stringify(entry));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadEnv() {
  const p = "/Users/Kelly/Alloy/web/.env.local";
  const env = fs.readFileSync(p, "utf8");
  const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
  return {
    url: get("NEXT_PUBLIC_SUPABASE_URL"),
    key: get("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

const OPP = "d097e1a8-c3c0-4c51-a113-2275b009b9a9"; // Kurzman family opportunity (prior cert)

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: storage,
  viewport: { width: 1440, height: 980 },
});
const page = await context.newPage();
page.setDefaultTimeout(30000);

try {
  // Warm server / auth
  push({ step: "warm" });
  await page.goto(`${BASE}/workspace/work-unit/waitlist`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-entity-id]", { timeout: 60000 }).catch(() => null);
  for (let i = 0; i < 20; i++) {
    if (!(await page.locator("text=Compiling").count())) break;
    await sleep(1000);
  }

  const cookies = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");

  // --- Operator: prepare fresh invitation ---
  push({ step: "prepare-invite" });
  const prepRes = await page.request.post(`${BASE}/api/admin/actions/execute`, {
    headers: { "Content-Type": "application/json", Cookie: cookies },
    data: {
      action_key: "send_tour_invitation",
      entity_type: "opportunity",
      entity_id: OPP,
      context: { surface: "focus_panel", origin: "operator" },
      payload: {
        mode: "prepare",
        idempotency_key: `send_tour_invitation:prepare:${OPP}:${Date.now()}:confirm-e2e`,
      },
      confirmation: { confirmed: true },
    },
  });
  const prepJson = await prepRes.json();
  const detail = prepJson.data?.execution_result?.detail ?? prepJson.data?.execution_result ?? {};
  const inviteUrl = detail?.draft?.invitationActionUrl || detail?.invitationActionUrl || null;
  const invitationId = detail?.invitation_id || detail?.invitationId || null;
  push({
    step: "prepare-result",
    status: prepRes.status(),
    ok: prepJson.ok,
    invitationId,
    inviteUrl,
    error: typeof prepJson.error === "string" ? prepJson.error : prepJson.error?.message,
  });
  if (!inviteUrl) throw new Error("No invitationActionUrl from prepare");

  // Extract booking link from body if present
  const body = detail?.draft?.body_html || detail?.draft?.body || detail?.draft?.emailBody || "";
  const linkFromBody = String(body).match(/https?:\/\/[^\s"'<>]+\/a\/[A-Za-z0-9_-]+/)?.[0] || null;
  const parentEntry = linkFromBody || inviteUrl;
  push({ step: "parent-entry", parentEntry, linkFromBody });

  // --- Parent: open real short link (no auth) ---
  const parentCtx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const parent = await parentCtx.newPage();
  parent.setDefaultTimeout(30000);

  const abs = parentEntry.startsWith("http") ? parentEntry : `${BASE}${parentEntry}`;
  // Force localhost port
  const localAbs = abs.replace(/https?:\/\/[^/]+/, BASE);
  push({ step: "parent-open", url: localAbs });
  await parent.goto(localAbs, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);
  await parent.screenshot({ path: path.join(outDir, "01-parent-open.png") });

  const resolveProbe = await parent.evaluate(async () => {
    const pathTok = location.pathname.split("/tour-booking/")[1]?.split(/[?#]/)[0];
    if (!pathTok) return { path: location.pathname, resolve: null };
    const r = await fetch(`/api/public/tour-booking/${encodeURIComponent(pathTok)}/resolve`);
    const j = await r.json().catch(() => ({}));
    return {
      path: location.pathname,
      status: r.status,
      state: j.view?.state,
      headline: j.view?.headline,
      actions: j.view?.actions,
      notice: j.view?.notice,
      bodyHasAccountCopy: /No account is needed/i.test(document.body.innerText),
      hasConfirm: /Confirm Tour/i.test(document.body.innerText),
    };
  });
  push({ step: "resolve-probe", ...resolveProbe });

  // Pick first available day + time
  const dayBtn = parent.locator("button[aria-label]").filter({ hasNotText: /^$/ }).first();
  // Prefer enabled calendar day buttons inside the calendar grid
  const calDays = parent.locator("button[aria-pressed]").filter({ hasText: /^\d+$/ });
  const dayCount = await calDays.count();
  let pickedDay = false;
  for (let i = 0; i < dayCount; i++) {
    const b = calDays.nth(i);
    if (await b.isEnabled()) {
      await b.click();
      pickedDay = true;
      break;
    }
  }
  push({ step: "pick-day", dayCount, pickedDay });
  await sleep(500);

  const timeBtns = parent.locator("button[aria-pressed]").filter({ hasText: /AM|PM/i });
  const timeCount = await timeBtns.count();
  if (timeCount < 1) throw new Error("No available time buttons");
  await timeBtns.first().click();
  await sleep(600);
  await parent.screenshot({ path: path.join(outDir, "02-time-selected.png") });

  const afterPick = await parent.evaluate(() => ({
    hasConfirm: /Confirm Tour/i.test(document.body.innerText),
    bodyHasAccountCopy: /No account is needed/i.test(document.body.innerText),
    textSlice: document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 600),
  }));
  push({ step: "after-time-select", ...afterPick });
  if (!afterPick.hasConfirm) throw new Error("Confirm Tour missing after time selection");
  if (afterPick.bodyHasAccountCopy) throw new Error("Account copy still present");

  // Confirm does not auto-book on time click — verify no confirmation yet
  if (/Tour confirmed|You.?re all set|Your visit is booked/i.test(afterPick.textSlice)) {
    throw new Error("Booking mutated on time select alone");
  }

  await parent.getByRole("button", { name: /Confirm Tour/i }).click();
  await sleep(3500);
  await parent.screenshot({ path: path.join(outDir, "03-after-confirm.png") });

  const afterConfirm = await parent.evaluate(() => ({
    headline: document.querySelector("h1")?.textContent?.trim() || null,
    textSlice: document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 800),
    hasConfirmBtn: !!Array.from(document.querySelectorAll("button")).find((b) =>
      /Confirm Tour/i.test(b.textContent || "")
    ),
    showsOptions: !!document.querySelector("button[aria-pressed]"),
  }));
  push({ step: "after-confirm", ...afterConfirm });

  const confirmed =
    /Tour confirmed|Your visit is booked|You.?re all set/i.test(afterConfirm.headline || "") ||
    /Tour confirmed|Your visit is booked|We.?ll see you/i.test(afterConfirm.textSlice);
  if (!confirmed) throw new Error("Parent confirmation state missing after Confirm Tour");

  // Double-confirm safety: if button gone, OK; if still somehow present, click shouldn't duplicate
  const tokenPath = await parent.evaluate(() => location.pathname.split("/tour-booking/")[1]?.split(/[?#]/)[0]);
  push({ step: "parent-token-path", tokenPath });

  await parentCtx.close();

  // --- DB: tour_bookings + invitation ---
  const { url, key } = loadEnv();
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data: bookings } = await sb
    .from("tour_bookings")
    .select("id, status_key, start_at, end_at, timezone, opportunity_id, location_id, source, created_at")
    .eq("opportunity_id", OPP)
    .order("created_at", { ascending: false })
    .limit(3);
  push({ step: "db-bookings", bookings });

  if (invitationId) {
    const { data: inv } = await sb
      .from("tour_invitations")
      .select("id, status, updated_at")
      .eq("id", invitationId)
      .maybeSingle();
    push({ step: "db-invitation", inv });
  }

  // --- Operator reaction: Tours work unit ---
  push({ step: "operator-tours-view" });
  await page.goto(`${BASE}/workspace/work-unit/tours`, { waitUntil: "domcontentloaded", timeout: 60000 });
  for (let i = 0; i < 25; i++) {
    if (!(await page.locator("text=Compiling").count())) break;
    await sleep(1000);
  }
  await sleep(4000);
  await page.screenshot({ path: path.join(outDir, "04-tours-work-view.png") });
  const toursProbe = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-entity-id]")].map((el) =>
      (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160)
    );
    const pills = [...document.querySelectorAll("[data-queue-count], [data-pill], button, a")]
      .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
      .filter((t) => /\d/.test(t) && t.length < 40)
      .slice(0, 30);
    return {
      rowCount: rows.length,
      rowsSample: rows.slice(0, 12),
      hasKurzman: rows.some((r) => /Kurzman|Lennon|Rowan/i.test(r)),
      title: document.title,
      bodySlice: document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 500),
      pills: pills.slice(0, 15),
    };
  });
  push({ step: "tours-probe", ...toursProbe });

  // Open family on waitlist / focus for What's Next + Activity
  await page.goto(`${BASE}/workspace/work-unit/waitlist`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-entity-id]", { timeout: 60000 });
  await sleep(2000);
  const rows = page.locator("[data-entity-id]");
  const n = await rows.count();
  let opened = false;
  for (let i = 0; i < n; i++) {
    const t = (await rows.nth(i).innerText()).replace(/\s+/g, " ");
    if (/Kurzman|Lennon/i.test(t)) {
      await rows.nth(i).click();
      opened = true;
      push({ step: "open-family-row", i, t: t.slice(0, 120) });
      break;
    }
  }
  if (!opened && n > 0) {
    await rows.first().click();
    push({ step: "open-family-fallback", n });
  }
  await sleep(4500);
  await page.screenshot({ path: path.join(outDir, "05-focus-after-book.png") });

  const focusProbe = await page.evaluate(() => {
    const card = document.querySelector("[data-current-work-surface='true'], [data-work-card='true']");
    const activity = [...document.querySelectorAll("[data-activity], [data-work-activity], section, article")]
      .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
      .filter((t) => /tour|invitation|booked|visit/i.test(t))
      .slice(0, 8);
    return {
      insight: card?.querySelector(".alloy-os-ucard__insight")?.textContent?.trim() || null,
      status: card?.querySelector(".alloy-os-ucard__status")?.textContent?.trim() || null,
      cardSlice: (card?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 500),
      activityHits: activity,
      bodyTourMentions: (document.body.innerText.match(/Tour|tour invitation|booked/gi) || []).slice(0, 20),
    };
  });
  push({ step: "focus-probe", ...focusProbe });

  push({
    step: "SUMMARY",
    parentConfirmed: confirmed,
    bookingId: bookings?.[0]?.id || null,
    bookingStatus: bookings?.[0]?.status_key || null,
    toursHasFamily: toursProbe.hasKurzman,
    toursRowCount: toursProbe.rowCount,
  });
} catch (e) {
  push({ step: "ERROR", message: String(e?.message || e) });
  try {
    await page.screenshot({ path: path.join(outDir, "error.png") });
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
} finally {
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  await browser.close();
}
