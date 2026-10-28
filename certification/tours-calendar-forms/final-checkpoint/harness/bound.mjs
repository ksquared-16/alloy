import { adminPage, api, approveCase } from "./ops.mjs";
import { familyRequest, loadState, saveState } from "./fam.mjs";
const FORM = process.env.FORM_ID;
const s = loadState(); s.p4 = {};
const bind = (k) => ({ entity_type: "person", field_key: k });
const SCHEMA = {
  schema_version: 1, title: "Northwind Tour Inquiry",
  sections: [{ id: "s1", title: "About you", field_ids: ["guardian_first_name", "guardian_last_name", "guardian_email", "guardian_phone", "child_first_name", "child_last_name"] }],
  fields: [
    { id: "guardian_first_name", type: "text", label: "Parent / guardian first name", required: true, field_source: bind("first_name") },
    { id: "guardian_last_name", type: "text", label: "Parent / guardian last name", required: true, field_source: bind("last_name") },
    { id: "guardian_email", type: "text", label: "Email", required: true, field_source: bind("email") },
    { id: "guardian_phone", type: "text", label: "Phone", field_source: bind("phone") },
    { id: "child_first_name", type: "text", label: "Child first name", required: true },
    { id: "child_last_name", type: "text", label: "Child last name", required: true },
  ],
};
{ const { browser, page } = await adminPage();
  const v = await api(page, `/api/admin/forms/${FORM}/versions`, "POST", { schema_json: SCHEMA });
  const vid = v.body?.data?.id ?? v.body?.id;
  const p = await api(page, `/api/admin/forms/${FORM}/versions/${vid}/publish`, "POST", {});
  s.p4.publishV2 = { version: v.status, err: v.body?.error ?? null, publish: p.status };
  await browser.close(); }
s.p4.request = await familyRequest({ tag: "g-bound-desktop-standalone", dayRe: /November 9\b/, time: "10:00 AM", first: "Gale", last: "Boundqa", email: "qa+final-g@example.invalid", consent: { email: true } });
s.p4.approve = await approveCase(/qa\+final-g@/, "g-bound-case");
saveState(s); console.log(JSON.stringify(s.p4, null, 1).slice(0, 2500));
