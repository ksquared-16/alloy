import { open, OUT, openCase } from "./lib.mjs";
export async function adminPage(viewport) { const o = await open(viewport ? { viewport } : {}); await o.page.goto(`${process.env.PREVIEW_ORIGIN}/workspace`, { waitUntil: "networkidle", timeout: 90000 }); return o; }
export const api = (page, url, method = "GET", body) => page.evaluate(async ([url, method, body]) => { const x = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: x.status, body: await x.json().catch(() => null) }; }, [url, method, body]);
const unfold = (s) => s.replace(/\r\n[ \t]/g, "");
/** Everything sent (or refused) on a lead's threads, summarized. */
export async function leadMessages(page, opp) {
  const t = await api(page, `/api/admin/communications/threads?entity_type=opportunities&entity_id=${opp}&limit=50`);
  const threads = t.body?.data?.threads ?? t.body?.threads ?? t.body?.data ?? [];
  const out = [];
  for (const th of Array.isArray(threads) ? threads : []) {
    const m = await api(page, `/api/admin/communications/threads/${th.id}/messages?limit=50`);
    const msgs = m.body?.data?.messages ?? m.body?.messages ?? m.body?.data ?? [];
    for (const x of Array.isArray(msgs) ? msgs : []) {
      const md = x.metadata ?? {};
      const ics = md.calendar_invite?.content_base64 ? unfold(Buffer.from(md.calendar_invite.content_base64, "base64").toString("utf8")) : null;
      out.push({
        channel: x.channel, status: x.status, to: x.to_address, subject: x.subject ?? null,
        event: md.tour_event_key ?? md.event_key ?? null, action: md.internal_calendar_action ?? null,
        staff: md.staff_recipient ?? null, category: md.message_category ?? null,
        calendarLink: /Add to calendar|calendar\.google\.com/.test(x.body ?? ""),
        unsubscribe: md.unsubscribe_url ?? (x.body ?? "").match(/https?:\/\/\S*unsubscribe\S*/)?.[0] ?? null,
        ics: ics ? { method: ics.match(/METHOD:(\w+)/)?.[1], dtstart: ics.match(/DTSTART:(\S+)/)?.[1], tz: ics.match(/X-ALLOY-BOOKING-TIMEZONE:(\S+)/)?.[1], attendee: /ATTENDEE[^\n]*mailto:/.test(ics) } : null,
        id: x.id, created_at: x.created_at,
      });
    }
  }
  return out;
}
export async function bookings(page, opp) { const b = await api(page, `/api/admin/tours/opportunities/${opp}/bookings`); const rows = b.body?.data?.bookings ?? b.body?.bookings ?? b.body?.data ?? []; return (Array.isArray(rows) ? rows : []).map((r) => ({ id: r.id, status: r.status_key, start: r.start_at, staffInvite: r.metadata?.internal_calendar_last ?? null })); }
export async function prefs(page, person) { const p = await api(page, `/api/admin/persons/${person}/communication-preferences`); return Object.fromEntries((p.body?.data?.preferences ?? []).filter((q) => /marketing/.test(q.key)).map((q) => [q.key, { state: q.state, set_by: q.lastChange?.source ?? null, wording: q.lastChange?.consentLanguageVersion ?? null, effective: q.effective?.status, history: (q.history ?? []).map((h) => `${h.source}:${h.fromState}->${h.toState}${h.changedState ? "" : " (no change)"}`) }])); }
/** Open the case, record what the operator sees, approve through the button. */
export async function approveCase(emailRe, shot, { viewport } = {}) {
  const { browser, page } = await adminPage(viewport);
  let approveJson = null; let caseId = null;
  page.on("request", (q) => { const m = /cases\/([0-9a-f-]{36})\/(recommendation|approve)$/.exec(q.url()); if (m) caseId = m[1]; });
  page.on("response", async (x) => { if (/\/approve$/.test(x.url()) && x.request().method() === "POST" && approveJson === null) { try { const j = await x.json(); approveJson = { status: x.status(), error: j.error, label: null, opp: j.data?.operationalResult?.recordId ?? null, person: j.data?.operationalResult?.records?.person ?? null, matchedExisting: j.data?.operationalResult?.matchedExisting ?? null, tourRequest: j.data?.tourRequest ?? null, marketingConsent: j.data?.marketingConsent ?? null }; } catch {} } });
  const dlg = await openCase(page, emailRe); await page.waitForTimeout(2500);
  const pre = (await dlg.innerText()).replace(/\n+/g, " | ");
  const before = {
    requestedTour: (pre.match(/REQUESTED TOUR \| [^|]*\| [^|]*\| [^|]*/i) || [null])[0],
    nothingSent: /Nothing is booked and nothing has been sent/.test(pre),
    consentPanel: (await page.getByTestId("case-marketing-consent").count()) ? (await page.getByTestId("case-marketing-consent").innerText()).replace(/\n+/g, " | ") : null,
  };
  await dlg.screenshot({ path: `${OUT}${shot}-before.png` });
  if (await page.getByRole("button", { name: /^Resolve matches to approve$/ }).count()) {
    await page.getByRole("button", { name: /^Review matches$/ }).click(); await page.waitForTimeout(2500);
    const rd = page.locator('[role="dialog"]').last();
    await rd.getByRole("button", { name: /^Same child$/ }).click(); await page.waitForTimeout(1500);
    await rd.getByRole("button", { name: /^Done$/ }).click(); await page.waitForTimeout(4000);
  }
  const btn = page.getByTestId("processing-approve");
  const label = await btn.innerText();
  await btn.click(); await page.waitForTimeout(12000);
  const post = (await dlg.innerText()).replace(/\n+/g, " | ");
  const after = {
    requestedTour: (post.match(/REQUESTED TOUR \| [^|]*\| [^|]*\| [^|]*\| [^|]*/i) || [null])[0],
    consentPanel: (await page.getByTestId("case-marketing-consent").count()) ? (await page.getByTestId("case-marketing-consent").innerText()).replace(/\n+/g, " | ") : null,
    rescheduling: /needs rescheduling/i.test(post),
  };
  await dlg.screenshot({ path: `${OUT}${shot}-after.png` });
  const replay = caseId ? await api(page, `/api/admin/processing/cases/${caseId}/approve`, "POST") : null;
  await browser.close();
  return { label, caseId, before, approve: approveJson, after, replay: replay ? { status: replay.status, tourRequest: replay.body?.data?.tourRequest ?? null, consentReplayed: replay.body?.data?.marketingConsent?.replayed ?? null } : null };
}
