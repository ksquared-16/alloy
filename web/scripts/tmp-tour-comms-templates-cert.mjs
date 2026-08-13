/**
 * Tour Communications Template Library cert (API + Supabase; no Playwright).
 * Slot 5 · proves: provision → edit → prepare invitation → book → confirmation uses library + friendly HTML.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const BASE = process.env.ALLOY_BASE_URL || "http://127.0.0.1:3015";
const outDir =
  "/Users/Kelly/Code/alloy-worktrees/wt5-epp-runtime-convergence/docs/audits/active/enrollment-e2e-tour-comms-templates";
const storage = path.join(process.env.HOME, ".local/state/alloy-dev/auth/slot5/storage-state.json");
const OPP = "d097e1a8-c3c0-4c51-a113-2275b009b9a9";
const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const MARKER = `CERT_TOUR_TMPL_${Date.now()}`;

fs.mkdirSync(outDir, { recursive: true });
const log = [];
function push(entry) {
  log.push({ t: new Date().toISOString(), ...entry });
  fs.writeFileSync(path.join(outDir, "api-qa-tour-comms-templates.json"), JSON.stringify(log, null, 2));
  console.log(JSON.stringify(entry));
}

function loadEnv() {
  const p = "/Users/Kelly/Alloy/web/.env.local";
  const env = fs.readFileSync(p, "utf8");
  const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
  return { url: get("NEXT_PUBLIC_SUPABASE_URL"), key: get("SUPABASE_SERVICE_ROLE_KEY") };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitServer(max = 90) {
  for (let i = 1; i <= max; i++) {
    try {
      const r = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(4000) });
      if (r.status === 200 || r.status === 307 || r.status === 302) return true;
    } catch {}
    await sleep(2000);
  }
  return false;
}

const env = loadEnv();
const sb = createClient(env.url, env.key, { auth: { persistSession: false } });

// --- 0: wait for Next ---
push({ step: "wait-server" });
if (!(await waitServer())) {
  push({ step: "FAIL", reason: "server_not_ready" });
  process.exit(2);
}
push({ step: "server-ready" });

// Cookie via storage-state (no full browser page)
const state = JSON.parse(fs.readFileSync(storage, "utf8"));
const cookie = state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");

async function api(pathname, init = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json };
}

// --- A: list templates (provisions Tour system templates) ---
const list1 = await api("/api/admin/communications/templates?limit=200");
push({
  step: "A-list-templates",
  status: list1.status,
  count: Array.isArray(list1.json?.data) ? list1.json.data.length : list1.json?.templates?.length ?? null,
  keysSample: (list1.json?.data || list1.json?.templates || [])
    .filter((t) => t.system_key?.startsWith?.("tour_"))
    .map((t) => ({ id: t.id, name: t.name, system_key: t.system_key, status: t.status }))
    .slice(0, 20),
});

const templates = list1.json?.data || list1.json?.templates || [];
const tourTemplates = templates.filter((t) => typeof t.system_key === "string" && t.system_key.startsWith("tour_"));
const byKey = Object.fromEntries(tourTemplates.map((t) => [t.system_key, t]));
const requiredKeys = [
  "tour_invitation:email",
  "tour_invitation:sms",
  "tour_confirmation:email",
  "tour_confirmation:sms",
  "tour_reminder:email",
  "tour_reminder:sms",
  "tour_reschedule:email",
  "tour_reschedule:sms",
  "tour_cancel:email",
  "tour_cancel:sms",
  "tour_no_show_followup:email",
  "tour_no_show_followup:sms",
];
const missing = requiredKeys.filter((k) => !byKey[k]);
push({ step: "A-inventory", present: requiredKeys.filter((k) => byKey[k]), missing });

if (missing.length) {
  // Direct ensure via DB seed if API list shape wrong — query system_key rows
  const { data: rows, error } = await sb
    .from("communication_templates")
    .select("id, name, system_key, status, current_version_id")
    .eq("org_id", ORG)
    .like("system_key", "tour_%");
  push({ step: "A-db-fallback", error: error?.message, rows: rows?.map((r) => r.system_key) });
}

// Prefer DB truth for edits
const { data: dbTour } = await sb
  .from("communication_templates")
  .select("id, name, system_key, status, current_version_id, channel")
  .eq("org_id", ORG)
  .like("system_key", "tour_%");
push({
  step: "A-db-tour-templates",
  keys: (dbTour || []).map((r) => r.system_key).sort(),
});

const confEmail = (dbTour || []).find((t) => t.system_key === "tour_confirmation:email");
const invEmail = (dbTour || []).find((t) => t.system_key === "tour_invitation:email");
if (!confEmail || !invEmail) {
  push({ step: "FAIL", reason: "missing_system_templates", confEmail: !!confEmail, invEmail: !!invEmail });
  process.exit(3);
}

// --- E prep: edit confirmation + invitation with marker ---
async function patchTemplate(templateId, { subject, body }) {
  return api(`/api/admin/communications/templates/${templateId}`, {
    method: "PATCH",
    body: JSON.stringify({ subject, body, change_summary: `cert ${MARKER}` }),
  });
}

// Load current invitation body
const { data: invVer } = await sb
  .from("communication_template_versions")
  .select("id, subject, body, version, version_number")
  .eq("id", invEmail.current_version_id)
  .maybeSingle();

let invBody = invVer?.body || "";
if (!invBody.includes("{{invitation_action_url}}")) {
  push({ step: "WARN", reason: "invitation_missing_placeholder_before_edit" });
}
if (!invBody.includes(MARKER)) {
  invBody = invBody.replace(
    "We look forward to meeting you.",
    `We look forward to meeting you.\n\n[${MARKER} invitation]`,
  );
  if (!invBody.includes(MARKER)) invBody = `${invBody}\n\n[${MARKER} invitation]`;
}
const invPatch = await patchTemplate(invEmail.id, {
  subject: invVer?.subject || "Come visit — pick a time",
  body: invBody,
});
push({
  step: "E-edit-invitation",
  status: invPatch.status,
  ok: invPatch.json?.ok ?? invPatch.json?.data != null,
  error: invPatch.json?.error,
});

// Required placeholder block test
const block = await patchTemplate(invEmail.id, {
  subject: "x",
  body: "Hello with no link placeholder",
});
push({
  step: "required-placeholder-block",
  status: block.status,
  error: typeof block.json?.error === "string" ? block.json.error : block.json?.error?.message || block.json,
  blocked: block.status >= 400,
});

const { data: confVer } = await sb
  .from("communication_template_versions")
  .select("id, subject, body")
  .eq("id", confEmail.current_version_id)
  .maybeSingle();
let confBody = confVer?.body || "";
if (!confBody.includes(MARKER)) {
  confBody = confBody.replace(
    "We look forward to meeting you.",
    `We look forward to meeting you.\n\n[${MARKER} confirmation]`,
  );
  if (!confBody.includes(MARKER)) confBody = `${confBody}\n\n[${MARKER} confirmation]`;
}
const confPatch = await patchTemplate(confEmail.id, {
  subject: (confVer?.subject || "Your tour is scheduled").includes(MARKER)
    ? confVer.subject
    : `${confVer?.subject || "Your tour is scheduled"} · ${MARKER}`,
  body: confBody,
});
push({
  step: "E-edit-confirmation",
  status: confPatch.status,
  ok: confPatch.json?.ok ?? confPatch.json?.data != null,
  error: confPatch.json?.error,
});

// Archive protect
const arch = await api(`/api/admin/communications/templates/${invEmail.id}/archive`, { method: "POST", body: "{}" });
push({
  step: "archive-protect",
  status: arch.status,
  error: typeof arch.json?.error === "string" ? arch.json.error : arch.json?.error?.message || arch.json,
  protected: arch.status >= 400,
});

// --- B: prepare invitation uses library ---
const prep = await api("/api/admin/actions/execute", {
  method: "POST",
  body: JSON.stringify({
    action_key: "send_tour_invitation",
    entity_type: "opportunity",
    entity_id: OPP,
    context: { surface: "focus_panel", origin: "operator" },
    payload: {
      mode: "prepare",
      idempotency_key: `send_tour_invitation:prepare:${OPP}:${Date.now()}:tmpl-cert`,
    },
    confirmation: { confirmed: true },
  }),
});
const detail = prep.json?.data?.execution_result?.detail ?? prep.json?.data?.execution_result ?? {};
const draft = detail?.draft || {};
push({
  step: "B-prepare",
  status: prep.status,
  ok: prep.json?.ok,
  invitationId: detail?.invitation_id || draft?.invitationId,
  inviteUrl: draft?.invitationActionUrl,
  subjectHasMarker: String(draft?.emailSubject || "").includes(MARKER),
  bodyHasMarker: String(draft?.emailBody || "").includes(MARKER),
  bodyHasChoose: /Choose a tour time/i.test(String(draft?.emailBody || "")),
  bodyHasRawToken: String(draft?.emailBody || "").includes("{{invitation_action_url}}"),
  emailBodySlice: String(draft?.emailBody || "").slice(0, 400),
  error: typeof prep.json?.error === "string" ? prep.json.error : prep.json?.error?.message,
});

const inviteUrl = draft?.invitationActionUrl;
if (!inviteUrl) {
  push({ step: "FAIL", reason: "no_invite_url" });
  process.exit(4);
}

// Resolve short → token
let bookingToken = null;
let parentEntry = inviteUrl;
try {
  const u = new URL(inviteUrl);
  if (u.pathname.startsWith("/a/")) {
    const r = await fetch(`${BASE}${u.pathname}`, { redirect: "manual" });
    const loc = r.headers.get("location");
    push({ step: "short-resolve", status: r.status, loc });
    if (loc) {
      parentEntry = loc.startsWith("http") ? loc : `${BASE}${loc}`;
      bookingToken = parentEntry.split("/tour-booking/")[1]?.split(/[?#]/)[0] || null;
    }
  } else if (u.pathname.includes("/tour-booking/")) {
    bookingToken = u.pathname.split("/tour-booking/")[1]?.split(/[?#]/)[0] || null;
  }
} catch (e) {
  push({ step: "short-resolve-error", message: String(e) });
}

if (!bookingToken) {
  push({ step: "FAIL", reason: "no_booking_token", parentEntry });
  process.exit(5);
}

// Resolve slots
const resolve = await fetch(`${BASE}/api/public/tour-booking/${encodeURIComponent(bookingToken)}/resolve`);
const resolveJson = await resolve.json();
const slots = resolveJson?.view?.slots || resolveJson?.slots || resolveJson?.view?.availableSlots || [];
push({
  step: "C-resolve",
  status: resolve.status,
  state: resolveJson?.view?.state || resolveJson?.state,
  slotCount: Array.isArray(slots) ? slots.length : 0,
  slotSample: Array.isArray(slots) ? slots.slice(0, 2) : null,
});

// Pick a bookable slot id
function pickSlot(payload) {
  const view = payload?.view || payload || {};
  const candidates = []
    .concat(view.slots || [])
    .concat(view.availableSlots || [])
    .concat(view.options || [])
    .concat(view.days || []);
  for (const c of candidates) {
    if (c?.slot_id || c?.slotId || c?.id) return c.slot_id || c.slotId || c.id;
    if (Array.isArray(c?.slots)) {
      for (const s of c.slots) {
        if (s?.slot_id || s?.slotId || s?.id) return s.slot_id || s.slotId || s.id;
      }
    }
    if (Array.isArray(c?.times)) {
      for (const s of c.times) {
        if (s?.slot_id || s?.slotId || s?.id) return s.slot_id || s.slotId || s.id;
      }
    }
  }
  // Deep search
  const blob = JSON.stringify(payload);
  const m = blob.match(/"(?:slot_id|slotId)"\s*:\s*"([^"]+)"/);
  return m?.[1] || null;
}

const slotId = pickSlot(resolveJson);
push({ step: "C-pick-slot", slotId });
if (!slotId) {
  push({ step: "FAIL", reason: "no_slot", resolveKeys: Object.keys(resolveJson?.view || resolveJson || {}) });
  process.exit(6);
}

const bookRes = await fetch(`${BASE}/api/public/tour-booking/${encodeURIComponent(bookingToken)}/book`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ slot_id: slotId, slotId }),
});
const bookJson = await bookRes.json().catch(() => ({}));
push({
  step: "D-book",
  status: bookRes.status,
  ok: bookJson?.ok,
  error: bookJson?.error || bookJson?.message,
  bookingId: bookJson?.booking_id || bookJson?.bookingId || bookJson?.view?.bookingId,
});

// Wait briefly for orchestrator enqueue
await sleep(2500);

// Find confirmation messages
const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
const { data: msgs, error: msgErr } = await sb
  .from("communication_messages")
  .select("id, channel, status, subject, body, rendered_snapshot, metadata, created_at")
  .eq("org_id", ORG)
  .gte("created_at", since)
  .order("created_at", { ascending: false })
  .limit(40);

const tourMsgs = (msgs || []).filter((m) => {
  const meta = m.metadata || {};
  const ek = String(meta.tour_comms_event_key || meta.event_key || meta.tour_event_key || "");
  const subj = String(m.subject || "");
  const body = String(m.body || "");
  const html = String(m.rendered_snapshot?.html || "");
  return (
    ek.includes("confirmation") ||
    subj.includes(MARKER) ||
    body.includes(MARKER) ||
    html.includes(MARKER) ||
    /Add to calendar/i.test(body + html) ||
    /Your tour is (confirmed|scheduled)/i.test(subj + body)
  );
});

function analyzeMsg(m) {
  const html = String(m.rendered_snapshot?.html || "");
  const body = String(m.body || "");
  const combined = html || body;
  const anchors = [...combined.matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi)].map((x) => ({
    href: x[1].slice(0, 120),
    text: x[2],
  }));
  const rawUrlVisible =
    /Add to calendar:\s*https?:\/\//i.test(html) ||
    /Need to reschedule\?\s*https?:\/\//i.test(html) ||
    /Manage or cancel[^\n<]*https?:\/\//i.test(html);
  return {
    id: m.id,
    channel: m.channel,
    status: m.status,
    subject: m.subject,
    hasMarker: combined.includes(MARKER),
    hasAddToCalendarAnchor: anchors.some((a) => /Add to calendar/i.test(a.text)),
    hasRescheduleAnchor: anchors.some((a) => /Reschedule tour/i.test(a.text)),
    hasManageAnchor: anchors.some((a) => /Manage or cancel tour/i.test(a.text)),
    rawUrlVisibleInHtml: rawUrlVisible,
    anchors,
    htmlSlice: html.slice(0, 500),
    bodySlice: body.slice(0, 300),
    eventKey: m.metadata?.tour_comms_event_key || m.metadata?.event_key || null,
  };
}

push({
  step: "D-messages",
  msgErr: msgErr?.message,
  totalRecent: (msgs || []).length,
  tourLike: tourMsgs.length,
  analyzed: tourMsgs.slice(0, 8).map(analyzeMsg),
});

// Light browser: Templates list only (single page) — skip if memory tight
let browserOk = false;
try {
  const free = Number(
    (await import("child_process")).execSync("vm_stat | awk '/Pages free/ {gsub(/\\./,\"\",$3); print $3}'").toString().trim(),
  );
  push({ step: "mem-before-browser", freePages: free, mb: Math.round((free * 16) / 1024) });
  if (free > 20000) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: storage, viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    await page.goto(`${BASE}/adminV2/communications/templates`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(3000);
    const text = await page.locator("body").innerText();
    const hasTourInv = /Tour Invitation/i.test(text);
    const hasTourConf = /Tour Confirmation/i.test(text);
    await page.screenshot({ path: path.join(outDir, "A-templates-list.png"), fullPage: false });
    push({ step: "A-browser-templates", hasTourInv, hasTourConf, textSlice: text.replace(/\s+/g, " ").slice(0, 400) });
    browserOk = hasTourInv && hasTourConf;
    await browser.close();
  } else {
    push({ step: "A-browser-skipped", reason: "low_memory" });
  }
} catch (e) {
  push({ step: "A-browser-error", message: String(e.message || e) });
}

const confAnalyzed = (tourMsgs.map(analyzeMsg).find((m) => m.hasMarker && m.channel === "email") ||
  tourMsgs.map(analyzeMsg).find((m) => m.hasAddToCalendarAnchor) ||
  null);

const pass = {
  templatesPresent: missing.length === 0 || (dbTour || []).length >= 10,
  invitationUsesLibrary: Boolean(draft?.emailBody?.includes(MARKER)),
  requiredPlaceholderBlocked: block.status >= 400,
  archiveProtected: arch.status >= 400,
  booked: bookRes.status < 400 && (bookJson?.ok !== false),
  confirmationHasMarker: Boolean(confAnalyzed?.hasMarker),
  friendlyAnchors: Boolean(
    confAnalyzed?.hasAddToCalendarAnchor && confAnalyzed?.hasRescheduleAnchor && confAnalyzed?.hasManageAnchor,
  ),
  noRawUrlsInHtml: confAnalyzed ? !confAnalyzed.rawUrlVisibleInHtml : false,
};

push({ step: "RESULT", pass, browserOk, marker: MARKER });
process.exit(Object.values(pass).every(Boolean) ? 0 : 1);
