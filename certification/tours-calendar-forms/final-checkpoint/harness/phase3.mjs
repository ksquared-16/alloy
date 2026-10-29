import { loadState, saveState, familyRequest } from "./fam.mjs";
import { open, OUT } from "./lib.mjs";
import { approveCase, adminPage, api, leadMessages, prefs } from "./ops.mjs";
const s = loadState(); s.p3 = s.p3 ?? {};
const A = s.p2.A.approve; const opp = A.opp; const person = A.person;
const step = async (k, fn) => { try { s.p3[k] = await fn(); } catch (e) { s.p3[k] = { error: String(e).slice(0, 400) }; } saveState(s); console.log(k, JSON.stringify(s.p3[k]).slice(0, 1200)); };
const send = async (category, text) => { const { browser, page } = await adminPage(); const r = await api(page, "/api/admin/communications/send", "POST", { entity_type: "opportunities", entity_id: opp, channel: "email", subject: `Northwind ${category}`, body: text, recipient_person_id: person, category }); await browser.close(); return { status: r.status, outcome: r.body?.outcome ?? (r.body?.ok ? "sent_to_queue" : null), code: r.body?.code ?? null, id: r.body?.communication_message_id ?? r.body?.data?.communication_message_id ?? null }; };
// 16a — an eligible marketing email to the opted-in family carries its unsubscribe link.
await step("marketing1", async () => send("marketing", "ZZ final: you're invited to our autumn open house."));
await step("marketing1Row", async () => { const { browser, page } = await adminPage(); const m = (await leadMessages(page, opp)).filter((x) => /open house/.test(x.subject ?? "") || x.unsubscribe); await browser.close(); return m.map((x) => ({ status: x.status, category: x.category, unsubscribe: Boolean(x.unsubscribe), origin: x.unsubscribe ? new URL(x.unsubscribe).origin : null, url: x.unsubscribe })); });
// 16b — the family follows the link: GET asks, the button confirms.
await step("unsubscribe", async () => {
  const row = (s.p3.marketing1Row ?? []).find((x) => x.url); if (!row) return { error: "no unsubscribe link" };
  const u = new URL(row.url); const target = `${process.env.PREVIEW_ORIGIN}${u.pathname}${u.search}`;
  const { browser, page } = await open({ auth: false, viewport: { width: 390, height: 844 } });
  await page.goto(target, { waitUntil: "networkidle", timeout: 60000 });
  const asked = (await page.locator("body").innerText()).replace(/\n+/g, " | ").slice(0, 300);
  await page.screenshot({ path: `${OUT}p3-unsubscribe-ask.png`, fullPage: true });
  await page.getByRole("button").first().click(); await page.waitForTimeout(3000);
  const done = (await page.locator("body").innerText()).replace(/\n+/g, " | ").slice(0, 300);
  await page.screenshot({ path: `${OUT}p3-unsubscribe-done.png`, fullPage: true });
  await browser.close(); return { linkOriginWasPreview: u.origin === process.env.PREVIEW_ORIGIN, asked, done };
});
await step("prefsAfterUnsub", async () => { const { browser, page } = await adminPage(); const p = await prefs(page, person); await browser.close(); return p; });
// 16c — later marketing is suppressed (governed, not a 500); transactional still flows.
await step("marketing2", async () => send("marketing", "ZZ final: second newsletter."));
await step("transactional", async () => send("transactional", "ZZ final: parking details for your tour."));
// 14 — a repeat inquiry ticking email cannot re-enable the opt-out.
await step("repeatRequest", async () => familyRequest({ tag: "f-repeat-desktop-iframe", dayRe: /November 6\b/, time: "10:30 AM", first: "Jamie", last: "Finalqa", email: "qa+final-a@example.invalid", consent: { email: true }, iframe: true }));
await step("repeatApprove", async () => approveCase(/qa\+final-a@[\s\S]*Fri, Nov 6|Fri, Nov 6[\s\S]*qa\+final-a@/, "f-repeat-case"));
await step("prefsAfterRepeat", async () => { const { browser, page } = await adminPage(); const p = await prefs(page, person); await browser.close(); return p; });
