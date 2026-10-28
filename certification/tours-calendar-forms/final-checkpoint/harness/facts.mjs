import { adminPage, api } from "./ops.mjs";
const id = process.argv[2];
const { browser, page } = await adminPage();
const c = await api(page, `/api/admin/processing/cases/${id}`);
const r = await api(page, `/api/admin/processing/cases/${id}/recommendation`);
const keys = (o, d = 0) => o && typeof o === "object" && !Array.isArray(o) && d < 2 ? Object.fromEntries(Object.entries(o).slice(0, 30).map(([k, v]) => [k, Array.isArray(v) ? `array(${v.length})` : (v && typeof v === "object" ? keys(v, d + 1) : typeof v === "string" ? v.slice(0, 80) : v)])) : o;
console.log(JSON.stringify({ case: keys(c.body), rec: keys(r.body) }, null, 1).slice(0, 4000));
await browser.close();
