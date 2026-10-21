import { createRequire } from "node:module";
const require = createRequire("/Users/vacilando/Code/alloy-worktrees/business-processes/web/package.json");
const { chromium } = require("playwright");
const BASE = "https://staging.workwithalloy.com";
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: process.env.STORAGE_STATE });
const out = {};
for (const view of ["new_work_view_8"]) {
  const r = await ctx.request.get(`${BASE}/api/admin/work-units/all/provisioning-answer?work_view_id=${view}`);
  const j = await r.json().catch(() => null);
  const a = j?.answer ?? j;
  const rows = a?.rows ?? [];
  out[view] = {
    status: r.status(), terminal: a?.terminal, top_keys: a ? Object.keys(a).slice(0, 30) : null,
    rows: rows.length, distinct_row_ids: new Set(rows.map((x) => x.id ?? x.row_id)).size,
    total_like: Object.fromEntries(Object.entries(a ?? {}).filter(([k, v]) => /total|count/i.test(k) && (typeof v === "number" || v === null))),
    grain: a?.rowGrain ?? a?.row_grain ?? null,
    row_shape: rows[0] ? Object.keys(rows[0]).slice(0, 20) : null,
    statuses: null,
    context_keys: rows[0]?.context ? Object.keys(rows[0].context).slice(0, 40) : null,
    opportunity_ids_per_row: rows.map((x) => { const c = x?.context ?? {}; const ids = new Set([...(Array.isArray(c.opportunity_ids) ? c.opportunity_ids : []), c.opportunity_id, ...(Array.isArray(c.member_opportunity_ids) ? c.member_opportunity_ids : [])].filter(Boolean)); return ids.size; }),
  };
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
