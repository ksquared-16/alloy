/** Mounted archive QA, then the 11 certification specimens. */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
const BASE = "https://staging.workwithalloy.com";
const STORAGE = `${process.env.HOME}/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json`;
const SITE = "1a5644a7-45c4-413b-9021-5f556118b6e2";
const SPECIMENS = [
  ["92207313-d1cc-4141-b56b-118b3c3bc644","QA Toddler 73122"],["62a8916c-de49-43dd-8bce-2dd5441a1651","QA Group A 58206"],
  ["db53757a-9eab-44de-a2df-fd1466ea4957","QA Group B 58206"],["e54a9d97-3c68-4a57-9ea3-530688f30eaf","QA Group A 06000"],
  ["1a1ad289-7d15-4178-8fb6-737e888f4211","QA Group B 06000"],["ba05df72-53db-4e56-89aa-d45d62a01027","QA Room 73122"],
  ["50bceb7d-fed5-418d-9550-faa2fe5a549e","QA Playground 73122"],["7e78c696-c93c-41fc-9373-12c24d76f50e","QA Room 58206"],
  ["6056e4f3-125a-46e4-94a5-01a4b00244b1","QA Yard 58206"],["1d15889a-f6d4-4f03-9284-894def33c72a","QA Room 06000"],
  ["88bdec35-446a-4115-9f02-57135baad1f8","QA Yard 06000"],
];
const b = await chromium.launch();
const c = await b.newContext({ storageState: JSON.parse(readFileSync(STORAGE, "utf8")), viewport: { width: 1440, height: 1100 } });
const p = await c.newPage();
const errs = [], perrs = [];
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 180)); });
p.on("pageerror", (e) => perrs.push(String(e).slice(0, 180)));
const tid = (t) => p.locator(`[data-testid="${t}"]`);
const ev = { at: new Date().toISOString(), checks: [] };
const check = (n, d) => { ev.checks.push({ name: n, ...d }); console.log("##", n, JSON.stringify(d).slice(0, 500)); };
const openSpaces = async () => {
  await p.goto(`${BASE}/organization/locations?locationId=${SITE}&tab=rooms`, { waitUntil: "domcontentloaded" });
  await p.waitForSelector('[data-testid="locations-rooms"]', { timeout: 45000 });
};
const counts = async () => ({
  all: (await tid("locations-room-kind-filter-all").textContent())?.trim(),
  operational: (await tid("locations-room-kind-filter-operational").textContent())?.trim(),
  physical: (await tid("locations-room-kind-filter-physical").textContent())?.trim(),
});
const archiveById = (id) => p.evaluate(async (id) => {
  const r = await fetch(`/api/admin/locations/${id}/archive`, { method: "POST", credentials: "include" });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}, id);

await openSpaces();
const before = await counts();
check("0_before", before);

// 1-3 — create a disposable space, make it inactive, confirm it stays visible
const name = `Archive probe ${Date.now().toString().slice(-5)}`;
await tid("locations-room-add").click();
await p.waitForSelector('[data-testid="locations-room-create-type"]', { timeout: 20000 });
await tid("locations-room-create-type").selectOption("operational_group");
await tid("locations-room-create-name").fill(name);
await tid("locations-room-create-save").click();
await p.waitForSelector('[data-testid="locations-room-detail"]', { timeout: 30000 });
await p.waitForFunction(() => new URL(location.href).searchParams.get("itemId") != null, null, { timeout: 20000 });
const probeId = new URL(p.url()).searchParams.get("itemId");
// Inactive through the product's own PATCH; the mounted question is whether an
// inactive space STAYS in the collection, not how the checkbox is clicked.
const madeInactive = await p.evaluate(async (id) => {
  const r = await fetch(`/api/admin/locations/${id}`, {
    method: "PATCH", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active: false }),
  });
  return r.status;
}, probeId);
check("2_made_inactive", { status: madeInactive });
await openSpaces();
const railInactive = await tid("locations-rooms-list").innerText();
check("1_3_inactive_stays_visible", { present: railInactive.includes(name), inactiveLabelled: /Inactive/.test(railInactive), counts: await counts() });

// 4-6 — archive it, confirm it leaves and counts drop
const arch = await archiveById(probeId);
check("4_archive_call", { status: arch.status, ok: arch.body?.ok === true, archivedAt: arch.body?.archivedAt ?? null });
await openSpaces();
const railAfter = await tid("locations-rooms-list").innerText();
const after = await counts();
check("5_6_leaves_collection_and_counts", { stillPresent: railAfter.includes(name), before, after });

// 7 — absent from selectors (the canonical provider feeds them)
const selectors = await p.evaluate(async (siteId) => {
  const r = await fetch(`/api/admin/locations?location_types=unit`, { credentials: "include" });
  const j = await r.json();
  const rows = Array.isArray(j) ? j : (j.locations ?? j.rows ?? []);
  return rows.map((x) => x.label);
}, SITE);
check("7_absent_from_selectors", { archivedListed: selectors.includes(name), total: selectors.length });

// 9 — an unsafe archive refuses: Room 1 still holds operational spaces
const room1 = await p.evaluate(async () => {
  const r = await fetch("/api/admin/locations?location_types=unit", { credentials: "include" });
  const j = await r.json();
  const rows = Array.isArray(j) ? j : (j.locations ?? j.rows ?? []);
  return rows.find((x) => x.label === "Room 1")?.id ?? null;
});
const refusal = room1 ? await archiveById(room1) : { status: 0, body: {} };
check("9_unsafe_refuses", { status: refusal.status, code: refusal.body?.code, message: refusal.body?.error });

// 11 — archive the 11 specimens, children before containers
const results = [];
for (const [id, label] of SPECIMENS) {
  const r = await archiveById(id);
  results.push({ label, status: r.status, code: r.body?.code ?? null });
  console.log("archive", label, r.status, r.body?.code ?? "ok");
}
ev.specimens = results;

// 12 — the rail is clean and real spaces remain
await openSpaces();
const finalRail = await tid("locations-rooms-list").innerText();
check("12_north_campus_clean", {
  qaMentions: (finalRail.match(/QA /g) ?? []).length,
  counts: await counts(),
  rows: finalRail.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 26),
});

// 10/16/17 — real spaces and ratio conflicts untouched
await p.getByText("Infant A", { exact: true }).first().click();
await p.waitForSelector('[data-testid="locations-room-detail"]', { timeout: 30000 });
await p.waitForTimeout(2000);
check("16_infant_a_untouched", { review: (await tid("locations-space-ratio-review").innerText().catch(() => null))?.replace(/\n+/g, " | ") ?? null });
await openSpaces();
await p.getByText("Toddler 1", { exact: true }).first().click();
await p.waitForSelector('[data-testid="locations-room-detail"]', { timeout: 30000 });
await p.waitForTimeout(2000);
check("17_toddler_1_untouched", { review: (await tid("locations-space-ratio-review").innerText().catch(() => null))?.replace(/\n+/g, " | ") ?? null });

check("runtime_errors", { errs, perrs });
writeFileSync("../certification/migrations/space-archive-mounted.json", JSON.stringify(ev, null, 2));
await b.close();
