import { chromium } from "@playwright/test";
import fs from "node:fs"; import crypto from "node:crypto"; import path from "node:path";
const STATE = "/Users/Kelly/.local/state/alloy-dev/gateway/auth/slot4/cert-storage-state.json";
const FIX = "/Users/Kelly/Code/alloy-worktrees/wt4-enrollment-phase2-participant-anchor/web/tests/fixtures/processing";
const FILES = ["school-of-enrichment-family-handbook.pdf","oregon-certificate-of-immunization-status.pdf","school-of-enrichment-admissions-packet.capture.html"];
const log = (...a) => console.log("[final]", ...a);
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STATE });
const page = await ctx.newPage();
await page.goto("http://127.0.0.1:3014/workspace", { waitUntil: "domcontentloaded", timeout: 240000 });
await page.waitForTimeout(3000);
async function upload(file, attachToCaseId) {
  const buf = fs.readFileSync(path.join(FIX, file));
  const mp = { file: { name: file, mimeType: file.endsWith(".pdf") ? "application/pdf" : "text/html", buffer: buf },
               processing_intent: "generate_form", title: file };
  if (attachToCaseId) mp.attach_to_case_id = attachToCaseId; else mp.open_processing_case = "true";
  const r = await page.request.post("http://127.0.0.1:3014/api/admin/documents/upload", { multipart: mp, timeout: 180000 });
  return { status: r.status(), ...(await r.json().catch(()=>({}))) };
}
const a = await upload(FILES[0], null);
const caseId = a.processing_case_id;
log("A:", a.status, "case", caseId, "keys", Object.keys(a).join(","));
const b = await upload(FILES[1], caseId);
const c = await upload(FILES[2], caseId);
log("B:", b.status, b.attach_outcome, "| C:", c.status, c.attach_outcome);
fs.writeFileSync("/tmp/finalcase.json", JSON.stringify({ caseId, a, b, c }, null, 2));
log("CASE:", caseId);
await browser.close();
