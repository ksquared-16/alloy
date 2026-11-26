import { loadState, saveState, LINK } from "./fam.mjs";
import { open } from "./lib.mjs";
import { approveCase, adminPage, api, leadMessages, bookings, prefs } from "./ops.mjs";
const s = loadState(); s.p2 = s.p2 ?? {};
const step = async (k, fn) => { try { s.p2[k] = await fn(); } catch (e) { s.p2[k] = { error: String(e).slice(0, 400) }; } saveState(s); console.log(k, JSON.stringify(s.p2[k]).slice(0, 1500)); };
const evidence = async (opp, person) => { const { browser, page } = await adminPage(); const r = { bookings: await bookings(page, opp), messages: await leadMessages(page, opp), prefs: person ? await prefs(page, person) : null }; await browser.close(); return r; };
// A — auto-confirm time, email consent: booked once, family confirmation + calendar link, staff invitation, consent recorded.
await step("A", async () => { const a = await approveCase(/qa\+final-a@/, "a-case"); return { ...a, evidence: a.approve?.opp ? await evidence(a.approve.opp, a.approve.person) : null }; });
// B — approval-required time, consent declined: booking pending, nothing sent; staff confirms it; then confirmation + invitation.
await step("B", async () => {
  const b = await approveCase(/qa\+final-b@/, "b-case", { viewport: { width: 390, height: 844 } });
  const before = b.approve?.opp ? await evidence(b.approve.opp, b.approve.person) : null;
  const bookingId = before?.bookings?.[0]?.id;
  const { browser, page } = await adminPage();
  const confirm = bookingId ? await api(page, `/api/admin/tours/bookings/${bookingId}/confirm`, "POST", {}) : null;
  await browser.close();
  return { ...b, beforeConfirm: before, confirm: confirm ? { status: confirm.status, booking: confirm.body?.data?.status_key ?? confirm.body?.data?.booking?.status_key ?? null } : null, afterConfirm: b.approve?.opp ? await evidence(b.approve.opp, b.approve.person) : null };
});
// C, D take the two seats at Thu 11:00; E's time is full by its approval: lead kept, rescheduling path.
await step("C", async () => { const c = await approveCase(/qa\+final-c@/, "c-case"); return { ...c, evidence: c.approve?.opp ? await evidence(c.approve.opp, c.approve.person) : null }; });
await step("D", async () => { const d = await approveCase(/qa\+final-d@/, "d-case"); return { ...d, evidence: d.approve?.opp ? await evidence(d.approve.opp, null) : null }; });
await step("E", async () => { const e = await approveCase(/qa\+final-e@/, "e-case"); return { ...e, evidence: e.approve?.opp ? await evidence(e.approve.opp, null) : null }; });
// Capacity is revalidated: Thursday 11:00 is no longer offered to families.
await step("thuAfter", async () => { const { browser, page } = await open({ auth: false }); await page.goto(LINK.hosted, { waitUntil: "networkidle", timeout: 90000 }); const next = page.getByRole("button", { name: /›|Next month/ }).first(); if (!(await page.getByRole("button", { name: /November 5\b/ }).count())) { await next.click(); await page.waitForTimeout(1200); } await page.getByRole("button", { name: /November 5\b/ }).first().click(); await page.waitForTimeout(1200); const t = await page.getByTestId("public-tour-times").getByRole("button").allInnerTexts(); await browser.close(); return t; });
