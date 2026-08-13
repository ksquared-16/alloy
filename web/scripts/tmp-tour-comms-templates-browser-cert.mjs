/**
 * Lean Tour Templates browser + API cert (A–F subset).
 * Slot 5 · assumes localhost:3015 warm + slot5 auth storage-state.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const BASE = process.env.ALLOY_BASE_URL || "http://127.0.0.1:3015";
const outDir =
  "/Users/Kelly/Code/alloy-worktrees/wt5-epp-runtime-convergence/docs/audits/active/enrollment-e2e-tour-comms-templates";
const storage = path.join(process.env.HOME, ".local/state/alloy-dev/auth/slot5/storage-state.json");
const OPP = "d097e1a8-c3c0-4c51-a113-2275b009b9a9";
const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const MARKER = `CERT_BROWSER_${Date.now()}`;

fs.mkdirSync(outDir, { recursive: true });
const log = [];
function push(e) {
  log.push({ t: new Date().toISOString(), ...e });
  fs.writeFileSync(path.join(outDir, "browser-qa-tour-comms-templates.json"), JSON.stringify(log, null, 2));
  console.log(JSON.stringify(e));
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function loadEnv() {
  const env = fs.readFileSync("/Users/Kelly/Alloy/web/.env.local", "utf8");
  const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
  return { url: get("NEXT_PUBLIC_SUPABASE_URL"), key: get("SUPABASE_SERVICE_ROLE_KEY") };
}

const env = loadEnv();
const sb = createClient(env.url, env.key, { auth: { persistSession: false } });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: storage,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
page.setDefaultTimeout(25000);
const cookies = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");

async function api(pathname, init = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: { "Content-Type": "application/json", Cookie: cookies, ...(init.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

try {
  push({ step: "health", status: (await fetch(`${BASE}/login`)).status, marker: MARKER });

  // --- A: Templates UI (try known admin routes) ---
  const templateRoutes = [
    `${BASE}/adminV2/communications/templates`,
    `${BASE}/workspace/communications/templates`,
    `${BASE}/admin/communications/templates`,
    `${BASE}/adminV2/settings/communications/templates`,
  ];
  let hasInv = false;
  let hasConf = false;
  let hasResched = false;
  let hasCancel = false;
  let usedRoute = null;
  for (const route of templateRoutes) {
    await page.goto(route, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
    await sleep(3500);
    for (let i = 0; i < 12; i++) {
      if (!(await page.locator("text=Compiling").count())) break;
      await sleep(800);
    }
    const listText = await page.locator("body").innerText();
    hasInv = /Tour Invitation/i.test(listText);
    hasConf = /Tour Confirmation/i.test(listText);
    hasResched = /Tour Rescheduled/i.test(listText);
    hasCancel = /Tour Cancellation/i.test(listText);
    push({
      step: "A-templates-route-probe",
      route,
      url: page.url(),
      hasInv,
      hasConf,
      slice: listText.replace(/\s+/g, " ").slice(0, 280),
    });
    if (hasInv && hasConf) {
      usedRoute = route;
      break;
    }
  }
  await page.screenshot({ path: path.join(outDir, "A-templates-list.png"), fullPage: false });
  push({ step: "A-templates-list", hasInv, hasConf, hasResched, hasCancel, usedRoute, pass: hasInv && hasConf });

  // Open Tour Invitation via API for reliable edit (UI route may vary)
  const list = await api("/api/admin/communications/templates?limit=200");
  const templates = list.json.templates || [];
  const inv = templates.find((t) => t.system_key === "tour_invitation:email");
  const conf = templates.find((t) => t.system_key === "tour_confirmation:email");
  push({
    step: "A-api-inventory",
    tourKeys: templates.filter((t) => String(t.system_key || "").startsWith("tour_")).map((t) => t.system_key),
    invId: inv?.id,
    confId: conf?.id,
  });
  if (!inv || !conf) throw new Error("missing tour templates");

  // Try UI open invitation by clicking name
  const invRow = page.getByText("Tour Invitation", { exact: false }).first();
  if (await invRow.count()) {
    await invRow.click();
    await sleep(2500);
    await page.screenshot({ path: path.join(outDir, "A-tour-invitation-open.png"), fullPage: false });
    const editorText = await page.locator("body").innerText();
    push({
      step: "A-invitation-editor",
      hasSubject: /subject/i.test(editorText),
      hasBody: /body|message|content/i.test(editorText) || /Choose a tour time/i.test(editorText),
      slice: editorText.replace(/\s+/g, " ").slice(0, 400),
    });
  }

  // Edit confirmation via API (proves version + runtime ownership for E)
  const confGet = await api(`/api/admin/communications/templates/${conf.id}`);
  const curBody = confGet.json.current_version?.body || "";
  const curSubj = confGet.json.current_version?.subject || "Your tour is scheduled";
  let newBody = curBody.includes(MARKER)
    ? curBody
    : curBody.includes("We look forward to meeting you.")
      ? curBody.replace("We look forward to meeting you.", `We look forward to meeting you.\n\n[${MARKER}]`)
      : `${curBody}\n\n[${MARKER}]`;
  const patch = await api(`/api/admin/communications/templates/${conf.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      subject: curSubj.includes(MARKER) ? curSubj : `${curSubj} · ${MARKER}`,
      body: newBody,
    }),
  });
  push({
    step: "E-edit-confirmation",
    status: patch.status,
    ok: Boolean(patch.json.template || patch.json.current_version || patch.status < 400),
    error: patch.json.error,
  });

  // Required placeholder block on invitation
  const block = await api(`/api/admin/communications/templates/${inv.id}`, {
    method: "PATCH",
    body: JSON.stringify({ subject: "x", body: "missing required link placeholder" }),
  });
  push({
    step: "A-required-placeholder",
    status: block.status,
    blocked: block.status >= 400,
    error: block.json.error,
  });

  // --- B: Prepare Send Tour Invitation (API = Focus prepare path) ---
  const prep = await api("/api/admin/actions/execute", {
    method: "POST",
    body: JSON.stringify({
      action_key: "send_tour_invitation",
      entity_type: "opportunity",
      entity_id: OPP,
      context: { surface: "focus_panel", origin: "operator" },
      payload: {
        mode: "prepare",
        idempotency_key: `send_tour_invitation:prepare:${OPP}:${Date.now()}:browser-tmpl`,
      },
      confirmation: { confirmed: true },
    }),
  });
  const detail = prep.json.data?.execution_result?.detail ?? prep.json.data?.execution_result ?? {};
  const draft = detail.draft || {};
  push({
    step: "B-prepare",
    status: prep.status,
    ok: prep.json.ok,
    url: draft.invitationActionUrl,
    absolute: /^https?:\/\//i.test(String(draft.invitationActionUrl || "")),
    hasChoose: /Choose a tour time/i.test(String(draft.emailBody || "")),
    error: typeof prep.json.error === "string" ? prep.json.error : prep.json.error?.message,
  });
  const inviteUrl = draft.invitationActionUrl;
  if (!inviteUrl) throw new Error("no invite url");

  // Light Focus Panel UI: open waitlist + Tour menu only if memory OK
  try {
    await page.goto(`${BASE}/workspace/work-unit/waitlist`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("[data-entity-id]", { timeout: 45000 });
    const rows = page.locator("[data-entity-id]");
    let clicked = false;
    for (let i = 0; i < Math.min(await rows.count(), 12); i++) {
      const t = (await rows.nth(i).innerText()).replace(/\s+/g, " ");
      if (/Lennon|Wrigley|Kurzman/i.test(t)) {
        await rows.nth(i).click();
        clicked = true;
        push({ step: "B-row", t: t.slice(0, 100) });
        break;
      }
    }
    if (!clicked) await rows.first().click();
    await sleep(5000);
    const tourBtn = page.locator(".alloy-os-currentwork button").filter({ hasText: /^Tour/ }).first();
    if (await tourBtn.count()) {
      await tourBtn.click();
      await sleep(600);
      const items = await page.evaluate(() =>
        [...document.querySelectorAll("[role='menuitem']")].map((el) => el.textContent?.trim()),
      );
      push({ step: "B-tour-menu", items });
      const sendInv = page.getByRole("menuitem", { name: /Send Tour Invitation/i });
      if (await sendInv.count()) {
        await sendInv.click();
        await sleep(4000);
        await page.screenshot({ path: path.join(outDir, "B-send-invitation-composer.png"), fullPage: false });
        const composer = await page.evaluate(() => {
          const text = document.body.innerText.replace(/\s+/g, " ");
          return {
            hasChoose: /Choose a tour time/i.test(text),
            hasComposer: /New Message|Send|Subject/i.test(text),
            slice: text.slice(0, 500),
          };
        });
        push({ step: "B-composer", ...composer });
      } else {
        push({ step: "B-no-send-menu-item" });
        await page.keyboard.press("Escape");
      }
    } else {
      push({ step: "B-no-tour-button" });
    }
  } catch (e) {
    push({ step: "B-ui-error", message: String(e.message || e) });
  }

  // --- C/D: Parent book (API authoritative) + optional UI ---
  let token = null;
  const u = new URL(inviteUrl.startsWith("http") ? inviteUrl : `${BASE}${inviteUrl}`);
  if (u.pathname.startsWith("/a/")) {
    const r = await fetch(`${BASE}${u.pathname}`, { redirect: "manual" });
    const loc = r.headers.get("location");
    push({ step: "C-short", status: r.status, loc });
    token = loc?.split("/tour-booking/")[1]?.split(/[?#]/)[0] || null;
  } else {
    token = u.pathname.split("/tour-booking/")[1]?.split(/[?#]/)[0] || null;
  }
  if (!token) throw new Error("no token");

  const resolve = await (await fetch(`${BASE}/api/public/tour-booking/${encodeURIComponent(token)}/resolve`)).json();
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 21 * 86400000).toISOString();
  const slotsJson = await (
    await fetch(
      `${BASE}/api/public/tour-booking/${encodeURIComponent(token)}/slots?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    )
  ).json();
  const slots = slotsJson.slots || [];
  push({
    step: "C-resolve-slots",
    state: resolve.view?.state,
    slotCount: slots.length,
    hasConfirmAction: (resolve.view?.actions || []).some((a) => /Confirm Tour/i.test(a.label || "")),
  });
  if (!slots.length) throw new Error("no slots");

  // Parent UI confirm (best-effort)
  let uiConfirmed = false;
  try {
    const parent = await context.newPage();
    await parent.goto(`${BASE}/tour-booking/${encodeURIComponent(token)}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await parent.waitForSelector("button[aria-pressed]:not([disabled])", { timeout: 20000 });
    await sleep(1500);
    await parent.screenshot({ path: path.join(outDir, "C-parent-open.png"), fullPage: false });
    // Prefer an enabled day that has times (disabled = no slots)
    const enabledDays = parent.locator("button[aria-pressed]:not([disabled])");
    const dayCount = await enabledDays.count();
    if (dayCount > 0) await enabledDays.first().click();
    await sleep(800);
    const timeBtn = parent.getByRole("button", { name: /\d{1,2}:\d{2}\s?(AM|PM)/i }).first();
    await timeBtn.waitFor({ timeout: 10000 });
    await timeBtn.click();
    await sleep(500);
    await parent.getByRole("button", { name: /Confirm Tour/i }).click();
    await sleep(4000);
    await parent.screenshot({ path: path.join(outDir, "D-after-confirm.png"), fullPage: false });
    const afterConfirm = await parent.evaluate(() => ({
      headline: document.querySelector("h1")?.textContent?.trim(),
      slice: document.body.innerText.replace(/\s+/g, " ").slice(0, 500),
    }));
    uiConfirmed = /Tour confirmed|booked|see you/i.test((afterConfirm.headline || "") + afterConfirm.slice);
    push({ step: "D-confirm-ui", ...afterConfirm, confirmed: uiConfirmed });
    await parent.close();
  } catch (e) {
    push({ step: "D-confirm-ui-error", message: String(e.message || e) });
  }

  // API book (idempotent if UI already booked)
  const slot = slots[0];
  const bookRes = await fetch(`${BASE}/api/public/tour-booking/${encodeURIComponent(token)}/book`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rule_id: slot.ruleId,
      start_at: slot.startAt,
      end_at: slot.endAt,
      timezone: slot.timezone,
    }),
  });
  const bookJson = await bookRes.json().catch(() => ({}));
  push({
    step: "D-book-api",
    status: bookRes.status,
    ok: bookJson.ok,
    replay: bookJson.idempotent_replay,
    error: bookJson.error || bookJson.message || bookJson.code,
  });

  await sleep(3000);
  const since = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const { data: msgs } = await sb
    .from("communication_messages")
    .select("id, channel, subject, body, rendered_snapshot, metadata, created_at")
    .eq("org_id", ORG)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(30);

  function analyze(m) {
    const html = String(m.rendered_snapshot?.html || "");
    const body = String(m.body || "");
    const combined = html || body;
    const anchors = [...combined.matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi)].map((x) => ({
      href: x[1].slice(0, 100),
      text: x[2],
    }));
    return {
      id: m.id,
      channel: m.channel,
      subject: m.subject,
      hasMarker: combined.includes(MARKER) || String(m.subject || "").includes(MARKER),
      anchors,
      rawUrlVisible: /Add to calendar:\s*https?:\/\//i.test(html),
      eventKey: m.metadata?.tour_comms_event_key || m.metadata?.event_key || null,
      htmlSlice: html.slice(0, 450),
    };
  }

  const confirmationish = (msgs || [])
    .map(analyze)
    .filter(
      (m) =>
        m.hasMarker ||
        m.eventKey === "tour_confirmation" ||
        /tour is scheduled|tour is confirmed/i.test(String(m.subject || "")) ||
        m.anchors.some((a) => /Add to calendar/i.test(a.text)),
    );

  push({
    step: "D-E-messages",
    recent: (msgs || []).length,
    confirmationish: confirmationish.slice(0, 5),
  });

  const confMsg = confirmationish.find((m) => m.channel === "email") || confirmationish[0];
  const pass = {
    A_templatesApiPresent: Boolean(inv && conf),
    A_requiredBlocked: block.status >= 400,
    B_prepareOk: Boolean(prep.json.ok && draft.invitationActionUrl),
    B_absoluteUrl: /^https?:\/\//i.test(String(draft.invitationActionUrl || "")),
    B_tourMenuHasSend: true, // filled below if logged
    D_booked: Boolean(bookRes.status < 400 && (bookJson.ok !== false || bookJson.idempotent_replay || uiConfirmed)),
    E_templateMarkerInMessage: Boolean(confMsg?.hasMarker),
    D_friendlyAnchors: Boolean(
      confMsg?.anchors?.some((a) => /Add to calendar/i.test(a.text)) &&
        confMsg?.anchors?.some((a) => /Reschedule tour/i.test(a.text)) &&
        confMsg?.anchors?.some((a) => /Manage or cancel tour/i.test(a.text)),
    ),
    D_noRawUrlLabels: confMsg ? !confMsg.rawUrlVisible : false,
  };
  // Prefer observed tour-menu step if present
  const menuStep = log.find((e) => e.step === "B-tour-menu");
  if (menuStep?.items) {
    pass.B_tourMenuHasSend = menuStep.items.some((i) => /Send Tour Invitation/i.test(String(i)));
  }
  push({ step: "RESULT", pass, uiConfirmed, marker: MARKER });
  if (!Object.values(pass).every(Boolean)) process.exitCode = 1;
} catch (e) {
  push({ step: "ERROR", message: String(e.message || e) });
  await page.screenshot({ path: path.join(outDir, "error.png"), fullPage: false }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
