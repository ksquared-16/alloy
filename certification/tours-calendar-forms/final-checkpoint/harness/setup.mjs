// Final checkpoint — isolated environment setup through the product's own routes and UI.
import { open, ORIGIN, OUT, createSchedule, riversideTours, mainText, RIVERSIDE } from "./lib.mjs";
const STAFF = "00000000-0000-4000-8000-000000000002"; // qa.operator — Northwind admin, all sites (holds tours.book)
const SCHEMA = {
  schema_version: 1, title: "Northwind Tour Inquiry",
  sections: [{ id: "s1", title: "About you", field_ids: ["guardian_first_name", "guardian_last_name", "guardian_email", "guardian_phone", "child_first_name", "child_last_name"] }],
  fields: [
    { id: "guardian_first_name", type: "text", label: "Parent / guardian first name", required: true },
    { id: "guardian_last_name", type: "text", label: "Parent / guardian last name", required: true },
    { id: "guardian_email", type: "text", label: "Email", required: true },
    { id: "guardian_phone", type: "text", label: "Phone" },
    { id: "child_first_name", type: "text", label: "Child first name", required: true },
    { id: "child_last_name", type: "text", label: "Child last name", required: true },
  ],
};
const { browser, page, errors } = await open();
const log = {};
await page.goto(`${ORIGIN}/organization/locations`, { waitUntil: "networkidle", timeout: 90000 });
const api = (url, method = "GET", body) => page.evaluate(async ([url, method, body]) => { const x = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: x.status, body: await x.json().catch(() => null) }; }, [url, method, body]);
// 1. The inquiry form: an Enrollment-lead intake form, published.
const created = await api("/api/admin/forms", "POST", { name: "Northwind Tour Inquiry", kind: "center", metadata: { intake_intent: "enrollment_lead" } });
const formId = created.body?.data?.id ?? created.body?.id ?? created.body?.form?.id;
log.formCreate = { status: created.status, formId };
const ver = await api(`/api/admin/forms/${formId}/versions`, "POST", { schema_json: SCHEMA });
const versionId = ver.body?.data?.id ?? ver.body?.id ?? ver.body?.version?.id;
log.version = { status: ver.status, versionId, err: ver.body?.error };
const pub = await api(`/api/admin/forms/${formId}/versions/${versionId}/publish`, "POST", {});
log.publish = { status: pub.status, err: pub.body?.error };
// 2. Staff calendar invitations: one authorized staff recipient (Studio's Tour delivery policy path).
const cur = await api("/api/admin/org-settings");
const meta = cur.body?.data?.metadata ?? cur.body?.metadata ?? {};
const tc = { ...(meta.tour_comms ?? {}), internal_recipients: { enabled: true, user_ids: [STAFF] } };
const patch = await api("/api/admin/org-settings", "PATCH", { metadata: { tour_comms: tc } });
log.staffRecipients = { status: patch.status, err: patch.body?.error };
// 3. Riverside schedules: an auto-confirm window and an approval-required one.
await riversideTours(page);
await page.getByRole("button", { name: /Add a schedule for/i }).first().click();
log.schedAuto = await createSchedule(page, { name: "QA Auto-confirm", days: [1, 2, 3, 4, 5], windows: [["10:00", "12:00"]], max: 2, approval: false });
await page.getByRole("button", { name: /Add a schedule for/i }).first().click();
log.schedApproval = await createSchedule(page, { name: "QA Needs approval", days: [1, 2, 3, 4, 5], windows: [["14:00", "15:00"]], max: 1, approval: true });
await riversideTours(page);
const t = await mainText(page);
log.availability = t.slice(t.indexOf("Families booking"), t.indexOf("Families booking") + 900);
await page.screenshot({ path: `${OUT}setup-riverside-availability.png`, fullPage: true });
log.errors = errors.filter((e) => !/favicon/.test(e)).slice(0, 5);
console.log(JSON.stringify(log, null, 1));
await browser.close();
